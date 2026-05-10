const Router = require("@koa/router");
const { listNamespaces } = require("../service/namespaces.service");

const router = new Router({ prefix: "/api" });

router.get("/namespaces", async (ctx) => {
  ctx.body = { namespaces: await listNamespaces() };
});

module.exports = router;
