import assert from "node:assert/strict";
import { test } from "node:test";

import { appendLogLines, getFilteredLogLines } from "../src/logBuffer.js";

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

test("getFilteredLogLines returns the raw view without mutating it when search is empty", () => {
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
