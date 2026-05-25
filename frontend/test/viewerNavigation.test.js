import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";

import {
	APP_VIEWS,
	backToWorkspaces,
	canOpenViewer,
	getOpenViewerActionState,
	openViewer,
} from "../src/lib/viewerNavigation.js";

function createCluster(overrides = {}) {
	return {
		id: 1,
		name: "prod-east",
		apiUrl: "https://api.example.com:6443",
		lastConnectionStatus: "connected",
		...overrides,
	};
}

test("viewer opens only when a selected cluster is connected", () => {
	assert.equal(canOpenViewer(null), false);
	assert.equal(canOpenViewer(createCluster()), true);
	assert.equal(
		canOpenViewer(createCluster({ lastConnectionStatus: "logged out" })),
		false,
	);
	assert.equal(
		canOpenViewer(createCluster({ lastConnectionStatus: "offline" })),
		false,
	);
});

test("viewer does not require namespace before opening", () => {
	const clusterWithoutNamespace = createCluster({ defaultNamespace: null });

	assert.equal(canOpenViewer(clusterWithoutNamespace), true);
	assert.equal(
		openViewer(APP_VIEWS.WORKSPACES, clusterWithoutNamespace),
		APP_VIEWS.VIEWER,
	);
});

test("openViewer preserves the current view when gating rules fail", () => {
	assert.equal(openViewer(APP_VIEWS.WORKSPACES, null), APP_VIEWS.WORKSPACES);
	assert.equal(
		openViewer(
			APP_VIEWS.WORKSPACES,
			createCluster({ lastConnectionStatus: "logged out" }),
		),
		APP_VIEWS.WORKSPACES,
	);
});

test("backToWorkspaces returns the workspaces view", () => {
	assert.equal(backToWorkspaces(), APP_VIEWS.WORKSPACES);
});

test("open viewer action state exposes disabled reasons for the workspaces primary action", () => {
	assert.deepEqual(getOpenViewerActionState(null), {
		disabled: true,
		reason: "Select a cluster to open the Log Viewer.",
	});
	assert.deepEqual(
		getOpenViewerActionState(
			createCluster({ lastConnectionStatus: "logged out" }),
		),
		{
			disabled: true,
			reason: "Connect the selected cluster before opening the Log Viewer.",
		},
	);
	assert.deepEqual(getOpenViewerActionState(createCluster()), {
		disabled: false,
		reason: "Open the dedicated Log Viewer for this cluster.",
	});
});

test("Workspaces screen no longer owns selectedNamespace or the legacy namespace workspace component", () => {
	const appSource = fs.readFileSync(path.resolve("src", "App.jsx"), "utf8");
	const workspacesScreenSource = fs.readFileSync(
		path.resolve("src", "components", "workspaces-screen.jsx"),
		"utf8",
	);

	assert.doesNotMatch(appSource, /ClusterNamespaceWorkspace/);
	assert.doesNotMatch(workspacesScreenSource, /selectedNamespace/);
});

test("top toolbar exposes product navigation tabs for Workspaces and Log Viewer", () => {
	const toolbarSource = fs.readFileSync(
		path.resolve("src", "components", "layout", "top-toolbar.jsx"),
		"utf8",
	);

	assert.match(toolbarSource, /Product navigation/);
	assert.match(toolbarSource, /Workspaces/);
	assert.match(toolbarSource, /Log Viewer/);
});
