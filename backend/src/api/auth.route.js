const Router = require("@koa/router");
const { checkOcAuth } = require("../service/ocAuth.service");

const router = new Router({ prefix: "/api/auth" });

router.get("/status", async (ctx) => {
  const authStatus = await checkOcAuth();

  if (authStatus.authenticated) {
    ctx.body = { authenticated: true };
    return;
  }

  ctx.status = authStatus.status;
  ctx.body = {
    authenticated: false,
    error: authStatus.error,
  };
});

module.exports = router;
