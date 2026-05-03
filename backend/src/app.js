const Koa = require("koa");

const app = new Koa();

app.use((ctx) => {
  if (ctx.method === "GET" && ctx.path === "/health") {
    ctx.body = { status: "ok" };
    return;
  }

  ctx.status = 404;
});

module.exports = app;
