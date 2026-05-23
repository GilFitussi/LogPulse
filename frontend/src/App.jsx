import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
	Copy,
	Download,
	FileJson,
	MoreHorizontal,
	Pause,
	Play,
	X,
} from "lucide-react";
import { List } from "react-window";

import { ClustersSidebar } from "@/components/clusters-sidebar";
import {
	AppShell,
	ContentLayout,
	PageContainer,
	Panel,
} from "@/components/layout/app-shell";
import {
	ToolbarButton,
	ToolbarSearchContainer,
	TopToolbar,
} from "@/components/layout/top-toolbar";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import {
	LOG_SEVERITIES,
	appendLogLines,
	detectLogSeverity,
	getFilteredLogLines,
} from "./logBuffer";

const API_BASE_URL = "http://localhost:3000";

function formatLogEvent(data) {
	if (typeof data === "string") {
		return data;
	}

	if (data && typeof data === "object") {
		const timestamp = typeof data.timestamp === "string" ? data.timestamp : "";
		const line =
			typeof data.line === "string" ? data.line : JSON.stringify(data);

		return timestamp ? `${timestamp} ${line}` : line;
	}

	return String(data ?? "");
}

const LOG_SCROLL_BOTTOM_THRESHOLD = 48;
const LOG_LIST_HEIGHT = 560;
const LOG_ROW_HEIGHT = 22;

const severityFilterOptions = [
	{
		severity: LOG_SEVERITIES.ERROR,
		label: "Error",
		markerClassName: "bg-red-500 text-white",
		buttonClassName:
			"border-red-500/35 bg-red-500/10 text-red-700 dark:text-red-300",
	},
	{
		severity: LOG_SEVERITIES.WARN,
		label: "Warn",
		markerClassName: "bg-amber-400 text-amber-950",
		buttonClassName:
			"border-amber-500/35 bg-amber-500/10 text-amber-700 dark:text-amber-300",
	},
	{
		severity: LOG_SEVERITIES.INFO,
		label: "Info",
		markerClassName: "bg-sky-400 text-sky-950",
		buttonClassName:
			"border-sky-500/35 bg-sky-500/10 text-sky-700 dark:text-sky-300",
	},
	{
		severity: LOG_SEVERITIES.DEBUG,
		label: "Debug",
		markerClassName: "bg-violet-400 text-violet-950",
		buttonClassName:
			"border-violet-500/35 bg-violet-500/10 text-violet-700 dark:text-violet-300",
	},
];

const severityFilterOptionsBySeverity = Object.fromEntries(
	severityFilterOptions.map((option) => [option.severity, option]),
);

const AUTH_STATUS = {
	CHECKING: "checking",
	CONNECTED: "connected",
	NOT_LOGGED_IN: "not-logged-in",
	OC_NOT_INSTALLED: "oc-not-installed",
	ERROR: "error",
};

function getClusterApiErrorMessage(data, fallbackMessage) {
	const details = data.details;

	if (typeof details === "string") {
		return details;
	}

	if (details && typeof details === "object") {
		if (typeof details.message === "string") {
			return details.message;
		}

		const detailsMessage = Object.values(details)
			.filter((value) => typeof value === "string" && value.trim())
			.join(" ");

		if (detailsMessage) {
			return detailsMessage;
		}
	}

	return data.error || fallbackMessage;
}

function parseLogLineMetadata(line, selectedNamespace, selectedPod) {
	const normalizedLine = String(line ?? "");
	const timestampMatch = normalizedLine.match(
		/^\s*(\d{4}-\d{2}-\d{2}[T\s]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?)/,
	);

	return {
		timestamp: timestampMatch?.[1] || "",
		severity: detectLogSeverity(normalizedLine),
		namespace: selectedNamespace || "",
		pod: selectedPod || "",
	};
}

function parseStructuredJsonFromLogLine(line) {
	const normalizedLine = String(line ?? "");
	const matchingTokenByOpeningToken = {
		"{": "}",
		"[": "]",
	};

	for (
		let startIndex = 0;
		startIndex < normalizedLine.length;
		startIndex += 1
	) {
		const openingToken = normalizedLine[startIndex];
		const closingToken = matchingTokenByOpeningToken[openingToken];

		if (!closingToken) {
			continue;
		}

		const expectedClosingTokens = [closingToken];
		let isInsideString = false;
		let isEscaped = false;

		for (
			let currentIndex = startIndex + 1;
			currentIndex < normalizedLine.length;
			currentIndex += 1
		) {
			const currentToken = normalizedLine[currentIndex];

			if (isInsideString) {
				if (isEscaped) {
					isEscaped = false;
				} else if (currentToken === "\\") {
					isEscaped = true;
				} else if (currentToken === '"') {
					isInsideString = false;
				}

				continue;
			}

			if (currentToken === '"') {
				isInsideString = true;
				continue;
			}

			const nestedClosingToken = matchingTokenByOpeningToken[currentToken];

			if (nestedClosingToken) {
				expectedClosingTokens.push(nestedClosingToken);
				continue;
			}

			if (
				currentToken !== expectedClosingTokens[expectedClosingTokens.length - 1]
			) {
				continue;
			}

			expectedClosingTokens.pop();

			if (expectedClosingTokens.length === 0) {
				const candidate = normalizedLine.slice(startIndex, currentIndex + 1);

				try {
					const parsedJson = JSON.parse(candidate);

					if (parsedJson && typeof parsedJson === "object") {
						return parsedJson;
					}
				} catch {
					// Keep scanning for another JSON object or array in the log line.
				}

				break;
			}
		}
	}

	return null;
}

function formatStructuredJsonFromLogLine(line) {
	const parsedJson = parseStructuredJsonFromLogLine(line);

	return parsedJson ? JSON.stringify(parsedJson, null, 2) : "";
}

