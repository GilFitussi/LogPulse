export const MAX_LOG_LINES = 10000;

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

export function getFilteredLogLines(rawLogLines, searchText = "") {
	const normalizedSearchText = searchText.trim().toLowerCase();

	if (!normalizedSearchText) {
		return rawLogLines;
	}

	return rawLogLines.filter((line) =>
		line.toLowerCase().includes(normalizedSearchText),
	);
}
