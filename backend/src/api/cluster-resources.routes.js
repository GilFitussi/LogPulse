const Router = require("@koa/router");
const {
	isValidNamespace,
	listNamespaces,
} = require("../service/namespaces.service");
const {
	isValidDeployment,
	listDeployments,
} = require("../service/deployments.service");
const { listPods, listPodsForDeployment } = require("../service/pods.service");
const { getClusterById } = require("../service/clusterManager.service");

const router = new Router({ prefix: "/api/clusters/:clusterId" });

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

router.get("/namespaces", async (ctx) => {
	ctx.body = { namespaces: await listNamespaces(ctx.state.cluster.id) };
});

router.get("/namespaces/:namespace/deployments", async (ctx) => {
	const { namespace } = ctx.params;

	validateNamespace(ctx, namespace);

	ctx.body = {
		deployments: await listDeployments(ctx.state.cluster.id, namespace),
	};
});

router.get("/namespaces/:namespace/pods", async (ctx) => {
	const { namespace } = ctx.params;

	validateNamespace(ctx, namespace);

	ctx.body = { pods: await listPods(ctx.state.cluster.id, namespace) };
});

router.get(
	"/namespaces/:namespace/deployments/:deployment/pods",
	async (ctx) => {
		const { namespace, deployment } = ctx.params;

		validateNamespace(ctx, namespace);
		validateDeployment(ctx, deployment);

		ctx.body = {
			pods: await listPodsForDeployment(
				ctx.state.cluster.id,
				namespace,
				deployment,
			),
		};
	},
);

function validateNamespace(ctx, namespace) {
	if (!isValidNamespace(namespace)) {
		ctx.throw(400, "Invalid namespace");
	}
}

function validateDeployment(ctx, deployment) {
	if (!isValidDeployment(deployment)) {
		ctx.throw(400, "Invalid deployment");
	}
}

function parseClusterId(clusterId) {
	const id = Number(clusterId);
	return Number.isInteger(id) && id > 0 ? id : null;
}

module.exports = router;
