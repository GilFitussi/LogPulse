const Router = require("@koa/router");
const {
	createCluster,
	listClusters,
} = require("../service/clusterManager.service");

const router = new Router();

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
	const errors = {};

	if (!input || typeof input !== "object" || Array.isArray(input)) {
		return {
			valid: false,
			errors: { body: "Request body must be a JSON object" },
		};
	}

	const name = validateRequiredString(input.name, "name", errors);
	const apiUrl = validateRequiredString(input.apiUrl, "apiUrl", errors);
	const defaultNamespace = validateOptionalString(
		input.defaultNamespace,
		"defaultNamespace",
		errors,
	);
	const description = validateOptionalString(
		input.description,
		"description",
		errors,
	);

	if (apiUrl && !isValidApiUrl(apiUrl)) {
		errors.apiUrl = "apiUrl must be a valid http or https URL";
	}

	if (Object.keys(errors).length > 0) {
		return { valid: false, errors };
	}

	return {
		valid: true,
		value: {
			name,
			apiUrl,
			defaultNamespace,
			description,
		},
	};
}

function validateRequiredString(value, field, errors) {
	if (typeof value !== "string" || value.trim().length === 0) {
		errors[field] = `${field} is required`;
		return null;
	}

	return value.trim();
}

function validateOptionalString(value, field, errors) {
	if (value === undefined || value === null) {
		return null;
	}

	if (typeof value !== "string") {
		errors[field] = `${field} must be a string`;
		return null;
	}

	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : null;
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
module.exports.validateCreateCluster = validateCreateCluster;
module.exports.isValidApiUrl = isValidApiUrl;
