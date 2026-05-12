import assert from "node:assert/strict";
import { test } from "node:test";

import {
	LOG_SEVERITIES,
	appendLogLines,
	detectLogSeverity,
	getFilteredLogLines,
} from "../src/logBuffer.js";

test("appendLogLines keeps lines under the configured limit", () => {
	assert.deepEqual(appendLogLines(["one"], ["two", "three"], 3), [
		"one",
		"two",
		"three",
	]);
});

test("appendLogLines drops oldest lines when the limit is exceeded", () => {
	assert.deepEqual(appendLogLines(["one", "two"], ["three", "four"], 3), [
		"two",
		"three",
		"four",
	]);
});

test("appendLogLines caps oversized batches to the newest lines", () => {
	assert.deepEqual(appendLogLines([], ["one", "two", "three", "four"], 2), [
		"three",
		"four",
	]);
});

test("detectLogSeverity detects simple severity keywords", () => {
	assert.equal(
		detectLogSeverity("Error: failed to connect"),
		LOG_SEVERITIES.ERROR,
	);
	assert.equal(detectLogSeverity("WARN disk pressure"), LOG_SEVERITIES.WARN);
	assert.equal(detectLogSeverity("debug cache hit"), LOG_SEVERITIES.DEBUG);
	assert.equal(detectLogSeverity("service started"), LOG_SEVERITIES.INFO);
});

test("detectLogSeverity defaults to info for unmarked lines", () => {
	assert.equal(detectLogSeverity("GET /health 200"), LOG_SEVERITIES.INFO);
});

test("getFilteredLogLines returns the raw view without mutating it when filters are empty", () => {
	const rawLogLines = ["one", "two"];

	assert.equal(getFilteredLogLines(rawLogLines), rawLogLines);
});

test("getFilteredLogLines filters lines by search text without mutating raw logs", () => {
	const rawLogLines = ["GET /health 200", "Error: failed to connect"];

	assert.deepEqual(getFilteredLogLines(rawLogLines, "error"), [
		"Error: failed to connect",
	]);
	assert.deepEqual(rawLogLines, ["GET /health 200", "Error: failed to connect"]);
});

test("getFilteredLogLines ignores leading, trailing, and case differences", () => {
	const rawLogLines = ["Pod started", "pod stopped", "Container ready"];

	assert.deepEqual(getFilteredLogLines(rawLogLines, " POD "), [
		"Pod started",
		"pod stopped",
	]);
});

test("getFilteredLogLines filters by severity", () => {
	const rawLogLines = [
		"GET /health 200",
		"Error: failed to connect",
		"WARN retrying request",
		"debug cache hit",
	];

	assert.deepEqual(getFilteredLogLines(rawLogLines, "", [LOG_SEVERITIES.WARN]), [
		"WARN retrying request",
	]);
});

test("getFilteredLogLines combines search and severity filters", () => {
	const rawLogLines = [
		"Error: payment failed",
		"WARN payment latency high",
		"Error: inventory failed",
	];

	assert.deepEqual(getFilteredLogLines(rawLogLines, "payment", [
		LOG_SEVERITIES.ERROR,
	]), ["Error: payment failed"]);
});
