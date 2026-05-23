const { AppError } = require("../errors/app.error");
const { getClusterById } = require("./clusterManager.service");

function isClusterId(value) {
	const id = Number(value);
	return Number.isInteger(id) && id > 0;
}

async function resolveCluster(clusterId) {
	if (!isClusterId(clusterId)) {
		throw createClusterNotFoundError();
	}

	const cluster = await getClusterById(Number(clusterId));

	if (!cluster) {
		throw createClusterNotFoundError();
	}

	return cluster;
}

async function resolveOptionalCluster(clusterId) {
	return clusterId === undefined || clusterId === null
		? null
		: resolveCluster(clusterId);
}

function withClusterServer(args, cluster) {
	return [...args, "--server", cluster.apiUrl];
}

function createClusterNotFoundError() {
	return new AppError("Cluster not found", {
		status: 404,
		code: "CLUSTER_NOT_FOUND",
	});
}

module.exports = {
	isClusterId,
	resolveCluster,
	resolveOptionalCluster,
	withClusterServer,
};
