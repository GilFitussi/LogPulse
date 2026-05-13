const { KubernetesApiError } = require("../errors/app.error");

const DEPLOYMENT_NAME_PATTERN =
	/^[a-z0-9]([-a-z0-9]*[a-z0-9])?(\.[a-z0-9]([-a-z0-9]*[a-z0-9])?)*$/;

function isValidDeployment(deployment) {
	return (
		typeof deployment === "string" &&
		deployment.length > 0 &&
		DEPLOYMENT_NAME_PATTERN.test(deployment)
	);
}

function buildLabelSelector(selector = {}) {
	const matchLabels = selector.matchLabels || {};
	const labelSelectors = Object.entries(matchLabels).map(
		([key, value]) => `${key}=${value}`,
	);
	const expressionSelectors = (selector.matchExpressions || [])
		.map((expression) => {
			const key = expression.key;
			const operator = expression.operator;
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

function mapDeployment(deployment) {
	return {
		name: deployment.metadata?.name,
		labels: deployment.metadata?.labels || {},
		selector: buildLabelSelector(deployment.spec?.selector),
		replicas: deployment.spec?.replicas,
		readyReplicas: deployment.status?.readyReplicas || 0,
		availableReplicas: deployment.status?.availableReplicas || 0,
	};
}

async function listDeployments(namespace) {
	try {
		const k8s = require("@kubernetes/client-node");
		const { createKubeClient } = require("./kubeClient.service");
		const client = await createKubeClient(k8s.AppsV1Api);
		const response = await client.listNamespacedDeployment({ namespace });
		const deploymentList = response?.body || response;

		return (deploymentList?.items || []).map(mapDeployment);
	} catch (error) {
		throw KubernetesApiError.from(error);
	}
}

async function listReplicaSetsForDeployment(
	namespace,
	deploymentName,
	deploymentUid,
	labelSelector,
) {
	try {
		const k8s = require("@kubernetes/client-node");
		const { createKubeClient } = require("./kubeClient.service");
		const client = await createKubeClient(k8s.AppsV1Api);
		const response = await client.listNamespacedReplicaSet({
			namespace,
			...(labelSelector ? { labelSelector } : {}),
		});
		const replicaSetList = response?.body || response;

		return (replicaSetList?.items || []).filter((replicaSet) =>
			isReplicaSetOwnedByDeployment(replicaSet, deploymentName, deploymentUid),
		);
	} catch (error) {
		throw KubernetesApiError.from(error);
	}
}

async function getDeployment(namespace, deployment) {
	try {
		const k8s = require("@kubernetes/client-node");
		const { createKubeClient } = require("./kubeClient.service");
		const client = await createKubeClient(k8s.AppsV1Api);
		const response = await client.readNamespacedDeployment({
			name: deployment,
			namespace,
		});

		return response?.body || response;
	} catch (error) {
		throw KubernetesApiError.from(error);
	}
}

module.exports = {
	buildLabelSelector,
	getDeployment,
	isValidDeployment,
	listDeployments,
	listReplicaSetsForDeployment,
};
