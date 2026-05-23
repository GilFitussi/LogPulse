const k8s = require("@kubernetes/client-node");
const { KubernetesApiError } = require("../errors/app.error");
const { createKubeClient } = require("./kubeClient.service");
const { runOcCommand } = require("./ocCommand.service");
const {
	resolveCluster,
	withClusterServer,
} = require("./clusterResourceTarget.service");

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

function parseJson(stdout, fallback) {
	const text = stdout?.trim();

	if (!text) {
		return fallback;
	}

	return JSON.parse(text);
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

async function listDeployments(clusterId, namespace) {
	const cluster = await resolveCluster(clusterId);
	return listDeploymentsWithArgs(
		withClusterServer(
			["get", "deployments", "-n", namespace, "-o", "json"],
			cluster,
		),
	);
}

async function listDeploymentsFromCurrentContext(namespace) {
	try {
		const client = await createKubeClient(k8s.AppsV1Api);
		const response = await client.listNamespacedDeployment({ namespace });
		const deploymentList = response?.body || response;

		return (deploymentList?.items || []).map(mapDeployment);
	} catch (error) {
		throw KubernetesApiError.from(error);
	}
}

async function listDeploymentsWithArgs(args) {
	try {
		const { stdout } = await runOcCommand(args);
		const deploymentList = parseJson(stdout, { items: [] });

		return (deploymentList?.items || []).map(mapDeployment);
	} catch (error) {
		throw KubernetesApiError.from(error);
	}
}

async function listReplicaSetsForDeployment(
	clusterId,
	namespace,
	deploymentName,
	deploymentUid,
	labelSelector,
) {
	const cluster = await resolveCluster(clusterId);
	const args = ["get", "replicasets", "-n", namespace, "-o", "json"];

	if (labelSelector) {
		args.push("-l", labelSelector);
	}

	return listReplicaSetsForDeploymentWithArgs(
		withClusterServer(args, cluster),
		deploymentName,
		deploymentUid,
	);
}

async function listReplicaSetsForDeploymentFromCurrentContext(
	namespace,
	deploymentName,
	deploymentUid,
	labelSelector,
) {
	try {
		const client = await createKubeClient(k8s.AppsV1Api);
		const response = await client.listNamespacedReplicaSet({
			namespace,
			...(labelSelector ? { labelSelector } : {}),
		});
		const replicaSetList = response?.body || response;

		return filterReplicaSetsForDeployment(
			replicaSetList?.items || [],
			deploymentName,
			deploymentUid,
		);
	} catch (error) {
		throw KubernetesApiError.from(error);
	}
}

async function listReplicaSetsForDeploymentWithArgs(
	args,
	deploymentName,
	deploymentUid,
) {
	try {
		const { stdout } = await runOcCommand(args);
		const replicaSetList = parseJson(stdout, { items: [] });

		return filterReplicaSetsForDeployment(
			replicaSetList?.items || [],
			deploymentName,
			deploymentUid,
		);
	} catch (error) {
		throw KubernetesApiError.from(error);
	}
}

function filterReplicaSetsForDeployment(
	replicaSets,
	deploymentName,
	deploymentUid,
) {
	return replicaSets.filter((replicaSet) =>
		isReplicaSetOwnedByDeployment(replicaSet, deploymentName, deploymentUid),
	);
}

async function getDeployment(clusterId, namespace, deployment) {
	const cluster = await resolveCluster(clusterId);

	try {
		const { stdout } = await runOcCommand(
			withClusterServer(
				["get", "deployment", deployment, "-n", namespace, "-o", "json"],
				cluster,
			),
		);

		return parseJson(stdout, null);
	} catch (error) {
		throw KubernetesApiError.from(error);
	}
}

async function getDeploymentFromCurrentContext(namespace, deployment) {
	try {
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
	getDeploymentFromCurrentContext,
	isValidDeployment,
	listDeployments,
	listDeploymentsFromCurrentContext,
	listReplicaSetsForDeployment,
	listReplicaSetsForDeploymentFromCurrentContext,
};
