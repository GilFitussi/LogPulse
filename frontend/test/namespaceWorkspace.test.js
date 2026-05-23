import assert from "node:assert/strict";
import { test } from "node:test";

import {
	closeNamespaceSelector,
	createNamespaceWorkspaceState,
	fetchClusterNamespaces,
	filterNamespacesBySearch,
	parseNamespacesResponse,
	selectNamespace,
} from "../src/lib/namespaceWorkspace.js";

test("fetchClusterNamespaces loads namespaces for the selected cluster", async () => {
	const requests = [];
	const fetchImpl = async (url) => {
		requests.push(url);
		return {
			ok: true,
			json: async () => ({
				namespaces: [{ name: "default" }, { name: "kube-system" }],
			}),
		};
	};

	const namespaces = await fetchClusterNamespaces(
		fetchImpl,
		42,
		"http://localhost:3000",
	);

	assert.deepEqual(requests, [
		"http://localhost:3000/api/clusters/42/namespaces",
	]);
	assert.deepEqual(namespaces, [{ name: "default" }, { name: "kube-system" }]);
});

test("fetchClusterNamespaces surfaces backend errors", async () => {
	const fetchImpl = async () => ({
		ok: false,
		json: async () => ({
			details: { message: "Cluster is not connected" },
		}),
	});

	await assert.rejects(
		() => fetchClusterNamespaces(fetchImpl, 9, "http://localhost:3000"),
		(error) => {
			assert.equal(error.message, "Cluster is not connected");
			return true;
		},
	);
});

test("parseNamespacesResponse rejects unexpected payloads", () => {
	assert.throws(
		() => parseNamespacesResponse({ namespaceList: [] }),
		/message from backend|Unexpected namespaces response from backend/i,
	);
});

test("parseNamespacesResponse trims valid namespace names and ignores invalid rows", () => {
	assert.deepEqual(
		parseNamespacesResponse({
			namespaces: [{ name: " default " }, "kube-system", { name: "" }, null],
		}),
		[{ name: "default" }, { name: "kube-system" }],
	);
});

test("filterNamespacesBySearch returns all namespaces when search is empty", () => {
	const namespaces = [{ name: "default" }, { name: "openshift" }];

	assert.equal(filterNamespacesBySearch(namespaces, ""), namespaces);
});

test("filterNamespacesBySearch matches names case-insensitively", () => {
	const namespaces = [
		{ name: "default" },
		{ name: "OpenShift-Config" },
		{ name: "payments-prod" },
	];

	assert.deepEqual(filterNamespacesBySearch(namespaces, "  openSHIFT "), [
		{ name: "OpenShift-Config" },
	]);
});

test("selectNamespace closes the dropdown and clears search text", () => {
	const initialState = createNamespaceWorkspaceState(3, {
		namespaces: [{ name: "default" }],
		searchText: "def",
		isDropdownOpen: true,
	});

	assert.deepEqual(selectNamespace(initialState, "default"), {
		clusterId: 3,
		namespaces: [{ name: "default" }],
		selectedNamespaceName: "default",
		searchText: "",
		isDropdownOpen: false,
		isLoading: false,
		error: "",
	});
});

test("closeNamespaceSelector clears search text on dropdown close", () => {
	const initialState = createNamespaceWorkspaceState(3, {
		searchText: "ops",
		isDropdownOpen: true,
		selectedNamespaceName: "openshift-config",
	});

	assert.deepEqual(closeNamespaceSelector(initialState), {
		clusterId: 3,
		namespaces: [],
		selectedNamespaceName: "openshift-config",
		searchText: "",
		isDropdownOpen: false,
		isLoading: false,
		error: "",
	});
});

test("createNamespaceWorkspaceState resets namespace state for a cluster change", () => {
	assert.deepEqual(createNamespaceWorkspaceState(8), {
		clusterId: 8,
		namespaces: [],
		selectedNamespaceName: "",
		searchText: "",
		isDropdownOpen: false,
		isLoading: false,
		error: "",
	});
});
