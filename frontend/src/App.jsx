import { useCallback, useEffect, useMemo, useState } from "react";

import { LogViewerScreen } from "@/components/log-viewer-screen";
import { AppShell, PageContainer } from "@/components/layout/app-shell";
import { TopToolbar } from "@/components/layout/top-toolbar";
import { WorkspacesScreen } from "@/components/workspaces-screen";
import { APP_VIEWS, canOpenViewer, openViewer } from "@/lib/viewerNavigation";

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

function App() {
	const [clusters, setClusters] = useState([]);
	const [clustersError, setClustersError] = useState("");
	const [isClustersLoading, setIsClustersLoading] = useState(true);
	const [selectedClusterId, setSelectedClusterId] = useState(null);
	const [currentView, setCurrentView] = useState(APP_VIEWS.WORKSPACES);

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

	const handleOpenViewer = useCallback(() => {
		setCurrentView((current) => openViewer(current, selectedCluster));
	}, [selectedCluster]);

	const handleChangeView = useCallback(
		(nextView) => {
			if (nextView === APP_VIEWS.WORKSPACES) {
				setCurrentView(APP_VIEWS.WORKSPACES);
				return;
			}

			if (nextView === APP_VIEWS.VIEWER) {
				setCurrentView((current) => openViewer(current, selectedCluster));
			}
		},
		[selectedCluster],
	);

	const isViewerActive = currentView === APP_VIEWS.VIEWER;

	return (
		<AppShell>
			<TopToolbar
				currentView={currentView}
				onChangeView={handleChangeView}
				canAccessViewer={canOpenViewer(selectedCluster)}
			/>
			<PageContainer
				className={
					isViewerActive
						? "max-w-none gap-0 px-0 py-0 sm:px-0 lg:px-0"
						: undefined
				}
			>
				{isViewerActive ? (
					<LogViewerScreen
						cluster={selectedCluster}
						apiBaseUrl={API_BASE_URL}
					/>
				) : (
					<WorkspacesScreen
						clusters={clusters}
						error={clustersError}
						isClustersLoading={isClustersLoading}
						onCreateCluster={createCluster}
						onDeleteCluster={deleteCluster}
						onLoginCluster={loginToCluster}
						onLogoutCluster={logoutFromCluster}
						onOpenViewer={handleOpenViewer}
						onRefresh={loadClusters}
						onSelectCluster={handleSelectCluster}
						onUpdateCluster={updateCluster}
						selectedCluster={selectedCluster}
						selectedClusterId={selectedClusterId}
					/>
				)}
			</PageContainer>
		</AppShell>
	);
}

export default App;
