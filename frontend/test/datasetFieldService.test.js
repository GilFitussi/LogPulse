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
	assert.deepEqual(
		fields.find((field) => field.name === "http.response.status_code").values,
		[{ value: "500", count: 2 }],
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
		{
			name: "status",
			type: "text",
			sampleValues: ["one", "two"],
			values: [
				{ value: "four", count: 1 },
				{ value: "one", count: 1 },
				{ value: "three", count: 1 },
				{ value: "two", count: 1 },
			],
		},
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
		{
			name: "containers.name",
			type: "text",
			sampleValues: ["api", "worker"],
			values: [
				{ value: "api", count: 1 },
				{ value: "worker", count: 1 },
			],
		},
		{
			name: "labels",
			type: "keyword",
			sampleValues: ["blue", "green"],
			values: [
				{ value: "blue", count: 2 },
				{ value: "green", count: 1 },
			],
		},
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

test("removes empty values and sorts numeric values predictably", () => {
	const fields = DatasetFieldService.discoverFields([
		{ statusCode: 500, level: "error" },
		{ statusCode: "200", level: " " },
		{ statusCode: 404, level: null },
		{ statusCode: "500", level: "error" },
		{ statusCode: "", level: "warn" },
	]);

	assert.deepEqual(fields.find((field) => field.name === "statusCode").values, [
		{ value: "200", count: 1 },
		{ value: "404", count: 1 },
		{ value: "500", count: 2 },
	]);
	assert.deepEqual(fields.find((field) => field.name === "level").values, [
		{ value: "error", count: 2 },
		{ value: "warn", count: 1 },
	]);
});
