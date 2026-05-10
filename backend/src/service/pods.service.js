const { KubernetesApiError } = require("../errors/app.error");
const { createKubeClient } = require("./kubeClient.service");

function getRestartCount(pod) {
	const statuses = [
		...(pod.status?.initContainerStatuses || []),
		...(pod.status?.containerStatuses || []),
	];

	if (statuses.length === 0) {
		return undefined;
	}

	return statuses.reduce(
		(total, status) => total + (status.restartCount || 0),
		0,
	);
}

function mapPod(pod) {
	return {
		name: pod.metadata?.name,
		status: pod.status?.phase,
		labels: pod.metadata?.labels || {},
		restartCount: getRestartCount(pod),
	};
}

async function listPods(namespace) {
	try {
		const client = await createKubeClient();
		const response = await client.listNamespacedPod({ namespace });
		const podList = response?.body || response;

		return (podList?.items || []).map(mapPod);
	} catch (error) {
		throw KubernetesApiError.from(error);
	}
}

module.exports = {
	listPods,
};
