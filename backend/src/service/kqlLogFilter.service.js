const TOKEN_TYPES = {
	WORD: "word",
	PHRASE: "phrase",
	COLON: "colon",
	EQUAL: "equal",
	LPAREN: "lparen",
	RPAREN: "rparen",
	OPERATOR: "operator",
};

const OPERATORS = new Set(["AND", "OR", "NOT"]);

function createError(code, message, position) {
	return { code, message, position };
}

function normalizeComparableValue(value) {
	return String(value ?? "").toLowerCase();
}

function normalizeFieldName(fieldName) {
	return String(fieldName || "").trim().toLowerCase();
}

function isSearchableValue(value) {
	return ["string", "number", "boolean"].includes(typeof value);
}

function tokenize(query) {
	const source = String(query || "");
	const tokens = [];
	let cursor = 0;

	while (cursor < source.length) {
		const char = source[cursor];

		if (/\s/.test(char)) {
			cursor += 1;
			continue;
		}

		if (char === ":") {
			tokens.push({ type: TOKEN_TYPES.COLON, value: char, position: cursor });
			cursor += 1;
			continue;
		}

		if (char === "=") {
			tokens.push({ type: TOKEN_TYPES.EQUAL, value: char, position: cursor });
			cursor += 1;
			continue;
		}

		if (char === "(") {
			tokens.push({ type: TOKEN_TYPES.LPAREN, value: char, position: cursor });
			cursor += 1;
			continue;
		}

		if (char === ")") {
			tokens.push({ type: TOKEN_TYPES.RPAREN, value: char, position: cursor });
			cursor += 1;
			continue;
		}

		if (char === '"') {
			const start = cursor;
			let value = "";
			cursor += 1;

			while (cursor < source.length && source[cursor] !== '"') {
				value += source[cursor];
				cursor += 1;
			}

			if (cursor >= source.length) {
				return {
					ok: false,
					error: createError(
						"UNCLOSED_QUOTE",
						"Quoted value is missing a closing quote.",
						start,
					),
				};
			}

			tokens.push({ type: TOKEN_TYPES.PHRASE, value, position: start });
			cursor += 1;
			continue;
		}

		const start = cursor;
		let value = "";

		while (
			cursor < source.length &&
			!/\s/.test(source[cursor]) &&
			![":", "=", "(", ")", '"'].includes(source[cursor])
		) {
			value += source[cursor];
			cursor += 1;
		}

		const normalizedValue = value.toUpperCase();
		tokens.push({
			type: OPERATORS.has(normalizedValue)
				? TOKEN_TYPES.OPERATOR
				: TOKEN_TYPES.WORD,
			value: OPERATORS.has(normalizedValue) ? normalizedValue : value,
			position: start,
		});
	}

	return { ok: true, tokens };
}

function isValueToken(token) {
	return token?.type === TOKEN_TYPES.WORD || token?.type === TOKEN_TYPES.PHRASE;
}

function isFieldOperatorToken(token) {
	return token?.type === TOKEN_TYPES.COLON || token?.type === TOKEN_TYPES.EQUAL;
}

function hasSyntaxTokens(tokens) {
	return tokens.some(
		(token) =>
			token.type !== TOKEN_TYPES.WORD && token.type !== TOKEN_TYPES.PHRASE,
	);
}

function parseFreeTextQuery(tokens) {
	return {
		type: "text",
		value: tokens.map((token) => token.value).join(" ").trim(),
	};
}

class KqlParser {
	constructor(tokens) {
		this.tokens = tokens;
		this.cursor = 0;
	}

	current() {
		return this.tokens[this.cursor] ?? null;
	}

	consume() {
		const token = this.current();
		this.cursor += 1;
		return token;
	}

	matchOperator(operator) {
		const token = this.current();

		if (token?.type === TOKEN_TYPES.OPERATOR && token.value === operator) {
			this.consume();
			return true;
		}

		return false;
	}

	parse() {
		const expression = this.parseOr();

		if (!expression.ok) {
			return expression;
		}

		const token = this.current();

		if (token) {
			return {
				ok: false,
				error: createError(
					"UNEXPECTED_TOKEN",
					`Unexpected token "${token.value}".`,
					token.position,
				),
			};
		}

		return { ok: true, ast: expression.ast };
	}

