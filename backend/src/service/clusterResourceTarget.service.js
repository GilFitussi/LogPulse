const { AppError } = require("../errors/app.error");
const { getClusterById } = require("./clusterManager.service");

function normalizeClusterId(clusterId) {
	const id = Number(clusterId);
	return Number.isInteger(id) && id > 0 ? id : null;
}

async function resolveCluster(clusterId) {
	const id = normalizeClusterId(clusterId);

	if (!id) {
		throwClusterNotFound();
	}

	const cluster = await getClusterById(id);

	if (!cluster) {
		throwClusterNotFound();
	}

	return cluster;
}

function withClusterServer(args, cluster) {
	return [...args, "--server", cluster.apiUrl];
}

function throwClusterNotFound() {
	throw new AppError("Cluster not found", {
		status: 404,
		code: "CLUSTER_NOT_FOUND",
	});
}

module.exports = {
	normalizeClusterId,
	resolveCluster,
	withClusterServer,
};
