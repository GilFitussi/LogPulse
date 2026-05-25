export const APP_VIEWS = {
	WORKSPACES: "workspaces",
	VIEWER: "viewer",
};

const CONNECTED_CLUSTER_STATUSES = new Set([
	"connected",
	"success",
	"online",
	"ok",
	"healthy",
]);

export function isClusterConnected(cluster) {
	const normalizedStatus = String(cluster?.lastConnectionStatus || "")
		.trim()
		.toLowerCase();

	return CONNECTED_CLUSTER_STATUSES.has(normalizedStatus);
}

export function canOpenViewer(cluster) {
	return Boolean(cluster) && isClusterConnected(cluster);
}

export function getOpenViewerActionState(cluster) {
	if (!cluster) {
		return {
			disabled: true,
			reason: "Select a cluster to open the Log Viewer.",
		};
	}

	if (!isClusterConnected(cluster)) {
		return {
			disabled: true,
			reason: "Connect the selected cluster before opening the Log Viewer.",
		};
	}

	return {
		disabled: false,
		reason: "Open the dedicated Log Viewer for this cluster.",
	};
}

export function openViewer(currentView, cluster) {
	return canOpenViewer(cluster) ? APP_VIEWS.VIEWER : currentView;
}

export function backToWorkspaces() {
	return APP_VIEWS.WORKSPACES;
}
