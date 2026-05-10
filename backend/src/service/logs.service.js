const { Writable } = require("stream");
const fetch = require("node-fetch");
const { KubernetesApiError } = require("../errors/app.error");

const TIMESTAMP_PREFIX =
	/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2}))\s+(.*)$/;

function parseLogLine(rawLine) {
	const match = rawLine.match(TIMESTAMP_PREFIX);

	if (!match) {
		return { line: rawLine };
	}

	return {
		timestamp: match[1],
		line: match[2],
	};
}

function createLineWritable(onLine) {
	let buffer = "";

	return new Writable({
		write(chunk, _encoding, callback) {
			buffer += chunk.toString("utf8");
			const lines = buffer.split(/\r?\n/);
			buffer = lines.pop() || "";

			for (const line of lines) {
				onLine(parseLogLine(line));
			}

			callback();
		},
		final(callback) {
			if (buffer) {
				onLine(parseLogLine(buffer));
			}

			callback();
		},
	});
}

async function streamPodLogs(namespace, pod, onLogLine) {
	try {
		const { createKubeConfig } = require("./kubeClient.service");
		const kubeConfig = await createKubeConfig();
		const cluster = kubeConfig.getCurrentCluster();

		if (!cluster) {
			throw new Error("No currently active cluster");
		}

		const url = new URL(
			`${cluster.server}/api/v1/namespaces/${encodeURIComponent(namespace)}/pods/${encodeURIComponent(pod)}/log`,
		);
		url.searchParams.set("follow", "true");
		url.searchParams.set("timestamps", "true");

		const controller = new AbortController();
		const requestOptions = await kubeConfig.applyToFetchOptions({});
		requestOptions.method = "GET";
		requestOptions.signal = controller.signal;

		const response = await fetch(url.toString(), requestOptions);

		if (!response.ok) {
			throw await createLogStreamError(response);
		}

		const lineStream = createLineWritable(onLogLine);
		response.body.pipe(lineStream);

		const cleanup = () => {
			controller.abort();
			response.body.destroy();
			lineStream.destroy();
		};

		return { abort: cleanup };
	} catch (error) {
		throw KubernetesApiError.from(error);
	}
}

async function createLogStreamError(response) {
	let body;

	try {
		body = await response.json();
	} catch (_error) {
		body = undefined;
	}

	return {
		statusCode: response.status,
		body,
		message: body?.message || "Error occurred in log request",
	};
}

module.exports = {
	parseLogLine,
	streamPodLogs,
};
