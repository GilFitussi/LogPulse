const Router = require("@koa/router");
const { listNamespaces } = require("../service/namespaces.service");
const { listPods } = require("../service/pods.service");

const router = new Router({ prefix: "/api" });

router.get("/namespaces", async (ctx) => {
  ctx.body = { namespaces: await listNamespaces() };
});

router.get("/namespaces/:namespace/pods", async (ctx) => {
  ctx.body = { pods: await listPods(ctx.params.namespace) };
});

module.exports = router;
