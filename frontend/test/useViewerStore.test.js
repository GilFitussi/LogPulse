import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import {
	createDefaultClusterViewerState,
	createDefaultLogSession,
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

function normalizeSessionTimestamps(value) {
	const normalizedValue = structuredClone(value);

	for (const clusterState of Object.values(normalizedValue)) {
		for (const session of Object.values(clusterState.logSessionsById || {})) {
			delete session.createdAt;
			delete session.updatedAt;
		}
	}

	return normalizedValue;
}

function createExpectedClusterState(overrides = {}, sessionOverrides = overrides) {
	const defaultState = createDefaultClusterViewerState();
	const activeSessionId = defaultState.activeLogSessionId;

	return {
		...defaultState,
		...overrides,
		logSessionsById: {
			...defaultState.logSessionsById,
			[activeSessionId]: {
				...defaultState.logSessionsById[activeSessionId],
				...sessionOverrides,
			},
		},
	};
}

function assertViewerStateByClusterEqual(actual, expected) {
	assert.deepEqual(
		normalizeSessionTimestamps(actual),
		normalizeSessionTimestamps(expected),
	);
}

test("createDefaultClusterViewerState returns the expected serializable defaults", () => {
	const defaultSession = createDefaultLogSession();

	assert.deepEqual(createDefaultClusterViewerState(), {
		selectedNamespace: null,
		selectedDeployment: null,
		selectedPods: [],
		selectedContainer: null,
		query: "",
		activeLogSessionId: defaultSession.id,
		logSessionsById: {
			[defaultSession.id]: defaultSession,
		},
		logSessionOrder: [defaultSession.id],
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

	assertViewerStateByClusterEqual(useViewerStore.getState().viewerStateByCluster, {
		"cluster-a": createExpectedClusterState({
			selectedNamespace: "default",
			selectedDeployment: null,
			selectedPods: [],
		}),
		"cluster-b": createExpectedClusterState({
			selectedNamespace: "openshift-config",
			selectedDeployment: null,
			selectedPods: [],
		}),
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
			...createExpectedClusterState(
				{
					selectedNamespace: "payments-prod",
					selectedDeployment: "api",
					selectedPods: ["api-123", "api-456"],
					openPodTabs: [{ id: "pod-a-1", podName: "api-123" }],
					activeTabId: "pod-a-1",
				},
				{
					selectedNamespace: "payments-prod",
					selectedDeployment: "api",
					selectedPods: ["api-123", "api-456"],
				},
			),
		},
	);
	assert.deepEqual(
		useViewerStore.getState().viewerStateByCluster["cluster-b"],
		{
			...createExpectedClusterState(
				{
					selectedNamespace: "kube-system",
					selectedDeployment: "dns",
					selectedPods: ["dns-456"],
					openPodTabs: [{ id: "pod-b-1", podName: "dns-456" }],
					activeTabId: "pod-b-1",
				},
				{
					selectedNamespace: "kube-system",
					selectedDeployment: "dns",
					selectedPods: ["dns-456"],
				},
			),
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

	assertViewerStateByClusterEqual(useViewerStore.getState().viewerStateByCluster, {
		"cluster-a": createExpectedClusterState({
			selectedDeployment: "api",
			selectedPods: [],
		}),
		"cluster-b": createExpectedClusterState({
			selectedPods: ["dns-456"],
		}),
	});
});

test("setQuery stores the current query for the targeted cluster", () => {
	useViewerStore.getState().setQuery("cluster-a", "level:error");
	useViewerStore.getState().setQuery("cluster-b", "statusCode:500");

	assertViewerStateByClusterEqual(useViewerStore.getState().viewerStateByCluster, {
		"cluster-a": createExpectedClusterState({
			query: "level:error",
		}),
		"cluster-b": createExpectedClusterState({
			query: "statusCode:500",
		}),
	});
});

test("setQuery normalizes empty values without clearing the loaded dataset scope", () => {
	useViewerStore.getState().patchClusterState("cluster-a", {
		selectedNamespace: "payments-prod",
		selectedDeployment: "api",
		selectedPods: ["api-123"],
		query: "level:error",
	});

	useViewerStore.getState().setQuery("cluster-a", null);

	assertViewerStateByClusterEqual(
		{
			"cluster-a":
				useViewerStore.getState().viewerStateByCluster["cluster-a"],
		},
		{
			"cluster-a": createExpectedClusterState({
				selectedNamespace: "payments-prod",
				selectedDeployment: "api",
				selectedPods: ["api-123"],
				query: "",
			}),
		},
	);
});

test("log sessions are scoped to a cluster and preserve independent viewer state", () => {
	useViewerStore.getState().patchActiveLogSession("cluster-a", {
		title: "api errors",
		selectedNamespace: "payments",
		selectedDeployment: "api",
		selectedPods: ["api-123"],
		query: "level:error",
		logs: [{ id: "log-a", message: "api failed" }],
		hasLoadedLogs: true,
	});
	const firstSessionId =
		useViewerStore.getState().viewerStateByCluster["cluster-a"]
			.activeLogSessionId;

	const secondSession = useViewerStore.getState().createLogSession("cluster-a", {
		title: "worker warnings",
		selectedNamespace: "payments",
		selectedDeployment: "worker",
		selectedPods: ["worker-456"],
		query: "level:warn",
		logs: [{ id: "log-b", message: "worker slow" }],
		hasLoadedLogs: true,
	});

	assert.equal(
		useViewerStore.getState().viewerStateByCluster["cluster-a"].query,
		"level:warn",
	);

	useViewerStore
		.getState()
		.setActiveLogSession("cluster-a", firstSessionId);

	const clusterState =
		useViewerStore.getState().viewerStateByCluster["cluster-a"];

	assert.equal(clusterState.activeLogSessionId, firstSessionId);
	assert.equal(clusterState.query, "level:error");
	assert.deepEqual(clusterState.selectedPods, ["api-123"]);
	assert.deepEqual(clusterState.logSessionsById[firstSessionId].logs, [
		{ id: "log-a", message: "api failed" },
	]);
	assert.deepEqual(clusterState.logSessionsById[secondSession.id].logs, [
		{ id: "log-b", message: "worker slow" },
	]);
});

test("patchLogSession updates the targeted session without changing the active session", () => {
	const firstSessionId =
		useViewerStore.getState().getOrCreateClusterState("cluster-a")
			.activeLogSessionId;
	const secondSession = useViewerStore
		.getState()
		.createLogSession("cluster-a", { title: "background search" });

	useViewerStore
		.getState()
		.setActiveLogSession("cluster-a", firstSessionId);
	useViewerStore.getState().patchLogSession("cluster-a", secondSession.id, {
		logs: [{ id: "late-log" }],
		hasLoadedLogs: true,
	});

	const clusterState =
		useViewerStore.getState().viewerStateByCluster["cluster-a"];

	assert.equal(clusterState.activeLogSessionId, firstSessionId);
	assert.deepEqual(clusterState.logSessionsById[firstSessionId].logs, []);
	assert.deepEqual(clusterState.logSessionsById[secondSession.id].logs, [
		{ id: "late-log" },
	]);
});

test("viewer state survives app-level back navigation because store state is independent of currentView", () => {
	useViewerStore.getState().patchClusterState("cluster-a", {
		selectedNamespace: "default",
		selectedPods: ["api-123"],
		activeTabId: "pod-a-1",
		query: "level:error AND statusCode:500",
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
	assert.equal(
		useViewerStore.getState().viewerStateByCluster["cluster-a"].query,
		"level:error AND statusCode:500",
	);
});
