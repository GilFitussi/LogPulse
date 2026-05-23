import { create } from "zustand";

export function createDefaultClusterViewerState() {
	return {
		selectedNamespace: null,
		selectedDeployment: null,
		selectedContainer: null,
		openPodTabs: [],
		activeTabId: null,
		tabLogState: {},
	};
}

function normalizeClusterId(clusterId) {
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
	setSelectedNamespace: (clusterId, namespace) => {
		const normalizedClusterId = normalizeClusterId(clusterId);
		const clusterState = get().getOrCreateClusterState(normalizedClusterId);

		set((state) => ({
			viewerStateByCluster: createClusterStateMapWithEntry(
				state.viewerStateByCluster,
				normalizedClusterId,
				{
					...clusterState,
					selectedNamespace: namespace,
				},
			),
		}));
	},
}));
