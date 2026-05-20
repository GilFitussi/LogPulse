const Router = require("@koa/router");
const Joi = require("joi");
const {
	createCluster,
	listClusters,
} = require("../service/clusterManager.service");

const router = new Router();

const createClusterSchema = Joi.object({
	name: Joi.string().trim().required().messages({
		"any.required": "name is required",
		"string.base": "name is required",
		"string.empty": "name is required",
	}),
	apiUrl: Joi.string()
		.trim()
		.required()
		.custom((value, helpers) => {
			if (!isValidApiUrl(value)) {
				return helpers.error("apiUrl.invalid");
			}

			return value;
		})
		.messages({
			"any.required": "apiUrl is required",
			"apiUrl.invalid": "apiUrl must be a valid http or https URL",
			"string.base": "apiUrl is required",
			"string.empty": "apiUrl is required",
		}),
	defaultNamespace: Joi.string().trim().allow(null).empty("").default(null).messages({
		"string.base": "defaultNamespace must be a string",
	}),
	description: Joi.string().trim().allow(null).empty("").default(null).messages({
		"string.base": "description must be a string",
	}),
}).messages({
	"object.base": "Request body must be a JSON object",
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

function isValidApiUrl(value) {
	try {
		const url = new URL(value);
		return (
			["http:", "https:"].includes(url.protocol) &&
			Boolean(url.hostname) &&
			url.username === "" &&
			url.password === ""
		);
	} catch (_error) {
		return false;
	}
}

module.exports = router;
