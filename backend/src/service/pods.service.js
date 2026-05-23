const { KubernetesApiError } = require("../errors/app.error");
const { createKubeClient } = require("./kubeClient.service");
const { runOcCommand } = require("./ocCommand.service");
const {
	resolveCluster,
	withClusterServer,
} = require("./clusterResourceTarget.service");
const {
	buildLabelSelector,
	getDeployment,
	getDeploymentFromCurrentContext,
	listReplicaSetsForDeployment,
	listReplicaSetsForDeploymentFromCurrentContext,
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

function parseJson(stdout, fallback) {
	const text = stdout?.trim();

	if (!text) {
		return fallback;
	}

	return JSON.parse(text);
}

async function listPodResources(clusterId, namespace, labelSelector) {
	const cluster = await resolveCluster(clusterId);
	const args = ["get", "pods", "-n", namespace, "-o", "json"];

	if (labelSelector) {
		args.push("-l", labelSelector);
	}

	const { stdout } = await runOcCommand(withClusterServer(args, cluster));
	const podList = parseJson(stdout, { items: [] });

	return podList?.items || [];
}

async function listPodResourcesFromCurrentContext(namespace, labelSelector) {
	const client = await createKubeClient();
	const response = await client.listNamespacedPod({
		namespace,
		...(labelSelector ? { labelSelector } : {}),
	});
	const podList = response?.body || response;

	return podList?.items || [];
}

function mapActivePods(pods) {
	return pods.filter(isActivePod).map(mapPod);
}

async function listPods(clusterId, namespace, labelSelector) {
	try {
		return mapActivePods(
			await listPodResources(clusterId, namespace, labelSelector),
		);
	} catch (error) {
		throw KubernetesApiError.from(error);
	}
}

async function listPodsFromCurrentContext(namespace, labelSelector) {
	try {
		return mapActivePods(
			await listPodResourcesFromCurrentContext(namespace, labelSelector),
		);
	} catch (error) {
		throw KubernetesApiError.from(error);
	}
}

async function listPodsForDeployment(clusterId, namespace, deploymentName) {
	const deployment = await getDeployment(clusterId, namespace, deploymentName);
	const labelSelector = buildLabelSelector(deployment.spec?.selector);

	if (!labelSelector) {
		return [];
	}

	const replicaSetUids = await getDeploymentReplicaSetUids(
		clusterId,
		namespace,
		deploymentName,
		deployment.metadata?.uid,
		labelSelector,
	);

	if (replicaSetUids.size === 0) {
		return [];
	}

	try {
		return mapDeploymentPods(
			await listPodResources(clusterId, namespace, labelSelector),
			replicaSetUids,
		);
	} catch (error) {
		throw KubernetesApiError.from(error);
	}
}

async function listPodsForDeploymentFromCurrentContext(
	namespace,
	deploymentName,
) {
	const deployment = await getDeploymentFromCurrentContext(
		namespace,
		deploymentName,
	);
	const labelSelector = buildLabelSelector(deployment.spec?.selector);

	if (!labelSelector) {
		return [];
	}

	const replicaSets = await listReplicaSetsForDeploymentFromCurrentContext(
		namespace,
		deploymentName,
		deployment.metadata?.uid,
		labelSelector,
	);
	const replicaSetUids = toReplicaSetUidSet(replicaSets);

	if (replicaSetUids.size === 0) {
		return [];
	}

	try {
		return mapDeploymentPods(
			await listPodResourcesFromCurrentContext(namespace, labelSelector),
			replicaSetUids,
		);
	} catch (error) {
		throw KubernetesApiError.from(error);
	}
}

async function getDeploymentReplicaSetUids(
	clusterId,
	namespace,
	deploymentName,
	deploymentUid,
	labelSelector,
) {
	const replicaSets = await listReplicaSetsForDeployment(
		clusterId,
		namespace,
		deploymentName,
		deploymentUid,
		labelSelector,
	);

	return toReplicaSetUidSet(replicaSets);
}

function toReplicaSetUidSet(replicaSets) {
	return new Set(
		replicaSets.map((replicaSet) => replicaSet.metadata?.uid).filter(Boolean),
	);
}

function mapDeploymentPods(pods, replicaSetUids) {
	return pods
		.filter(isActivePod)
		.filter((pod) => isPodOwnedByReplicaSet(pod, replicaSetUids))
		.map(mapPod);
}

module.exports = {
	isValidPod,
	listPods,
	listPodsFromCurrentContext,
	listPodsForDeployment,
	listPodsForDeploymentFromCurrentContext,
};
