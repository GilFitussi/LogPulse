const Router = require("@koa/router");
const Joi = require("joi");
const { getClusterById } = require("../service/clusterManager.service");
const {
	getClusterPodLogs,
	listClusterDeployments,
	listClusterNamespaces,
	listClusterPods,
	listClusterPodsForDeployment,
} = require("../service/clusterResources.service");

const router = new Router({ prefix: "/api/clusters/:clusterId" });

const clusterIdSchema = Joi.number().integer().positive().required();
const requiredStringSchema = Joi.string().trim().required();

const clusterParamsSchema = Joi.object({
	clusterId: clusterIdSchema,
}).unknown(true);

const namespaceParamsSchema = Joi.object({
	clusterId: clusterIdSchema,
	namespace: requiredStringSchema,
}).unknown(true);

const deploymentParamsSchema = Joi.object({
	clusterId: clusterIdSchema,
	namespace: requiredStringSchema,
	deployment: requiredStringSchema,
}).unknown(true);

const podLogsParamsSchema = Joi.object({
	clusterId: clusterIdSchema,
	namespace: requiredStringSchema,
	podName: requiredStringSchema,
}).unknown(true);

const podLogsQuerySchema = Joi.object({
	container: Joi.string().trim().empty("").optional(),
	tailLines: Joi.number().integer().positive(),
	sinceSeconds: Joi.number().integer().positive(),
});

router.use(async (ctx, next) => {
	const validation = validateInput(ctx.params, clusterParamsSchema);

	if (!validation.valid) {
		ctx.status = 400;
		ctx.body = {
			error: "Invalid cluster resource params",
			details: validation.errors,
		};
		return;
	}

	const clusterId = validation.value.clusterId;
	const cluster = await getClusterById(clusterId);

	if (!cluster) {
		ctx.status = 404;
		ctx.body = { error: "Cluster not found" };
		return;
	}

	ctx.state.cluster = cluster;
	ctx.state.clusterId = clusterId;
	await next();
});

router.get("/namespaces", async (ctx) => {
	ctx.body = {
		namespaces: await listClusterNamespaces(ctx.state.clusterId),
	};
});

router.get("/namespaces/:namespace/deployments", async (ctx) => {
	const params = validateRequest(
		ctx,
		ctx.params,
		namespaceParamsSchema,
		"Invalid cluster resource params",
	);

	if (!params) {
		return;
	}

	ctx.body = {
		deployments: await listClusterDeployments(
			ctx.state.clusterId,
			params.namespace,
		),
	};
});

router.get("/namespaces/:namespace/pods", async (ctx) => {
	const params = validateRequest(
		ctx,
		ctx.params,
		namespaceParamsSchema,
		"Invalid cluster resource params",
	);

	if (!params) {
		return;
	}

	ctx.body = {
		pods: await listClusterPods(ctx.state.clusterId, params.namespace),
	};
});

router.get(
	"/namespaces/:namespace/deployments/:deployment/pods",
	async (ctx) => {
		const params = validateRequest(
			ctx,
			ctx.params,
			deploymentParamsSchema,
			"Invalid cluster resource params",
		);

		if (!params) {
			return;
		}

		ctx.body = {
			pods: await listClusterPodsForDeployment(
				ctx.state.clusterId,
				params.namespace,
				params.deployment,
			),
		};
	},
);

router.get("/namespaces/:namespace/pods/:podName/logs", async (ctx) => {
	const params = validateRequest(
		ctx,
		ctx.params,
		podLogsParamsSchema,
		"Invalid cluster resource params",
	);

	if (!params) {
		return;
	}

	const options = validateRequest(
		ctx,
		ctx.request.query,
		podLogsQuerySchema,
		"Invalid pod log query",
	);

	if (!options) {
		return;
	}

	const result = await getClusterPodLogs(
		ctx.state.clusterId,
		params.namespace,
		params.podName,
		options,
	);

	ctx.body = {
		logs: result.logs,
	};
});

function validateRequest(ctx, input, schema, errorMessage) {
	const validation = validateInput(input, schema);

	if (!validation.valid) {
		ctx.status = 400;
		ctx.body = {
			error: errorMessage,
			details: validation.errors,
		};
		return null;
	}

	return validation.value;
}

function validateInput(input, schema) {
	const { error, value } = schema.validate(input, {
		abortEarly: false,
		convert: true,
		stripUnknown: true,
	});

	if (!error) {
		return { valid: true, value };
	}

	return {
		valid: false,
		errors: error.details.reduce((errors, detail) => {
			const field = detail.path[0] || "value";

			if (!errors[field]) {
				errors[field] = detail.message;
			}

			return errors;
		}, {}),
	};
}

module.exports = router;
