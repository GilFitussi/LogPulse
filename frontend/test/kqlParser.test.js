import assert from "node:assert/strict";
import test from "node:test";

import { parseKqlQuery } from "../src/lib/kqlParser.js";

test("parseKqlQuery returns match-all AST for empty query", () => {
	assert.deepEqual(parseKqlQuery("   "), {
		ok: true,
		ast: { type: "match_all" },
		error: null,
	});
});

test("parseKqlQuery parses free-text queries as a single text expression", () => {
	assert.deepEqual(parseKqlQuery("connection failed").ast, {
		type: "text",
		value: "connection failed",
	});
});

test("parseKqlQuery parses simple field queries with normalized field names", () => {
	assert.deepEqual(parseKqlQuery("Level:error").ast, {
		type: "field",
		field: "level",
		value: "error",
		position: 0,
	});
});

test("parseKqlQuery parses quoted field values with spaces", () => {
	assert.deepEqual(parseKqlQuery('message:"connection failed"').ast, {
		type: "field",
		field: "message",
		value: "connection failed",
		position: 0,
	});
});

test("parseKqlQuery parses AND expressions", () => {
	assert.deepEqual(parseKqlQuery("level:error AND statusCode:500").ast, {
		type: "and",
		left: {
			type: "field",
			field: "level",
			value: "error",
			position: 0,
		},
		right: {
			type: "field",
			field: "statuscode",
			value: "500",
			position: 16,
		},
		position: 12,
	});
});

test("parseKqlQuery parses OR expressions", () => {
	assert.equal(parseKqlQuery("level:error OR level:warn").ast.type, "or");
});

test("parseKqlQuery parses NOT expressions", () => {
	assert.deepEqual(parseKqlQuery("NOT level:debug").ast, {
		type: "not",
		expression: {
			type: "field",
			field: "level",
			value: "debug",
			position: 4,
		},
		position: 0,
	});
});

test("parseKqlQuery parses grouped expressions", () => {
	const result = parseKqlQuery("(level:error OR level:warn) AND statusCode:500");

	assert.equal(result.ok, true);
	assert.equal(result.ast.type, "and");
	assert.equal(result.ast.left.type, "or");
	assert.equal(result.ast.right.field, "statuscode");
});

test("parseKqlQuery parses nested expressions", () => {
	const result = parseKqlQuery(
		'((level:error OR level:warn) AND message:"connection failed")',
	);

	assert.equal(result.ok, true);
	assert.equal(result.ast.type, "and");
	assert.equal(result.ast.left.type, "or");
	assert.equal(result.ast.right.value, "connection failed");
});

test("parseKqlQuery returns structured errors for malformed query", () => {
	const result = parseKqlQuery("level:error AND OR level:warn");

	assert.equal(result.ok, false);
	assert.equal(result.ast, null);
	assert.equal(result.error.code, "UNEXPECTED_TOKEN");
	assert.equal(typeof result.error.position, "number");
});

test("parseKqlQuery returns structured errors for missing field value", () => {
	const result = parseKqlQuery("level:");

	assert.equal(result.ok, false);
	assert.equal(result.error.code, "MISSING_VALUE");
});

test("parseKqlQuery returns structured errors for unclosed quote", () => {
	const result = parseKqlQuery('message:"connection failed');

	assert.equal(result.ok, false);
	assert.equal(result.error.code, "UNCLOSED_QUOTE");
});

test("parseKqlQuery returns structured errors for unclosed parenthesis", () => {
	const result = parseKqlQuery("(level:error OR level:warn");

	assert.equal(result.ok, false);
	assert.equal(result.error.code, "UNCLOSED_PARENTHESIS");
});

test("parseKqlQuery accepts unknown fields for structured dataset fields", () => {
	const result = parseKqlQuery("traceId:abc-123");

	assert.deepEqual(result.ast, {
		type: "field",
		field: "traceid",
		value: "abc-123",
		position: 0,
	});
});
