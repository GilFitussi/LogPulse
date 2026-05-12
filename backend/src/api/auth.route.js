const Router = require("@koa/router");
const { checkOcAuth } = require("../service/ocAuth.service");

const router = new Router({ prefix: "/api/auth" });

router.get("/status", async (ctx) => {
	const authStatus = await checkOcAuth();

	if (authStatus.authenticated) {
		ctx.body = {
			authenticated: true,
			username: authStatus.username,
		};
		return;
	}

	ctx.status = authStatus.status;
	ctx.body = {
		authenticated: false,
		error: authStatus.error,
		code: authStatus.code,
		action: authStatus.action,
	};
});

module.exports = router;
