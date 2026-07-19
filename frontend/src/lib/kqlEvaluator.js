import { parseKqlQuery } from "./kqlParser.js";

function normalizeComparableValue(value) {
	return String(value ?? "").toLowerCase();
}

function normalizeFieldName(fieldName) {
	return String(fieldName || "").trim().toLowerCase();
}

function isSearchableValue(value) {
	return ["string", "number", "boolean"].includes(typeof value);
}

function valueContains(value, query) {
	return normalizeComparableValue(value).includes(normalizeComparableValue(query));
}

function isNumericLike(value) {
	return (
		typeof value === "number" ||
		(typeof value === "string" && value.trim() && !Number.isNaN(Number(value)))
	);
}

function fieldValueMatches(value, query) {
	if (isNumericLike(value) && isNumericLike(query)) {
		return Number(value) === Number(query);
	}

	return valueContains(value, query);
}

function getSearchableTextValues(log) {
	const values = [
		log?.message,
		log?.details?.message,
		log?.details?.log,
		log?.rawLine,
	];

	return values.filter(isSearchableValue);
}

function addFlattenedFields(value, fieldsByName, path = "") {
	if (isSearchableValue(value)) {
		if (path) {
			const normalizedPath = normalizeFieldName(path);
			const existingValues = fieldsByName.get(normalizedPath) ?? [];
			existingValues.push(value);
			fieldsByName.set(normalizedPath, existingValues);
		}
		return;
	}

	if (Array.isArray(value)) {
		for (const item of value) {
			addFlattenedFields(item, fieldsByName, path);
		}
		return;
	}

	if (!value || typeof value !== "object" || value instanceof Date) {
		return;
	}

	for (const [key, childValue] of Object.entries(value)) {
		if (!key) {
			continue;
		}

		addFlattenedFields(
			childValue,
			fieldsByName,
			path ? `${path}.${key}` : key,
		);
	}
}

function createFieldMap(log) {
	const fieldsByName = new Map();

	addFlattenedFields(log, fieldsByName);
	addFlattenedFields(log?.details, fieldsByName);

	if (log?.pod !== undefined) {
		fieldsByName.set("podname", [log.pod]);
	}

	if (log?.details?.["kubernetes.pod.name"] !== undefined) {
		fieldsByName.set("podname", [log.details["kubernetes.pod.name"]]);
	}

	return fieldsByName;
}

function getFieldMap(log, fieldMapCache) {
	if (!log || typeof log !== "object") {
		return createFieldMap(log);
	}

	const existingFieldMap = fieldMapCache.get(log);

	if (existingFieldMap) {
		return existingFieldMap;
	}

	const fieldMap = createFieldMap(log);
	fieldMapCache.set(log, fieldMap);
	return fieldMap;
}

function evaluateAst(ast, log, fieldMapCache) {
	switch (ast?.type) {
		case "match_all":
			return true;
		case "text":
			return getSearchableTextValues(log).some((value) =>
				valueContains(value, ast.value),
			);
		case "field": {
			const fieldValues = getFieldMap(log, fieldMapCache).get(ast.field) ?? [];
			return fieldValues.some((value) => fieldValueMatches(value, ast.value));
		}
		case "not":
			return !evaluateAst(ast.expression, log, fieldMapCache);
		case "and":
			return (
				evaluateAst(ast.left, log, fieldMapCache) &&
				evaluateAst(ast.right, log, fieldMapCache)
			);
		case "or":
			return (
				evaluateAst(ast.left, log, fieldMapCache) ||
				evaluateAst(ast.right, log, fieldMapCache)
			);
		default:
			return false;
	}
}

export function evaluateKqlQuery(logs, query) {
	const dataset = Array.isArray(logs) ? logs : [];
	const parseResult = parseKqlQuery(query);

	if (!parseResult.ok) {
		return {
			ok: false,
			logs: [],
			error: parseResult.error,
		};
	}

	const fieldMapCache = new WeakMap();

	return {
		ok: true,
		logs: dataset.filter((log) =>
			evaluateAst(parseResult.ast, log, fieldMapCache),
		),
		error: null,
	};
}
