const Router = require("@koa/router");
const Joi = require("joi");
const {
	createCluster,
	deleteCluster,
	getClusterById,
	listClusters,
	updateCluster,
} = require("../service/clusterManager.service");
const { loginToCluster } = require("../service/clusterOcLogin.service");

const router = new Router();

const apiUrlSchema = Joi.string()
	.trim()
	.uri({ scheme: ["http", "https"] })
	.custom((value, helpers) => {
		const url = new URL(value);

		if (url.username !== "" || url.password !== "") {
			return helpers.error("any.invalid");
		}

		return value;
	});

const nullableStringSchema = Joi.string().trim().allow(null).empty("");

const createClusterSchema = Joi.object({
	name: Joi.string().trim().required(),
	apiUrl: apiUrlSchema.required(),
	defaultNamespace: nullableStringSchema.default(null),
	description: nullableStringSchema.default(null),
});

const updateClusterSchema = Joi.object({
	name: Joi.string().trim(),
	apiUrl: apiUrlSchema,
	defaultNamespace: nullableStringSchema,
	description: nullableStringSchema,
}).min(1);

const loginSchema = Joi.object({
	loginMethod: Joi.string()
		.valid("credentials", "token")
		.default("credentials"),
	username: Joi.when("loginMethod", {
		is: "credentials",
		then: Joi.string().trim().required(),
		otherwise: Joi.string().trim().optional().allow(""),
	}),
	password: Joi.when("loginMethod", {
		is: "credentials",
		then: Joi.string().required(),
		otherwise: Joi.string().optional().allow(""),
	}),
	token: Joi.when("loginMethod", {
		is: "token",
		then: Joi.string().trim().required(),
		otherwise: Joi.string().optional().allow(""),
	}),
});

router.get("/clusters", async (ctx) => {
	ctx.body = { clusters: await listClusters() };
});

router.post("/clusters", async (ctx) => {
	const validation = validateClusterInput(
		ctx.request.body,
		createClusterSchema,
	);

	if (!validation.valid) {
		ctx.status = 400;
		ctx.body = {
			error: "Invalid cluster input",
			details: validation.errors,
		};
		return;
	}

	const cluster = await createCluster(validation.value);

	ctx.status = 201;
	ctx.body = { cluster };
});

router.get("/clusters/:clusterId", async (ctx) => {
	const cluster = await getClusterById(parseClusterId(ctx.params.clusterId));

	if (!cluster) {
		ctx.status = 404;
		ctx.body = { error: "Cluster not found" };
		return;
	}

	ctx.body = { cluster };
});

router.patch("/clusters/:clusterId", async (ctx) => {
	const validation = validateClusterInput(
		ctx.request.body,
		updateClusterSchema,
	);

	if (!validation.valid) {
		ctx.status = 400;
		ctx.body = {
			error: "Invalid cluster input",
			details: validation.errors,
		};
		return;
	}

	const cluster = await updateCluster(
		parseClusterId(ctx.params.clusterId),
		validation.value,
	);

	if (!cluster) {
		ctx.status = 404;
		ctx.body = { error: "Cluster not found" };
		return;
	}

	ctx.body = { cluster };
});

router.post("/clusters/:clusterId/login", async (ctx) => {
	const validation = validateClusterInput(ctx.request.body, loginSchema);

	if (!validation.valid) {
		ctx.status = 400;
		ctx.body = {
			error: "Invalid login input",
			details: validation.errors,
		};
		return;
	}

	const result = await loginToCluster(
		parseClusterId(ctx.params.clusterId),
		validation.value,
	);

	ctx.body = {
		cluster: result.cluster,
		username: result.username,
	};
});

router.delete("/clusters/:clusterId", async (ctx) => {
	const deleted = await deleteCluster(parseClusterId(ctx.params.clusterId));

	if (!deleted) {
		ctx.status = 404;
		ctx.body = { error: "Cluster not found" };
		return;
	}

	ctx.status = 204;
});

function validateClusterInput(input, schema) {
	const { error, value } = schema.validate(input, {
		abortEarly: false,
		stripUnknown: true,
	});

	if (!error) {
		return { valid: true, value };
	}

	return {
		valid: false,
		errors: error.details.reduce((errors, detail) => {
			const field = detail.path[0] || "body";

			if (!errors[field]) {
				errors[field] = detail.message;
			}

			return errors;
		}, {}),
	};
}

function parseClusterId(clusterId) {
	const id = Number(clusterId);
	return Number.isInteger(id) && id > 0 ? id : null;
}

module.exports = router;
