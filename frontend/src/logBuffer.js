export const MAX_LOG_LINES = 10000;

export const LOG_SEVERITIES = {
	ERROR: "error",
	WARN: "warn",
	INFO: "info",
	DEBUG: "debug",
};

const severityPatterns = [
	{
		severity: LOG_SEVERITIES.ERROR,
		pattern: /\b(error|err|fatal|critical|exception|failed|failure)\b/i,
	},
	{
		severity: LOG_SEVERITIES.WARN,
		pattern: /\b(warn|warning|deprecated)\b/i,
	},
	{
		severity: LOG_SEVERITIES.DEBUG,
		pattern: /\b(debug|trace|verbose)\b/i,
	},
	{
		severity: LOG_SEVERITIES.INFO,
		pattern: /\b(info|information|notice|started|ready|success|succeeded)\b/i,
	},
];

export function detectLogSeverity(line) {
	const normalizedLine = String(line ?? "");
	const match = severityPatterns.find(({ pattern }) =>
		pattern.test(normalizedLine),
	);

	return match?.severity || LOG_SEVERITIES.INFO;
}

export function appendLogLines(
	currentLines,
	newLines,
	maxLines = MAX_LOG_LINES,
) {
	const linesToAppend = Array.isArray(newLines) ? newLines : [newLines];

	if (maxLines <= 0) {
		return [];
	}

	const nextLines = [...currentLines, ...linesToAppend];

	if (nextLines.length <= maxLines) {
		return nextLines;
	}

	return nextLines.slice(nextLines.length - maxLines);
}

export function getFilteredLogLines(
	rawLogLines,
	searchText = "",
	severityFilters = [],
) {
	const normalizedSearchText = searchText.trim().toLowerCase();
	const activeSeverityFilters = new Set(severityFilters);
	const hasSeverityFilters = activeSeverityFilters.size > 0;

	if (!normalizedSearchText && !hasSeverityFilters) {
		return rawLogLines;
	}

	return rawLogLines.filter((line) => {
		const matchesSearch =
			!normalizedSearchText ||
			line.toLowerCase().includes(normalizedSearchText);
		const matchesSeverity =
			!hasSeverityFilters || activeSeverityFilters.has(detectLogSeverity(line));

		return matchesSearch && matchesSeverity;
	});
}
