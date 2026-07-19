export const MAX_LOG_DATASET_SIZE = 5000;

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

function tryParseJsonPayloadFromLine(rawLine) {
	const normalizedLine = String(rawLine || "");
	const jsonStartIndex = normalizedLine.indexOf("{");
	const jsonEndIndex = normalizedLine.lastIndexOf("}");

	if (jsonStartIndex === -1 || jsonEndIndex <= jsonStartIndex) {
		return null;
	}

	return tryParseJsonLogLine(
		normalizedLine.slice(jsonStartIndex, jsonEndIndex + 1),
	);
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

export function createLogRecordFromSearchEntry(entry, metadata = {}) {
	const namespace =
		typeof entry?.namespace === "string" && entry.namespace.trim()
			? entry.namespace.trim()
			: metadata.namespace || "";
	const podName =
		typeof entry?.podName === "string" && entry.podName.trim()
			? entry.podName.trim()
			: metadata.podName || "—";
	const deployment = metadata.deployment || "—";
	const rawTimestamp =
		typeof entry?.timestamp === "string" && entry.timestamp.trim()
			? entry.timestamp.trim()
			: null;
	const rawLine =
		typeof entry?.rawLine === "string" && entry.rawLine.trim()
			? entry.rawLine.trim()
			: typeof entry?.message === "string"
				? entry.message
				: "";
	const message =
		typeof entry?.message === "string" && entry.message.trim()
			? entry.message.trim()
			: rawLine;
	const jsonLog = tryParseJsonPayloadFromLine(rawLine);
	const level =
		typeof entry?.level === "string" && entry.level.trim()
			? detectLogLevel(entry.level)
			: detectLogLevel(message || rawLine);
	const service = metadata.service || metadata.deployment || "—";
	const details = {
		...(jsonLog && typeof jsonLog === "object" ? jsonLog : {}),
		message,
		"log.level": level,
		"service.name": service,
		"kubernetes.cluster.id": String(metadata.clusterId),
		"kubernetes.namespace_name": namespace,
		"kubernetes.deployment.name": deployment,
		"kubernetes.pod.name": podName,
		"log.source": namespace && podName ? `${namespace}/${podName}` : podName,
		log: rawLine,
		pod: podName,
		source: podName,
	};

	if (rawTimestamp) {
		details["@timestamp"] = rawTimestamp;
	}

	return {
		id:
			typeof entry?.id === "string" && entry.id.trim()
				? entry.id
				: `${podName}:${rawTimestamp || "no-timestamp"}:${message}`,
		rawTimestamp,
		parsedTimestamp: parseLogTimestamp(rawTimestamp),
		timestamp: formatLogTimestamp(rawTimestamp),
		level,
		pod: podName,
		source: podName,
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

export function trimLogDataset(logs, maxSize = MAX_LOG_DATASET_SIZE) {
	const safeMaxSize =
		Number.isInteger(maxSize) && maxSize > 0 ? maxSize : MAX_LOG_DATASET_SIZE;
	const entries = Array.isArray(logs) ? logs : [];

	if (entries.length <= safeMaxSize) {
		return {
			logs: entries,
			trimmedCount: 0,
			isTrimmed: false,
		};
	}

	return {
		logs: entries.slice(0, safeMaxSize),
		trimmedCount: entries.length - safeMaxSize,
		isTrimmed: true,
	};
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

export function parsePodLogSearchResponse(data, metadata = {}) {
	if (
		typeof data?.searchSessionId !== "string" ||
		!data.searchSessionId.trim() ||
		!Array.isArray(data?.logs)
	) {
		throw new Error("Unexpected pod log search response from backend");
	}

	const namespace =
		typeof data.namespace === "string" && data.namespace.trim()
			? data.namespace.trim()
			: metadata.namespace || "";

	return {
		searchSessionId: data.searchSessionId,
		namespace,
		podNames: Array.isArray(data.podNames) ? data.podNames : [],
		windowStartTimestamp: data.windowStartTimestamp || null,
		windowEndTimestamp: data.windowEndTimestamp || null,
		count:
			typeof data.count === "number" && data.count >= 0
				? data.count
				: data.logs.length,
		limit: typeof data.limit === "number" && data.limit > 0 ? data.limit : null,
		offset:
			typeof data.offset === "number" && data.offset >= 0 ? data.offset : 0,
		totalCount:
			typeof data.totalCount === "number" && data.totalCount >= 0
				? data.totalCount
				: data.logs.length,
		hasMore: Boolean(data.hasMore),
		nextOffset:
			typeof data.nextOffset === "number" && data.nextOffset >= 0
				? data.nextOffset
				: null,
		fields: Array.isArray(data.fields)
			? data.fields
					.filter((field) => typeof field?.name === "string" && field.name.trim())
					.map((field) => ({
						name: field.name.trim(),
						type: "keyword",
						filterable: field.filterable !== false,
						kqlSearchable: field.kqlSearchable !== false,
						sampleValues: (field.values ?? [])
							.map((entry) => String(entry?.value ?? "").trim())
							.filter(Boolean)
							.slice(0, 5),
						values: (field.values ?? [])
							.filter((entry) => String(entry?.value ?? "").trim())
							.map((entry) => ({
								value: String(entry.value).trim(),
								count:
									typeof entry.count === "number" && entry.count > 0
										? entry.count
										: 1,
							})),
					}))
			: [],
		logs: data.logs.map((entry) =>
			createLogRecordFromSearchEntry(entry, {
				...metadata,
				namespace:
					typeof entry?.namespace === "string" && entry.namespace.trim()
						? entry.namespace.trim()
						: namespace,
				podName:
					typeof entry?.podName === "string" && entry.podName.trim()
						? entry.podName.trim()
						: metadata.podName,
			}),
		),
	};
}

export async function createPodLogSearch(
	fetchImpl,
	clusterId,
	namespace,
	apiBaseUrl,
	options = {},
) {
	const requestOptions = {
		...options,
		filters: Array.isArray(options.filters)
			? options.filters.map((filter) => ({
					field: filter.field,
					operator: filter.operator,
					value: filter.value,
				}))
			: options.filters,
	};
	const response = await fetchImpl(
		`${apiBaseUrl}/api/clusters/${clusterId}/namespaces/${encodeURIComponent(namespace)}/log-searches`,
		{
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify(requestOptions),
		},
	);
	const data = await response.json().catch(() => ({}));

	if (!response.ok) {
		throw new Error(getPodLogsApiErrorMessage(data, "Unable to load logs"));
	}

	return parsePodLogSearchResponse(data, {
		clusterId,
		namespace,
		deployment: options.deployment,
	});
}

export async function fetchPodLogSearchResults(
	fetchImpl,
	clusterId,
	searchSessionId,
	apiBaseUrl,
	options = {},
) {
	const searchParams = new URLSearchParams();

	if (typeof options.offset === "number") {
		searchParams.set("offset", String(options.offset));
	}

	if (typeof options.limit === "number") {
		searchParams.set("limit", String(options.limit));
	}

	const queryString = searchParams.toString();
	const response = await fetchImpl(
		`${apiBaseUrl}/api/clusters/${clusterId}/log-searches/${encodeURIComponent(searchSessionId)}${queryString ? `?${queryString}` : ""}`,
	);
	const data = await response.json().catch(() => ({}));

	if (!response.ok) {
		throw new Error(
			getPodLogsApiErrorMessage(data, "Unable to load more logs"),
		);
	}

	return parsePodLogSearchResponse(data, {
		clusterId,
		deployment: options.deployment,
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
