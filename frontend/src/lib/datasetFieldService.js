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
		return value;
	}

	return String(value);
}

function addFieldValue(fieldsByName, name, value, sampleValueLimit) {
	if (!name || !isSearchableValue(value)) {
		return;
	}

	const sampleValue = normalizeSampleValue(value);
	const existingField = fieldsByName.get(name) ?? {
		name,
		count: 0,
		maxLength: 0,
		sampleValues: [],
		uniqueValues: new Set(),
	};

	existingField.count += 1;
	existingField.maxLength = Math.max(
		existingField.maxLength,
		sampleValue.length,
	);
	existingField.uniqueValues.add(sampleValue);

	if (
		sampleValue &&
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

	const hasRepeatedValues = field.count > field.uniqueValues.size;
	const isShort = field.maxLength <= options.keywordMaxLength;
	const hasBoundedCardinality =
		field.uniqueValues.size <= options.keywordMaxUniqueValues;

	if (hasRepeatedValues && isShort && hasBoundedCardinality) {
		return "keyword";
	}

	return "text";
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
			}))
			.sort((left, right) => left.name.localeCompare(right.name));
	}
}
