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

function normalizeFieldName(fieldName) {
	return String(fieldName || "").trim().toLowerCase();
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

			tokens.push({
				type: TOKEN_TYPES.PHRASE,
				value,
				position: start,
			});
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

export function parseKqlQuery(query) {
	const normalizedQuery = String(query || "").trim();

	if (!normalizedQuery) {
		return {
			ok: true,
			ast: { type: "match_all" },
			error: null,
		};
	}

	const tokenResult = tokenize(normalizedQuery);

	if (!tokenResult.ok) {
		return {
			ok: false,
			ast: null,
			error: tokenResult.error,
		};
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
