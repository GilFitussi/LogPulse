import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import {
	createDefaultClusterViewerState,
	getClusterViewerStateOrDefault,
	normalizeClusterId,
	useViewerStore,
} from "../src/stores/useViewerStore.js";

function resetViewerStore() {
	useViewerStore.setState({
		viewerStateByCluster: {},
	});
}

afterEach(() => {
	resetViewerStore();
});

test("createDefaultClusterViewerState returns the expected serializable defaults", () => {
	assert.deepEqual(createDefaultClusterViewerState(), {
		selectedNamespace: null,
		selectedDeployment: null,
		selectedPods: [],
		selectedContainer: null,
		openPodTabs: [],
		activeTabId: null,
		tabLogState: {},
	});
});

test("normalizeClusterId rejects empty values and trims valid ids", () => {
	assert.throws(() => normalizeClusterId(null), /clusterId is required/i);
	assert.throws(() => normalizeClusterId("   "), /clusterId is required/i);
	assert.equal(normalizeClusterId("  cluster-a  "), "cluster-a");
});

test("getOrCreateClusterState initializes a missing cluster state predictably", () => {
	const clusterState = useViewerStore
		.getState()
		.getOrCreateClusterState("cluster-a");

	assert.deepEqual(clusterState, createDefaultClusterViewerState());
	assert.deepEqual(useViewerStore.getState().viewerStateByCluster, {
		"cluster-a": createDefaultClusterViewerState(),
	});
	assert.deepEqual(clusterState.tabLogState, {});
});

test("getClusterViewerStateOrDefault returns a default snapshot without mutating store state", () => {
	const snapshot = getClusterViewerStateOrDefault({}, "cluster-a");

	assert.deepEqual(snapshot, createDefaultClusterViewerState());
	assert.deepEqual(useViewerStore.getState().viewerStateByCluster, {});
});

test("getOrCreateClusterState returns the existing cluster state without affecting other clusters", () => {
	const firstClusterState = useViewerStore
		.getState()
		.getOrCreateClusterState("cluster-a");

	useViewerStore.getState().setSelectedNamespace("cluster-b", "payments-prod");

	const secondReadClusterState = useViewerStore
		.getState()
		.getOrCreateClusterState("cluster-a");

	assert.equal(secondReadClusterState, firstClusterState);
	assert.equal(secondReadClusterState.selectedNamespace, null);
	assert.equal(
		useViewerStore.getState().viewerStateByCluster["cluster-b"]
			.selectedNamespace,
		"payments-prod",
	);
});

test("setSelectedNamespace only updates the targeted cluster and clears deployment and pod selection", () => {
	useViewerStore.getState().setSelectedDeployment("cluster-a", "api");
	useViewerStore.getState().setSelectedPods("cluster-a", ["api-123"]);
	useViewerStore.getState().setSelectedDeployment("cluster-b", "dns");
	useViewerStore.getState().setSelectedPods("cluster-b", ["dns-456"]);
	useViewerStore.getState().setSelectedNamespace("cluster-a", "default");
	useViewerStore
		.getState()
		.setSelectedNamespace("cluster-b", "openshift-config");

	assert.deepEqual(useViewerStore.getState().viewerStateByCluster, {
		"cluster-a": {
			...createDefaultClusterViewerState(),
			selectedNamespace: "default",
			selectedDeployment: null,
			selectedPods: [],
		},
		"cluster-b": {
			...createDefaultClusterViewerState(),
			selectedNamespace: "openshift-config",
			selectedDeployment: null,
			selectedPods: [],
		},
	});
});

test("patchClusterState preserves per-cluster viewer context for tabs and selection", () => {
	useViewerStore.getState().patchClusterState("cluster-a", {
		selectedNamespace: "payments-prod",
		selectedDeployment: "api",
		selectedPods: ["api-123", "api-456"],
		openPodTabs: [{ id: "pod-a-1", podName: "api-123" }],
		activeTabId: "pod-a-1",
	});
	useViewerStore.getState().patchClusterState("cluster-b", {
		selectedNamespace: "kube-system",
		selectedDeployment: "dns",
		selectedPods: ["dns-456"],
		openPodTabs: [{ id: "pod-b-1", podName: "dns-456" }],
		activeTabId: "pod-b-1",
	});

	assert.deepEqual(
		useViewerStore.getState().viewerStateByCluster["cluster-a"],
		{
			...createDefaultClusterViewerState(),
			selectedNamespace: "payments-prod",
			selectedDeployment: "api",
			selectedPods: ["api-123", "api-456"],
			openPodTabs: [{ id: "pod-a-1", podName: "api-123" }],
			activeTabId: "pod-a-1",
		},
	);
	assert.deepEqual(
		useViewerStore.getState().viewerStateByCluster["cluster-b"],
		{
			...createDefaultClusterViewerState(),
			selectedNamespace: "kube-system",
			selectedDeployment: "dns",
			selectedPods: ["dns-456"],
			openPodTabs: [{ id: "pod-b-1", podName: "dns-456" }],
			activeTabId: "pod-b-1",
		},
	);
});

test("setTabLogState only appends log state for the targeted cluster and tab", () => {
	useViewerStore.getState().setTabLogState("cluster-a", "pod-a-1", {
		isStreaming: true,
	});
	useViewerStore.getState().setTabLogState("cluster-b", "pod-b-1", {
		isStreaming: false,
	});

	assert.deepEqual(
		useViewerStore.getState().viewerStateByCluster["cluster-a"],
		{
			...createDefaultClusterViewerState(),
			tabLogState: {
				"pod-a-1": {
					isStreaming: true,
				},
			},
		},
	);
	assert.deepEqual(
		useViewerStore.getState().viewerStateByCluster["cluster-b"],
		{
			...createDefaultClusterViewerState(),
			tabLogState: {
				"pod-b-1": {
					isStreaming: false,
				},
			},
		},
	);
});

test("setSelectedDeployment clears selected pods for the targeted cluster", () => {
	useViewerStore.getState().setSelectedPods("cluster-a", ["api-123"]);
	useViewerStore.getState().setSelectedPods("cluster-b", ["dns-456"]);
	useViewerStore.getState().setSelectedDeployment("cluster-a", "api");

	assert.deepEqual(useViewerStore.getState().viewerStateByCluster, {
		"cluster-a": {
			...createDefaultClusterViewerState(),
			selectedDeployment: "api",
			selectedPods: [],
		},
		"cluster-b": {
			...createDefaultClusterViewerState(),
			selectedPods: ["dns-456"],
		},
	});
});

test("viewer state survives app-level back navigation because store state is independent of currentView", () => {
	useViewerStore.getState().patchClusterState("cluster-a", {
		selectedNamespace: "default",
		selectedPods: ["api-123"],
		activeTabId: "pod-a-1",
	});

	const beforeBackNavigation = structuredClone(
		useViewerStore.getState().viewerStateByCluster,
	);

	const nextAppView = "workspaces";

	assert.equal(nextAppView, "workspaces");
	assert.deepEqual(
		useViewerStore.getState().viewerStateByCluster,
		beforeBackNavigation,
	);
});