	parseOr() {
		let left = this.parseAnd();

		if (!left.ok) {
			return left;
		}

		while (this.matchOperator("OR")) {
			const operatorToken = this.tokens[this.cursor - 1];
			const right = this.parseAnd();

			if (!right.ok) {
				return right;
			}

			left = {
				ok: true,
				ast: {
					type: "or",
					left: left.ast,
					right: right.ast,
					position: operatorToken.position,
				},
			};
		}

		return left;
	}

	parseAnd() {
		let left = this.parseNot();

		if (!left.ok) {
			return left;
		}

		while (this.matchOperator("AND")) {
			const operatorToken = this.tokens[this.cursor - 1];
			const right = this.parseNot();

			if (!right.ok) {
				return right;
			}

			left = {
				ok: true,
				ast: {
					type: "and",
					left: left.ast,
					right: right.ast,
					position: operatorToken.position,
				},
			};
		}

		return left;
	}

	parseNot() {
		if (this.matchOperator("NOT")) {
			const operatorToken = this.tokens[this.cursor - 1];
			const expression = this.parseNot();

			if (!expression.ok) {
				return expression;
			}

			return {
				ok: true,
				ast: {
					type: "not",
					expression: expression.ast,
					position: operatorToken.position,
				},
			};
		}

		return this.parsePrimary();
	}

	parsePrimary() {
		const token = this.current();

		if (!token) {
			return {
				ok: false,
				error: createError(
					"MISSING_EXPRESSION",
					"Expected a query expression.",
					this.tokens.at(-1)?.position ?? 0,
				),
			};
		}

		if (token.type === TOKEN_TYPES.LPAREN) {
			const openParen = this.consume();
			const expression = this.parseOr();

			if (!expression.ok) {
				return expression;
			}

			if (this.current()?.type !== TOKEN_TYPES.RPAREN) {
				return {
					ok: false,
					error: createError(
						"UNCLOSED_PARENTHESIS",
						"Grouped expression is missing a closing parenthesis.",
						openParen.position,
					),
				};
			}

			this.consume();
			return expression;
		}

		if (isValueToken(token)) {
			const valueToken = this.consume();

			if (isFieldOperatorToken(this.current())) {
				if (valueToken.type !== TOKEN_TYPES.WORD) {
					return {
						ok: false,
						error: createError(
							"INVALID_FIELD",
							"Field names must be unquoted identifiers.",
							valueToken.position,
						),
					};
				}

				this.consume();
				const fieldValue = this.current();

				if (!isValueToken(fieldValue)) {
					return {
						ok: false,
						error: createError(
							"MISSING_VALUE",
							`Field "${valueToken.value}" is missing a value.`,
							this.current()?.position ?? valueToken.position + valueToken.value.length,
						),
					};
				}

				this.consume();

				return {
					ok: true,
					ast: {
						type: "field",
						field: normalizeFieldName(valueToken.value),
						value: fieldValue.value,
						position: valueToken.position,
					},
				};
			}

			return {
				ok: true,
				ast: {
					type: "text",
					value: valueToken.value,
					position: valueToken.position,
				},
			};
		}

		return {
			ok: false,
			error: createError(
				"UNEXPECTED_TOKEN",
				`Unexpected token "${token.value}".`,
				token.position,
			),
		};
	}
}

