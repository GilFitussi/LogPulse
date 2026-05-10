const Router = require("@koa/router");
const { isValidNamespace } = require("../service/namespaces.service");
const { isValidPod } = require("../service/pods.service");
const { streamPodLogs } = require("../service/logs.service");

const router = new Router({ prefix: "/api" });

function writeSseEvent(res, event, data) {
	res.write(`event: ${event}\n`);
	res.write(`data: ${JSON.stringify(data)}\n\n`);
}

router.get("/logs/:namespace/:pod", async (ctx) => {
	const { namespace, pod } = ctx.params;

	if (!isValidNamespace(namespace)) {
		ctx.throw(400, "Invalid namespace");
	}

	if (!isValidPod(pod)) {
		ctx.throw(400, "Invalid pod");
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

	const cleanup = () => {
		disconnected = true;
		logStream?.abort();
	};

	ctx.req.on("close", cleanup);

	try {
		logStream = await streamPodLogs(namespace, pod, (logLine) => {
			if (!disconnected) {
				writeSseEvent(ctx.res, "log", logLine);
			}
		});

		if (disconnected) {
			logStream.abort();
		}
	} catch (error) {
		if (!disconnected) {
			writeSseEvent(ctx.res, "error", {
				error: error.message || "Log stream failed",
				details: error.details,
			});
			ctx.res.end();
		}
	}
});

module.exports = router;
