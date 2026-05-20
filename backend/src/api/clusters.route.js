const Router = require("@koa/router");
const Joi = require("joi");
const {
	createCluster,
	listClusters,
} = require("../service/clusterManager.service");

const router = new Router();

const createClusterSchema = Joi.object({
	name: Joi.string().trim().required(),
	apiUrl: Joi.string()
		.trim()
		.uri({ scheme: ["http", "https"] })
		.required()
		.custom((value, helpers) => {
			const url = new URL(value);

			if (url.username !== "" || url.password !== "") {
				return helpers.error("any.invalid");
			}

			return value;
		}),
	defaultNamespace: Joi.string().trim().allow(null).empty("").default(null),
	description: Joi.string().trim().allow(null).empty("").default(null),
});

router.get("/clusters", async (ctx) => {
	ctx.body = { clusters: await listClusters() };
});

router.post("/clusters", async (ctx) => {
	const body = await readJsonBody(ctx);
	const validation = validateCreateCluster(body);

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

async function readJsonBody(ctx) {
	if (ctx.request.body !== undefined) {
		return ctx.request.body;
	}

	const rawBody = await readRequestBody(ctx.req);

	if (rawBody.trim().length === 0) {
		return {};
	}

	try {
		return JSON.parse(rawBody);
	} catch (_error) {
		ctx.throw(400, "Invalid JSON request body");
	}
}

function readRequestBody(request) {
	return new Promise((resolve, reject) => {
		let body = "";

		request.setEncoding("utf8");
		request.on("data", (chunk) => {
			body += chunk;
		});
		request.on("end", () => resolve(body));
		request.on("error", reject);
	});
}

function validateCreateCluster(input) {
	const { error, value } = createClusterSchema.validate(input, {
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

module.exports = router;