function writeTextToClipboard(text) {
	if (navigator.clipboard?.writeText) {
		return navigator.clipboard.writeText(text);
	}

	const textArea = document.createElement("textarea");
	textArea.value = text;
	textArea.setAttribute("readonly", "");
	textArea.style.position = "fixed";
	textArea.style.left = "-9999px";
	document.body.appendChild(textArea);
	textArea.select();

	try {
		const copied = document.execCommand("copy");

		return copied
			? Promise.resolve()
			: Promise.reject(new Error("Copy command failed"));
	} finally {
		document.body.removeChild(textArea);
	}
}

function downloadLogFile(content, filename, mimeType) {
	const blob = new Blob([content], { type: mimeType });
	const url = URL.createObjectURL(blob);
	const link = document.createElement("a");

	link.href = url;
	link.download = filename;
	document.body.appendChild(link);
	link.click();
	document.body.removeChild(link);
	URL.revokeObjectURL(url);
}

function createLogExportFilename(extension, selectedNamespace, selectedPod) {
	const scope =
		[selectedNamespace, selectedPod].filter(Boolean).join("-") || "logs";
	const timestamp = new Date().toISOString().replace(/[:.]/g, "-");

	return `${scope}-${timestamp}.${extension}`;
}

function renderHighlightedLogLine(line, searchText) {
	const normalizedSearchText = searchText.trim().toLowerCase();

	if (!normalizedSearchText) {
		return line;
	}

	const normalizedLine = line.toLowerCase();
	const highlightedParts = [];
	let currentIndex = 0;
	let matchIndex = normalizedLine.indexOf(normalizedSearchText, currentIndex);

	while (matchIndex !== -1) {
		if (matchIndex > currentIndex) {
			highlightedParts.push(line.slice(currentIndex, matchIndex));
		}

		const matchEndIndex = matchIndex + normalizedSearchText.length;

		highlightedParts.push(
			<mark
				key={`${matchIndex}-${highlightedParts.length}`}
				className="rounded px-0.5 font-semibold ring-1 ring-amber-900/20"
				style={{ backgroundColor: "#fcd34d", color: "#451a03" }}
			>
				{line.slice(matchIndex, matchEndIndex)}
			</mark>,
		);

		currentIndex = matchEndIndex;
		matchIndex = normalizedLine.indexOf(normalizedSearchText, currentIndex);
	}

	if (currentIndex < line.length) {
		highlightedParts.push(line.slice(currentIndex));
	}

	return highlightedParts;
}

function splitLogLineForDisplay(line) {
	const normalizedLine = String(line ?? "");
	const timestampMatch = normalizedLine.match(
		/^\s*(\d{4}-\d{2}-\d{2}[T\s]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?)\s*(.*)$/,
	);

	if (!timestampMatch) {
		return { message: normalizedLine, timestamp: "" };
	}

	return {
		message: timestampMatch[2] || "",
		timestamp: timestampMatch[1],
	};
}

function getWorkspaceStatusConfig(cluster) {
	const normalizedStatus = String(
		cluster?.lastConnectionStatus || "",
	).toLowerCase();

	if (
		["connected", "success", "online", "ok", "healthy"].includes(
			normalizedStatus,
		)
	) {
		return {
			label: "Connected",
			className:
				"bg-emerald-500/10 text-emerald-700 ring-emerald-500/20 dark:text-emerald-300",
			dotClassName: "bg-emerald-500",
		};
	}

	if (["error", "failed", "offline", "unhealthy"].includes(normalizedStatus)) {
		return {
			label: "Connection issue",
			className: "bg-red-500/10 text-red-700 ring-red-500/20 dark:text-red-300",
			dotClassName: "bg-red-500",
		};
	}

	if (["checking", "connecting", "pending"].includes(normalizedStatus)) {
		return {
			label: "Checking",
			className: "bg-sky-500/10 text-sky-700 ring-sky-500/20 dark:text-sky-300",
			dotClassName: "bg-sky-500",
		};
	}

	return {
		label: normalizedStatus ? "Logged out" : "Not checked",
		className: "bg-muted text-muted-foreground ring-border",
		dotClassName: "bg-muted-foreground/60",
	};
}

function SelectedClusterWorkspaceHeader({ cluster }) {
	if (!cluster) {
		return (
			<div className="mb-2 rounded-lg border border-dashed border-border bg-muted/30 px-3 py-2">
				<p className="text-sm font-medium text-foreground">
					No cluster workspace selected
				</p>
				<p className="mt-0.5 text-xs text-muted-foreground">
					Select a cluster from the sidebar to make it the current workspace.
				</p>
			</div>
		);
	}

	const statusConfig = getWorkspaceStatusConfig(cluster);
	const statusDetail =
		cluster.lastConnectionError ||
		(cluster.lastConnectedAt
			? `Last connected ${new Date(cluster.lastConnectedAt).toLocaleString()}`
			: "No connection check recorded");

	return (
		<div className="mb-2 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/70 bg-background/60 px-3 py-2">
			<div className="min-w-0">
				<p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
					Current workspace
				</p>
				<h2 className="mt-0.5 truncate text-base font-semibold text-foreground">
					{cluster.name}
				</h2>
				<p className="mt-0.5 truncate text-xs text-muted-foreground">
					{cluster.apiUrl}
				</p>
			</div>
			<div className="flex flex-wrap items-center gap-1.5 text-xs">
				<span
					className={`inline-flex items-center gap-1.5 rounded-full px-2 py-1 ring-1 ${statusConfig.className}`}
					title={statusDetail}
				>
					<span
						className={`size-1.5 rounded-full ${statusConfig.dotClassName}`}
						aria-hidden="true"
					/>
					{statusConfig.label}
				</span>
				{cluster.defaultNamespace ? (
					<span className="rounded-full bg-muted px-2 py-1 text-muted-foreground ring-1 ring-border">
						Default namespace: {cluster.defaultNamespace}
					</span>
				) : null}
			</div>
		</div>
	);
}

