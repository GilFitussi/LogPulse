import { create } from "zustand";

const DEFAULT_LOG_SESSION_TITLE = "New log session";
const DEFAULT_LOG_TIME_RANGE = "Last 5 minutes";

let nextLogSessionSequence = 1;

function createLogSessionId() {
	const sequence = nextLogSessionSequence;
	nextLogSessionSequence += 1;
	return `log-session-${sequence}`;
}

export function createDefaultLogSession(overrides = {}) {
	const id = overrides.id || "log-session-default";

	return {
		id,
		title: overrides.title || DEFAULT_LOG_SESSION_TITLE,
		selectedNamespace: overrides.selectedNamespace ?? null,
		selectedDeployment: overrides.selectedDeployment ?? null,
		selectedPods: overrides.selectedPods ? [...overrides.selectedPods] : [],
		query: String(overrides.query ?? ""),
		activeStructuredFilters: overrides.activeStructuredFilters
			? [...overrides.activeStructuredFilters]
			: [],
		pageDraft: String(overrides.pageDraft ?? "1"),
		selectedTimeRange: overrides.selectedTimeRange || DEFAULT_LOG_TIME_RANGE,
		selectedDetailTab: overrides.selectedDetailTab || "Document",
		isDetailsOpen: Boolean(overrides.isDetailsOpen),
		selectedLogId: overrides.selectedLogId ?? null,
		logs: overrides.logs ? [...overrides.logs] : [],
		isLogsLoading: Boolean(overrides.isLogsLoading),
		isPageLoading: Boolean(overrides.isPageLoading),
		logsError: overrides.logsError || "",
		hasLoadedLogs: Boolean(overrides.hasLoadedLogs),
		lastRefreshedAt: overrides.lastRefreshedAt ?? null,
		lastRefreshDurationMs: overrides.lastRefreshDurationMs ?? null,
		activeSearch: overrides.activeSearch ?? null,
		logTableScrollTop: Number(overrides.logTableScrollTop ?? 0),
		createdAt: overrides.createdAt ?? null,
		updatedAt: overrides.updatedAt ?? null,
	};
}

