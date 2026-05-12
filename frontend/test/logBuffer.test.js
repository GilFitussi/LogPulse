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

test("getFilteredLogLines returns the raw view without mutating it", () => {
	const rawLogLines = ["one", "two"];

	assert.equal(getFilteredLogLines(rawLogLines), rawLogLines);
});
