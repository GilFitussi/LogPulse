function normalizeLogLine(value) {
	return typeof value === "string" ? value.replace(/\r/g, "") : "";
}

function normalizeLogsApiMessage(message, fallbackMessage) {
	const normalizedMessage =
		typeof message === "string" && message.trim() ? message.trim() : "";

	return normalizedMessage || fallbackMessage;
}

export function getPodLogsApiErrorMessage(data, fallbackMessage) {
	const details = data?.details;

	if (typeof details === "string" && details.trim()) {
		return normalizeLogsApiMessage(details, fallbackMessage);
	}

	if (details && typeof details === "object") {
		if (typeof details.message === "string" && details.message.trim()) {
			return normalizeLogsApiMessage(details.message, fallbackMessage);
		}

		const detailsMessage = Object.values(details)
			.filter((value) => typeof value === "string" && value.trim())
			.join(" ");

		if (detailsMessage) {
			return normalizeLogsApiMessage(detailsMessage, fallbackMessage);
		}
	}

	if (typeof data?.error === "string" && data.error.trim()) {
		return normalizeLogsApiMessage(data.error, fallbackMessage);
	}

	return fallbackMessage;
}

export function parsePodLogsResponse(data) {
	if (typeof data?.logs !== "string") {
		throw new Error("Unexpected pod logs response from backend");
	}

	return data.logs;
}

export function detectLogLevel(rawLine) {
	const normalizedLine = String(rawLine || "");
	const match = normalizedLine.match(
		/\b(error|warn|warning|info|debug|trace|fatal)\b/i,
	);

	if (!match) {
		return "INFO";
	}

	const normalizedLevel = match[1].toUpperCase();

	if (normalizedLevel === "WARNING") {
		return "WARN";
	}

	return normalizedLevel;
}

export function parseLogTimestamp(rawTimestamp) {
	if (typeof rawTimestamp !== "string" || !rawTimestamp.trim()) {
		return null;
	}

	const normalizedTimestamp = rawTimestamp.trim().replace(/,(\d{3,})/, ".$1");
	const parsedTimestamp = Date.parse(normalizedTimestamp);

	if (!Number.isNaN(parsedTimestamp)) {
		return parsedTimestamp;
	}

	const isoWithoutTimezoneMatch = normalizedTimestamp.match(
		/^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}:\d{2}(?:\.\d+)?)$/,
	);

	if (isoWithoutTimezoneMatch) {
		const fallbackParsedTimestamp = Date.parse(
			`${isoWithoutTimezoneMatch[1]}T${isoWithoutTimezoneMatch[2]}Z`,
		);

		if (!Number.isNaN(fallbackParsedTimestamp)) {
			return fallbackParsedTimestamp;
		}
	}

	return null;
}

export function formatLogTimestamp(rawTimestamp) {
	if (typeof rawTimestamp !== "string" || !rawTimestamp.trim()) {
		return "—";
	}

	const parsedTimestamp = parseLogTimestamp(rawTimestamp);

	if (parsedTimestamp === null) {
		return rawTimestamp.trim();
	}

	return new Intl.DateTimeFormat("en-US", {
		month: "short",
		day: "2-digit",
		hour: "2-digit",
		minute: "2-digit",
		second: "2-digit",
		hour12: false,
	}).format(new Date(parsedTimestamp));
}

function extractTimestampFromLine(rawLine) {
	const normalizedLine = String(rawLine || "");
	const match = normalizedLine.match(
		/\b\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:[.,]\d+)?(?:Z|[+-]\d{2}:?\d{2})?\b/,
	);

	return match?.[0] || null;
}

function tryParseJsonLogLine(rawLine) {
	try {
		const parsed = JSON.parse(rawLine);
		return parsed && typeof parsed === "object" ? parsed : null;
	} catch {
		return null;
	}
}

export function createLogRecord(rawLine, metadata, lineIndex) {
	const normalizedLine = normalizeLogLine(rawLine);
	const jsonLog = tryParseJsonLogLine(normalizedLine);
	const rawTimestamp =
		jsonLog?.timestamp ||
		jsonLog?.time ||
		jsonLog?.["@timestamp"] ||
		extractTimestampFromLine(normalizedLine);
	const message =
		jsonLog?.message || jsonLog?.msg || jsonLog?.log || normalizedLine;
	const level = detectLogLevel(
		jsonLog?.level || jsonLog?.severity || normalizedLine,
	);
	const service =
		jsonLog?.service?.name ||
		jsonLog?.service_name ||
		metadata.deployment ||
		"—";
	const details = {
		...(jsonLog && typeof jsonLog === "object" ? jsonLog : {}),
		message,
		"log.level": level,
		"service.name": service,
		"kubernetes.cluster.id": String(metadata.clusterId),
		"kubernetes.namespace_name": metadata.namespace,
		"kubernetes.deployment.name": metadata.deployment,
		"kubernetes.pod.name": metadata.podName,
		"log.source": `${metadata.namespace}/${metadata.podName}`,
		log: normalizedLine,
		pod: metadata.podName,
		source: metadata.podName,
	};

	if (rawTimestamp) {
		details["@timestamp"] = rawTimestamp;
	}

	return {
		id: `${metadata.podName}:${lineIndex}:${normalizedLine}`,
		rawTimestamp,
		parsedTimestamp: parseLogTimestamp(rawTimestamp),
		timestamp: formatLogTimestamp(rawTimestamp),
		level,
		pod: metadata.podName,
		source: metadata.podName,
		service,
		message,
		details,
	};
}

export function parsePodLogsDataset(rawLogs, metadata) {
	return String(rawLogs || "")
		.split("\n")
		.map((line) => normalizeLogLine(line))
		.filter((line) => line.trim())
		.map((line, index) => createLogRecord(line, metadata, index));
}

export function combinePodLogDatasets(podDatasets) {
	return podDatasets.flat().sort((left, right) => {
		if (
			typeof left.parsedTimestamp === "number" &&
			typeof right.parsedTimestamp === "number"
		) {
			if (right.parsedTimestamp !== left.parsedTimestamp) {
				return right.parsedTimestamp - left.parsedTimestamp;
			}
		}

		if (typeof left.parsedTimestamp === "number") {
			return -1;
		}

		if (typeof right.parsedTimestamp === "number") {
			return 1;
		}

		return right.id.localeCompare(left.id);
	});
}

export async function fetchPodLogs(
	fetchImpl,
	clusterId,
	namespace,
	podName,
	apiBaseUrl,
	options = {},
) {
	const searchParams = new URLSearchParams();

	if (typeof options.sinceSeconds === "number") {
		searchParams.set("sinceSeconds", String(options.sinceSeconds));
	}

	const queryString = searchParams.toString();
	const response = await fetchImpl(
		`${apiBaseUrl}/api/clusters/${clusterId}/namespaces/${encodeURIComponent(namespace)}/pods/${encodeURIComponent(podName)}/logs${queryString ? `?${queryString}` : ""}`,
	);
	const data = await response.json().catch(() => ({}));

	if (!response.ok) {
		throw new Error(
			getPodLogsApiErrorMessage(
				data,
				`Unable to load logs for pod "${podName}"`,
			),
		);
	}

	return parsePodLogsResponse(data);
}
