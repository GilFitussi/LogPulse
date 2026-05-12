import { useEffect, useRef, useState } from "react";
import { List } from "react-window";

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

const severityFilterOptions = [
	{
		severity: LOG_SEVERITIES.ERROR,
		label: "Error",
		markerClassName: "bg-red-500 text-white",
		buttonClassName: "border-red-300 bg-red-50 text-red-800",
	},
	{
		severity: LOG_SEVERITIES.WARN,
		label: "Warn",
		markerClassName: "bg-amber-400 text-amber-950",
		buttonClassName: "border-amber-300 bg-amber-50 text-amber-800",
	},
	{
		severity: LOG_SEVERITIES.INFO,
		label: "Info",
		markerClassName: "bg-sky-400 text-sky-950",
		buttonClassName: "border-sky-300 bg-sky-50 text-sky-800",
	},
	{
		severity: LOG_SEVERITIES.DEBUG,
		label: "Debug",
		markerClassName: "bg-violet-400 text-violet-950",
		buttonClassName: "border-violet-300 bg-violet-50 text-violet-800",
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
		className: "border-slate-200 bg-slate-50 text-slate-700",
	},
	[AUTH_STATUS.CONNECTED]: {
		label: "Connected",
		message: "Backend can access your local OpenShift session.",
		className: "border-emerald-200 bg-emerald-50 text-emerald-800",
	},
	[AUTH_STATUS.NOT_LOGGED_IN]: {
		label: "Not logged in",
		message: "Please run oc login from your terminal.",
		className: "border-amber-200 bg-amber-50 text-amber-800",
	},
	[AUTH_STATUS.OC_NOT_INSTALLED]: {
		label: "oc not installed",
		message:
			"Install the OpenShift CLI and make sure oc is available in your PATH.",
		className: "border-red-200 bg-red-50 text-red-800",
	},
	[AUTH_STATUS.ERROR]: {
		label: "Unable to check authentication",
		message:
			"The backend could not verify your OpenShift authentication status.",
		className: "border-red-200 bg-red-50 text-red-800",
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
				className="rounded bg-amber-300 px-0.5 text-slate-950"
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
	const isSelected = selectedLogLine?.line === line && selectedLogLine?.index === index;

	return (
		<button
			{...ariaAttributes}
			type="button"
			style={style}
			onClick={() => onSelectLogLine({ index, line })}
			className={`overflow-hidden whitespace-pre-wrap pr-4 text-left font-mono text-xs leading-5 text-slate-100 ${
				isSelected ? "bg-slate-800" : "hover:bg-slate-900"
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
	const hasActiveLogSearch = logSearch.trim().length > 0;
	const hasActiveSeverityFilters = activeSeverityFilters.length > 0;
	const hasActiveLogFilters = hasActiveLogSearch || hasActiveSeverityFilters;
	const selectedLogLineMetadata = selectedLogLine
		? parseLogLineMetadata(selectedLogLine.line, selectedNamespace, selectedPod)
		: null;

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

	const clearLogSearch = () => {
		setLogSearch("");
	};

	const toggleSeverityFilter = (severity) => {
		setActiveSeverityFilters((currentFilters) =>
			currentFilters.includes(severity)
				? currentFilters.filter((currentSeverity) => currentSeverity !== severity)
				: [...currentFilters, severity],
		);
	};

	const clearSeverityFilters = () => {
		setActiveSeverityFilters([]);
	};

	const closeLogLineDetails = () => {
		setSelectedLogLine(null);
	};

	return (
		<main className="min-h-screen bg-slate-50 px-6 py-8">
			<div className="mx-auto flex max-w-6xl flex-col gap-6">
				<header className="border-b border-slate-200 pb-5">
					<h1 className="text-3xl font-semibold text-slate-950">OS-LogPulse</h1>
				</header>

				<section className="grid gap-4 md:grid-cols-2">
					<div className="rounded-lg border border-slate-200 bg-white p-5">
						<h2 className="text-base font-medium text-slate-900">
							Backend status
						</h2>
						<p className="mt-2 text-sm text-slate-700">{healthStatus}</p>
					</div>

					<div className="rounded-lg border border-slate-200 bg-white p-5">
						<h2 className="text-base font-medium text-slate-900">
							OpenShift authentication
						</h2>
						<div
							className={`mt-3 rounded-md border px-4 py-3 ${authContent.className}`}
						>
							<p className="text-sm font-medium">{authContent.label}</p>
							<p className="mt-1 text-sm">{authContent.message}</p>
						</div>
					</div>
				</section>

				<section className="grid gap-4 md:grid-cols-2">
					<div className="rounded-lg border border-slate-200 bg-white p-5">
						<h2 className="text-base font-medium text-slate-900">
							Project selector
						</h2>
						<label
							htmlFor="namespace-selector"
							className="mt-4 block text-sm text-slate-700"
						>
							OpenShift project / namespace
						</label>
						<input
							id="namespace-selector"
							list="namespace-options"
							value={namespaceSearch}
							onChange={handleNamespaceChange}
							placeholder="Search projects..."
							className="mt-2 h-11 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-slate-500"
						/>
						<datalist id="namespace-options">
							{filteredNamespaces.map((namespace) => (
								<option key={namespace} value={namespace} />
							))}
						</datalist>
						<p className="mt-2 text-sm text-slate-600">
							{selectedNamespace
								? `Selected project: ${selectedNamespace}`
								: namespacesStatus}
						</p>
					</div>

					<div className="rounded-lg border border-slate-200 bg-white p-5">
						<h2 className="text-base font-medium text-slate-900">
							Pod selector
						</h2>
						<label
							htmlFor="pod-selector"
							className="mt-4 block text-sm text-slate-700"
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
							className="mt-2 h-11 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-slate-500 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500"
						/>
						<datalist id="pod-options">
							{filteredPodNames.map((podName) => (
								<option key={podName} value={podName} />
							))}
						</datalist>
						<p className="mt-2 text-sm text-slate-600">
							{selectedPod ? `Selected pod: ${selectedPod}` : podsStatus}
						</p>
					</div>
				</section>

				<section className="min-h-96 rounded-lg border border-slate-200 bg-white p-5">
					<div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
						<h2 className="text-base font-medium text-slate-900">Live logs</h2>
						<p className="text-sm text-slate-600">{logStatus}</p>
					</div>
					{hasNewLogsWhilePaused && (
						<p className="mt-3 text-sm text-slate-700">
							New logs available while auto-scroll is paused.
						</p>
					)}
					{(isLogAutoScrollPaused || hasNewLogsWhilePaused) && (
						<button
							type="button"
							onClick={jumpToLatestLog}
							className="mt-3 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
						>
							Jump to latest
						</button>
					)}
					<div className="mt-4 flex flex-col gap-3">
						<div className="flex flex-col gap-2 sm:flex-row sm:items-end">
							<div className="flex-1">
								<label
									htmlFor="log-search"
									className="block text-sm text-slate-700"
								>
									Search current log buffer
								</label>
								<input
									id="log-search"
									value={logSearch}
									onChange={(event) => setLogSearch(event.target.value)}
									placeholder="Filter logs by text..."
									className="mt-2 h-11 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-slate-500"
								/>
							</div>
							<button
								type="button"
								onClick={clearLogSearch}
								disabled={!hasActiveLogSearch}
								className="h-11 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500"
							>
								Clear search
							</button>
						</div>
						<div>
							<p className="text-sm text-slate-700">Severity filters</p>
							<div className="mt-2 flex flex-wrap gap-2">
								{severityFilterOptions.map((option) => {
									const isActive = activeSeverityFilters.includes(option.severity);

									return (
										<button
											key={option.severity}
											type="button"
											onClick={() => toggleSeverityFilter(option.severity)}
											aria-pressed={isActive}
											className={`rounded-md border px-3 py-2 text-sm font-medium ${
												isActive
													? option.buttonClassName
													: "border-slate-300 bg-white text-slate-700"
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
									className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500"
								>
									Clear severity
								</button>
							</div>
						</div>
					</div>
					{hasActiveLogFilters && (
						<p className="mt-2 text-sm text-slate-600">
							Showing {filteredLogLines.length} of {rawLogLines.length} buffered log
							lines.
						</p>
					)}
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
								className="mt-4 overflow-auto rounded-md border border-slate-800 bg-slate-950 p-4 font-mono text-xs leading-5 text-slate-100"
								style={{ height: LOG_LIST_HEIGHT }}
							/>
						) : (
							<div className="mt-4 h-72 overflow-auto rounded-md border border-slate-800 bg-slate-950 p-4 font-mono text-xs leading-5 whitespace-pre-wrap text-slate-100">
								{hasActiveLogFilters
									? "No log lines match your filters."
									: "No log lines received yet."}
							</div>
						)}
						{selectedLogLine && selectedLogLineMetadata && (
							<aside className="mt-4 rounded-md border border-slate-200 bg-slate-50 p-4">
								<div className="flex items-start justify-between gap-3">
									<div>
										<h3 className="text-sm font-semibold text-slate-900">
											Log line details
										</h3>
										<p className="mt-1 text-xs text-slate-600">
											Inspect the selected log entry.
										</p>
									</div>
									<button
										type="button"
										onClick={closeLogLineDetails}
										className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-900"
									>
										Close
									</button>
								</div>
								<div className="mt-4 space-y-3 text-sm">
									<div>
										<p className="font-medium text-slate-700">Raw log text</p>
										<pre className="mt-2 max-h-56 overflow-auto whitespace-pre-wrap break-words rounded-md border border-slate-200 bg-white p-3 font-mono text-xs text-slate-900">
											{selectedLogLine.line}
										</pre>
									</div>
									<div>
										<p className="font-medium text-slate-700">Parsed metadata</p>
										<dl className="mt-2 grid gap-2 rounded-md border border-slate-200 bg-white p-3 text-xs">
											{[
												["timestamp", selectedLogLineMetadata.timestamp],
												["severity", selectedLogLineMetadata.severity],
												["namespace", selectedLogLineMetadata.namespace],
												["pod", selectedLogLineMetadata.pod],
											].map(([label, value]) => (
												<div key={label} className="grid grid-cols-3 gap-2">
													<dt className="font-medium capitalize text-slate-600">
														{label}
													</dt>
													<dd className="col-span-2 break-words text-slate-900">
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
				</section>
			</div>
		</main>
	);
}

export default App;
