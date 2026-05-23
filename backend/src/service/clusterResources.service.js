const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { Writable } = require("node:stream");
const { finished } = require("node:stream/promises");
const { AppError } = require("../errors/app.error");
const { getClusterById } = require("./clusterManager.service");
const { getClusterSession } = require("./clusterSessionRegistry.service");
const {
	getAppsV1Api,
	getCoreV1Api,
	getLogClient,
} = require("./kubernetesClientFactory.service");
const {
	getOcErrorMessage,
	isOcNotInstalledError,
	runOcCommand,
} = require("./ocCommand.service");

const CLUSTER_NOT_CONNECTED_MESSAGE = "Cluster is not connected";

async function requireCluster(clusterId) {
	const cluster = await getClusterById(clusterId);

	if (!cluster) {
		throw new AppError("Cluster not found", {
			status: 404,
			code: "CLUSTER_NOT_FOUND",
		});
	}

	return cluster;
}

function requireClusterSession(clusterId) {
	const session = getClusterSession(clusterId);

	if (!session?.kubeconfigContent) {
		throw new AppError(CLUSTER_NOT_CONNECTED_MESSAGE, {
			status: 409,
			code: "CLUSTER_NOT_CONNECTED",
			details: {
				message: `No active cluster session found for clusterId ${clusterId}`,
			},
			action: "Login to the cluster and try again.",
		});
	}

	return session;
}

async function requireActiveClusterSession(clusterId) {
	await requireCluster(clusterId);
	return requireClusterSession(clusterId);
}

function normalizeNamespace(name) {
	return { name };
}

function normalizeDeployment(deployment) {
	return {
		name: deployment?.metadata?.name || null,
		namespace: deployment?.metadata?.namespace || null,
		replicas: deployment?.spec?.replicas ?? 0,
		readyReplicas: deployment?.status?.readyReplicas ?? 0,
		updatedReplicas: deployment?.status?.updatedReplicas ?? 0,
		createdAt: deployment?.metadata?.creationTimestamp || null,
	};
}

function normalizePod(pod) {
	const containers = (pod?.spec?.containers || []).map(
		(container) => container.name,
	);
	const containerStatuses = pod?.status?.containerStatuses || [];
	const ready =
		containers.length > 0 &&
		containerStatuses.length >= containers.length &&
		containerStatuses.every((containerStatus) =>
			Boolean(containerStatus?.ready),
		);
	const restarts = containerStatuses.reduce(
		(total, containerStatus) => total + (containerStatus?.restartCount ?? 0),
		0,
	);

	return {
		name: pod?.metadata?.name || null,
		namespace: pod?.metadata?.namespace || null,
		status: pod?.status?.phase || "Unknown",
		ready,
		restarts,
		createdAt: pod?.metadata?.creationTimestamp || null,
		containers,
	};
}

function getResponseBody(response) {
	return response?.body || response;
}

function getResponseItems(response) {
	return getResponseBody(response)?.items || [];
}

function buildLabelSelector(matchLabels) {
	if (!matchLabels || typeof matchLabels !== "object") {
		return undefined;
	}

	const labels = Object.entries(matchLabels)
		.filter(([key, value]) => key && value !== undefined && value !== null)
		.map(([key, value]) => `${key}=${value}`);

	return labels.length > 0 ? labels.join(",") : undefined;
}

async function withTempKubeconfig(kubeconfigContent, callback) {
	const tempDirectory = await fs.mkdtemp(
		path.join(os.tmpdir(), "logpulse-kubeconfig-"),
	);
	const kubeconfigPath = path.join(tempDirectory, "config");

	try {
		await fs.writeFile(kubeconfigPath, kubeconfigContent, "utf8");
		return await callback(kubeconfigPath);
	} finally {
		await fs.rm(tempDirectory, { recursive: true, force: true });
	}
}

async function listClusterNamespaces(clusterId) {
	const session = await requireActiveClusterSession(clusterId);

	try {
		const { stdout } = await withTempKubeconfig(
			session.kubeconfigContent,
			(kubeconfigPath) =>
				runOcCommand(["--kubeconfig", kubeconfigPath, "projects", "-q"]),
		);

		return stdout
			.split(/\r?\n/)
			.map((line) => line.trim())
			.filter(Boolean)
			.map(normalizeNamespace);
	} catch (error) {
		const message = isOcNotInstalledError(error)
			? "oc CLI is not installed or not available in PATH"
			: getOcErrorMessage(error) || "Unable to list cluster namespaces";

		throw new AppError("Unable to list cluster namespaces", {
			status: isOcNotInstalledError(error) ? 500 : 502,
			code: "CLUSTER_NAMESPACES_UNAVAILABLE",
			details: { message },
			action: "Verify cluster access and try again.",
		});
	}
}

async function listClusterDeployments(clusterId, namespace) {
	await requireActiveClusterSession(clusterId);
	const appsV1Api = getAppsV1Api(clusterId);
	const response = await appsV1Api.listNamespacedDeployment({ namespace });
	return getResponseItems(response).map(normalizeDeployment);
}

async function listClusterPodsInternal(clusterId, namespace, labelSelector) {
	const coreV1Api = getCoreV1Api(clusterId);
	const response = await coreV1Api.listNamespacedPod({
		namespace,
		labelSelector,
	});

	return getResponseItems(response).map(normalizePod);
}

async function listClusterPods(clusterId, namespace) {
	await requireActiveClusterSession(clusterId);
	return listClusterPodsInternal(clusterId, namespace);
}

async function listClusterPodsForDeployment(clusterId, namespace, deployment) {
	await requireActiveClusterSession(clusterId);
	const appsV1Api = getAppsV1Api(clusterId);
	const deploymentResponse = await appsV1Api.readNamespacedDeployment({
		name: deployment,
		namespace,
	});
	const deploymentResource = getResponseBody(deploymentResponse);
	const labelSelector = buildLabelSelector(
		deploymentResource?.spec?.selector?.matchLabels,
	);

	if (!labelSelector) {
		return [];
	}

	return listClusterPodsInternal(clusterId, namespace, labelSelector);
}

async function resolveContainerName(clusterId, namespace, podName, container) {
	if (container) {
		return container;
	}

	const coreV1Api = getCoreV1Api(clusterId);
	const podResponse = await coreV1Api.readNamespacedPod({
		name: podName,
		namespace,
	});
	const pod = getResponseBody(podResponse);
	return pod?.spec?.containers?.[0]?.name || "";
}

function createLogCaptureStream(chunks) {
	return new Writable({
		write(chunk, encoding, callback) {
			chunks.push(
				Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, encoding),
			);
			callback();
		},
	});
}

async function getClusterPodLogs(clusterId, namespace, podName, options = {}) {
	await requireActiveClusterSession(clusterId);
	const containerName = await resolveContainerName(
		clusterId,
		namespace,
		podName,
		options.container,
	);
	const logClient = getLogClient(clusterId);
	const chunks = [];
	const stream = createLogCaptureStream(chunks);
	const logOptions = {};

	if (typeof options.tailLines === "number") {
		logOptions.tailLines = options.tailLines;
	}

	if (typeof options.sinceSeconds === "number") {
		logOptions.sinceSeconds = options.sinceSeconds;
	}

	await logClient.log(namespace, podName, containerName, stream, logOptions);
	await finished(stream);

	return {
		logs: Buffer.concat(chunks).toString("utf8"),
	};
}

module.exports = {
	CLUSTER_NOT_CONNECTED_MESSAGE,
	getClusterPodLogs,
	listClusterDeployments,
	listClusterNamespaces,
	listClusterPods,
	listClusterPodsForDeployment,
};
