import assert from "node:assert/strict";
import test from "node:test";

import { DatasetFieldService } from "../src/lib/datasetFieldService.js";

test("discovers and flattens all unique searchable dataset fields", () => {
	const fields = DatasetFieldService.discoverFields([
		{
			message: "payment failed",
			service: { name: "payment-service" },
			http: { response: { status_code: 500 } },
			trace: { id: "abc123" },
		},
		{
			message: "payment retried",
			service: { name: "payment-service" },
			http: { response: { status_code: 500 } },
			trace: { id: "def456" },
			kubernetes: {
				namespace_name: "prod",
				pod: { name: "payment-123" },
			},
		},
	]);

	assert.deepEqual(
		fields.map((field) => field.name),
		[
			"http.response.status_code",
			"kubernetes.namespace_name",
			"kubernetes.pod.name",
			"message",
			"service.name",
			"trace.id",
		],
	);
	assert.equal(fields.find((field) => field.name === "message").type, "text");
	assert.equal(
		fields.find((field) => field.name === "service.name").type,
		"keyword",
	);
	assert.deepEqual(
		fields.find((field) => field.name === "http.response.status_code")
			.sampleValues,
		["500"],
	);
});

test("keeps sample values limited", () => {
	const fields = DatasetFieldService.discoverFields(
		[
			{ status: "one" },
			{ status: "two" },
			{ status: "three" },
			{ status: "four" },
		],
		{ sampleValueLimit: 2 },
	);

	assert.deepEqual(fields, [
		{ name: "status", type: "text", sampleValues: ["one", "two"] },
	]);
});

test("discovers searchable values inside arrays without hardcoded fields", () => {
	const fields = DatasetFieldService.discoverFields([
		{
			labels: ["blue", "blue", "green"],
			containers: [{ name: "api" }, { name: "worker" }],
		},
	]);

	assert.deepEqual(fields, [
		{ name: "containers.name", type: "text", sampleValues: ["api", "worker"] },
		{ name: "labels", type: "keyword", sampleValues: ["blue", "green"] },
	]);
});

test("classifies timestamp-like fields as date fields", () => {
	const fields = DatasetFieldService.discoverFields([
		{
			"@timestamp": "2026-07-19T12:30:00.000Z",
			createdAt: "2026-07-19T12:31:00.000Z",
			message: "started",
		},
	]);

	assert.equal(fields.find((field) => field.name === "@timestamp").type, "date");
	assert.equal(fields.find((field) => field.name === "createdAt").type, "date");
});
