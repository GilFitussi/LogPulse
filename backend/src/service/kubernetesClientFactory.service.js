const k8s = require("@kubernetes/client-node");
const { getClusterSession } = require("./clusterSessionRegistry.service");

function createMissingClusterSessionError(clusterId) {
	return new Error(
		`No active cluster session found for clusterId ${clusterId}`,
	);
}

function createKubeConfig(clusterId) {
	const session = getClusterSession(clusterId);

	if (!session?.kubeconfigContent) {
		throw createMissingClusterSessionError(clusterId);
	}

	const kubeConfig = new k8s.KubeConfig();
	kubeConfig.loadFromString(session.kubeconfigContent);
	return kubeConfig;
}

function getCoreV1Api(clusterId) {
	return createKubeConfig(clusterId).makeApiClient(k8s.CoreV1Api);
}

function getAppsV1Api(clusterId) {
	return createKubeConfig(clusterId).makeApiClient(k8s.AppsV1Api);
}

function getLogClient(clusterId) {
	return new k8s.Log(createKubeConfig(clusterId));
}

module.exports = {
	getCoreV1Api,
	getAppsV1Api,
	getLogClient,
};
