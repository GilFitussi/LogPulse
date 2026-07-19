import assert from "node:assert/strict";
import test from "node:test";

import { evaluateKqlQuery } from "../src/lib/kqlEvaluator.js";

function createLog(overrides = {}) {
	return {
		id: overrides.id,
		message: overrides.message ?? "",
		level: overrides.level ?? "INFO",
		pod: overrides.pod ?? "api-pod-1",
		service: overrides.service ?? "api",
		details: {
			message: overrides.message ?? "",
			log: overrides.log ?? overrides.message ?? "",
			statusCode: overrides.statusCode,
			"log.level": overrides.level ?? "INFO",
			"service.name": overrides.service ?? "api",
			"kubernetes.pod.name": overrides.pod ?? "api-pod-1",
			...overrides.details,
		},
	};
}

const logs = [
	createLog({
		id: "one",
		message: "Connection failed for billing API",
		level: "ERROR",
		pod: "api-pod-123",
		service: "billing",
		statusCode: 500,
	}),
	createLog({
		id: "two",
		message: "connection restored",
		level: "INFO",
		pod: "api-pod-456",
		service: "billing",
		statusCode: "200",
	}),
	createLog({
		id: "three",
		message: "Cache warning threshold exceeded",
		level: "WARN",
		pod: "cache-pod-1",
		service: "cache",
		statusCode: 503,
	}),
];

function matchingIds(query, dataset = logs) {
	return evaluateKqlQuery(dataset, query).logs.map((log) => log.id);
}

test("evaluateKqlQuery returns all logs for an empty query", () => {
	assert.deepEqual(matchingIds("   "), ["one", "two", "three"]);
});

test("evaluateKqlQuery matches free text against the main log text", () => {
	assert.deepEqual(matchingIds("connection failed"), ["one"]);
});

test("evaluateKqlQuery returns no logs when nothing matches", () => {
	assert.deepEqual(matchingIds("not-present"), []);
});

test("evaluateKqlQuery matches strings case-insensitively", () => {
	assert.deepEqual(matchingIds("CONNECTION FAILED"), ["one"]);
	assert.deepEqual(matchingIds("level:error"), ["one"]);
});

test("evaluateKqlQuery matches normalized field values", () => {
	assert.deepEqual(matchingIds('message:"connection restored"'), ["two"]);
	assert.deepEqual(matchingIds("podName:api-pod-123"), ["one"]);
});

test("evaluateKqlQuery matches numeric statusCode as number or string", () => {
	assert.deepEqual(matchingIds("statusCode:500"), ["one"]);
	assert.deepEqual(matchingIds("statusCode = 500"), ["one"]);
	assert.deepEqual(matchingIds("statusCode:200"), ["two"]);
});

test("evaluateKqlQuery treats missing fields as non-matches", () => {
	assert.deepEqual(matchingIds("traceId:abc123"), []);
});

test("evaluateKqlQuery supports AND expressions", () => {
	assert.deepEqual(matchingIds("level:error AND statusCode:500"), ["one"]);
	assert.deepEqual(matchingIds("level:error AND statusCode:200"), []);
});

test("evaluateKqlQuery supports OR expressions", () => {
	assert.deepEqual(matchingIds("level:error OR level:warn"), ["one", "three"]);
});

test("evaluateKqlQuery supports NOT expressions", () => {
	assert.deepEqual(matchingIds("NOT level:info"), ["one", "three"]);
});

test("evaluateKqlQuery preserves grouped expression precedence", () => {
	assert.deepEqual(
		matchingIds("(level:error OR level:warn) AND service.name:cache"),
		["three"],
	);
});

test("evaluateKqlQuery preserves result ordering and record references", () => {
	const result = evaluateKqlQuery(logs, "statusCode:500 OR statusCode:503");

	assert.deepEqual(
		result.logs.map((log) => log.id),
		["one", "three"],
	);
	assert.equal(result.logs[0], logs[0]);
	assert.equal(result.logs[1], logs[2]);
});

test("evaluateKqlQuery does not mutate the original dataset", () => {
	const dataset = [
		createLog({ id: "before", message: "before", statusCode: 200 }),
		createLog({ id: "after", message: "after", statusCode: 500 }),
	];
	const snapshot = structuredClone(dataset);

	evaluateKqlQuery(dataset, "statusCode:500");

	assert.deepEqual(dataset, snapshot);
});

test("evaluateKqlQuery returns parse errors without throwing", () => {
	const result = evaluateKqlQuery(logs, "level:error AND OR level:warn");

	assert.equal(result.ok, false);
	assert.deepEqual(result.logs, []);
	assert.equal(result.error.code, "UNEXPECTED_TOKEN");
});

