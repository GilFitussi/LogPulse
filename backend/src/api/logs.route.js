const Router = require("@koa/router");
const { isValidNamespace } = require("../service/namespaces.service");
const { isValidPod } = require("../service/pods.service");
const { streamPodLogs } = require("../service/logs.service");

const router = new Router({ prefix: "/api" });

const LOG_BATCH_INTERVAL_MS = 100;
const MAX_LOG_BATCH_SIZE = 250;
const CONTAINER_NAME_PATTERN = /^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/;

function isValidContainer(container) {
	return (
		typeof container === "string" &&
		container.length > 0 &&
		CONTAINER_NAME_PATTERN.test(container)
	);
}

function writeSseEvent(res, event, data) {
	res.write(`event: ${event}\n`);
	res.write(`data: ${JSON.stringify(data)}\n\n`);
}

function createLogBatcher(res) {
	let buffer = [];

	const flush = () => {
		if (buffer.length === 0 || res.destroyed || res.writableEnded) {
			return;
		}

		const batch = buffer;
		buffer = [];
		writeSseEvent(res, "log", batch);
	};

	const interval = setInterval(flush, LOG_BATCH_INTERVAL_MS);
	interval.unref?.();

	return {
		add(logLine) {
			buffer.push(logLine);

			if (buffer.length >= MAX_LOG_BATCH_SIZE) {
				flush();
			}
		},
		flush,
		stop() {
			clearInterval(interval);
			flush();
		},
	};
}

router.get("/logs/:namespace/:pod", async (ctx) => {
	const { namespace, pod } = ctx.params;
	const { container } = ctx.query;

	if (!isValidNamespace(namespace)) {
		ctx.throw(400, "Invalid namespace");
	}

	if (!isValidPod(pod)) {
		ctx.throw(400, "Invalid pod");
	}

	if (container !== undefined && !isValidContainer(container)) {
		ctx.throw(400, "Invalid container");
	}

	ctx.respond = false;
	ctx.req.setTimeout(0);
	ctx.res.writeHead(200, {
		"Content-Type": "text/event-stream",
		"Cache-Control": "no-cache, no-transform",
		Connection: "keep-alive",
		"X-Accel-Buffering": "no",
	});
	ctx.res.write(": connected\n\n");

	let logStream;
	let disconnected = false;
	const logBatcher = createLogBatcher(ctx.res);

	const cleanup = () => {
		logBatcher.stop();
		disconnected = true;
		logStream?.abort();
	};

	ctx.req.on("close", cleanup);

	try {
		logStream = await streamPodLogs(
			namespace,
			pod,
			(logLine) => {
				if (!disconnected) {
					logBatcher.add(logLine);
				}
			},
			container,
		);

		if (disconnected) {
			logStream.abort();
		}
	} catch (error) {
		if (!disconnected) {
			logBatcher.stop();
			writeSseEvent(ctx.res, "error", {
				error: error.message || "Log stream failed",
				details: error.details,
			});
			ctx.res.end();
		}
	}
});

module.exports = router;
module.exports.createLogBatcher = createLogBatcher;
module.exports.isValidContainer = isValidContainer;
module.exports.LOG_BATCH_INTERVAL_MS = LOG_BATCH_INTERVAL_MS;
