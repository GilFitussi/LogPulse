const Koa = require("koa");
const Router = require("@koa/router");
const cors = require("@koa/cors");
const bodyParser = require("koa-bodyparser");
const authRouter = require("./api/auth.route");
const clusterResourcesRouter = require("./api/cluster-resources.routes");
const clustersRouter = require("./api/clusters.route");
const errorMiddleware = require("./middleware/error.middleware");

const app = new Koa();
const router = new Router();

app.use(errorMiddleware);

app.use(
	cors({
		origin: "http://localhost:5173",
	}),
);
app.use(
	bodyParser({
		onerror(_error, ctx) {
			ctx.throw(400, "Invalid JSON request body");
		},
	}),
);

router.get("/health", (ctx) => {
	ctx.body = { status: "ok" };
});

app.use(router.routes());
app.use(router.allowedMethods());
app.use(authRouter.routes());
app.use(authRouter.allowedMethods());
app.use(clusterResourcesRouter.routes());
app.use(clusterResourcesRouter.allowedMethods());
app.use(clustersRouter.routes());
app.use(clustersRouter.allowedMethods());

app.use((ctx) => {
	ctx.status = 404;
});

module.exports = app;
