import assert from "node:assert/strict";
import test from "node:test";

import {
	fetchDeploymentPods,
	getPodsApiErrorMessage,
	parsePodsResponse,
} from "../src/lib/pods.js";

test("parsePodsResponse rejects unexpected payloads", () => {
	assert.throws(
		() => parsePodsResponse({ podList: [] }),
		/Unexpected pods response from backend/,
	);
});

test("parsePodsResponse trims valid pod names and ignores invalid rows", () => {
	assert.deepEqual(
		parsePodsResponse({
			pods: [" api-123 ", { name: " worker-456 " }, { name: "" }, null],
		}),
		[{ name: "api-123" }, { name: "worker-456" }],
	);
});

test("getPodsApiErrorMessage prefers nested backend details", () => {
	assert.equal(
		getPodsApiErrorMessage(
			{ details: { message: "deployment missing" } },
			"fallback",
		),
		"deployment missing",
	);
});

test("getPodsApiErrorMessage normalizes forbidden pod access errors", () => {
	assert.equal(
		getPodsApiErrorMessage(
			{
				details: {
					message:
						'pods is forbidden: User "gigo1985" cannot list resource "pods" in API group "" in the namespace "payments"',
				},
			},
			"fallback",
		),
		"You do not have access to pods in this deployment",
	);
});

test("fetchDeploymentPods loads pods for the selected deployment", async () => {
	const calls = [];
	const fetchImpl = async (url) => {
		calls.push(url);
		return {
			ok: true,
			json: async () => ({
				pods: [{ name: "api-123" }, { name: "api-456" }],
			}),
		};
	};

	const pods = await fetchDeploymentPods(
		fetchImpl,
		9,
		"payments prod",
		"api server",
		"http://localhost:3000",
	);

	assert.deepEqual(pods, [{ name: "api-123" }, { name: "api-456" }]);
	assert.deepEqual(calls, [
		"http://localhost:3000/api/clusters/9/namespaces/payments%20prod/deployments/api%20server/pods",
	]);
});

test("fetchDeploymentPods surfaces backend errors", async () => {
	const fetchImpl = async () => ({
		ok: false,
		json: async () => ({ details: "forbidden" }),
	});

	await assert.rejects(
		() =>
			fetchDeploymentPods(
				fetchImpl,
				9,
				"payments",
				"api",
				"http://localhost:3000",
			),
		/You do not have access to pods in this deployment/,
	);
});
