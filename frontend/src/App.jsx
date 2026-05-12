import { useEffect, useMemo, useRef, useState } from "react";
import { List } from "react-window";

import {
	AppShell,
	PageContainer,
	Panel,
	SectionHeader,
	ToolbarContainer,
} from "@/components/layout/app-shell";
import { ThemeToggle } from "@/components/theme-toggle";

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

const LOG_SCROLL_BOTTOM_THRESHOLD = 8;
const LOG_LIST_HEIGHT = 288;
const LOG_ROW_HEIGHT = 20;
const LOG_DENSITY_BUCKET_COUNT = 36;
const LOG_DENSITY_MAX_BAR_HEIGHT = 56;

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

const authStatusContent = {
	[AUTH_STATUS.CHECKING]: {
		label: "Checking OpenShift authentication...",
		message: "Verifying whether the backend can access your local oc session.",
		className: "border-border bg-muted text-muted-foreground",
	},
	[AUTH_STATUS.CONNECTED]: {
		label: "Connected",
		message: "Backend can access your local OpenShift session.",
		className:
			"border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
	},
	[AUTH_STATUS.NOT_LOGGED_IN]: {
		label: "Not logged in",
		message: "Please run oc login from your terminal.",
		className:
			"border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300",
	},
	[AUTH_STATUS.OC_NOT_INSTALLED]: {
		label: "oc not installed",
		message:
			"Install the OpenShift CLI and make sure oc is available in your PATH.",
		className: "border-destructive/30 bg-destructive/10 text-destructive",
	},
	[AUTH_STATUS.ERROR]: {
		label: "Unable to check authentication",
		message:
			"The backend could not verify your OpenShift authentication status.",
		className: "border-destructive/30 bg-destructive/10 text-destructive",
	},
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

function LogLineRow({
	ariaAttributes,
	filteredLogLines,
	index,
	logSearch,
	onSelectLogLine,
	selectedLogLine,
	style,
}) {
	const line = filteredLogLines[index];
	const severity = detectLogSeverity(line);
	const severityOption = severityFilterOptionsBySeverity[severity];
	const isSelected =
		selectedLogLine?.line === line && selectedLogLine?.index === index;

	return (
		<button
			{...ariaAttributes}
			type="button"
			style={style}
			onClick={() => onSelectLogLine({ index, line })}
			className={`overflow-hidden whitespace-pre-wrap pr-4 text-left font-mono text-xs leading-5 text-log-foreground ${
				isSelected ? "bg-slate-800/80" : "hover:bg-slate-900/80"
			}`}
		>
			<span
				className={`mr-2 inline-block rounded px-1.5 py-0.5 text-[10px] font-bold uppercase leading-none ${severityOption.markerClassName}`}
			>
				{severityOption.label}
			</span>
			{renderHighlightedLogLine(line, logSearch)}
		</button>
	);
}

function LogDensityMap({ densityData, logLineCount, onBucketClick }) {
	const maxBucketCount = Math.max(
		1,
		...densityData.buckets.map((bucket) => bucket.count),
	);

	return (
		<div className="mt-4 rounded-md border border-border bg-panel p-4">
			<div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
				<div>
					<h3 className="text-sm font-semibold text-foreground">
						Log density map
					</h3>
					<p className="mt-1 text-xs text-muted-foreground">
						{logLineCount} visible log lines bucketed by {densityData.mode}.
					</p>
				</div>
				<p className="text-xs text-muted-foreground">
					Click a bar to jump near it.
				</p>
			</div>
			{densityData.buckets.length > 0 ? (
				<div
					className="mt-4 flex h-20 items-end gap-1 rounded-md border border-border bg-card px-2 py-2"
					aria-label="Log volume density timeline"
				>
					{densityData.buckets.map((bucket) => {
						const barHeight = Math.max(
							4,
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
									className={`block w-full rounded-sm ${
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
				<p className="mt-3 rounded-md border border-border bg-card p-3 text-sm text-muted-foreground">
					Log volume appears here after logs arrive.
				</p>
			)}
		</div>
	);
}

function App() {
	const [healthStatus, setHealthStatus] = useState(
		"Checking backend health...",
	);
	const [authStatus, setAuthStatus] = useState(AUTH_STATUS.CHECKING);
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
	const [hasNewLogsWhilePaused, setHasNewLogsWhilePaused] = useState(false);
	const logListRef = useRef(null);
	const isLogAutoScrollPausedRef = useRef(false);
	const previousRawLogLinesRef = useRef(rawLogLines);

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
					return;
				}

				if (response.status === 401) {
					setAuthStatus(AUTH_STATUS.NOT_LOGGED_IN);
					return;
				}

				if (
					response.status === 500 &&
					data.error?.toLowerCase().includes("oc cli")
				) {
					setAuthStatus(AUTH_STATUS.OC_NOT_INSTALLED);
					return;
				}

				setAuthStatus(AUTH_STATUS.ERROR);
			} catch {
				setAuthStatus(AUTH_STATUS.ERROR);
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
				const logLines = Array.isArray(logBatch) ? logBatch : [logBatch];

				setRawLogLines((currentLines) =>
					appendLogLines(currentLines, logLines.map(formatLogEvent)),
				);
			} catch {
				setRawLogLines((currentLines) =>
					appendLogLines(currentLines, event.data),
				);
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
	}, [selectedNamespace, selectedPod]);

	const authContent = authStatusContent[authStatus];
	const filteredLogLines = getFilteredLogLines(
		rawLogLines,
		logSearch,
		activeSeverityFilters,
	);
	const logDensityData = useMemo(
		() => buildLogDensityBuckets(filteredLogLines),
		[filteredLogLines],
	);
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
		: filteredLogLines;

	useEffect(() => {
		isLogAutoScrollPausedRef.current = isLogAutoScrollPaused;
	}, [isLogAutoScrollPaused]);

	useEffect(() => {
		const hasNewLogLines =
			rawLogLines !== previousRawLogLinesRef.current &&
			filteredLogLines.length > 0;

		previousRawLogLinesRef.current = rawLogLines;

		if (isLogAutoScrollPausedRef.current) {
			if (hasNewLogLines) {
				setHasNewLogsWhilePaused(true);
			}

			return;
		}

		if (filteredLogLines.length > 0) {
			logListRef.current?.scrollToRow({
				align: "end",
				index: filteredLogLines.length - 1,
			});
		}

		setHasNewLogsWhilePaused(false);
	}, [rawLogLines, filteredLogLines.length]);
	const filteredNamespaces = namespaces.filter((namespace) =>
		namespace.toLowerCase().includes(namespaceSearch.toLowerCase()),
	);
	const podNames = pods.map((pod) => pod.name).filter(Boolean);
	const filteredPodNames = podNames.filter((podName) =>
		podName.toLowerCase().includes(podSearch.toLowerCase()),
	);

	const handleNamespaceChange = (event) => {
		const value = event.target.value;
		const nextNamespace = namespaces.includes(value) ? value : "";

		setNamespaceSearch(value);

		if (nextNamespace !== selectedNamespace) {
			setPods([]);
			setPodSearch("");
			setSelectedPod("");
			setRawLogLines([]);
			setActiveSeverityFilters([]);
			setSelectedLogLine(null);
			setIncludeFilteredOutLogsForExport(false);
			setLogTransferStatus("");
			setIsLogAutoScrollPaused(false);
			setHasNewLogsWhilePaused(false);
			setLogStatus("Select a project and pod to stream logs");
			setPodsStatus(
				nextNamespace ? "Loading pods..." : "Select a project to load pods",
			);
		}

		setSelectedNamespace(nextNamespace);
	};

	const handlePodChange = (event) => {
		const value = event.target.value;
		const nextPod = podNames.includes(value) ? value : "";

		setPodSearch(value);
		setSelectedPod(nextPod);
		setRawLogLines([]);
		setActiveSeverityFilters([]);
		setSelectedLogLine(null);
		setIncludeFilteredOutLogsForExport(false);
		setLogTransferStatus("");
		setIsLogAutoScrollPaused(false);
		setHasNewLogsWhilePaused(false);
		setLogStatus(
			nextPod
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

		setIsLogAutoScrollPaused(!isAtBottom);

		if (isAtBottom) {
			setHasNewLogsWhilePaused(false);
		}
	};

	const jumpToLatestLog = () => {
		if (filteredLogLines.length > 0) {
			logListRef.current?.scrollToRow({
				align: "end",
				index: filteredLogLines.length - 1,
			});
		}

		setIsLogAutoScrollPaused(false);
		setHasNewLogsWhilePaused(false);
	};

	const jumpToDensityBucket = (bucket) => {
		if (bucket.count === 0 || filteredLogLines.length === 0) {
			return;
		}

		const targetIndex = Math.min(
			filteredLogLines.length - 1,
			Math.max(0, bucket.startIndex),
		);

		logListRef.current?.scrollToRow({
			align: "start",
			index: targetIndex,
		});
		setSelectedLogLine({
			index: targetIndex,
			line: filteredLogLines[targetIndex],
		});
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
		if (filteredLogLines.length === 0) {
			return;
		}

		try {
			await writeTextToClipboard(filteredLogLines.join("\n"));
			setLogTransferStatus(
				`Copied ${filteredLogLines.length} visible filtered log lines.`,
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

	return (
		<AppShell>
			<PageContainer>
				<ToolbarContainer as="header">
					<div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
						<div>
							<p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
								OpenShift log explorer
							</p>
							<h1 className="mt-1 text-3xl font-semibold tracking-tight text-foreground">
								OS-LogPulse
							</h1>
						</div>
						<ThemeToggle />
					</div>
				</ToolbarContainer>

				<section className="grid gap-4 md:grid-cols-2">
					<Panel>
						<SectionHeader title="Backend status" />
						<p className="mt-2 text-sm text-foreground/80">{healthStatus}</p>
					</Panel>

					<Panel>
						<SectionHeader title="OpenShift authentication" />
						<div
							className={`mt-3 rounded-md border px-4 py-3 ${authContent.className}`}
						>
							<p className="text-sm font-medium">{authContent.label}</p>
							<p className="mt-1 text-sm">{authContent.message}</p>
						</div>
					</Panel>
				</section>

				<section className="grid gap-4 md:grid-cols-2">
					<Panel>
						<SectionHeader title="Project selector" />
						<label
							htmlFor="namespace-selector"
							className="mt-4 block text-sm text-foreground/80"
						>
							OpenShift project / namespace
						</label>
						<input
							id="namespace-selector"
							list="namespace-options"
							value={namespaceSearch}
							onChange={handleNamespaceChange}
							placeholder="Search projects..."
							className="mt-2 h-11 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none focus:border-ring"
						/>
						<datalist id="namespace-options">
							{filteredNamespaces.map((namespace) => (
								<option key={namespace} value={namespace} />
							))}
						</datalist>
						<p className="mt-2 text-sm text-muted-foreground">
							{selectedNamespace
								? `Selected project: ${selectedNamespace}`
								: namespacesStatus}
						</p>
					</Panel>

					<Panel>
						<SectionHeader title="Pod selector" />
						<label
							htmlFor="pod-selector"
							className="mt-4 block text-sm text-foreground/80"
						>
							Pod
						</label>
						<input
							id="pod-selector"
							list="pod-options"
							value={podSearch}
							onChange={handlePodChange}
							placeholder={
								selectedNamespace ? "Search pods..." : "Select a project first"
							}
							disabled={!selectedNamespace}
							className="mt-2 h-11 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none focus:border-ring disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground"
						/>
						<datalist id="pod-options">
							{filteredPodNames.map((podName) => (
								<option key={podName} value={podName} />
							))}
						</datalist>
						<p className="mt-2 text-sm text-muted-foreground">
							{selectedPod ? `Selected pod: ${selectedPod}` : podsStatus}
						</p>
					</Panel>
				</section>

				<Panel className="min-h-96">
					<SectionHeader title="Live logs" description={logStatus} />
					{hasNewLogsWhilePaused && (
						<p className="mt-3 text-sm text-foreground/80">
							New logs available while auto-scroll is paused.
						</p>
					)}
					{(isLogAutoScrollPaused || hasNewLogsWhilePaused) && (
						<button
							type="button"
							onClick={jumpToLatestLog}
							className="mt-3 rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground"
						>
							Jump to latest
						</button>
					)}
					<div className="mt-4 flex flex-col gap-3">
						<div className="flex flex-col gap-2 sm:flex-row sm:items-end">
							<div className="flex-1">
								<label
									htmlFor="log-search"
									className="block text-sm text-foreground/80"
								>
									Search current log buffer
								</label>
								<input
									id="log-search"
									value={logSearch}
									onChange={(event) => setLogSearch(event.target.value)}
									placeholder="Filter logs by text..."
									className="mt-2 h-11 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none focus:border-ring"
								/>
							</div>
							<button
								type="button"
								onClick={clearLogSearch}
								disabled={!hasActiveLogSearch}
								className="h-11 rounded-md border border-input bg-background px-3 text-sm text-foreground disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground"
							>
								Clear search
							</button>
						</div>
						<div>
							<p className="text-sm text-foreground/80">Severity filters</p>
							<div className="mt-2 flex flex-wrap gap-2">
								{severityFilterOptions.map((option) => {
									const isActive = activeSeverityFilters.includes(
										option.severity,
									);

									return (
										<button
											key={option.severity}
											type="button"
											onClick={() => toggleSeverityFilter(option.severity)}
											aria-pressed={isActive}
											className={`rounded-md border px-3 py-2 text-sm font-medium ${
												isActive
													? option.buttonClassName
													: "border-input bg-background text-foreground/80"
											}`}
										>
											{option.label}
										</button>
									);
								})}
								<button
									type="button"
									onClick={clearSeverityFilters}
									disabled={!hasActiveSeverityFilters}
									className="rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground"
								>
									Clear severity
								</button>
							</div>
						</div>
					</div>
					{hasActiveLogFilters && (
						<p className="mt-2 text-sm text-muted-foreground">
							Showing {filteredLogLines.length} of {rawLogLines.length} buffered
							log lines.
						</p>
					)}
					<div className="mt-4 rounded-md border border-border bg-panel p-4">
						<div className="flex flex-wrap items-center gap-2">
							<button
								type="button"
								onClick={copySelectedLogLine}
								disabled={!selectedLogLine}
								className="rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground"
							>
								Copy selected line
							</button>
							<button
								type="button"
								onClick={copyVisibleLogLines}
								disabled={filteredLogLines.length === 0}
								className="rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground"
							>
								Copy visible logs
							</button>
							<button
								type="button"
								onClick={exportLogLinesAsText}
								disabled={exportLogLines.length === 0}
								className="rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground"
							>
								Export .txt
							</button>
							<button
								type="button"
								onClick={exportLogLinesAsJson}
								disabled={exportLogLines.length === 0}
								className="rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground"
							>
								Export .json
							</button>
						</div>
						<label className="mt-3 flex items-center gap-2 text-sm text-foreground/80">
							<input
								type="checkbox"
								checked={includeFilteredOutLogsForExport}
								onChange={(event) =>
									setIncludeFilteredOutLogsForExport(event.target.checked)
								}
								className="h-4 w-4 rounded border-input"
							/>
							Include filtered-out logs in exports
						</label>
						<p className="mt-2 text-xs text-muted-foreground">
							Exports use {exportLogLines.length}{" "}
							{includeFilteredOutLogsForExport
								? "buffered"
								: "visible filtered"}{" "}
							log lines.
						</p>
						{logTransferStatus && (
							<p className="mt-2 text-sm text-foreground/80" role="status">
								{logTransferStatus}
							</p>
						)}
					</div>
					<LogDensityMap
						densityData={logDensityData}
						logLineCount={filteredLogLines.length}
						onBucketClick={jumpToDensityBucket}
					/>
					<div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
						{filteredLogLines.length > 0 ? (
							<List
								listRef={logListRef}
								onScroll={handleLogViewerScroll}
								rowComponent={LogLineRow}
								rowCount={filteredLogLines.length}
								rowHeight={LOG_ROW_HEIGHT}
								rowProps={{
									filteredLogLines,
									logSearch,
									onSelectLogLine: setSelectedLogLine,
									selectedLogLine,
								}}
								overscanCount={8}
								className="mt-4 overflow-auto rounded-md border border-border bg-log p-4 font-mono text-xs leading-5 text-log-foreground"
								style={{ height: LOG_LIST_HEIGHT }}
							/>
						) : (
							<div className="mt-4 h-72 overflow-auto rounded-md border border-border bg-log p-4 font-mono text-xs leading-5 whitespace-pre-wrap text-log-foreground">
								{hasActiveLogFilters
									? "No log lines match your filters."
									: "No log lines received yet."}
							</div>
						)}
						{selectedLogLine && selectedLogLineMetadata && (
							<aside className="mt-4 rounded-md border border-border bg-panel p-4">
								<div className="flex items-start justify-between gap-3">
									<div>
										<h3 className="text-sm font-semibold text-foreground">
											Log line details
										</h3>
										<p className="mt-1 text-xs text-muted-foreground">
											Inspect the selected log entry.
										</p>
									</div>
									<button
										type="button"
										onClick={closeLogLineDetails}
										className="rounded-md border border-input bg-background px-3 py-1.5 text-sm text-foreground"
									>
										Close
									</button>
								</div>
								<div className="mt-4 space-y-3 text-sm">
									<div>
										<p className="font-medium text-foreground/80">
											Structured JSON
										</p>
										{selectedLogLineFormattedJson ? (
											<pre className="mt-2 max-h-72 overflow-auto whitespace-pre rounded-md border border-border bg-card p-3 font-mono text-xs text-foreground">
												{selectedLogLineFormattedJson}
											</pre>
										) : (
											<p className="mt-2 rounded-md border border-border bg-card p-3 text-xs text-muted-foreground">
												No valid JSON object or array found in this log line.
											</p>
										)}
									</div>
									<div>
										<p className="font-medium text-foreground/80">
											Raw log text
										</p>
										<pre className="mt-2 max-h-56 overflow-auto whitespace-pre-wrap break-words rounded-md border border-border bg-card p-3 font-mono text-xs text-foreground">
											{selectedLogLine.line}
										</pre>
									</div>
									<div>
										<p className="font-medium text-foreground/80">
											Parsed metadata
										</p>
										<dl className="mt-2 grid gap-2 rounded-md border border-border bg-card p-3 text-xs">
											{[
												["timestamp", selectedLogLineMetadata.timestamp],
												["severity", selectedLogLineMetadata.severity],
												["namespace", selectedLogLineMetadata.namespace],
												["pod", selectedLogLineMetadata.pod],
											].map(([label, value]) => (
												<div key={label} className="grid grid-cols-3 gap-2">
													<dt className="font-medium capitalize text-muted-foreground">
														{label}
													</dt>
													<dd className="col-span-2 break-words text-foreground">
														{value || "Not available"}
													</dd>
												</div>
											))}
										</dl>
									</div>
								</div>
							</aside>
						)}
					</div>
				</Panel>
			</PageContainer>
		</AppShell>
	);
}

export default App;
