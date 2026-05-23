const Router = require("@koa/router");
const {
	isValidNamespace,
	listNamespaces,
} = require("../service/namespaces.service");
const {
	isValidDeployment,
	listDeploymentsFromCurrentContext,
} = require("../service/deployments.service");
const {
	listPodsFromCurrentContext,
	listPodsForDeploymentFromCurrentContext,
} = require("../service/pods.service");

// Legacy namespace-scoped routes kept temporarily for compatibility.
// Prefer cluster-scoped routes in cluster-resources.routes.js for new clients.
const router = new Router({ prefix: "/api" });

router.get("/namespaces", async (ctx) => {
	ctx.body = { namespaces: await listNamespaces() };
});

router.get("/namespaces/:namespace/deployments", async (ctx) => {
	const { namespace } = ctx.params;

	if (!isValidNamespace(namespace)) {
		ctx.throw(400, "Invalid namespace");
	}

	ctx.body = {
		deployments: await listDeploymentsFromCurrentContext(namespace),
	};
});

router.get("/namespaces/:namespace/pods", async (ctx) => {
	const { namespace } = ctx.params;

	if (!isValidNamespace(namespace)) {
		ctx.throw(400, "Invalid namespace");
	}

	ctx.body = { pods: await listPodsFromCurrentContext(namespace) };
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

		ctx.body = {
			pods: await listPodsForDeploymentFromCurrentContext(
				namespace,
				deployment,
			),
		};
	},
);

module.exports = router;