export function createDefaultClusterViewerState() {
	const defaultLogSession = createDefaultLogSession();

	return {
		selectedNamespace: defaultLogSession.selectedNamespace,
		selectedDeployment: defaultLogSession.selectedDeployment,
		selectedPods: defaultLogSession.selectedPods,
		selectedContainer: null,
		query: defaultLogSession.query,
		activeLogSessionId: defaultLogSession.id,
		logSessionsById: {
			[defaultLogSession.id]: defaultLogSession,
		},
		logSessionOrder: [defaultLogSession.id],
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
	const nextState =
		typeof update === "function"
			? update(normalizedCurrentState)
			: {
					...normalizedCurrentState,
					...update,
				};

	return ensureClusterLogSessionState(nextState);
}

function getActiveLogSession(clusterState) {
	return clusterState.logSessionsById[clusterState.activeLogSessionId];
}

function mirrorActiveLogSessionFields(clusterState) {
	const activeLogSession = getActiveLogSession(clusterState);

	if (!activeLogSession) {
		return clusterState;
	}

	return {
		...clusterState,
		selectedNamespace: activeLogSession.selectedNamespace,
		selectedDeployment: activeLogSession.selectedDeployment,
		selectedPods: activeLogSession.selectedPods,
		query: activeLogSession.query,
	};
}

function ensureClusterLogSessionState(clusterState) {
	const logSessionsById = clusterState.logSessionsById || {};
	const logSessionOrder = clusterState.logSessionOrder || [];
	const activeLogSessionId =
		clusterState.activeLogSessionId || logSessionOrder[0] || null;

	if (activeLogSessionId && logSessionsById[activeLogSessionId]) {
		const activeLogSession = logSessionsById[activeLogSessionId];
		const syncedActiveLogSession = {
			...activeLogSession,
			selectedNamespace: clusterState.selectedNamespace,
			selectedDeployment: clusterState.selectedDeployment,
			selectedPods: clusterState.selectedPods,
			query: clusterState.query,
		};

		return mirrorActiveLogSessionFields({
			...clusterState,
			activeLogSessionId,
			logSessionsById: {
				...logSessionsById,
				[activeLogSessionId]: syncedActiveLogSession,
			},
			logSessionOrder: logSessionOrder.length
				? logSessionOrder
				: [activeLogSessionId],
		});
	}

	const defaultLogSession = createDefaultLogSession({
		selectedNamespace: clusterState.selectedNamespace,
		selectedDeployment: clusterState.selectedDeployment,
		selectedPods: clusterState.selectedPods,
		query: clusterState.query,
	});

	return mirrorActiveLogSessionFields({
		...clusterState,
		activeLogSessionId: defaultLogSession.id,
		logSessionsById: {
			...logSessionsById,
			[defaultLogSession.id]: defaultLogSession,
		},
		logSessionOrder: [...logSessionOrder, defaultLogSession.id],
	});
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
		return get().patchActiveLogSession(clusterId, {
			selectedNamespace: namespace,
			selectedDeployment: null,
			selectedPods: [],
			activeSearch: null,
			logs: [],
			hasLoadedLogs: false,
			selectedLogId: null,
			isDetailsOpen: false,
		});
	},
	setSelectedDeployment: (clusterId, deployment) => {
		return get().patchActiveLogSession(clusterId, {
			selectedDeployment: deployment,
			selectedPods: [],
			activeSearch: null,
			logs: [],
			hasLoadedLogs: false,
			selectedLogId: null,
			isDetailsOpen: false,
		});
	},
	setSelectedPods: (clusterId, selectedPods) => {
		return get().patchActiveLogSession(clusterId, {
			selectedPods,
		});
	},
	setSelectedContainer: (clusterId, container) => {
		return get().patchClusterState(clusterId, {
			selectedContainer: container,
		});
	},
	setQuery: (clusterId, query) => {
		return get().patchActiveLogSession(clusterId, {
			query: String(query ?? ""),
		});
	},
	createLogSession: (clusterId, overrides = {}) => {
		const nextLogSession = createDefaultLogSession({
			...overrides,
			id: overrides.id || createLogSessionId(),
			createdAt: Date.now(),
			updatedAt: Date.now(),
		});

		set((state) => ({
			viewerStateByCluster: updateClusterViewerStateMap(
				state.viewerStateByCluster,
				clusterId,
				(currentClusterState) => ({
					...currentClusterState,
					selectedNamespace: nextLogSession.selectedNamespace,
					selectedDeployment: nextLogSession.selectedDeployment,
					selectedPods: nextLogSession.selectedPods,
					query: nextLogSession.query,
					activeLogSessionId: nextLogSession.id,
					logSessionsById: {
						...currentClusterState.logSessionsById,
						[nextLogSession.id]: nextLogSession,
					},
					logSessionOrder: [
						...currentClusterState.logSessionOrder,
						nextLogSession.id,
					],
				}),
			),
		}));

		return nextLogSession;
	},
	setActiveLogSession: (clusterId, logSessionId) => {
		return get().patchClusterState(clusterId, (currentClusterState) => {
			if (!currentClusterState.logSessionsById[logSessionId]) {
				return currentClusterState;
			}

			return {
				...currentClusterState,
				selectedNamespace:
					currentClusterState.logSessionsById[logSessionId]
						.selectedNamespace,
				selectedDeployment:
					currentClusterState.logSessionsById[logSessionId]
						.selectedDeployment,
				selectedPods:
					currentClusterState.logSessionsById[logSessionId].selectedPods,
				query: currentClusterState.logSessionsById[logSessionId].query,
				activeLogSessionId: logSessionId,
			};
		});
	},
	patchLogSession: (clusterId, logSessionId, update) => {
		return get().patchClusterState(clusterId, (currentClusterState) => {
			const currentLogSession =
				currentClusterState.logSessionsById[logSessionId];

			if (!currentLogSession) {
				return currentClusterState;
			}

			const nextLogSessionPatch =
				typeof update === "function" ? update(currentLogSession) : update;
			const nextLogSession = {
				...currentLogSession,
				...nextLogSessionPatch,
				updatedAt: Date.now(),
			};
			const isActiveLogSession =
				currentClusterState.activeLogSessionId === logSessionId;

			return {
				...currentClusterState,
				...(isActiveLogSession
					? {
							selectedNamespace: nextLogSession.selectedNamespace,
							selectedDeployment: nextLogSession.selectedDeployment,
							selectedPods: nextLogSession.selectedPods,
							query: nextLogSession.query,
						}
					: {}),
				logSessionsById: {
					...currentClusterState.logSessionsById,
					[logSessionId]: nextLogSession,
				},
			};
		});
	},
	patchActiveLogSession: (clusterId, update) => {
		const clusterState = get().getOrCreateClusterState(clusterId);
		return get().patchLogSession(
			clusterId,
			clusterState.activeLogSessionId,
			update,
		);
	},
	closeLogSession: (clusterId, logSessionId) => {
		return get().patchClusterState(clusterId, (currentClusterState) => {
			if (
				!currentClusterState.logSessionsById[logSessionId] ||
				currentClusterState.logSessionOrder.length <= 1
			) {
				return currentClusterState;
			}

			const nextLogSessionsById = {
				...currentClusterState.logSessionsById,
			};
			delete nextLogSessionsById[logSessionId];
			const nextLogSessionOrder = currentClusterState.logSessionOrder.filter(
				(sessionId) => sessionId !== logSessionId,
			);
			const activeLogSessionId =
				currentClusterState.activeLogSessionId === logSessionId
					? nextLogSessionOrder[0]
					: currentClusterState.activeLogSessionId;

			return {
				...currentClusterState,
				selectedNamespace:
					nextLogSessionsById[activeLogSessionId].selectedNamespace,
				selectedDeployment:
					nextLogSessionsById[activeLogSessionId].selectedDeployment,
				selectedPods: nextLogSessionsById[activeLogSessionId].selectedPods,
				query: nextLogSessionsById[activeLogSessionId].query,
				activeLogSessionId,
				logSessionsById: nextLogSessionsById,
				logSessionOrder: nextLogSessionOrder,
			};
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