function parseKqlQuery(query) {
	const normalizedQuery = String(query || "").trim();

	if (!normalizedQuery) {
		return { ok: true, ast: { type: "match_all" }, error: null };
	}

	const tokenResult = tokenize(normalizedQuery);

	if (!tokenResult.ok) {
		return { ok: false, ast: null, error: tokenResult.error };
	}

	if (!hasSyntaxTokens(tokenResult.tokens)) {
		return {
			ok: true,
			ast: parseFreeTextQuery(tokenResult.tokens),
			error: null,
		};
	}

	const parseResult = new KqlParser(tokenResult.tokens).parse();

	return parseResult.ok
		? { ok: true, ast: parseResult.ast, error: null }
		: { ok: false, ast: null, error: parseResult.error };
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

function fieldValueEquals(leftValue, rightValue) {
	if (isNumericLike(leftValue) && isNumericLike(rightValue)) {
		return Number(leftValue) === Number(rightValue);
	}

	return normalizeComparableValue(leftValue) === normalizeComparableValue(rightValue);
}

function tryParseJsonPayloadFromLine(rawLine) {
	const normalizedLine = String(rawLine || "");
	const jsonStartIndex = normalizedLine.indexOf("{");
	const jsonEndIndex = normalizedLine.lastIndexOf("}");

	if (jsonStartIndex === -1 || jsonEndIndex <= jsonStartIndex) {
		return null;
	}

	try {
		const parsed = JSON.parse(
			normalizedLine.slice(jsonStartIndex, jsonEndIndex + 1),
		);
		return parsed && typeof parsed === "object" ? parsed : null;
	} catch {
		return null;
	}
}

function addFieldValue(fieldsByName, fieldName, value) {
	if (!fieldName || !isSearchableValue(value)) {
		return;
	}

	const normalizedPath = normalizeFieldName(fieldName);
	const existingValues = fieldsByName.get(normalizedPath) ?? [];
	existingValues.push(value);
	fieldsByName.set(normalizedPath, existingValues);
}

function addFlattenedFields(value, fieldsByName, path = "") {
	if (isSearchableValue(value)) {
		if (path) {
			addFieldValue(fieldsByName, path, value);
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
	const jsonPayload = tryParseJsonPayloadFromLine(log?.rawLine);

	addFlattenedFields(log, fieldsByName);
	addFlattenedFields(jsonPayload, fieldsByName);

	if (log?.podName !== undefined) {
		addFieldValue(fieldsByName, "podName", log.podName);
	}

	if (log?.namespace !== undefined) {
		addFieldValue(fieldsByName, "namespace", log.namespace);
	}

	if (log?.level !== undefined) {
		addFieldValue(fieldsByName, "log.level", log.level);
	}

	return fieldsByName;
}

function getSearchableTextValues(log) {
	const jsonPayload = tryParseJsonPayloadFromLine(log?.rawLine);
	const values = [
		log?.message,
		log?.rawLine,
		jsonPayload?.message,
		jsonPayload?.log,
	];

	return values.filter(isSearchableValue);
}

function evaluateAst(ast, log, fieldMap) {
	switch (ast?.type) {
		case "match_all":
			return true;
		case "text":
			return getSearchableTextValues(log).some((value) =>
				valueContains(value, ast.value),
			);
		case "field": {
			const fieldValues = fieldMap.get(ast.field) ?? [];
			return fieldValues.some((value) => fieldValueMatches(value, ast.value));
		}
		case "not":
			return !evaluateAst(ast.expression, log, fieldMap);
		case "and":
			return (
				evaluateAst(ast.left, log, fieldMap) &&
				evaluateAst(ast.right, log, fieldMap)
			);
		case "or":
			return (
				evaluateAst(ast.left, log, fieldMap) ||
				evaluateAst(ast.right, log, fieldMap)
			);
		default:
			return false;
	}
}

function structuredFilterMatches(log, filter, fieldMap) {
	if (!filter?.field || filter.operator !== "equals") {
		return true;
	}

	const fieldValues = fieldMap.get(normalizeFieldName(filter.field)) ?? [];
	return fieldValues.some((value) => fieldValueEquals(value, filter.value));
}

function applyLogSearchFilters(logs, options = {}) {
	const dataset = Array.isArray(logs) ? logs : [];
	const parsedQuery = parseKqlQuery(options.query);

	if (!parsedQuery.ok) {
		const error = new Error(parsedQuery.error.message);
		error.code = "INVALID_KQL_QUERY";
		error.details = parsedQuery.error;
		throw error;
	}

	const structuredFilters = Array.isArray(options.filters)
		? options.filters
		: [];

	if (
		parsedQuery.ast.type === "match_all" &&
		structuredFilters.length === 0
	) {
		return dataset;
	}

	return dataset.filter((log) => {
		const fieldMap = createFieldMap(log);
		return (
			evaluateAst(parsedQuery.ast, log, fieldMap) &&
			structuredFilters.every((filter) =>
				structuredFilterMatches(log, filter, fieldMap),
			)
		);
	});
}

function normalizeFieldValue(value) {
	return typeof value === "string" ? value.trim() : String(value);
}

const HIDDEN_FIELD_NAMES = new Set([
	"@timestamp",
	"id",
	"log",
	"order",
	"parsedtimestamp",
	"rawline",
	"timestamp",
]);
const NON_FILTERABLE_FIELD_NAMES = new Set(["message"]);
const CORE_FIELD_ORDER = [
	"log.level",
	"level",
	"statusCode",
	"service.name",
	"namespace",
	"podName",
	"kubernetes.pod.name",
	"kubernetes.namespace_name",
	"kubernetes.deployment.name",
	"method",
	"path",
	"route",
	"requestId",
	"traceId",
	"spanId",
	"userId",
	"user.id",
];
const CORE_FIELD_RANK = new Map(
	CORE_FIELD_ORDER.map((fieldName, index) => [normalizeFieldName(fieldName), index]),
);
const MAX_FILTER_VALUE_LENGTH = 120;
const MAX_KQL_VALUE_LENGTH = 500;
const MAX_FILTER_UNIQUE_VALUES = 100;
const MAX_RETURNED_FIELD_VALUES = 100;

function getMaxValueLength(field) {
	return Array.from(field.values.keys()).reduce(
		(maxLength, value) => Math.max(maxLength, String(value).length),
		0,
	);
}

function classifyDiscoveredField(field) {
	const normalizedName = normalizeFieldName(field.name);
	const isHidden = HIDDEN_FIELD_NAMES.has(normalizedName);
	const uniqueValueCount = field.values.size;
	const maxValueLength = getMaxValueLength(field);
	const isCoreField = CORE_FIELD_RANK.has(normalizedName);
	const isShortEnoughForFilter = maxValueLength <= MAX_FILTER_VALUE_LENGTH;
	const isShortEnoughForKql = maxValueLength <= MAX_KQL_VALUE_LENGTH;
	const hasReasonableCardinality =
		isCoreField || uniqueValueCount <= MAX_FILTER_UNIQUE_VALUES;
	const filterable =
		!isHidden &&
		!NON_FILTERABLE_FIELD_NAMES.has(normalizedName) &&
		isShortEnoughForFilter &&
		hasReasonableCardinality;

	return {
		filterable,
		kqlSearchable: !isHidden && isShortEnoughForKql,
		hidden: isHidden,
	};
}

function addDiscoveryValue(fieldsByName, fieldName, value) {
	if (!fieldName || !isSearchableValue(value)) {
		return;
	}

	const normalizedValue = normalizeFieldValue(value);

	if (!normalizedValue) {
		return;
	}

	const field = fieldsByName.get(fieldName) ?? {
		name: fieldName,
		count: 0,
		values: new Map(),
	};

	field.count += 1;
	field.values.set(normalizedValue, (field.values.get(normalizedValue) ?? 0) + 1);
	fieldsByName.set(fieldName, field);
}

function addDiscoveryFields(value, fieldsByName, path = "") {
	if (isSearchableValue(value)) {
		addDiscoveryValue(fieldsByName, path, value);
		return;
	}

	if (Array.isArray(value)) {
		for (const item of value) {
			addDiscoveryFields(item, fieldsByName, path);
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

		addDiscoveryFields(
			childValue,
			fieldsByName,
			path ? `${path}.${key}` : key,
		);
	}
}

function compareDiscoveredValues(left, right) {
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

function createDiscoveryRecord(log) {
	const jsonPayload = tryParseJsonPayloadFromLine(log?.rawLine);

	return {
		...(jsonPayload && typeof jsonPayload === "object" ? jsonPayload : {}),
		message: log?.message,
		level: log?.level,
		"log.level": log?.level,
		namespace: log?.namespace,
		podName: log?.podName,
		log: log?.rawLine,
	};
}

function discoverLogFields(logs) {
	const fieldsByName = new Map();

	for (const log of Array.isArray(logs) ? logs : []) {
		addDiscoveryFields(createDiscoveryRecord(log), fieldsByName);
	}

	return Array.from(fieldsByName.values())
		.map((field) => {
			const classification = classifyDiscoveredField(field);

			return {
				name: field.name,
				count: field.count,
				...classification,
				values: Array.from(field.values.entries())
					.map(([value, count]) => ({ value, count }))
					.sort(compareDiscoveredValues)
					.slice(0, MAX_RETURNED_FIELD_VALUES),
			};
		})
		.filter((field) => !field.hidden && field.kqlSearchable)
		.sort((left, right) => {
			const leftRank =
				CORE_FIELD_RANK.get(normalizeFieldName(left.name)) ?? Number.MAX_SAFE_INTEGER;
			const rightRank =
				CORE_FIELD_RANK.get(normalizeFieldName(right.name)) ?? Number.MAX_SAFE_INTEGER;

			if (leftRank !== rightRank) {
				return leftRank - rightRank;
			}

			if (left.filterable !== right.filterable) {
				return left.filterable ? -1 : 1;
			}

			return left.name.localeCompare(right.name);
		});
}

module.exports = {
	applyLogSearchFilters,
	discoverLogFields,
	parseKqlQuery,
};
