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

const router = new Router({ prefix: "/api" });

router.get("/namespaces", async (ctx) => {
	ctx.body = { namespaces: await listNamespaces() };
});

router.get("/namespaces/:namespace/deployments", async (ctx) => {
	const { namespace } = ctx.params;

	if (!isValidNamespace(namespace)) {
		ctx.throw(400, "Invalid namespace");
	}

	ctx.body = { deployments: await listDeployments(namespace) };
});

router.get("/namespaces/:namespace/pods", async (ctx) => {
	const { namespace } = ctx.params;

	if (!isValidNamespace(namespace)) {
		ctx.throw(400, "Invalid namespace");
	}

	ctx.body = { pods: await listPods(namespace) };
});

router.get(
	"/namespaces/:namespace/deployments/:deployment/pods",
	async (ctx) => {
		const { namespace, deployment } = ctx.params;

		if (!isValidNamespace(namespace)) {
			ctx.throw(400, "Invalid namespace");
		}

		if (!isValidDeployment(deployment)) {
			ctx.throw(400, "Invalid deployment");
		}

		ctx.body = { pods: await listPodsForDeployment(namespace, deployment) };
	},
);

module.exports = router;
