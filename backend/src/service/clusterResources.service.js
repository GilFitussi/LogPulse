const { randomUUID } = require("node:crypto");
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
	applyLogSearchFilters,
	discoverLogFields,
} = require("./kqlLogFilter.service");
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

function parseKubernetesErrorBody(body) {
	if (!body) {
		return null;
	}

	if (typeof body === "object") {
		return body;
	}

	if (typeof body !== "string") {
		return null;
	}

	try {
		return JSON.parse(body);
	} catch {
		return null;
	}
}

function getKubernetesApiErrorDetails(error, fallbackMessage) {
	const parsedBody = parseKubernetesErrorBody(
		error?.body || error?.response?.body,
	);
	const statusCode =
		error?.statusCode ||
		error?.response?.statusCode ||
		parsedBody?.code ||
		error?.body?.code ||
		error?.code;
	const message =
		parsedBody?.message ||
		error?.body?.message ||
		error?.message ||
		fallbackMessage;

	return {
		statusCode,
		message,
	};
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

	try {
		const response = await appsV1Api.listNamespacedDeployment({ namespace });
		return getResponseItems(response).map(normalizeDeployment);
	} catch (error) {
		const { statusCode, message } = getKubernetesApiErrorDetails(
			error,
			"Unable to list cluster deployments",
		);

		if (statusCode === 404) {
			return [];
		}

		if (statusCode === 403) {
			throw new AppError("Unable to list cluster deployments", {
				status: 403,
				code: "CLUSTER_DEPLOYMENTS_FORBIDDEN",
				details: {
					message,
				},
				action: "Choose another namespace or request deployment access.",
			});
		}

		throw new AppError("Unable to list cluster deployments", {
			status: 502,
			code: "CLUSTER_DEPLOYMENTS_UNAVAILABLE",
			details: {
				message,
			},
			action: "Verify cluster access and try again.",
		});
	}
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

const LOG_SEARCH_SESSION_TTL_MS = 15 * 60 * 1000;
const podLogSearchSessions = new Map();

function parseTimestampToken(value) {
	if (typeof value !== "string" || !value.trim()) {
		return null;
	}

	const parsedTimestamp = Date.parse(value.trim());

	if (Number.isNaN(parsedTimestamp)) {
		return null;
	}

	return {
		rawTimestamp: value.trim(),
		parsedTimestamp,
		isoTimestamp: new Date(parsedTimestamp).toISOString(),
	};
}

function detectLogLevel(message) {
	const match = String(message || "").match(
		/\b(error|warn|warning|info|debug|trace|fatal)\b/i,
	);

	if (!match) {
		return null;
	}

	const normalizedLevel = match[1].toUpperCase();
	return normalizedLevel === "WARNING" ? "WARN" : normalizedLevel;
}

function tryParseJsonLogMessage(message) {
	try {
		const parsed = JSON.parse(message);
		return parsed && typeof parsed === "object" ? parsed : null;
	} catch {
		return null;
	}
}

function buildLogRecord(rawLine, index, metadata) {
	const line = String(rawLine || "")
		.replace(/\r/g, "")
		.trim();

	if (!line) {
		return null;
	}

	const firstSpaceIndex = line.indexOf(" ");

	if (firstSpaceIndex === -1) {
		return null;
	}

	const timestamp = parseTimestampToken(line.slice(0, firstSpaceIndex));

	if (!timestamp) {
		return null;
	}

	const message = line.slice(firstSpaceIndex + 1);
	const jsonMessage = tryParseJsonLogMessage(message);
	const normalizedMessage =
		typeof jsonMessage?.message === "string" && jsonMessage.message.trim()
			? jsonMessage.message.trim()
			: typeof jsonMessage?.msg === "string" && jsonMessage.msg.trim()
				? jsonMessage.msg.trim()
				: message;
	const levelSource =
		typeof jsonMessage?.level === "string"
			? jsonMessage.level
			: typeof jsonMessage?.severity === "string"
				? jsonMessage.severity
				: message;

	return {
		id: `${metadata.podName}:${timestamp.isoTimestamp}:${index}:${line}`,
		namespace: metadata.namespace,
		podName: metadata.podName,
		timestamp: timestamp.isoTimestamp,
		level: detectLogLevel(levelSource),
		message: normalizedMessage,
		rawLine: line,
		parsedTimestamp: timestamp.parsedTimestamp,
		order: index,
	};
}

function parseLogEntries(rawLogs, metadata) {
	return String(rawLogs || "")
		.split(/\r?\n/)
		.map((line, index) => buildLogRecord(line, index, metadata))
		.filter(Boolean);
}

function buildLogWindow({ sinceSeconds, windowEndTimestamp }) {
	const endTimestamp =
		parseTimestampToken(windowEndTimestamp)?.parsedTimestamp ?? Date.now();
	const startTimestamp = endTimestamp - sinceSeconds * 1000;

	return {
		windowStartTimestamp: new Date(startTimestamp).toISOString(),
		windowEndTimestamp: new Date(endTimestamp).toISOString(),
	};
}

async function fetchPodLogsForWindow(clusterId, namespace, podName, window) {
	const containerName = await resolveContainerName(
		clusterId,
		namespace,
		podName,
	);
	const logClient = getLogClient(clusterId);
	const chunks = [];
	const stream = createLogCaptureStream(chunks);

	await logClient.log(namespace, podName, containerName, stream, {
		timestamps: true,
		sinceTime: window.windowStartTimestamp,
		untilTime: window.windowEndTimestamp,
	});
	await finished(stream);

	return parseLogEntries(Buffer.concat(chunks).toString("utf8"), {
		namespace,
		podName,
	});
}

function sortCombinedLogRecords(logs) {
	return [...logs].sort((left, right) => {
		if (right.parsedTimestamp !== left.parsedTimestamp) {
			return right.parsedTimestamp - left.parsedTimestamp;
		}

		if (left.podName !== right.podName) {
			return left.podName.localeCompare(right.podName);
		}

		return right.order - left.order;
	});
}

function cleanupExpiredPodLogSearchSessions() {
	const expiresBefore = Date.now() - LOG_SEARCH_SESSION_TTL_MS;

	for (const [searchSessionId, session] of podLogSearchSessions.entries()) {
		if (session.createdAt < expiresBefore) {
			podLogSearchSessions.delete(searchSessionId);
		}
	}
}

function createPodLogSearchSession(clusterId, payload) {
	cleanupExpiredPodLogSearchSessions();
	const searchSessionId = randomUUID();

	podLogSearchSessions.set(searchSessionId, {
		searchSessionId,
		clusterId,
		createdAt: Date.now(),
		...payload,
	});

	return podLogSearchSessions.get(searchSessionId);
}

function getPodLogSearchSession(clusterId, searchSessionId) {
	cleanupExpiredPodLogSearchSessions();
	const session = podLogSearchSessions.get(searchSessionId);

	if (!session || session.clusterId !== clusterId) {
		throw new AppError("Pod log search session not found", {
			status: 404,
			code: "POD_LOG_SEARCH_NOT_FOUND",
		});
	}

	return session;
}

function buildPodLogSearchResponse(session, offset, limit) {
	const normalizedOffset = Math.max(0, offset);
	const normalizedLimit = Math.max(1, limit);
	const logs = session.logs.slice(
		normalizedOffset,
		normalizedOffset + normalizedLimit,
	);
	const nextOffset = normalizedOffset + logs.length;

	return {
		searchSessionId: session.searchSessionId,
		namespace: session.namespace,
		podNames: session.podNames,
		windowStartTimestamp: session.windowStartTimestamp,
		windowEndTimestamp: session.windowEndTimestamp,
		count: logs.length,
		limit: normalizedLimit,
		offset: normalizedOffset,
		totalCount: session.logs.length,
		hasMore: nextOffset < session.logs.length,
		nextOffset: nextOffset < session.logs.length ? nextOffset : null,
		fields: discoverLogFields(session.logs),
		logs: logs.map(({ parsedTimestamp, order, ...log }) => log),
	};
}

async function createPodLogSearch(clusterId, namespace, options = {}) {
	await requireActiveClusterSession(clusterId);
	const window = buildLogWindow({
		sinceSeconds: options.sinceSeconds,
		windowEndTimestamp: options.windowEndTimestamp,
	});
	const podNames = [...new Set(options.podNames)];
	const podLogs = await Promise.all(
		podNames.map((podName) =>
			fetchPodLogsForWindow(clusterId, namespace, podName, window),
		),
	);
	let logs;

	try {
		logs = applyLogSearchFilters(sortCombinedLogRecords(podLogs.flat()), {
			query: options.query,
			filters: options.filters,
		});
	} catch (error) {
		if (error.code === "INVALID_KQL_QUERY") {
			throw new AppError("Invalid KQL query", {
				status: 400,
				code: "INVALID_KQL_QUERY",
				details: error.details,
			});
		}

		throw error;
	}
	const session = createPodLogSearchSession(clusterId, {
		namespace,
		podNames,
		windowStartTimestamp: window.windowStartTimestamp,
		windowEndTimestamp: window.windowEndTimestamp,
		query: options.query || "",
		filters: Array.isArray(options.filters) ? options.filters : [],
		logs,
	});

	return buildPodLogSearchResponse(session, 0, options.limit);
}

async function getPodLogSearchResults(
	clusterId,
	searchSessionId,
	options = {},
) {
	const session = getPodLogSearchSession(clusterId, searchSessionId);
	return buildPodLogSearchResponse(
		session,
		typeof options.offset === "number" ? options.offset : 0,
		typeof options.limit === "number" ? options.limit : 500,
	);
}

function resetPodLogSearchSessions() {
	podLogSearchSessions.clear();
}

module.exports = {
	CLUSTER_NOT_CONNECTED_MESSAGE,
	createPodLogSearch,
	getPodLogSearchResults,
	listClusterDeployments,
	listClusterNamespaces,
	listClusterPods,
	listClusterPodsForDeployment,
	resetPodLogSearchSessions,
};
