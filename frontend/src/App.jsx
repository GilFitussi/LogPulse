import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
	Check,
	ChevronDown,
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
	SecondaryFilterToolbar,
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

function SearchableSelector({
	id,
	options,
	value,
	status,
	placeholder,
	disabled = false,
	ariaLabel,
	onValueChange,
	className = "",
}) {
	const [isOpen, setIsOpen] = useState(false);
	const [query, setQuery] = useState("");
	const containerRef = useRef(null);
	const inputRef = useRef(null);
	const normalizedQuery = query.trim().toLowerCase();
	const filteredOptions = options.filter((option) =>
		option.toLowerCase().includes(normalizedQuery),
	);
	const displayValue = value || placeholder;

	useEffect(() => {
		if (!isOpen) {
			return undefined;
		}

		const focusInput = window.setTimeout(() => inputRef.current?.focus(), 0);

		const handlePointerDown = (event) => {
			if (!containerRef.current?.contains(event.target)) {
				setIsOpen(false);
			}
		};

		const handleKeyDown = (event) => {
			if (event.key === "Escape") {
				setIsOpen(false);
			}
		};

		document.addEventListener("pointerdown", handlePointerDown);
		document.addEventListener("keydown", handleKeyDown);

		return () => {
			window.clearTimeout(focusInput);
			document.removeEventListener("pointerdown", handlePointerDown);
			document.removeEventListener("keydown", handleKeyDown);
		};
	}, [isOpen]);

	const toggleOpen = () => {
		setQuery("");
		setIsOpen((currentValue) => !currentValue);
	};

	const selectValue = (nextValue) => {
		onValueChange(nextValue);
		setIsOpen(false);
	};

	return (
		<div ref={containerRef} className={`relative min-w-0 flex-1 ${className}`}>
			<button
				type="button"
				id={id}
				disabled={disabled}
				onClick={toggleOpen}
				aria-label={ariaLabel}
				aria-haspopup="listbox"
				aria-expanded={isOpen}
				title={value || status}
				className="flex h-6 w-full items-center rounded-md border border-input/70 bg-background/70 px-2 pr-10 text-left text-xs text-foreground outline-none transition-colors focus-visible:border-ring disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground"
			>
				<span
					className={`min-w-0 flex-1 truncate ${
						value ? "text-foreground" : "text-muted-foreground"
					}`}
				>
					{displayValue}
				</span>
			</button>
			{value && !disabled ? (
				<button
					type="button"
					aria-label={`Clear ${ariaLabel}`}
					title="Clear selection"
					onClick={() => selectValue("")}
					className="absolute right-5.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
				>
					<X className="size-3" aria-hidden="true" />
				</button>
			) : null}
			<ChevronDown
				className="pointer-events-none absolute right-2 top-1/2 size-3 -translate-y-1/2 text-muted-foreground"
				aria-hidden="true"
			/>
			{isOpen && !disabled ? (
				<div className="absolute left-0 top-full z-50 mt-1 w-full min-w-80 max-w-[calc(100vw-2rem)] rounded-xl border border-border bg-popover p-2 text-popover-foreground shadow-xl sm:w-96">
					<input
						ref={inputRef}
						value={query}
						onChange={(event) => setQuery(event.target.value)}
						placeholder="Type to filter..."
						aria-label={`${ariaLabel} filter`}
						className="mb-2 h-8 w-full rounded-md border border-input/70 bg-background px-2 text-xs outline-none placeholder:text-muted-foreground focus-visible:border-ring"
					/>
					<div
						role="listbox"
						aria-label={ariaLabel}
						className="max-h-72 overflow-auto"
					>
						{filteredOptions.length > 0 ? (
							filteredOptions.map((option) => (
								<button
									key={option}
									type="button"
									role="option"
									aria-selected={option === value}
									onClick={() => selectValue(option)}
									className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-xs hover:bg-muted focus:bg-muted focus:outline-none"
								>
									<span className="min-w-0 flex-1 truncate">{option}</span>
									{option === value ? (
										<Check className="size-3 text-primary" aria-hidden="true" />
									) : null}
								</button>
							))
						) : (
							<div className="px-2.5 py-3 text-xs text-muted-foreground">
								No matches found.
							</div>
						)}
					</div>
				</div>
			) : null}
		</div>
	);
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
	const [authStatus, setAuthStatus] = useState(AUTH_STATUS.CHECKING);
	const [authStatusMessage, setAuthStatusMessage] = useState(
		"Checking oc login...",
	);
	const [clusters, setClusters] = useState([]);
	const [clustersError, setClustersError] = useState("");
	const [isClustersLoading, setIsClustersLoading] = useState(true);
	const [selectedClusterId, setSelectedClusterId] = useState(null);
	const [namespaces, setNamespaces] = useState([]);
	const [namespacesStatus, setNamespacesStatus] = useState(
		"Loading projects...",
	);
	const [, setNamespaceSearch] = useState("");
	const [selectedNamespace, setSelectedNamespace] = useState("");
	const [deployments, setDeployments] = useState([]);
	const [deploymentsStatus, setDeploymentsStatus] = useState(
		"Select a project to load deployments",
	);
	const [, setDeploymentSearch] = useState("");
	const [selectedDeployment, setSelectedDeployment] = useState("");
	const [pods, setPods] = useState([]);
	const [podsStatus, setPodsStatus] = useState(
		"Select a deployment to load pods",
	);
	const [, setPodSearch] = useState("");
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

	const loadNamespaces = useCallback(async () => {
		setNamespaces([]);
		setSelectedNamespace("");
		setDeployments([]);
		setSelectedDeployment("");
		setPods([]);
		setSelectedPod("");
		setNamespacesStatus("Loading projects...");
		setDeploymentsStatus("Select a project to load deployments");
		setPodsStatus("Select a deployment to load pods");

		try {
			const response = await fetch(`${API_BASE_URL}/api/namespaces`);
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
	}, []);

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

			await loadClusters();
			setSelectedClusterId(data.cluster?.id ?? cluster.id);
			await checkAuthStatus();
			await loadNamespaces();

			return data;
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
		void Promise.resolve().then(loadNamespaces);
		void Promise.resolve().then(loadClusters);
	}, [checkAuthStatus, loadClusters, loadNamespaces]);

	useEffect(() => {
		if (!selectedNamespace) {
			return undefined;
		}

		const controller = new AbortController();

		const loadDeployments = async () => {
			setDeploymentsStatus("Loading deployments...");

			try {
				const response = await fetch(
					`${API_BASE_URL}/api/namespaces/${encodeURIComponent(selectedNamespace)}/deployments`,
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
	}, [selectedNamespace]);

	useEffect(() => {
		if (!selectedNamespace || !selectedDeployment) {
			return undefined;
		}

		const controller = new AbortController();

		const loadPods = async () => {
			setPodsStatus("Loading pods...");

			try {
				const response = await fetch(
					`${API_BASE_URL}/api/namespaces/${encodeURIComponent(selectedNamespace)}/deployments/${encodeURIComponent(selectedDeployment)}/pods`,
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
	}, [selectedDeployment, selectedNamespace]);

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
	const deploymentNames = deployments
		.map((deployment) => deployment.name)
		.filter(Boolean);
	const podNames = [...new Set(pods.map((pod) => pod.name).filter(Boolean))];

	const handleNamespaceChange = (event) => {
		const value = event.target.value;
		const nextNamespace = namespaces.includes(value) ? value : null;

		setNamespaceSearch(value);

		if (nextNamespace === null && value !== "") {
			return;
		}

		const resolvedNamespace = nextNamespace || "";

		if (resolvedNamespace !== selectedNamespace) {
			setDeployments([]);
			setDeploymentSearch("");
			setSelectedDeployment("");
			setPods([]);
			setPodSearch("");
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
			setLogStatus("Select a project, deployment and pod to stream logs");
			setDeploymentsStatus(
				resolvedNamespace
					? "Loading deployments..."
					: "Select a project to load deployments",
			);
			setPodsStatus("Select a deployment to load pods");
		}

		setSelectedNamespace(resolvedNamespace);
	};

	const handleDeploymentChange = (event) => {
		const value = event.target.value;
		const nextDeployment = deploymentNames.includes(value) ? value : null;

		setDeploymentSearch(value);

		if (nextDeployment === null && value !== "") {
			return;
		}

		const resolvedDeployment = nextDeployment || "";

		if (resolvedDeployment === selectedDeployment) {
			return;
		}

		setSelectedDeployment(resolvedDeployment);
		setPods([]);
		setPodSearch("");
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
		setPodsStatus(
			resolvedDeployment
				? "Loading pods..."
				: "Select a deployment to load pods",
		);
		setLogStatus("Select a project, deployment and pod to stream logs");
	};

	const handlePodChange = (event) => {
		const value = event.target.value;
		const nextPod = podNames.includes(value) ? value : null;

		setPodSearch(value);

		if (nextPod === null && value !== "") {
			return;
		}

		const resolvedPod = nextPod || "";

		if (resolvedPod === selectedPod) {
			return;
		}

		setSelectedPod(resolvedPod);
		setRawLogLines([]);
		setActiveSeverityFilters([]);
		setSelectedLogLine(null);
		setIncludeFilteredOutLogsForExport(false);
		setLogTransferStatus("");
		isManualLogFollowingPausedRef.current = false;
		setPausedRawLogLines(null);
		setIsLogAutoScrollPaused(false);
		setNewLogCountWhilePaused(0);
		setLogStatus(
			resolvedPod
				? "Connecting to log stream..."
				: "Select a project, deployment and pod to stream logs",
		);
	};

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
	const isLogStreamConnected = logStatus === "Connected to log stream";
	const connectionLabel = isLogStreamConnected
		? "Connected to log stream"
		: "Select a target to stream logs";
	const hasNewLogsWhilePaused = newLogCountWhilePaused > 0;
	const canJumpToLatestLog =
		isLogAutoScrollPaused && visibleLogLines.length > 0;

	return (
		<AppShell>
			<TopToolbar
				authStatus={authStatus}
				authStatusMessage={authStatusMessage}
				connectionLabel={connectionLabel}
				isConnected={isLogStreamConnected}
				newLogsAvailable={hasNewLogsWhilePaused}
			/>
			<SecondaryFilterToolbar
				namespaceSearchControl={
					<SearchableSelector
						id="namespace-selector"
						options={namespaces}
						value={selectedNamespace}
						status={namespacesStatus}
						placeholder="Select project"
						ariaLabel="Search OpenShift projects or namespaces"
						onValueChange={(nextValue) =>
							handleNamespaceChange({ target: { value: nextValue } })
						}
					/>
				}
				deploymentSearchControl={
					<SearchableSelector
						id="deployment-selector"
						options={deploymentNames}
						value={selectedDeployment}
						status={deploymentsStatus}
						placeholder={
							selectedNamespace ? "Select deployment" : "Select a project first"
						}
						disabled={!selectedNamespace}
						ariaLabel="Search deployments"
						onValueChange={(nextValue) =>
							handleDeploymentChange({ target: { value: nextValue } })
						}
					/>
				}
				podSearchControl={
					<SearchableSelector
						id="pod-selector"
						options={podNames}
						value={selectedPod}
						status={podsStatus}
						placeholder={
							selectedDeployment ? "Select pod" : "Select a deployment first"
						}
						disabled={!selectedDeployment}
						ariaLabel="Search pods"
						onValueChange={(nextValue) =>
							handlePodChange({ target: { value: nextValue } })
						}
					/>
				}
				searchControl={
					<div className="flex min-w-0 flex-1 gap-1.5">
						<ToolbarSearchContainer>
							<input
								id="log-search"
								value={logSearch}
								onChange={(event) => setLogSearch(event.target.value)}
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
				}
				severityFilterControls={
					<div className="flex flex-wrap gap-1">
						{severityFilterOptions.map((option) => {
							const isActive = activeSeverityFilters.includes(option.severity);

							return (
								<ToolbarButton
									key={option.severity}
									type="button"
									onClick={() => toggleSeverityFilter(option.severity)}
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
				}
				utilityActions={
					<>
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
									setIncludeFilteredOutLogsForExport(event.target.checked)
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
									<MoreHorizontal className="size-3.5" aria-hidden="true" />
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
									<Download className="size-3.5" aria-hidden="true" />
									Export .txt
								</DropdownMenuItem>
								<DropdownMenuItem
									onSelect={exportLogLinesAsJson}
									disabled={exportLogLines.length === 0}
								>
									<FileJson className="size-3.5" aria-hidden="true" />
									Export .json
								</DropdownMenuItem>
							</DropdownMenuContent>
						</DropdownMenu>
					</>
				}
			/>
			<PageContainer>
				<ContentLayout className="min-h-0 flex-1 lg:flex-row">
					<ClustersSidebar
						clusters={clusters}
						error={clustersError}
						isLoading={isClustersLoading}
						onCreateCluster={createCluster}
						onDeleteCluster={deleteCluster}
						onLoginCluster={loginToCluster}
						onRefresh={loadClusters}
						onSelectCluster={setSelectedClusterId}
						onUpdateCluster={updateCluster}
						selectedClusterId={selectedClusterId}
					/>
					<Panel className="min-h-0 flex-1 border-border/50 bg-card/50 p-2">
						<div>
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
								{logTransferStatus && (
									<span className="text-foreground/80" role="status">
										{logTransferStatus}
									</span>
								)}
							</div>
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
