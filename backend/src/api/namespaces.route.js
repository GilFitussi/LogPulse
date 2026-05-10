const Router = require("@koa/router");
const {
	isValidNamespace,
	listNamespaces,
} = require("../service/namespaces.service");
const { listPods } = require("../service/pods.service");

const router = new Router({ prefix: "/api" });

router.get("/namespaces", async (ctx) => {
	ctx.body = { namespaces: await listNamespaces() };
});

router.get("/namespaces/:namespace/pods", async (ctx) => {
	const { namespace } = ctx.params;

	if (!isValidNamespace(namespace)) {
		ctx.throw(400, "Invalid namespace");
	}

	ctx.body = { pods: await listPods(namespace) };
});

module.exports = router;