function LogLineRow({
	ariaAttributes,
	index,
	logLinesStore,
	logSearch,
	onSelectLogLine,
	selectedLogLine,
	style,
}) {
	const line = logLinesStore.lines[index];
	const severity = detectLogSeverity(line);
	const severityOption = severityFilterOptionsBySeverity[severity];
	const { message, timestamp } = splitLogLineForDisplay(line);
	const isSelected =
		selectedLogLine?.line === line && selectedLogLine?.index === index;

	return (
		<button
			{...ariaAttributes}
			type="button"
			style={style}
			onClick={() => onSelectLogLine({ index, line })}
			className={`grid grid-cols-[9.5rem_3.75rem_minmax(0,1fr)] items-start gap-2 overflow-hidden px-2 py-0.5 text-left font-mono text-xs leading-5 text-log-foreground ${
				isSelected ? "bg-slate-800/80" : "hover:bg-slate-900/70"
			}`}
		>
			<span className="truncate text-[11px] text-log-foreground/50">
				{timestamp || "—"}
			</span>
			<span
				className={`justify-self-start rounded px-1.5 py-0.5 text-[9px] font-bold uppercase leading-none ${severityOption.markerClassName}`}
			>
				{severityOption.label}
			</span>
			<span className="min-w-0 overflow-hidden text-ellipsis whitespace-pre text-log-foreground">
				{renderHighlightedLogLine(message || line, logSearch)}
			</span>
		</button>
	);
}

