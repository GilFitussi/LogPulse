import { useEffect, useState } from "react";

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
	const [logLines, setLogLines] = useState([]);
	const [logStatus, setLogStatus] = useState(
		"Select a project and pod to stream logs",
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

				setLogLines((currentLines) => [
					...currentLines,
					...logLines.map(formatLogEvent),
				]);
			} catch {
				setLogLines((currentLines) => [...currentLines, event.data]);
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
			setLogLines([]);
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
		setLogLines([]);
		setLogStatus(
			nextPod
				? "Connecting to log stream..."
				: "Select a project and pod to stream logs",
		);
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
					<pre className="mt-4 h-72 overflow-auto rounded-md border border-slate-800 bg-slate-950 p-4 text-xs leading-5 whitespace-pre-wrap text-slate-100">
						{logLines.length > 0
							? logLines.join("\n")
							: "No log lines received yet."}
					</pre>
				</section>
			</div>
		</main>
	);
}

export default App;
