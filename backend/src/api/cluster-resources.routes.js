const Router = require("@koa/router");
const { getClusterById } = require("../service/clusterManager.service");

const router = new Router({ prefix: "/api/clusters/:clusterId" });

const NOT_IMPLEMENTED_MESSAGE = "Cluster-scoped resources are not implemented yet.";

router.use(async (ctx, next) => {
	const clusterId = parseClusterId(ctx.params.clusterId);
	const cluster = await getClusterById(clusterId);

	if (!cluster) {
		ctx.status = 404;
		ctx.body = { error: "Cluster not found" };
		return;
	}

	ctx.state.cluster = cluster;
	await next();
});

router.get("/namespaces", notImplemented);
router.get("/namespaces/:namespace/deployments", notImplemented);
router.get("/namespaces/:namespace/pods", notImplemented);
router.get(
	"/namespaces/:namespace/deployments/:deployment/pods",
	notImplemented,
);
router.get("/namespaces/:namespace/pods/:podName/logs", notImplemented);

function notImplemented(ctx) {
	ctx.status = 501;
	ctx.body = { error: NOT_IMPLEMENTED_MESSAGE };
}

function parseClusterId(clusterId) {
	const id = Number(clusterId);
	return Number.isInteger(id) && id > 0 ? id : null;
}

module.exports = router;
module.exports.NOT_IMPLEMENTED_MESSAGE = NOT_IMPLEMENTED_MESSAGE;
