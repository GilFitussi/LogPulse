const { Writable } = require("stream");
const fetch = require("node-fetch");
const { KubernetesApiError } = require("../errors/app.error");

const TIMESTAMP_PREFIX =
	/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2}))\s+(.*)$/;
const COMMON_SIDECAR_CONTAINER_NAMES = new Set([
	"istio-proxy",
	"linkerd-proxy",
	"vault-agent",
	"filebeat",
	"fluent-bit",
]);

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

function chooseDefaultLogContainer(containers = []) {
	if (!Array.isArray(containers) || containers.length === 0) {
		return undefined;
	}

	const preferredContainer = containers.find(
		(container) =>
			container?.name && !COMMON_SIDECAR_CONTAINER_NAMES.has(container.name),
	);

	return preferredContainer?.name || containers[0]?.name;
}

async function getPodContainers(kubeConfig, clusterServer, namespace, pod) {
	const url = new URL(
		`${clusterServer}/api/v1/namespaces/${encodeURIComponent(namespace)}/pods/${encodeURIComponent(pod)}`,
	);
	const requestOptions = await kubeConfig.applyToFetchOptions({});
	requestOptions.method = "GET";

	const response = await fetch(url.toString(), requestOptions);

	if (!response.ok) {
		throw await createLogStreamError(response);
	}

	const podResource = await response.json();

	return podResource?.spec?.containers || [];
}

async function resolveLogContainer(
	kubeConfig,
	clusterServer,
	namespace,
	pod,
	container,
) {
	if (container) {
		return container;
	}

	return chooseDefaultLogContainer(
		await getPodContainers(kubeConfig, clusterServer, namespace, pod),
	);
}

async function streamPodLogs(namespace, pod, onLogLine, container) {
	try {
		const { createKubeConfig } = require("./kubeClient.service");
		const kubeConfig = await createKubeConfig();
		const cluster = kubeConfig.getCurrentCluster();

		if (!cluster) {
			throw new Error("No currently active cluster");
		}

		const selectedContainer = await resolveLogContainer(
			kubeConfig,
			cluster.server,
			namespace,
			pod,
			container,
		);
		const url = new URL(
			`${cluster.server}/api/v1/namespaces/${encodeURIComponent(namespace)}/pods/${encodeURIComponent(pod)}/log`,
		);
		url.searchParams.set("follow", "true");
		url.searchParams.set("timestamps", "true");

		if (selectedContainer) {
			url.searchParams.set("container", selectedContainer);
		}

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
	chooseDefaultLogContainer,
	parseLogLine,
	streamPodLogs,
};
