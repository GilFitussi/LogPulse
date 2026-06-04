function normalizePodsApiMessage(message, fallbackMessage) {
	const normalizedMessage =
		typeof message === "string" && message.trim() ? message.trim() : "";

	if (!normalizedMessage) {
		return fallbackMessage;
	}

	if (
		normalizedMessage.includes('cannot list resource "pods"') ||
		normalizedMessage.toLowerCase().includes("forbidden")
	) {
		return "You do not have access to pods in this deployment";
	}

	return normalizedMessage;
}

export function getPodsApiErrorMessage(data, fallbackMessage) {
	const details = data?.details;

	if (typeof details === "string" && details.trim()) {
		return normalizePodsApiMessage(details, fallbackMessage);
	}

	if (details && typeof details === "object") {
		if (typeof details.message === "string" && details.message.trim()) {
			return normalizePodsApiMessage(details.message, fallbackMessage);
		}

		const detailsMessage = Object.values(details)
			.filter((value) => typeof value === "string" && value.trim())
			.join(" ");

		if (detailsMessage) {
			return normalizePodsApiMessage(detailsMessage, fallbackMessage);
		}
	}

	if (typeof data?.error === "string" && data.error.trim()) {
		return normalizePodsApiMessage(data.error, fallbackMessage);
	}

	return fallbackMessage;
}

export function parsePodsResponse(data) {
	if (!Array.isArray(data?.pods)) {
		throw new Error("Unexpected pods response from backend");
	}

	return data.pods
		.map((pod) => {
			if (typeof pod === "string") {
				return { name: pod };
			}

			if (pod && typeof pod.name === "string") {
				return { name: pod.name };
			}

			return null;
		})
		.filter((pod) => typeof pod?.name === "string" && pod.name.trim())
		.map((pod) => ({ name: pod.name.trim() }));
}

export async function fetchDeploymentPods(
	fetchImpl,
	clusterId,
	namespace,
	deployment,
	apiBaseUrl,
) {
	const response = await fetchImpl(
		`${apiBaseUrl}/api/clusters/${clusterId}/namespaces/${encodeURIComponent(namespace)}/deployments/${encodeURIComponent(deployment)}/pods`,
	);
	const data = await response.json().catch(() => ({}));

	if (!response.ok) {
		throw new Error(getPodsApiErrorMessage(data, "Unable to load pods"));
	}

	return parsePodsResponse(data);
}
