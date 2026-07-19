import { create } from "zustand";

export function createDefaultClusterViewerState() {
	return {
		selectedNamespace: null,
		selectedDeployment: null,
		selectedPods: [],
		selectedContainer: null,
		query: "",
		openPodTabs: [],
		activeTabId: null,
		tabLogState: {},
	};
}

export function normalizeClusterId(clusterId) {
	if (clusterId === null || clusterId === undefined) {
		throw new Error("clusterId is required");
	}

	const normalizedClusterId = String(clusterId).trim();

	if (!normalizedClusterId) {
		throw new Error("clusterId is required");
	}

	return normalizedClusterId;
}

function createClusterStateMapWithEntry(
	viewerStateByCluster,
	clusterId,
	clusterState,
) {
	return {
		...viewerStateByCluster,
		[clusterId]: clusterState,
	};
}

export function getClusterViewerStateOrDefault(
	viewerStateByCluster,
	clusterId,
) {
	const normalizedClusterId = normalizeClusterId(clusterId);

	return (
		viewerStateByCluster?.[normalizedClusterId] ||
		createDefaultClusterViewerState()
	);
}

function createNextClusterViewerState(currentClusterState, update) {
	const normalizedCurrentState = {
		...createDefaultClusterViewerState(),
		...currentClusterState,
	};

	if (typeof update === "function") {
		return update(normalizedCurrentState);
	}

	return {
		...normalizedCurrentState,
		...update,
	};
}

function updateClusterViewerStateMap(viewerStateByCluster, clusterId, update) {
	const normalizedClusterId = normalizeClusterId(clusterId);
	const currentClusterState = getClusterViewerStateOrDefault(
		viewerStateByCluster,
		normalizedClusterId,
	);

	return createClusterStateMapWithEntry(
		viewerStateByCluster,
		normalizedClusterId,
		createNextClusterViewerState(currentClusterState, update),
	);
}

export const useViewerStore = create((set, get) => ({
	viewerStateByCluster: {},
	getOrCreateClusterState: (clusterId) => {
		const normalizedClusterId = normalizeClusterId(clusterId);
		const existingClusterState =
			get().viewerStateByCluster[normalizedClusterId];

		if (existingClusterState) {
			return existingClusterState;
		}

		set((state) => ({
			viewerStateByCluster: createClusterStateMapWithEntry(
				state.viewerStateByCluster,
				normalizedClusterId,
				createDefaultClusterViewerState(),
			),
		}));

		return get().viewerStateByCluster[normalizedClusterId];
	},
	patchClusterState: (clusterId, update) => {
		set((state) => ({
			viewerStateByCluster: updateClusterViewerStateMap(
				state.viewerStateByCluster,
				clusterId,
				update,
			),
		}));

		return get().viewerStateByCluster[normalizeClusterId(clusterId)];
	},
	setSelectedNamespace: (clusterId, namespace) => {
		return get().patchClusterState(clusterId, {
			selectedNamespace: namespace,
			selectedDeployment: null,
			selectedPods: [],
		});
	},
	setSelectedDeployment: (clusterId, deployment) => {
		return get().patchClusterState(clusterId, {
			selectedDeployment: deployment,
			selectedPods: [],
		});
	},
	setSelectedPods: (clusterId, selectedPods) => {
		return get().patchClusterState(clusterId, {
			selectedPods,
		});
	},
	setSelectedContainer: (clusterId, container) => {
		return get().patchClusterState(clusterId, {
			selectedContainer: container,
		});
	},
	setQuery: (clusterId, query) => {
		return get().patchClusterState(clusterId, {
			query: String(query ?? ""),
		});
	},
	setOpenPodTabs: (clusterId, openPodTabs) => {
		return get().patchClusterState(clusterId, {
			openPodTabs,
		});
	},
	setActiveTabId: (clusterId, activeTabId) => {
		return get().patchClusterState(clusterId, {
			activeTabId,
		});
	},
	setTabLogState: (clusterId, tabId, nextTabLogState) => {
		return get().patchClusterState(clusterId, (currentClusterState) => ({
			...currentClusterState,
			tabLogState: {
				...currentClusterState.tabLogState,
				[tabId]: nextTabLogState,
			},
		}));
	},
}));
