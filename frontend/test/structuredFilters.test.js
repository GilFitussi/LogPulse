import assert from "node:assert/strict";
import test from "node:test";

import { evaluateKqlQuery } from "../src/lib/kqlEvaluator.js";
import {
	addStructuredFilter,
	applyStructuredFilters,
	createStructuredFilter,
	reconcileStructuredFilters,
	removeStructuredFilter,
} from "../src/lib/structuredFilters.js";

function createLog(overrides = {}) {
	return {
		id: overrides.id,
		message: overrides.message ?? "",
		level: overrides.level ?? "INFO",
		pod: overrides.pod ?? "api-pod-1",
		service: overrides.service ?? "api",
		details: {
			message: overrides.message ?? "",
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
		message: "connection failed",
		level: "ERROR",
		statusCode: 500,
		pod: "api-pod-1",
	}),
	createLog({
		id: "two",
		message: "connection failed",
		level: "INFO",
		statusCode: 200,
		pod: "api-pod-2",
	}),
	createLog({
		id: "three",
		message: "cache warmed",
		level: "ERROR",
		statusCode: "500",
		pod: "cache-pod-1",
	}),
];

function matchingIds(dataset, filters) {
	return applyStructuredFilters(dataset, filters).map((log) => log.id);
}

test("createStructuredFilter normalizes valid equality filters", () => {
	assert.deepEqual(createStructuredFilter(" level ", " error "), {
		id: "level=error",
		field: "level",
		operator: "equals",
		value: "error",
	});
	assert.equal(createStructuredFilter("", "error"), null);
	assert.equal(createStructuredFilter("level", " "), null);
});

test("addStructuredFilter prevents exact duplicate filters", () => {
	const filter = createStructuredFilter("level", "error");
	const filters = addStructuredFilter([], filter);

	assert.equal(addStructuredFilter(filters, filter), filters);
	assert.deepEqual(filters, [filter]);
});

test("removeStructuredFilter removes one active filter", () => {
	const levelFilter = createStructuredFilter("level", "error");
	const statusFilter = createStructuredFilter("statusCode", "500");

	assert.deepEqual(
		removeStructuredFilter([levelFilter, statusFilter], levelFilter.id),
		[statusFilter],
	);
});

test("applyStructuredFilters supports one equality filter", () => {
	assert.deepEqual(matchingIds(logs, [createStructuredFilter("level", "error")]), [
		"one",
		"three",
	]);
});

test("applyStructuredFilters supports multiple equality filters", () => {
	const filters = [
		createStructuredFilter("level", "error"),
		createStructuredFilter("statusCode", "500"),
	];

	assert.deepEqual(matchingIds(logs, filters), ["one", "three"]);
});

test("applyStructuredFilters combines with KQL-filtered logs", () => {
	const queryResult = evaluateKqlQuery(logs, "message:connection");
	const filters = [createStructuredFilter("level", "error")];

	assert.deepEqual(matchingIds(queryResult.logs, filters), ["one"]);
});

test("reconcileStructuredFilters removes filters missing after dataset refresh", () => {
	const filters = [
		createStructuredFilter("level", "error"),
		createStructuredFilter("statusCode", "500"),
	];
	const fields = [
		{
			name: "level",
			values: [{ value: "error", count: 1 }],
		},
		{
			name: "statusCode",
			values: [{ value: "200", count: 1 }],
		},
	];

	assert.deepEqual(reconcileStructuredFilters(filters, fields), [filters[0]]);
});
