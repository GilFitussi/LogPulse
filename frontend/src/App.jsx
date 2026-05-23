import { useCallback, useEffect, useMemo, useState } from "react";

import { ClusterNamespaceWorkspace } from "@/components/cluster-namespace-workspace";
import { ClustersSidebar } from "@/components/clusters-sidebar";
import {
	AppShell,
	ContentLayout,
	PageContainer,
	Panel,
} from "@/components/layout/app-shell";
import { TopToolbar } from "@/components/layout/top-toolbar";

const API_BASE_URL = "http://localhost:3000";

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
		return null;
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

function App() {
	const [clusters, setClusters] = useState([]);
	const [clustersError, setClustersError] = useState("");
	const [isClustersLoading, setIsClustersLoading] = useState(true);
	const [selectedClusterId, setSelectedClusterId] = useState(null);

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

			return data;
		},
		[loadClusters],
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

			return data.cluster;
		},
		[loadClusters],
	);

	useEffect(() => {
		void Promise.resolve().then(loadClusters);
	}, [loadClusters]);

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
		},
		[clusters],
	);

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
						<SelectedClusterWorkspaceHeader cluster={selectedCluster} />
						<ClusterNamespaceWorkspace
							cluster={selectedCluster}
							apiBaseUrl={API_BASE_URL}
						/>
					</Panel>
				</ContentLayout>
			</PageContainer>
		</AppShell>
	);
}

export default App;