function App() {
	const [, setHealthStatus] = useState("Checking backend health...");
	const [, setAuthStatus] = useState(AUTH_STATUS.CHECKING);
	const [, setAuthStatusMessage] = useState("Checking oc login...");
	const [clusters, setClusters] = useState([]);
	const [clustersError, setClustersError] = useState("");
	const [isClustersLoading, setIsClustersLoading] = useState(true);
	const [selectedClusterId, setSelectedClusterId] = useState(null);
	const [, setNamespaces] = useState([]);
	const [, setNamespacesStatus] = useState("Loading projects...");
	const [selectedNamespace, setSelectedNamespace] = useState("");
	const [, setDeployments] = useState([]);
	const [, setDeploymentsStatus] = useState(
		"Select a project to load deployments",
	);
	const [selectedDeployment, setSelectedDeployment] = useState("");
	const [, setPods] = useState([]);
	const [, setPodsStatus] = useState("Select a deployment to load pods");
	const [selectedPod, setSelectedPod] = useState("");
	const [rawLogLines, setRawLogLines] = useState([]);
	const [logSearch, setLogSearch] = useState("");
	const [activeSeverityFilters, setActiveSeverityFilters] = useState([]);
	const [selectedLogLine, setSelectedLogLine] = useState(null);
	const [includeFilteredOutLogsForExport, setIncludeFilteredOutLogsForExport] =
		useState(false);
	const [logTransferStatus, setLogTransferStatus] = useState("");
	const [logStatus, setLogStatus] = useState(
		"Select a project, deployment and pod to stream logs",
	);
	const [isLogAutoScrollPaused, setIsLogAutoScrollPaused] = useState(false);
	const [newLogCountWhilePaused, setNewLogCountWhilePaused] = useState(0);
	const [logStreamUpdateCount, setLogStreamUpdateCount] = useState(0);
	const [pausedRawLogLines, setPausedRawLogLines] = useState(null);
	const logListRef = useRef(null);
	const isLogAutoScrollPausedRef = useRef(false);
	const isManualLogFollowingPausedRef = useRef(false);
	const logSearchRef = useRef("");
	const activeSeverityFiltersRef = useRef([]);

	const resetWorkspaceScope = useCallback((nextNamespace = "") => {
		setSelectedNamespace(nextNamespace);
		setDeployments([]);
		setSelectedDeployment("");
		setPods([]);
		setSelectedPod("");
		setRawLogLines([]);
		setActiveSeverityFilters([]);
		setSelectedLogLine(null);
		setIncludeFilteredOutLogsForExport(false);
		setLogTransferStatus("");
		isManualLogFollowingPausedRef.current = false;
		setPausedRawLogLines(null);
		setIsLogAutoScrollPaused(false);
		setNewLogCountWhilePaused(0);
		setDeploymentsStatus(
			nextNamespace
				? "Loading deployments..."
				: "Select a project to load deployments",
		);
		setPodsStatus("Select a deployment to load pods");
		setLogStatus("Select a project, deployment and pod to stream logs");
	}, []);

	const loadClusters = useCallback(async () => {
		setIsClustersLoading(true);
		setClustersError("");

		try {
			const response = await fetch(`${API_BASE_URL}/clusters`);
			const data = await response.json().catch(() => ({}));

			if (!response.ok) {
				setClustersError(
					data.details || data.error || "Unable to load clusters",
				);
				setClusters([]);
				setSelectedClusterId(null);
				return;
			}

			if (!Array.isArray(data.clusters)) {
				setClustersError("Unexpected clusters response from backend");
				setClusters([]);
				setSelectedClusterId(null);
				return;
			}

			setClusters(data.clusters);
			setSelectedClusterId((currentClusterId) => {
				if (
					currentClusterId &&
					data.clusters.some(
						(cluster) => String(cluster.id) === String(currentClusterId),
					)
				) {
					return currentClusterId;
				}

				return data.clusters[0]?.id ?? null;
			});
		} catch {
			setClustersError("Unable to reach backend");
			setClusters([]);
			setSelectedClusterId(null);
		} finally {
			setIsClustersLoading(false);
		}
	}, []);

	const createCluster = useCallback(
		async (clusterInput) => {
			const response = await fetch(`${API_BASE_URL}/clusters`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify(clusterInput),
			});
			const data = await response.json().catch(() => ({}));

			if (!response.ok) {
				throw new Error(
					getClusterApiErrorMessage(data, "Unable to create cluster"),
				);
			}

			if (!data.cluster) {
				throw new Error("Unexpected create cluster response from backend");
			}

			await loadClusters();
			setSelectedClusterId(data.cluster.id);

			return data.cluster;
		},
		[loadClusters],
	);

	const updateCluster = useCallback(
		async (cluster, clusterInput) => {
			const response = await fetch(`${API_BASE_URL}/clusters/${cluster.id}`, {
				method: "PATCH",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify(clusterInput),
			});
			const data = await response.json().catch(() => ({}));

			if (!response.ok) {
				throw new Error(
					getClusterApiErrorMessage(data, "Unable to update cluster"),
				);
			}

			if (!data.cluster) {
				throw new Error("Unexpected update cluster response from backend");
			}

			await loadClusters();
			setSelectedClusterId(data.cluster.id);

			return data.cluster;
		},
		[loadClusters],
	);

	const deleteCluster = useCallback(
		async (cluster) => {
			const response = await fetch(`${API_BASE_URL}/clusters/${cluster.id}`, {
				method: "DELETE",
			});

			if (!response.ok) {
				const data = await response.json().catch(() => ({}));

				throw new Error(
					getClusterApiErrorMessage(data, "Unable to delete cluster"),
				);
			}

			await loadClusters();
		},
		[loadClusters],
	);

	const checkAuthStatus = useCallback(async () => {
		try {
			const response = await fetch(`${API_BASE_URL}/api/auth/status`);
			const data = await response.json().catch(() => ({}));

			if (response.ok && data.authenticated === true) {
				setAuthStatus(AUTH_STATUS.CONNECTED);
				setAuthStatusMessage(
					data.username ? `OC logged in as ${data.username}` : "OC logged in",
				);
				return;
			}

			if (response.status === 401) {
				setAuthStatus(AUTH_STATUS.NOT_LOGGED_IN);
				setAuthStatusMessage(data.action || data.error || "Run oc login");
				return;
			}

			if (
				response.status === 500 &&
				data.error?.toLowerCase().includes("oc cli")
			) {
				setAuthStatus(AUTH_STATUS.OC_NOT_INSTALLED);
				setAuthStatusMessage(data.action || data.error || "oc CLI missing");
				return;
			}

			setAuthStatus(AUTH_STATUS.ERROR);
			setAuthStatusMessage(data.error || "Unable to verify oc login");
		} catch {
			setAuthStatus(AUTH_STATUS.ERROR);
			setAuthStatusMessage("Unable to reach backend for oc login check");
		}
	}, []);

	const loadNamespaces = useCallback(
		async (clusterId = selectedClusterId) => {
			setNamespaces([]);
			setSelectedNamespace("");
			setDeployments([]);
			setSelectedDeployment("");
			setPods([]);
			setSelectedPod("");
			setDeploymentsStatus("Select a project to load deployments");
			setPodsStatus("Select a deployment to load pods");

			if (!clusterId) {
				setNamespacesStatus("Select a cluster to load projects");
				return;
			}

			setNamespacesStatus("Loading projects...");

			try {
				const response = await fetch(
					`${API_BASE_URL}/api/clusters/${encodeURIComponent(clusterId)}/namespaces`,
				);
				const data = await response.json().catch(() => ({}));

				if (response.status === 401) {
					setNamespacesStatus(
						data.details || data.error || "OpenShift authentication failed",
					);
					return;
				}

				if (response.status === 403) {
					setNamespacesStatus(
						data.details || "Your oc user cannot list projects",
					);
					return;
				}

				if (!response.ok) {
					setNamespacesStatus(
						data.details || data.error || "Unable to load projects",
					);
					return;
				}

				if (!Array.isArray(data.namespaces)) {
					setNamespacesStatus("Unexpected projects response from backend");
					return;
				}

				setNamespaces(data.namespaces);
				setNamespacesStatus(
					data.namespaces.length > 0 ? "Choose a project" : "No projects found",
				);
			} catch {
				setNamespacesStatus("Unable to reach backend");
			}
		},
		[selectedClusterId],
	);

	const loginToCluster = useCallback(
		async (cluster, credentials) => {
			const response = await fetch(
				`${API_BASE_URL}/clusters/${cluster.id}/login`,
				{
					method: "POST",
					headers: {
						"Content-Type": "application/json",
					},
					body: JSON.stringify(credentials),
				},
			);
			const data = await response.json().catch(() => ({}));

			if (!response.ok) {
				throw new Error(
					getClusterApiErrorMessage(data, "Unable to login to cluster"),
				);
			}

			const loggedInClusterId = data.cluster?.id ?? cluster.id;

			await loadClusters();
			setSelectedClusterId(loggedInClusterId);
			await checkAuthStatus();
			await loadNamespaces(loggedInClusterId);

			return data;
		},
		[checkAuthStatus, loadClusters, loadNamespaces],
	);

	const logoutFromCluster = useCallback(
		async (cluster) => {
			const response = await fetch(
				`${API_BASE_URL}/clusters/${cluster.id}/logout`,
				{
					method: "POST",
				},
			);
			const data = await response.json().catch(() => ({}));

			if (!response.ok) {
				throw new Error(
					getClusterApiErrorMessage(data, "Unable to logout from cluster"),
				);
			}

			await loadClusters();
			await checkAuthStatus();
			await loadNamespaces();

			return data.cluster;
		},
		[checkAuthStatus, loadClusters, loadNamespaces],
	);

	useEffect(() => {
		const checkBackendHealth = async () => {
			try {
				const response = await fetch(`${API_BASE_URL}/health`);

				if (!response.ok) {
					setHealthStatus("Backend health check failed");
					return;
				}

				const data = await response.json();

				if (data.status === "ok") {
					setHealthStatus("Backend is healthy");
					return;
				}

				setHealthStatus("Backend health check failed");
			} catch {
				setHealthStatus("Backend health check failed");
			}
		};

		void Promise.resolve().then(checkBackendHealth);
		void Promise.resolve().then(checkAuthStatus);
		void Promise.resolve().then(loadClusters);
	}, [checkAuthStatus, loadClusters]);

	useEffect(() => {
		void Promise.resolve().then(() => loadNamespaces(selectedClusterId));
	}, [loadNamespaces, selectedClusterId]);

	useEffect(() => {
		if (!selectedClusterId || !selectedNamespace) {
			return undefined;
		}

		const controller = new AbortController();

		const loadDeployments = async () => {
			setDeploymentsStatus("Loading deployments...");

			try {
				const response = await fetch(
					`${API_BASE_URL}/api/clusters/${encodeURIComponent(selectedClusterId)}/namespaces/${encodeURIComponent(selectedNamespace)}/deployments`,
					{ signal: controller.signal },
				);
				const data = await response.json().catch(() => ({}));

				if (response.status === 401) {
					setDeploymentsStatus(
						data.details || data.error || "OpenShift authentication failed",
					);
					return;
				}

				if (response.status === 403) {
					setDeploymentsStatus(
						data.details ||
							"Your oc user cannot list deployments in this project",
					);
					return;
				}

				if (!response.ok) {
					setDeploymentsStatus(
						data.details || data.error || "Unable to load deployments",
					);
					return;
				}

				if (!Array.isArray(data.deployments)) {
					setDeploymentsStatus("Unexpected deployments response from backend");
					return;
				}

				setDeployments(data.deployments);
				setDeploymentsStatus(
					data.deployments.length > 0
						? "Choose a deployment"
						: "No deployments found",
				);
			} catch (error) {
				if (error.name !== "AbortError") {
					setDeploymentsStatus("Unable to reach backend");
				}
			}
		};

		loadDeployments();

		return () => controller.abort();
	}, [selectedClusterId, selectedNamespace]);

	useEffect(() => {
		if (!selectedClusterId || !selectedNamespace || !selectedDeployment) {
			return undefined;
		}

		const controller = new AbortController();

		const loadPods = async () => {
			setPodsStatus("Loading pods...");

			try {
				const response = await fetch(
					`${API_BASE_URL}/api/clusters/${encodeURIComponent(selectedClusterId)}/namespaces/${encodeURIComponent(selectedNamespace)}/deployments/${encodeURIComponent(selectedDeployment)}/pods`,
					{ signal: controller.signal },
				);
				const data = await response.json().catch(() => ({}));

				if (response.status === 401) {
					setPodsStatus(
						data.details || data.error || "OpenShift authentication failed",
					);
					return;
				}

				if (response.status === 403) {
					setPodsStatus(
						data.details || "Your oc user cannot list pods for this deployment",
					);
					return;
				}

				if (!response.ok) {
					setPodsStatus(data.details || data.error || "Unable to load pods");
					return;
				}

				if (!Array.isArray(data.pods)) {
					setPodsStatus("Unexpected pods response from backend");
					return;
				}

				setPods(data.pods);
				setPodsStatus(data.pods.length > 0 ? "Choose a pod" : "No pods found");
			} catch (error) {
				if (error.name !== "AbortError") {
					setPodsStatus("Unable to reach backend");
				}
			}
		};

		loadPods();

		return () => controller.abort();
	}, [selectedClusterId, selectedDeployment, selectedNamespace]);

	const appendReceivedLogLines = useCallback((receivedLogLines) => {
		const formattedLogLines = (
			Array.isArray(receivedLogLines) ? receivedLogLines : [receivedLogLines]
		).map(formatLogEvent);

		if (formattedLogLines.length === 0) {
			return;
		}

		setRawLogLines((currentLines) =>
			appendLogLines(currentLines, formattedLogLines),
		);

		if (isLogAutoScrollPausedRef.current) {
			const newVisibleLogLineCount = getFilteredLogLines(
				formattedLogLines,
				logSearchRef.current,
				activeSeverityFiltersRef.current,
			).length;

			if (newVisibleLogLineCount > 0) {
				setNewLogCountWhilePaused(
					(currentCount) => currentCount + newVisibleLogLineCount,
				);
			}
		} else {
			setNewLogCountWhilePaused(0);
		}

		setLogStreamUpdateCount((currentCount) => currentCount + 1);
	}, []);

	useEffect(() => {
		if (!selectedNamespace || !selectedPod) {
			return undefined;
		}

		const streamUrl = `${API_BASE_URL}/api/logs/${encodeURIComponent(selectedNamespace)}/${encodeURIComponent(selectedPod)}`;
		const eventSource = new EventSource(streamUrl);

		eventSource.onopen = () => {
			setLogStatus("Connected to log stream");
		};

		eventSource.addEventListener("log", (event) => {
			try {
				const logBatch = JSON.parse(event.data);

				appendReceivedLogLines(logBatch);
			} catch {
				appendReceivedLogLines(event.data);
			}
		});

		eventSource.addEventListener("error", (event) => {
			if (event.data) {
				try {
					const data = JSON.parse(event.data);
					setLogStatus(data.details || data.error || "Log stream error");
				} catch {
					setLogStatus(event.data);
				}
				eventSource.close();
				return;
			}

			setLogStatus("Log stream connection error");
		});

		eventSource.onerror = (event) => {
			if (event?.data) {
				return;
			}

			setLogStatus("Log stream connection error");
		};

		return () => {
			eventSource.close();
		};
	}, [appendReceivedLogLines, selectedNamespace, selectedPod]);

	const visibleRawLogLines = pausedRawLogLines ?? rawLogLines;
	const filteredLogLines = getFilteredLogLines(
		visibleRawLogLines,
		logSearch,
		activeSeverityFilters,
	);
	const visibleLogLines = filteredLogLines;
	const logLinesStore = useMemo(() => {
		const store = {};

		Object.defineProperty(store, "lines", {
			value: visibleLogLines,
			enumerable: false,
		});

		return store;
	}, [visibleLogLines]);
	const hasActiveLogSearch = logSearch.trim().length > 0;
	const hasActiveSeverityFilters = activeSeverityFilters.length > 0;
	const hasActiveLogFilters = hasActiveLogSearch || hasActiveSeverityFilters;
	const selectedLogLineMetadata = selectedLogLine
		? parseLogLineMetadata(selectedLogLine.line, selectedNamespace, selectedPod)
		: null;
	const selectedLogLineFormattedJson = selectedLogLine
		? formatStructuredJsonFromLogLine(selectedLogLine.line)
		: "";
	const exportLogLines = includeFilteredOutLogsForExport
		? rawLogLines
		: visibleLogLines;

	const scrollToLatestVisibleLog = useCallback(() => {
		if (filteredLogLines.length === 0) {
			return;
		}

		const latestIndex = filteredLogLines.length - 1;

		logListRef.current?.scrollToRow({
			align: "end",
			index: latestIndex,
		});

		requestAnimationFrame(() => {
			logListRef.current?.scrollToRow({
				align: "end",
				index: latestIndex,
			});

			const logViewer = logListRef.current?.element;

			if (logViewer) {
				logViewer.scrollTop = logViewer.scrollHeight;
			}
		});
	}, [filteredLogLines.length]);

	useEffect(() => {
		isLogAutoScrollPausedRef.current = isLogAutoScrollPaused;
	}, [isLogAutoScrollPaused]);

	useEffect(() => {
		logSearchRef.current = logSearch;
	}, [logSearch]);

	useEffect(() => {
		activeSeverityFiltersRef.current = activeSeverityFilters;
	}, [activeSeverityFilters]);

	useEffect(() => {
		if (isLogAutoScrollPausedRef.current) {
			return;
		}

		scrollToLatestVisibleLog();
	}, [filteredLogLines.length, logStreamUpdateCount, scrollToLatestVisibleLog]);
	const selectedCluster = useMemo(
		() =>
			clusters.find(
				(cluster) => String(cluster.id) === String(selectedClusterId),
			) || null,
		[clusters, selectedClusterId],
	);

	const handleSelectCluster = useCallback(
		(clusterId) => {
			const nextCluster =
				clusters.find((cluster) => String(cluster.id) === String(clusterId)) ||
				null;

			setSelectedClusterId(nextCluster?.id ?? null);
			resetWorkspaceScope(nextCluster?.defaultNamespace || "");
		},
		[clusters, resetWorkspaceScope],
	);

	const handleLogViewerScroll = () => {
		const logViewer = logListRef.current?.element;

		if (!logViewer) {
			return;
		}

		const distanceFromBottom =
			logViewer.scrollHeight - logViewer.scrollTop - logViewer.clientHeight;
		const isAtBottom = distanceFromBottom <= LOG_SCROLL_BOTTOM_THRESHOLD;

		if (isManualLogFollowingPausedRef.current) {
			return;
		}

		if (!isAtBottom && !isLogAutoScrollPaused) {
			setPausedRawLogLines(rawLogLines);
		}

		setIsLogAutoScrollPaused(!isAtBottom);

		if (isAtBottom) {
			setPausedRawLogLines(null);
			setNewLogCountWhilePaused(0);
		}
	};

	const pauseLogFollowing = () => {
		isManualLogFollowingPausedRef.current = true;
		isLogAutoScrollPausedRef.current = true;
		setPausedRawLogLines(rawLogLines);
		setIsLogAutoScrollPaused(true);
	};

	const jumpToLatestLog = () => {
		setPausedRawLogLines(null);
		scrollToLatestVisibleLog();
		isManualLogFollowingPausedRef.current = false;
		isLogAutoScrollPausedRef.current = false;
		setIsLogAutoScrollPaused(false);
		setNewLogCountWhilePaused(0);
	};

	const clearLogSearch = () => {
		setLogSearch("");
	};

	const toggleSeverityFilter = (severity) => {
		setActiveSeverityFilters((currentFilters) =>
			currentFilters.includes(severity)
				? currentFilters.filter(
						(currentSeverity) => currentSeverity !== severity,
					)
				: [...currentFilters, severity],
		);
	};

	const clearSeverityFilters = () => {
		setActiveSeverityFilters([]);
	};

	const copySelectedLogLine = async () => {
		if (!selectedLogLine) {
			return;
		}

		try {
			await writeTextToClipboard(selectedLogLine.line);
			setLogTransferStatus("Copied selected log line.");
		} catch {
			setLogTransferStatus("Unable to copy selected log line.");
		}
	};

	const copyVisibleLogLines = async () => {
		if (visibleLogLines.length === 0) {
			return;
		}

		try {
			await writeTextToClipboard(visibleLogLines.join("\n"));
			setLogTransferStatus(
				`Copied ${visibleLogLines.length} visible filtered log lines.`,
			);
		} catch {
			setLogTransferStatus("Unable to copy visible filtered logs.");
		}
	};

	const exportLogLinesAsText = () => {
		if (exportLogLines.length === 0) {
			return;
		}

		downloadLogFile(
			exportLogLines.join("\n"),
			createLogExportFilename("txt", selectedNamespace, selectedPod),
			"text/plain;charset=utf-8",
		);
		setLogTransferStatus(
			`Exported ${exportLogLines.length} ${
				includeFilteredOutLogsForExport ? "buffered" : "visible filtered"
			} log lines as text.`,
		);
	};

	const exportLogLinesAsJson = () => {
		if (exportLogLines.length === 0) {
			return;
		}

		const exportPayload = {
			exportedAt: new Date().toISOString(),
			namespace: selectedNamespace || null,
			deployment: selectedDeployment || null,
			pod: selectedPod || null,
			filters: {
				search: logSearch,
				severities: activeSeverityFilters,
			},
			includeFilteredOutLogs: includeFilteredOutLogsForExport,
			count: exportLogLines.length,
			logs: exportLogLines.map((line, index) => ({
				index,
				line,
				metadata: parseLogLineMetadata(line, selectedNamespace, selectedPod),
				structuredJson: parseStructuredJsonFromLogLine(line),
			})),
		};

		downloadLogFile(
			JSON.stringify(exportPayload, null, 2),
			createLogExportFilename("json", selectedNamespace, selectedPod),
			"application/json;charset=utf-8",
		);
		setLogTransferStatus(
			`Exported ${exportLogLines.length} ${
				includeFilteredOutLogsForExport ? "buffered" : "visible filtered"
			} log lines as JSON.`,
		);
	};

	const closeLogLineDetails = () => {
		setSelectedLogLine(null);
	};

	const toolbarInputClassName =
		"h-6 w-full rounded-md border border-input/70 bg-background/70 px-2 text-xs text-foreground outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground";
	const toolbarSearchInputClassName = `${toolbarInputClassName} pl-8`;
	const hasNewLogsWhilePaused = newLogCountWhilePaused > 0;
	const canJumpToLatestLog =
		isLogAutoScrollPaused && visibleLogLines.length > 0;

	return (
		<AppShell>
			<TopToolbar />
			<PageContainer>
				<ContentLayout className="min-h-0 flex-1 lg:flex-row">
					<ClustersSidebar
						clusters={clusters}
						error={clustersError}
						isLoading={isClustersLoading}
						onCreateCluster={createCluster}
						onDeleteCluster={deleteCluster}
						onLoginCluster={loginToCluster}
						onLogoutCluster={logoutFromCluster}
						onRefresh={loadClusters}
						onSelectCluster={handleSelectCluster}
						onUpdateCluster={updateCluster}
						selectedClusterId={selectedClusterId}
					/>
					<Panel className="min-h-0 flex-1 border-border/50 bg-card/50 p-2">
						<div>
							<SelectedClusterWorkspaceHeader cluster={selectedCluster} />
							{selectedPod ? (
								<>
									<div className="mt-2 rounded-lg border border-border/60 bg-background/70 p-2">
										<div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
											<div
												className="flex min-w-72 flex-1 gap-1.5"
												aria-label="Log search"
											>
												<ToolbarSearchContainer>
													<input
														id="log-search"
														value={logSearch}
														onChange={(event) =>
															setLogSearch(event.target.value)
														}
														placeholder="Search logs..."
														aria-label="Filter logs by text"
														className={toolbarSearchInputClassName}
													/>
												</ToolbarSearchContainer>
												<ToolbarButton
													type="button"
													onClick={clearLogSearch}
													disabled={!hasActiveLogSearch}
													aria-label="Clear log search"
													title="Clear search"
													className="w-7 px-0"
												>
													<X className="size-3.5" aria-hidden="true" />
												</ToolbarButton>
											</div>

											<div
												className="flex flex-wrap gap-1"
												aria-label="Severity filters"
											>
												{severityFilterOptions.map((option) => {
													const isActive = activeSeverityFilters.includes(
														option.severity,
													);

													return (
														<ToolbarButton
															key={option.severity}
															type="button"
															onClick={() =>
																toggleSeverityFilter(option.severity)
															}
															aria-pressed={isActive}
															className={`rounded-full border-transparent bg-muted/50 px-2 text-muted-foreground hover:bg-muted ${
																isActive ? option.buttonClassName : ""
															}`}
														>
															{option.label}
														</ToolbarButton>
													);
												})}
												<ToolbarButton
													type="button"
													onClick={clearSeverityFilters}
													disabled={!hasActiveSeverityFilters}
													aria-label="Clear severity filters"
													title="Clear severity filters"
													className="w-6 rounded-full border-transparent bg-muted/50 px-0"
												>
													<X className="size-3" aria-hidden="true" />
												</ToolbarButton>
											</div>

											<div className="ml-auto flex min-w-0 flex-wrap items-center justify-end gap-1.5">
												{isLogAutoScrollPaused ? (
													<ToolbarButton
														type="button"
														onClick={jumpToLatestLog}
														disabled={!canJumpToLatestLog}
														aria-label="Resume following latest visible log"
														title="Resume following latest visible log"
													>
														<Play className="size-3.5" aria-hidden="true" />
														{hasNewLogsWhilePaused
															? `Follow (${newLogCountWhilePaused} new)`
															: "Follow"}
													</ToolbarButton>
												) : (
													<ToolbarButton
														type="button"
														onClick={pauseLogFollowing}
														disabled={visibleLogLines.length === 0}
														aria-label="Pause following latest logs"
														title="Pause following latest logs"
													>
														<Pause className="size-3.5" aria-hidden="true" />
														Pause
													</ToolbarButton>
												)}
												<label
													className="flex h-6 items-center gap-1.5 rounded-md bg-background/60 px-2 text-xs text-muted-foreground ring-1 ring-border/50"
													title="Include filtered-out logs in exports"
												>
													<input
														type="checkbox"
														checked={includeFilteredOutLogsForExport}
														onChange={(event) =>
															setIncludeFilteredOutLogsForExport(
																event.target.checked,
															)
														}
														className="h-3.5 w-3.5 rounded border-input accent-primary"
													/>
													Export all
												</label>
												<DropdownMenu>
													<DropdownMenuTrigger asChild>
														<ToolbarButton
															type="button"
															aria-label="Open log actions"
															title="Log actions"
															className="w-7 px-0"
														>
															<MoreHorizontal
																className="size-3.5"
																aria-hidden="true"
															/>
														</ToolbarButton>
													</DropdownMenuTrigger>
													<DropdownMenuContent>
														<DropdownMenuItem
															onSelect={copySelectedLogLine}
															disabled={!selectedLogLine}
														>
															<Copy className="size-3.5" aria-hidden="true" />
															Copy selected
														</DropdownMenuItem>
														<DropdownMenuItem
															onSelect={copyVisibleLogLines}
															disabled={visibleLogLines.length === 0}
														>
															<Copy className="size-3.5" aria-hidden="true" />
															Copy visible
														</DropdownMenuItem>
														<DropdownMenuItem
															onSelect={exportLogLinesAsText}
															disabled={exportLogLines.length === 0}
														>
															<Download
																className="size-3.5"
																aria-hidden="true"
															/>
															Export .txt
														</DropdownMenuItem>
														<DropdownMenuItem
															onSelect={exportLogLinesAsJson}
															disabled={exportLogLines.length === 0}
														>
															<FileJson
																className="size-3.5"
																aria-hidden="true"
															/>
															Export .json
														</DropdownMenuItem>
													</DropdownMenuContent>
												</DropdownMenu>
											</div>
										</div>
									</div>
									{visibleLogLines.length > 0 ? (
										<div className="relative mt-2">
											<List
												listRef={logListRef}
												onScroll={handleLogViewerScroll}
												rowComponent={LogLineRow}
												rowCount={visibleLogLines.length}
												rowHeight={LOG_ROW_HEIGHT}
												rowProps={{
													logLinesStore,
													logSearch,
													onSelectLogLine: setSelectedLogLine,
													selectedLogLine,
												}}
												overscanCount={8}
												className="overflow-auto rounded-md bg-log p-2 font-mono text-xs leading-5 text-log-foreground ring-1 ring-border/50"
												style={{ height: LOG_LIST_HEIGHT }}
											/>
											{canJumpToLatestLog && (
												<button
													type="button"
													onClick={jumpToLatestLog}
													className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground shadow-lg ring-1 ring-primary/30 hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-ring"
												>
													{hasNewLogsWhilePaused
														? `${newLogCountWhilePaused} new logs — jump to latest`
														: "Jump to latest"}
												</button>
											)}
										</div>
									) : (
										<div className="mt-2 h-[35rem] overflow-auto rounded-md bg-log p-2 font-mono text-xs leading-5 whitespace-pre-wrap text-log-foreground ring-1 ring-border/50">
											{hasActiveLogFilters
												? "No log lines match your filters."
												: "No log lines received yet."}
										</div>
									)}
									<div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
										<span>
											{visibleLogLines.length} visible / {rawLogLines.length}{" "}
											buffered
										</span>
										<span className="text-foreground/80" role="status">
											{logTransferStatus || logStatus}
										</span>
									</div>
								</>
							) : (
								<div className="mt-2 flex h-[35rem] items-center justify-center rounded-md border border-dashed border-border bg-muted/20 p-6 text-sm text-muted-foreground">
									Select a pod to view logs.
								</div>
							)}
						</div>
					</Panel>
				</ContentLayout>
			</PageContainer>
			<aside
				className={`fixed inset-y-0 right-0 z-40 w-[min(28rem,calc(100vw-1rem))] border-l border-border/70 bg-card/95 shadow-lg backdrop-blur-sm transition-transform duration-200 ease-out ${
					selectedLogLine ? "translate-x-0" : "translate-x-full"
				}`}
				aria-hidden={!selectedLogLine}
			>
				{selectedLogLine && selectedLogLineMetadata && (
					<div className="flex h-full flex-col">
						<div className="flex items-center justify-between border-b border-border/60 px-3 py-2">
							<div className="min-w-0">
								<h2 className="text-sm font-semibold text-foreground">
									Log details
								</h2>
								<p className="text-xs text-muted-foreground">
									Selected row inspector
								</p>
							</div>
							<ToolbarButton
								type="button"
								onClick={closeLogLineDetails}
								aria-label="Close log details"
								className="w-7 px-0"
							>
								<X className="size-3.5" aria-hidden="true" />
							</ToolbarButton>
						</div>
						<div className="min-h-0 flex-1 space-y-3 overflow-auto p-3 text-sm">
							<section>
								<h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
									Metadata
								</h3>
								<dl className="mt-2 grid grid-cols-[5.5rem_minmax(0,1fr)] gap-x-2 gap-y-1 text-xs">
									{[
										["timestamp", selectedLogLineMetadata.timestamp],
										["severity", selectedLogLineMetadata.severity],
										["namespace", selectedLogLineMetadata.namespace],
										["pod", selectedLogLineMetadata.pod],
									].map(([label, value]) => (
										<div key={label} className="contents">
											<dt className="capitalize text-muted-foreground">
												{label}
											</dt>
											<dd className="truncate text-foreground">
												{value || "Not available"}
											</dd>
										</div>
									))}
								</dl>
							</section>
							<section>
								<h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
									Structured JSON
								</h3>
								{selectedLogLineFormattedJson ? (
									<pre className="mt-2 max-h-64 overflow-auto rounded-md bg-background/70 p-2 font-mono text-xs text-foreground ring-1 ring-border/60">
										{selectedLogLineFormattedJson}
									</pre>
								) : (
									<p className="mt-2 rounded-md bg-background/60 p-2 text-xs text-muted-foreground ring-1 ring-border/50">
										No valid JSON object or array found.
									</p>
								)}
							</section>
							<section>
								<h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
									Raw log
								</h3>
								<pre className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap break-words rounded-md bg-background/70 p-2 font-mono text-xs text-foreground ring-1 ring-border/60">
									{selectedLogLine.line}
								</pre>
							</section>
						</div>
					</div>
				)}
			</aside>
		</AppShell>
	);
}

export default App;
