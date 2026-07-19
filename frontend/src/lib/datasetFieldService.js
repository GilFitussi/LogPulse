const DEFAULT_SAMPLE_VALUE_LIMIT = 5;
const DEFAULT_KEYWORD_MAX_LENGTH = 64;
const DEFAULT_KEYWORD_MAX_UNIQUE_VALUES = 50;

function isPlainObject(value) {
	return (
		value !== null &&
		typeof value === "object" &&
		!Array.isArray(value) &&
		!(value instanceof Date)
	);
}

function isSearchableValue(value) {
	return ["string", "number", "boolean"].includes(typeof value);
}

function normalizeSampleValue(value) {
	if (typeof value === "string") {
		return value.trim();
	}

	return String(value);
}

function isDateFieldName(fieldName) {
	return /(^|[._-])(timestamp|time|date|datetime|createdat|updatedat)$/i.test(
		fieldName,
	);
}

function isDateLikeValue(value) {
	if (typeof value !== "string" || !value.trim()) {
		return false;
	}

	const normalizedValue = value.trim();

	if (!/\d{4}[-/]\d{1,2}[-/]\d{1,2}/.test(normalizedValue)) {
		return false;
	}

	return !Number.isNaN(Date.parse(normalizedValue.replace(/,(\d{3,})/, ".$1")));
}

function addFieldValue(fieldsByName, name, value, sampleValueLimit) {
	if (!name || !isSearchableValue(value)) {
		return;
	}

	const sampleValue = normalizeSampleValue(value);

	if (!sampleValue) {
		return;
	}

	const existingField = fieldsByName.get(name) ?? {
		name,
		count: 0,
		maxLength: 0,
		sampleValues: [],
		uniqueValues: new Set(),
		valueCounts: new Map(),
	};

	existingField.count += 1;
	existingField.maxLength = Math.max(
		existingField.maxLength,
		sampleValue.length,
	);
	existingField.uniqueValues.add(sampleValue);
	existingField.valueCounts.set(
		sampleValue,
		(existingField.valueCounts.get(sampleValue) ?? 0) + 1,
	);

	if (
		existingField.sampleValues.length < sampleValueLimit &&
		!existingField.sampleValues.includes(sampleValue)
	) {
		existingField.sampleValues.push(sampleValue);
	}

	fieldsByName.set(name, existingField);
}

function flattenRecord(value, fieldsByName, options, path = "") {
	if (isSearchableValue(value)) {
		addFieldValue(fieldsByName, path, value, options.sampleValueLimit);
		return;
	}

	if (Array.isArray(value)) {
		for (const item of value) {
			flattenRecord(item, fieldsByName, options, path);
		}
		return;
	}

	if (!isPlainObject(value)) {
		return;
	}

	for (const [key, childValue] of Object.entries(value)) {
		if (!key) {
			continue;
		}

		const childPath = path ? `${path}.${key}` : key;
		flattenRecord(childValue, fieldsByName, options, childPath);
	}
}

function inferFieldType(field, options) {
	if (field.name === "message") {
		return "text";
	}

	if (
		isDateFieldName(field.name) ||
		field.sampleValues.some((value) => isDateLikeValue(value))
	) {
		return "date";
	}

	const hasRepeatedValues = field.count > field.uniqueValues.size;
	const isShort = field.maxLength <= options.keywordMaxLength;
	const hasBoundedCardinality =
		field.uniqueValues.size <= options.keywordMaxUniqueValues;

	if (hasRepeatedValues && isShort && hasBoundedCardinality) {
		return "keyword";
	}

	return "text";
}

function compareFieldValues(left, right) {
	const leftNumber = Number(left.value);
	const rightNumber = Number(right.value);
	const leftIsNumeric = left.value.trim() && !Number.isNaN(leftNumber);
	const rightIsNumeric = right.value.trim() && !Number.isNaN(rightNumber);

	if (leftIsNumeric && rightIsNumeric && leftNumber !== rightNumber) {
		return leftNumber - rightNumber;
	}

	return left.value.localeCompare(right.value, undefined, {
		numeric: true,
		sensitivity: "base",
	});
}

function createSortedValueCounts(valueCounts) {
	return Array.from(valueCounts.entries())
		.map(([value, count]) => ({ value, count }))
		.sort(compareFieldValues);
}

export class DatasetFieldService {
	static discoverFields(records, options = {}) {
		const normalizedOptions = {
			sampleValueLimit:
				options.sampleValueLimit ?? DEFAULT_SAMPLE_VALUE_LIMIT,
			keywordMaxLength:
				options.keywordMaxLength ?? DEFAULT_KEYWORD_MAX_LENGTH,
			keywordMaxUniqueValues:
				options.keywordMaxUniqueValues ?? DEFAULT_KEYWORD_MAX_UNIQUE_VALUES,
		};
		const fieldsByName = new Map();
		const dataset = Array.isArray(records) ? records : [];

		for (const record of dataset) {
			flattenRecord(record, fieldsByName, normalizedOptions);
		}

		return Array.from(fieldsByName.values())
			.map((field) => ({
				name: field.name,
				type: inferFieldType(field, normalizedOptions),
				sampleValues: field.sampleValues,
				values: createSortedValueCounts(field.valueCounts),
			}))
			.sort((left, right) => left.name.localeCompare(right.name));
	}
}
