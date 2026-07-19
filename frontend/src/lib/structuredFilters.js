function normalizeComparableValue(value) {
	return String(value ?? "").trim().toLowerCase();
}

function normalizeFieldName(fieldName) {
	return String(fieldName || "").trim().toLowerCase();
}

function isSearchableValue(value) {
	return ["string", "number", "boolean"].includes(typeof value);
}

function isNumericLike(value) {
	return (
		typeof value === "number" ||
		(typeof value === "string" && value.trim() && !Number.isNaN(Number(value)))
	);
}

function normalizeFilterValue(value) {
	return String(value ?? "").trim();
}

function addFieldValue(fieldsByName, fieldName, value) {
	if (!fieldName || !isSearchableValue(value)) {
		return;
	}

	const normalizedValue = normalizeFilterValue(value);

	if (!normalizedValue) {
		return;
	}

	const normalizedFieldName = normalizeFieldName(fieldName);
	const existingValues = fieldsByName.get(normalizedFieldName) ?? [];
	existingValues.push(value);
	fieldsByName.set(normalizedFieldName, existingValues);
}

function addFlattenedFields(value, fieldsByName, path = "") {
	if (isSearchableValue(value)) {
		addFieldValue(fieldsByName, path, value);
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
		addFieldValue(fieldsByName, "podName", log.pod);
	}

	if (log?.details?.["kubernetes.pod.name"] !== undefined) {
		addFieldValue(fieldsByName, "podName", log.details["kubernetes.pod.name"]);
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

function fieldValueEquals(leftValue, rightValue) {
	if (isNumericLike(leftValue) && isNumericLike(rightValue)) {
		return Number(leftValue) === Number(rightValue);
	}

	return normalizeComparableValue(leftValue) === normalizeComparableValue(rightValue);
}

export function createStructuredFilter(field, value) {
	const normalizedField = String(field || "").trim();
	const normalizedValue = normalizeFilterValue(value);

	if (!normalizedField || !normalizedValue) {
		return null;
	}

	return {
		id: `${normalizeFieldName(normalizedField)}=${normalizeComparableValue(normalizedValue)}`,
		field: normalizedField,
		operator: "equals",
		value: normalizedValue,
	};
}

export function addStructuredFilter(filters, nextFilter) {
	const currentFilters = Array.isArray(filters) ? filters : [];

	if (!nextFilter) {
		return currentFilters;
	}

	if (currentFilters.some((filter) => filter.id === nextFilter.id)) {
		return currentFilters;
	}

	return [...currentFilters, nextFilter];
}

export function removeStructuredFilter(filters, filterId) {
	return (Array.isArray(filters) ? filters : []).filter(
		(filter) => filter.id !== filterId,
	);
}

export function logMatchesStructuredFilter(log, filter, fieldMapCache) {
	if (!filter?.field || filter.operator !== "equals") {
		return true;
	}

	const fieldValues =
		getFieldMap(log, fieldMapCache).get(normalizeFieldName(filter.field)) ?? [];

	return fieldValues.some((value) => fieldValueEquals(value, filter.value));
}

export function applyStructuredFilters(logs, filters) {
	const dataset = Array.isArray(logs) ? logs : [];
	const activeFilters = Array.isArray(filters) ? filters : [];

	if (activeFilters.length === 0) {
		return dataset;
	}

	const fieldMapCache = new WeakMap();

	return dataset.filter((log) =>
		activeFilters.every((filter) =>
			logMatchesStructuredFilter(log, filter, fieldMapCache),
		),
	);
}

export function reconcileStructuredFilters(filters, fields) {
	const fieldValueLookup = new Map(
		(Array.isArray(fields) ? fields : []).map((field) => [
			normalizeFieldName(field.name),
			new Set(
				(field.values ?? []).map((entry) =>
					normalizeComparableValue(entry.value),
				),
			),
		]),
	);

	return (Array.isArray(filters) ? filters : []).filter((filter) => {
		const values = fieldValueLookup.get(normalizeFieldName(filter.field));
		return values?.has(normalizeComparableValue(filter.value));
	});
}
