const { KubernetesApiError } = require("../errors/app.error");
const { createKubeClient } = require("./kubeClient.service");
const {
	buildLabelSelector,
	getDeployment,
	listReplicaSetsForDeployment,
} = require("./deployments.service");

const POD_NAME_PATTERN =
	/^[a-z0-9]([-a-z0-9]*[a-z0-9])?(\.[a-z0-9]([-a-z0-9]*[a-z0-9])?)*$/;

function isValidPod(pod) {
	return (
		typeof pod === "string" && pod.length > 0 && POD_NAME_PATTERN.test(pod)
	);
}

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

function isPodOwnedByReplicaSet(pod, replicaSetUids) {
	return (pod.metadata?.ownerReferences || []).some(
		(ownerReference) =>
			ownerReference.kind === "ReplicaSet" &&
			replicaSetUids.has(ownerReference.uid),
	);
}

function isPodReady(pod) {
	return (pod.status?.conditions || []).some(
		(condition) => condition.type === "Ready" && condition.status === "True",
	);
}

function isActivePod(pod) {
	return (
		!pod.metadata?.deletionTimestamp &&
		pod.status?.phase === "Running" &&
		isPodReady(pod)
	);
}

function mapPod(pod) {
	return {
		name: pod.metadata?.name,
		status: pod.status?.phase,
		labels: pod.metadata?.labels || {},
		ready: isPodReady(pod),
		restartCount: getRestartCount(pod),
	};
}

async function listPodResources(namespace, labelSelector) {
	const client = await createKubeClient();
	const response = await client.listNamespacedPod({
		namespace,
		...(labelSelector ? { labelSelector } : {}),
	});
	const podList = response?.body || response;

	return podList?.items || [];
}

async function listPods(namespace, labelSelector) {
	try {
		return (await listPodResources(namespace, labelSelector))
			.filter(isActivePod)
			.map(mapPod);
	} catch (error) {
		throw KubernetesApiError.from(error);
	}
}

async function listPodsForDeployment(namespace, deploymentName) {
	const deployment = await getDeployment(namespace, deploymentName);
	const labelSelector = buildLabelSelector(deployment.spec?.selector);

	if (!labelSelector) {
		return [];
	}

	const replicaSets = await listReplicaSetsForDeployment(
		namespace,
		deploymentName,
		deployment.metadata?.uid,
		labelSelector,
	);
	const replicaSetUids = new Set(
		replicaSets.map((replicaSet) => replicaSet.metadata?.uid).filter(Boolean),
	);

	if (replicaSetUids.size === 0) {
		return [];
	}

	try {
		return (await listPodResources(namespace, labelSelector))
			.filter(isActivePod)
			.filter((pod) => isPodOwnedByReplicaSet(pod, replicaSetUids))
			.map(mapPod);
	} catch (error) {
		throw KubernetesApiError.from(error);
	}
}

module.exports = {
	isValidPod,
	listPods,
	listPodsForDeployment,
};
