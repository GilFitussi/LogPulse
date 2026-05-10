const Koa = require("koa");
const Router = require("@koa/router");
const cors = require("@koa/cors");
const authRouter = require("./api/auth.route");

const app = new Koa();
const router = new Router();

app.use(
  cors({
    origin: "http://localhost:5173",
  }),
);

router.get("/health", (ctx) => {
  ctx.body = { status: "ok" };
});

app.use(router.routes());
app.use(router.allowedMethods());
app.use(authRouter.routes());
app.use(authRouter.allowedMethods());

app.use((ctx) => {
  ctx.status = 404;
});

module.exports = app;
