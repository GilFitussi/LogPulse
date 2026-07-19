import assert from "node:assert/strict";
import test from "node:test";

import {
	fetchClusterDeployments,
	filterDeploymentsBySearch,
	getDeploymentsApiErrorMessage,
	parseDeploymentsResponse,
} from "../src/lib/deployments.js";

test("parseDeploymentsResponse rejects unexpected payloads", () => {
	assert.throws(
		() => parseDeploymentsResponse({ deploymentList: [] }),
		/Unexpected deployments response from backend/,
	);
});

test("parseDeploymentsResponse trims valid deployment names and ignores invalid rows", () => {
	assert.deepEqual(
		parseDeploymentsResponse({
			deployments: [" api ", { name: " worker " }, { name: "" }, null],
		}),
		[{ name: "api" }, { name: "worker" }],
	);
});

test("filterDeploymentsBySearch returns all deployments when search is empty", () => {
	const deployments = [{ name: "api" }, { name: "worker" }];

	assert.equal(filterDeploymentsBySearch(deployments, ""), deployments);
});

test("filterDeploymentsBySearch matches deployment names case-insensitively", () => {
	const deployments = [
		{ name: "api" },
		{ name: "Billing-Worker" },
		{ name: "frontend" },
	];

	assert.deepEqual(filterDeploymentsBySearch(deployments, "  worker "), [
		{ name: "Billing-Worker" },
	]);
});

test("getDeploymentsApiErrorMessage prefers nested backend details", () => {
	assert.equal(
		getDeploymentsApiErrorMessage(
			{ details: { message: "namespace missing" } },
			"fallback",
		),
		"namespace missing",
	);
});

test("getDeploymentsApiErrorMessage normalizes forbidden deployment access errors", () => {
	assert.equal(
		getDeploymentsApiErrorMessage(
			{
				details: {
					message:
						'deployments.apps is forbidden: User "gigo1985" cannot list resource "deployments" in API group "apps" in the namespace "openshift-virtualization-os-images"',
				},
			},
			"fallback",
		),
		"You do not have access to deployments in this namespace",
	);
});

test("fetchClusterDeployments loads deployments for the selected namespace", async () => {
	const calls = [];
	const fetchImpl = async (url) => {
		calls.push(url);
		return {
			ok: true,
			json: async () => ({
				deployments: [{ name: "api" }, { name: "worker" }],
			}),
		};
	};

	const deployments = await fetchClusterDeployments(
		fetchImpl,
		9,
		"payments prod",
		"http://localhost:3000",
	);

	assert.deepEqual(deployments, [{ name: "api" }, { name: "worker" }]);
	assert.deepEqual(calls, [
		"http://localhost:3000/api/clusters/9/namespaces/payments%20prod/deployments",
	]);
});

test("fetchClusterDeployments surfaces backend errors", async () => {
	const fetchImpl = async () => ({
		ok: false,
		json: async () => ({ details: "forbidden" }),
	});

	await assert.rejects(
		() =>
			fetchClusterDeployments(
				fetchImpl,
				9,
				"payments",
				"http://localhost:3000",
			),
		/You do not have access to deployments in this namespace/,
	);
});
