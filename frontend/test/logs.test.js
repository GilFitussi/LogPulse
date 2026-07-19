import assert from "node:assert/strict";
import test from "node:test";

import {
	combinePodLogDatasets,
	createLogRecord,
	createPodLogSearch,
	fetchPodLogSearchResults,
	fetchPodLogs,
	getPodLogsApiErrorMessage,
	parseLogTimestamp,
	parsePodLogSearchResponse,
	parsePodLogsDataset,
	parsePodLogsResponse,
	trimLogDataset,
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

test("trimLogDataset keeps the newest loaded records within a safe maximum", () => {
	const records = [
		{ id: "newest" },
		{ id: "middle" },
		{ id: "oldest" },
	];

	assert.deepEqual(trimLogDataset(records, 2), {
		logs: records.slice(0, 2),
		trimmedCount: 1,
		isTrimmed: true,
	});
});

test("trimLogDataset leaves datasets under the limit unchanged", () => {
	const records = [{ id: "one" }, { id: "two" }];

	assert.deepEqual(trimLogDataset(records, 5), {
		logs: records,
		trimmedCount: 0,
		isTrimmed: false,
	});
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

test("parsePodLogSearchResponse normalizes paged search results", () => {
	const response = parsePodLogSearchResponse(
		{
			searchSessionId: "session-1",
			namespace: "prod",
			podNames: ["api-123"],
			offset: 500,
			limit: 500,
			totalCount: 1200,
			hasMore: true,
			nextOffset: 1000,
			logs: [
				{
					id: "entry-1",
					podName: "api-123",
					namespace: "prod",
					timestamp: "2026-06-04T10:30:00.000Z",
					level: "error",
					message: "Billing API timeout",
					rawLine:
						'2026-06-04T10:30:00.000Z {"level":"error","message":"Billing API timeout"}',
				},
			],
		},
		{ clusterId: 1, deployment: "payments" },
	);

	assert.equal(response.searchSessionId, "session-1");
	assert.equal(response.totalCount, 1200);
	assert.equal(response.nextOffset, 1000);
	assert.equal(response.logs.length, 1);
	assert.equal(response.logs[0].id, "entry-1");
	assert.equal(response.logs[0].level, "ERROR");
	assert.equal(response.logs[0].service, "payments");
	assert.equal(response.logs[0].details["kubernetes.namespace_name"], "prod");
});

test("parsePodLogSearchResponse preserves structured JSON fields from raw lines", () => {
	const response = parsePodLogSearchResponse(
		{
			searchSessionId: "session-1",
			namespace: "prod",
			podNames: ["api-123"],
			offset: 0,
			limit: 500,
			totalCount: 1,
			hasMore: false,
			nextOffset: null,
			logs: [
				{
					id: "entry-1",
					podName: "api-123",
					namespace: "prod",
					timestamp: "2026-06-04T10:30:00.000Z",
					level: "error",
					message: "failed",
					rawLine:
						'2026-06-04T10:30:00.000Z {"message":"failed","statusCode":500,"container":"api"}',
				},
			],
		},
		{ clusterId: 1, deployment: "payments" },
	);

	assert.equal(response.logs[0].details.statusCode, 500);
	assert.equal(response.logs[0].details.container, "api");
});

test("createPodLogSearch posts the initial search and returns the first batch", async () => {
	const calls = [];
	const fetchImpl = async (url, options) => {
		calls.push({ url, options });
		return {
			ok: true,
			json: async () => ({
				searchSessionId: "session-1",
				namespace: "payments prod",
				podNames: ["api-123", "api-456"],
				offset: 0,
				limit: 500,
				totalCount: 1200,
				hasMore: true,
				nextOffset: 500,
				logs: [
					{
						id: "entry-1",
						podName: "api-123",
						namespace: "payments prod",
						timestamp: "2026-06-04T10:30:00.000Z",
						level: "info",
						message: "started",
						rawLine: "2026-06-04T10:30:00.000Z started",
					},
				],
			}),
		};
	};

	const result = await createPodLogSearch(
		fetchImpl,
		9,
		"payments prod",
		"http://localhost:3000",
		{
			podNames: ["api-123", "api-456"],
			sinceSeconds: 900,
			limit: 500,
			deployment: "payments-api",
		},
	);

	assert.equal(result.searchSessionId, "session-1");
	assert.equal(result.logs.length, 1);
	assert.equal(result.logs[0].service, "payments-api");
	assert.deepEqual(calls, [
		{
			url: "http://localhost:3000/api/clusters/9/namespaces/payments%20prod/log-searches",
			options: {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					podNames: ["api-123", "api-456"],
					sinceSeconds: 900,
					limit: 500,
					deployment: "payments-api",
				}),
			},
		},
	]);
});

test("fetchPodLogSearchResults loads the next batch from the same search session", async () => {
	const calls = [];
	const fetchImpl = async (url) => {
		calls.push(url);
		return {
			ok: true,
			json: async () => ({
				searchSessionId: "session-1",
				namespace: "payments",
				podNames: ["api-123"],
				offset: 500,
				limit: 500,
				totalCount: 1200,
				hasMore: true,
				nextOffset: 1000,
				logs: [
					{
						id: "entry-501",
						podName: "api-123",
						namespace: "payments",
						timestamp: "2026-06-04T10:29:00.000Z",
						message: "next batch line",
						rawLine: "2026-06-04T10:29:00.000Z next batch line",
					},
				],
			}),
		};
	};

	const result = await fetchPodLogSearchResults(
		fetchImpl,
		9,
		"session-1",
		"http://localhost:3000",
		{ offset: 500, limit: 500, deployment: "payments-api" },
	);

	assert.equal(result.offset, 500);
	assert.equal(result.logs[0].message, "next batch line");
	assert.deepEqual(calls, [
		"http://localhost:3000/api/clusters/9/log-searches/session-1?offset=500&limit=500",
	]);
});
