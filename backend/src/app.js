const Koa = require("koa");
const cors = require("@koa/cors");

const app = new Koa();

app.use(
  cors({
    origin: "http://localhost:5173",
  }),
);

app.use((ctx) => {
  if (ctx.method === "GET" && ctx.path === "/health") {
    ctx.body = { status: "ok" };
    return;
  }

  ctx.status = 404;
});

module.exports = app;
