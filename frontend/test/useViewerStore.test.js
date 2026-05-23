import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import {
	createDefaultClusterViewerState,
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
		selectedContainer: null,
		openPodTabs: [],
		activeTabId: null,
		tabLogState: {},
	});
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

test("setSelectedNamespace only updates the targeted cluster", () => {
	useViewerStore.getState().setSelectedNamespace("cluster-a", "default");
	useViewerStore
		.getState()
		.setSelectedNamespace("cluster-b", "openshift-config");

	assert.deepEqual(useViewerStore.getState().viewerStateByCluster, {
		"cluster-a": {
			...createDefaultClusterViewerState(),
			selectedNamespace: "default",
		},
		"cluster-b": {
			...createDefaultClusterViewerState(),
			selectedNamespace: "openshift-config",
		},
	});
});

test("setSelectedNamespace preserves default tabLogState on new cluster entries", () => {
	useViewerStore.getState().setSelectedNamespace("cluster-a", "kube-system");

	assert.deepEqual(
		useViewerStore.getState().viewerStateByCluster["cluster-a"],
		{
			...createDefaultClusterViewerState(),
			selectedNamespace: "kube-system",
		},
	);
	assert.deepEqual(
		useViewerStore.getState().viewerStateByCluster["cluster-a"].tabLogState,
		{},
	);
});
