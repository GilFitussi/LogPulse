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
const LOG_DENSITY_BUCKET_COUNT = 36;
const LOG_DENSITY_MAX_BAR_HEIGHT = 16;

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

function getLogTimestampMs(line) {
	const { timestamp } = parseLogLineMetadata(line, "", "");

	if (!timestamp) {
		return null;
	}

	const normalizedTimestamp = timestamp.includes("T")
		? timestamp
		: timestamp.replace(" ", "T");
	const timestampMs = Date.parse(normalizedTimestamp);

	return Number.isNaN(timestampMs) ? null : timestampMs;
}

function formatDensityBucketLabel(bucket, mode) {
	if (
		mode === "time" &&
		bucket.startTimeMs !== null &&
		bucket.endTimeMs !== null
	) {
		const startTime = new Date(bucket.startTimeMs).toLocaleTimeString();
		const endTime = new Date(bucket.endTimeMs).toLocaleTimeString();

		return `${startTime} - ${endTime}`;
	}

	return `Lines ${bucket.startIndex + 1}-${bucket.endIndex + 1}`;
}

function buildLogDensityBuckets(
	logLines,
	bucketCount = LOG_DENSITY_BUCKET_COUNT,
) {
	if (logLines.length === 0) {
		return { buckets: [], mode: "index" };
	}

	const timestampedLines = logLines
		.map((line, index) => ({ index, timestampMs: getLogTimestampMs(line) }))
		.filter(({ timestampMs }) => timestampMs !== null)
		.sort(
			(firstLine, secondLine) => firstLine.timestampMs - secondLine.timestampMs,
		);
	const canUseTimeBuckets =
		timestampedLines.length === logLines.length && timestampedLines.length >= 2;
	const bucketsLength = Math.min(bucketCount, logLines.length);
	const buckets = Array.from({ length: bucketsLength }, (_, bucketIndex) => ({
		count: 0,
		endIndex: 0,
		endTimeMs: null,
		index: bucketIndex,
		startIndex: logLines.length - 1,
		startTimeMs: null,
	}));

	if (canUseTimeBuckets) {
		const firstTimestampMs = timestampedLines[0].timestampMs;
		const lastTimestampMs =
			timestampedLines[timestampedLines.length - 1].timestampMs;
		const timeRangeMs = Math.max(1, lastTimestampMs - firstTimestampMs);

		timestampedLines.forEach(({ index, timestampMs }) => {
			const bucketIndex = Math.min(
				bucketsLength - 1,
				Math.floor(
					((timestampMs - firstTimestampMs) / timeRangeMs) * bucketsLength,
				),
			);
			const bucket = buckets[bucketIndex];

			bucket.count += 1;
			bucket.startIndex = Math.min(bucket.startIndex, index);
			bucket.endIndex = Math.max(bucket.endIndex, index);
			bucket.startTimeMs =
				bucket.startTimeMs === null
					? timestampMs
					: Math.min(bucket.startTimeMs, timestampMs);
			bucket.endTimeMs =
				bucket.endTimeMs === null
					? timestampMs
					: Math.max(bucket.endTimeMs, timestampMs);
		});

		return { buckets, mode: "time" };
	}

	logLines.forEach((_, index) => {
		const bucketIndex = Math.min(
			bucketsLength - 1,
			Math.floor((index / logLines.length) * bucketsLength),
		);
		const bucket = buckets[bucketIndex];

		bucket.count += 1;
		bucket.startIndex = Math.min(bucket.startIndex, index);
		bucket.endIndex = Math.max(bucket.endIndex, index);
	});

	return { buckets, mode: "index" };
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
				className="rounded bg-amber-300 px-0.5 text-foreground"
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

function LogDensityMap({ densityData, onBucketClick }) {
	const maxBucketCount = Math.max(
		1,
		...densityData.buckets.map((bucket) => bucket.count),
	);

	return (
		<div className="mt-1 flex justify-end">
			{densityData.buckets.length > 0 ? (
				<div
					className="flex h-4 w-full items-end gap-0.5 overflow-hidden rounded bg-muted/20 px-1 py-0.5 opacity-80"
					aria-label="Log volume density timeline"
				>
					{densityData.buckets.map((bucket) => {
						const barHeight = Math.max(
							2,
							Math.round(
								(bucket.count / maxBucketCount) * LOG_DENSITY_MAX_BAR_HEIGHT,
							),
						);
						const label = `${bucket.count} logs, ${formatDensityBucketLabel(
							bucket,
							densityData.mode,
						)}`;

						return (
							<button
								key={bucket.index}
								type="button"
								onClick={() => onBucketClick(bucket)}
								disabled={bucket.count === 0}
								className="flex min-w-0 flex-1 items-end justify-center rounded-sm focus:outline-none focus:ring-2 focus:ring-sky-500 disabled:cursor-not-allowed"
								aria-label={label}
								title={label}
							>
								<span
									className={`block w-full rounded-[1px] ${
										bucket.count === maxBucketCount
											? "bg-rose-500"
											: bucket.count > 0
												? "bg-sky-500"
												: "bg-muted"
									}`}
									style={{ height: `${barHeight}px` }}
								/>
							</button>
						);
					})}
				</div>
			) : (
				<p className="text-xs text-muted-foreground">
					Log volume appears here after logs arrive.
				</p>
			)}
		</div>
	);
}

function App() {
	const [, setHealthStatus] = useState("Checking backend health...");
	const [authStatus, setAuthStatus] = useState(AUTH_STATUS.CHECKING);
	const [authStatusMessage, setAuthStatusMessage] = useState(
		"Checking oc login...",
	);
	const [namespaces, setNamespaces] = useState([]);
	const [namespacesStatus, setNamespacesStatus] = useState(
		"Loading projects...",
	);
	const [namespaceSearch, setNamespaceSearch] = useState("");
	const [selectedNamespace, setSelectedNamespace] = useState("");
	const [pods, setPods] = useState([]);
	const [podsStatus, setPodsStatus] = useState("Select a project to load pods");
	const [podSearch, setPodSearch] = useState("");
	const [selectedPod, setSelectedPod] = useState("");
	const [rawLogLines, setRawLogLines] = useState([]);
	const [logSearch, setLogSearch] = useState("");
	const [activeSeverityFilters, setActiveSeverityFilters] = useState([]);
	const [selectedLogLine, setSelectedLogLine] = useState(null);
	const [includeFilteredOutLogsForExport, setIncludeFilteredOutLogsForExport] =
		useState(false);
	const [logTransferStatus, setLogTransferStatus] = useState("");
	const [logStatus, setLogStatus] = useState(
		"Select a project and pod to stream logs",
	);
	const [isLogAutoScrollPaused, setIsLogAutoScrollPaused] = useState(false);
	const [newLogCountWhilePaused, setNewLogCountWhilePaused] = useState(0);
	const [logStreamUpdateCount, setLogStreamUpdateCount] = useState(0);
	const [pausedVisibleLogLines, setPausedVisibleLogLines] = useState(null);
	const logListRef = useRef(null);
	const isLogAutoScrollPausedRef = useRef(false);
	const isManualLogFollowingPausedRef = useRef(false);
	const logSearchRef = useRef("");
	const activeSeverityFiltersRef = useRef([]);

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

		const checkAuthStatus = async () => {
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
		};

		const loadNamespaces = async () => {
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
		};

		checkBackendHealth();
		checkAuthStatus();
		loadNamespaces();
	}, []);

	useEffect(() => {
		if (!selectedNamespace) {
			return undefined;
		}

		const controller = new AbortController();

		const loadPods = async () => {
			setPodsStatus("Loading pods...");

			try {
				const response = await fetch(
					`${API_BASE_URL}/api/namespaces/${encodeURIComponent(selectedNamespace)}/pods`,
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
						data.details || "Your oc user cannot list pods in this project",
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
	}, [selectedNamespace]);

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
				return;
			}

			setLogStatus("Log stream connection error");
		});

		eventSource.onerror = () => {
			setLogStatus("Log stream connection error");
		};

		return () => {
			eventSource.close();
		};
	}, [appendReceivedLogLines, selectedNamespace, selectedPod]);

	const filteredLogLines = getFilteredLogLines(
		rawLogLines,
		logSearch,
		activeSeverityFilters,
	);
	const visibleLogLines = pausedVisibleLogLines ?? filteredLogLines;
	const logDensityData = useMemo(
		() => buildLogDensityBuckets(visibleLogLines),
		[visibleLogLines],
	);
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
	const filteredNamespaces = namespaces.filter((namespace) =>
		namespace.toLowerCase().includes(namespaceSearch.toLowerCase()),
	);
	const podNames = pods.map((pod) => pod.name).filter(Boolean);
	const filteredPodNames = podNames.filter((podName) =>
		podName.toLowerCase().includes(podSearch.toLowerCase()),
	);

	const handleNamespaceChange = (event) => {
		const value = event.target.value;
		const nextNamespace = namespaces.includes(value) ? value : null;

		setNamespaceSearch(value);

		if (nextNamespace === null && value !== "") {
			return;
		}

		const resolvedNamespace = nextNamespace || "";

		if (resolvedNamespace !== selectedNamespace) {
			setPods([]);
			setPodSearch("");
			setSelectedPod("");
			setRawLogLines([]);
			setActiveSeverityFilters([]);
			setSelectedLogLine(null);
			setIncludeFilteredOutLogsForExport(false);
			setLogTransferStatus("");
			isManualLogFollowingPausedRef.current = false;
			setPausedVisibleLogLines(null);
			setIsLogAutoScrollPaused(false);
			setNewLogCountWhilePaused(0);
			setLogStatus("Select a project and pod to stream logs");
			setPodsStatus(
				resolvedNamespace ? "Loading pods..." : "Select a project to load pods",
			);
		}

		setSelectedNamespace(resolvedNamespace);
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
		setPausedVisibleLogLines(null);
		setIsLogAutoScrollPaused(false);
		setNewLogCountWhilePaused(0);
		setLogStatus(
			resolvedPod
				? "Connecting to log stream..."
				: "Select a project and pod to stream logs",
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
			setPausedVisibleLogLines(filteredLogLines);
		}

		setIsLogAutoScrollPaused(!isAtBottom);

		if (isAtBottom) {
			setPausedVisibleLogLines(null);
			setNewLogCountWhilePaused(0);
		}
	};

	const pauseLogFollowing = () => {
		isManualLogFollowingPausedRef.current = true;
		isLogAutoScrollPausedRef.current = true;
		setPausedVisibleLogLines(filteredLogLines);
		setIsLogAutoScrollPaused(true);
	};

	const jumpToLatestLog = () => {
		setPausedVisibleLogLines(null);
		scrollToLatestVisibleLog();
		isManualLogFollowingPausedRef.current = false;
		isLogAutoScrollPausedRef.current = false;
		setIsLogAutoScrollPaused(false);
		setNewLogCountWhilePaused(0);
	};

	const jumpToDensityBucket = (bucket) => {
		if (bucket.count === 0 || visibleLogLines.length === 0) {
			return;
		}

		const targetIndex = Math.min(
			visibleLogLines.length - 1,
			Math.max(0, bucket.startIndex),
		);

		logListRef.current?.scrollToRow({
			align: "start",
			index: targetIndex,
		});
		setSelectedLogLine({
			index: targetIndex,
			line: visibleLogLines[targetIndex],
		});
		setPausedVisibleLogLines(visibleLogLines);
		isManualLogFollowingPausedRef.current = true;
		isLogAutoScrollPausedRef.current = true;
		setIsLogAutoScrollPaused(true);
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
					<>
						<input
							id="namespace-selector"
							list="namespace-options"
							value={namespaceSearch}
							onChange={handleNamespaceChange}
							placeholder="Search projects..."
							aria-label="Search OpenShift projects or namespaces"
							title={selectedNamespace || namespacesStatus}
							className={toolbarInputClassName}
						/>
						<datalist id="namespace-options">
							{filteredNamespaces.map((namespace) => (
								<option key={namespace} value={namespace} />
							))}
						</datalist>
					</>
				}
				podSearchControl={
					<>
						<input
							id="pod-selector"
							list="pod-options"
							value={podSearch}
							onChange={handlePodChange}
							placeholder={
								selectedNamespace ? "Search pods..." : "Select a project first"
							}
							disabled={!selectedNamespace}
							aria-label="Search pods"
							title={selectedPod || podsStatus}
							className={toolbarInputClassName}
						/>
						<datalist id="pod-options">
							{filteredPodNames.map((podName) => (
								<option key={podName} value={podName} />
							))}
						</datalist>
					</>
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
				<ContentLayout>
					<Panel className="min-h-0 flex-1 border-border/50 bg-card/50 p-2">
						<LogDensityMap
							densityData={logDensityData}
							onBucketClick={jumpToDensityBucket}
						/>
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
