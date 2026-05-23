const { KubernetesApiError } = require("../errors/app.error");
const { runOcCommand } = require("./ocCommand.service");
const {
	isClusterId,
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

async function listDeployments(namespaceOrClusterId, namespace) {
	if (!isClusterId(namespaceOrClusterId)) {
		return listDeploymentsFromCurrentContext(namespaceOrClusterId);
	}

	const cluster = await resolveCluster(namespaceOrClusterId);

	try {
		const { stdout } = await runOcCommand(
			withClusterServer(
				["get", "deployments", "-n", namespace, "-o", "json"],
				cluster,
			),
		);
		const deploymentList = parseJson(stdout, { items: [] });

		return (deploymentList?.items || []).map(mapDeployment);
	} catch (error) {
		throw KubernetesApiError.from(error);
	}
}

async function listDeploymentsFromCurrentContext(namespace) {
	try {
		const { stdout } = await runOcCommand([
			"get",
			"deployments",
			"-n",
			namespace,
			"-o",
			"json",
		]);
		const deploymentList = parseJson(stdout, { items: [] });

		return (deploymentList?.items || []).map(mapDeployment);
	} catch (error) {
		throw KubernetesApiError.from(error);
	}
}

async function listReplicaSetsForDeployment(
	namespaceOrClusterId,
	namespaceOrDeploymentName,
	deploymentNameOrUid,
	deploymentUidOrLabelSelector,
	labelSelector,
) {
	if (!isClusterId(namespaceOrClusterId)) {
		return listReplicaSetsForDeploymentFromCurrentContext(
			namespaceOrClusterId,
			namespaceOrDeploymentName,
			deploymentNameOrUid,
			deploymentUidOrLabelSelector,
		);
	}

	const namespace = namespaceOrDeploymentName;
	const deploymentName = deploymentNameOrUid;
	const deploymentUid = deploymentUidOrLabelSelector;
	const cluster = await resolveCluster(namespaceOrClusterId);

	try {
		const args = ["get", "replicasets", "-n", namespace, "-o", "json"];
		if (labelSelector) {
			args.push("-l", labelSelector);
		}
		const { stdout } = await runOcCommand(withClusterServer(args, cluster));
		const replicaSetList = parseJson(stdout, { items: [] });

		return (replicaSetList?.items || []).filter((replicaSet) =>
			isReplicaSetOwnedByDeployment(replicaSet, deploymentName, deploymentUid),
		);
	} catch (error) {
		throw KubernetesApiError.from(error);
	}
}

async function listReplicaSetsForDeploymentFromCurrentContext(
	namespace,
	deploymentName,
	deploymentUid,
	labelSelector,
) {
	try {
		const args = ["get", "replicasets", "-n", namespace, "-o", "json"];
		if (labelSelector) {
			args.push("-l", labelSelector);
		}
		const { stdout } = await runOcCommand(args);
		const replicaSetList = parseJson(stdout, { items: [] });

		return (replicaSetList?.items || []).filter((replicaSet) =>
			isReplicaSetOwnedByDeployment(replicaSet, deploymentName, deploymentUid),
		);
	} catch (error) {
		throw KubernetesApiError.from(error);
	}
}

async function getDeployment(
	namespaceOrClusterId,
	namespaceOrDeployment,
	deployment,
) {
	if (!isClusterId(namespaceOrClusterId)) {
		return getDeploymentFromCurrentContext(
			namespaceOrClusterId,
			namespaceOrDeployment,
		);
	}

	const namespace = namespaceOrDeployment;
	const cluster = await resolveCluster(namespaceOrClusterId);

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
		const { stdout } = await runOcCommand([
			"get",
			"deployment",
			deployment,
			"-n",
			namespace,
			"-o",
			"json",
		]);
		return parseJson(stdout, null);
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
