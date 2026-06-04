import assert from "node:assert/strict";
import test from "node:test";

import {
	combinePodLogDatasets,
	createLogRecord,
	fetchPodLogs,
	getPodLogsApiErrorMessage,
	parseLogTimestamp,
	parsePodLogsDataset,
	parsePodLogsResponse,
} from "../src/lib/logs.js";

test("parsePodLogsResponse rejects unexpected payloads", () => {
	assert.throws(
		() => parsePodLogsResponse({ entries: [] }),
		/Unexpected pod logs response from backend/,
	);
});

test("getPodLogsApiErrorMessage prefers nested backend details", () => {
	assert.equal(
		getPodLogsApiErrorMessage(
			{ details: { message: "pod not found" } },
			"fallback",
		),
		"pod not found",
	);
});

test("createLogRecord preserves pod metadata and extracts common fields", () => {
	const record = createLogRecord(
		JSON.stringify({
			"@timestamp": "2026-06-04T10:30:00.000Z",
			level: "error",
			message: "Billing API timeout",
			service: { name: "payments" },
		}),
		{
			clusterId: 1,
			namespace: "prod",
			deployment: "api",
			podName: "api-123",
		},
		0,
	);

	assert.equal(record.level, "ERROR");
	assert.equal(record.message, "Billing API timeout");
	assert.equal(record.service, "payments");
	assert.equal(record.pod, "api-123");
	assert.equal(record.details["kubernetes.namespace_name"], "prod");
	assert.equal(record.details["kubernetes.deployment.name"], "api");
	assert.equal(record.details["kubernetes.pod.name"], "api-123");
	assert.equal(record.details["@timestamp"], "2026-06-04T10:30:00.000Z");
});

test("parsePodLogsDataset ignores blank lines and keeps plain text log messages", () => {
	const dataset = parsePodLogsDataset(
		"2026-06-04T10:30:00Z ERROR failed\n\nworker started\n",
		{
			clusterId: 1,
			namespace: "prod",
			deployment: "worker",
			podName: "worker-456",
		},
	);

	assert.equal(dataset.length, 2);
	assert.equal(dataset[0].message, "2026-06-04T10:30:00Z ERROR failed");
	assert.equal(dataset[0].level, "ERROR");
	assert.equal(dataset[1].message, "worker started");
	assert.equal(dataset[1].pod, "worker-456");
});

test("parseLogTimestamp supports comma millisecond timestamps", () => {
	assert.equal(
		parseLogTimestamp("2026-06-04T10:30:00,123Z"),
		Date.parse("2026-06-04T10:30:00.123Z"),
	);
});

test("combinePodLogDatasets sorts newer timestamped records first", () => {
	const combined = combinePodLogDatasets([
		parsePodLogsDataset(
			[
				'{"@timestamp":"2026-06-04T10:29:00.000Z","message":"older"}',
				'{"@timestamp":"2026-06-04T10:30:00,123Z","message":"newest"}',
			].join("\n"),
			{
				clusterId: 1,
				namespace: "prod",
				deployment: "api",
				podName: "api-123",
			},
		),
		parsePodLogsDataset(
			'{"@timestamp":"2026-06-04T10:30:00.000Z","message":"middle"}',
			{
				clusterId: 1,
				namespace: "prod",
				deployment: "api",
				podName: "api-456",
			},
		),
	]);

	assert.deepEqual(
		combined.map((entry) => entry.message),
		["newest", "middle", "older"],
	);
});

test("fetchPodLogs loads logs for the selected pod", async () => {
	const calls = [];
	const fetchImpl = async (url) => {
		calls.push(url);
		return {
			ok: true,
			json: async () => ({ logs: "line 1\nline 2\n" }),
		};
	};

	const logs = await fetchPodLogs(
		fetchImpl,
		9,
		"payments prod",
		"api server-123",
		"http://localhost:3000",
		{ sinceSeconds: 900 },
	);

	assert.equal(logs, "line 1\nline 2\n");
	assert.deepEqual(calls, [
		"http://localhost:3000/api/clusters/9/namespaces/payments%20prod/pods/api%20server-123/logs?sinceSeconds=900",
	]);
});

test("fetchPodLogs surfaces backend errors", async () => {
	const fetchImpl = async () => ({
		ok: false,
		json: async () => ({ details: "Access denied" }),
	});

	await assert.rejects(
		() =>
			fetchPodLogs(
				fetchImpl,
				9,
				"payments",
				"api-123",
				"http://localhost:3000",
			),
		/Access denied/,
	);
});
