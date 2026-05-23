const {
	AppError,
	KubernetesApiError,
	KubernetesPermissionError,
	OcCliNotFoundError,
	OpenShiftAuthError,
} = require("../errors/app.error");
const { getClusterById } = require("../service/clusterManager.service");
const {
	getOcErrorMessage,
	isOcNotInstalledError,
	runOcCommand,
} = require("../service/ocCommand.service");

async function listClusterNamespaces(clusterId) {
	const cluster = await requireCluster(clusterId);
	const items = await ocGetJson(cluster, ["namespaces"]);

	return items.map(mapNamespace);
}

async function listClusterDeployments(clusterId, namespace) {
	const cluster = await requireCluster(clusterId);
	const items = await ocGetJson(cluster, [
		"deployments",
		"--namespace",
		namespace,
	]);

	return items.map(mapDeployment);
}

async function listClusterPods(clusterId, namespace) {
	const cluster = await requireCluster(clusterId);
	const items = await ocGetJson(cluster, ["pods", "--namespace", namespace]);

	return items.map(mapPod);
}

async function listClusterPodsForDeployment(
	clusterId,
	namespace,
	deploymentName,
) {
	const cluster = await requireCluster(clusterId);
	const deployment = await ocGetOneJson(cluster, [
		"deployment",
		deploymentName,
		"--namespace",
		namespace,
	]);
	const labelSelector = buildLabelSelector(deployment.spec?.selector);

	if (!labelSelector) {
		return [];
	}

	const replicaSets = await ocGetJson(cluster, [
		"replicasets",
		"--namespace",
		namespace,
		"--selector",
		labelSelector,
	]);
	const replicaSetUids = new Set(
		replicaSets
			.filter((replicaSet) =>
				isReplicaSetOwnedByDeployment(
					replicaSet,
					deploymentName,
					deployment.metadata?.uid,
				),
			)
			.map((replicaSet) => replicaSet.metadata?.uid)
			.filter(Boolean),
	);

	if (replicaSetUids.size === 0) {
		return [];
	}

	const pods = await ocGetJson(cluster, [
		"pods",
		"--namespace",
		namespace,
		"--selector",
		labelSelector,
	]);

	return pods
		.filter((pod) => isPodOwnedByReplicaSet(pod, replicaSetUids))
		.map(mapPod);
}

async function requireCluster(clusterId) {
	const id = Number(clusterId);

	if (!Number.isInteger(id) || id <= 0) {
		throw new AppError("Cluster not found", {
			status: 404,
			code: "CLUSTER_NOT_FOUND",
		});
	}

	const cluster = await getClusterById(id);

	if (!cluster) {
		throw new AppError("Cluster not found", {
			status: 404,
			code: "CLUSTER_NOT_FOUND",
		});
	}

	return cluster;
}

async function ocGetJson(cluster, args) {
	const json = await ocGetOneJson(cluster, args);
	return json?.items || [];
}

async function ocGetOneJson(cluster, args) {
	try {
		const { stdout } = await runOcCommand([
			"--server",
			cluster.apiUrl,
			"get",
			...args,
			"--output",
			"json",
		]);

		return stdout ? JSON.parse(stdout) : {};
	} catch (error) {
		throw toClusterResourceError(error);
	}
}

function toClusterResourceError(error) {
	if (error instanceof AppError) {
		return error;
	}

	if (isOcNotInstalledError(error)) {
		return new OcCliNotFoundError();
	}

	const message = getOcErrorMessage(error) || error?.message;
	const lowerMessage = message?.toLowerCase() || "";

	if (
		lowerMessage.includes("must be logged in") ||
		lowerMessage.includes("unauthorized") ||
		lowerMessage.includes('forbidden: user "system:anonymous"')
	) {
		return new OpenShiftAuthError(message);
	}

	if (lowerMessage.includes("forbidden")) {
		return new KubernetesPermissionError(message);
	}

	if (error instanceof SyntaxError) {
		return new KubernetesApiError("Invalid JSON response from oc");
	}

	return new KubernetesApiError(message || "Unable to read cluster resources");
}

function buildLabelSelector(selector = {}) {
	const matchLabels = selector.matchLabels || {};
	const labelSelectors = Object.entries(matchLabels).map(
		([key, value]) => `${key}=${value}`,
	);
	const expressionSelectors = (selector.matchExpressions || [])
		.map((expression) => {
			const { key, operator } = expression;
			const values = expression.values || [];

			if (!key || !operator) {
				return "";
			}

			switch (operator) {
				case "In":
					return `${key} in (${values.join(",")})`;
				case "NotIn":
					return `${key} notin (${values.join(",")})`;
				case "Exists":
					return key;
				case "DoesNotExist":
					return `!${key}`;
				default:
					return "";
			}
		})
		.filter(Boolean);

	return [...labelSelectors, ...expressionSelectors].join(",");
}

function isReplicaSetOwnedByDeployment(
	replicaSet,
	deploymentName,
	deploymentUid,
) {
	return (replicaSet.metadata?.ownerReferences || []).some(
		(ownerReference) =>
			ownerReference.kind === "Deployment" &&
			ownerReference.name === deploymentName &&
			(!deploymentUid || ownerReference.uid === deploymentUid),
	);
}

function isPodOwnedByReplicaSet(pod, replicaSetUids) {
	return (pod.metadata?.ownerReferences || []).some(
		(ownerReference) =>
			ownerReference.kind === "ReplicaSet" &&
			replicaSetUids.has(ownerReference.uid),
	);
}

function mapNamespace(namespace) {
	return {
		name: namespace.metadata?.name,
		status: namespace.status?.phase,
		labels: namespace.metadata?.labels || {},
	};
}

function mapDeployment(deployment) {
	return {
		name: deployment.metadata?.name,
		namespace: deployment.metadata?.namespace,
		labels: deployment.metadata?.labels || {},
		selector: buildLabelSelector(deployment.spec?.selector),
		replicas: deployment.spec?.replicas || 0,
		readyReplicas: deployment.status?.readyReplicas || 0,
		availableReplicas: deployment.status?.availableReplicas || 0,
		updatedReplicas: deployment.status?.updatedReplicas || 0,
	};
}

function mapPod(pod) {
	return {
		name: pod.metadata?.name,
		namespace: pod.metadata?.namespace,
		status: pod.status?.phase,
		labels: pod.metadata?.labels || {},
		ready: isPodReady(pod),
		restartCount: getRestartCount(pod),
		nodeName: pod.spec?.nodeName,
		createdAt: pod.metadata?.creationTimestamp,
	};
}

function isPodReady(pod) {
	return (pod.status?.conditions || []).some(
		(condition) => condition.type === "Ready" && condition.status === "True",
	);
}

function getRestartCount(pod) {
	const statuses = [
		...(pod.status?.initContainerStatuses || []),
		...(pod.status?.containerStatuses || []),
	];

	return statuses.reduce(
		(total, status) => total + (status.restartCount || 0),
		0,
	);
}

module.exports = {
	buildLabelSelector,
	listClusterDeployments,
	listClusterNamespaces,
	listClusterPods,
	listClusterPodsForDeployment,
};
