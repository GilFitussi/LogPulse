function normalizeDeploymentsApiMessage(message, fallbackMessage) {
	const normalizedMessage =
		typeof message === "string" && message.trim() ? message.trim() : "";

	if (!normalizedMessage) {
		return fallbackMessage;
	}

	if (
		normalizedMessage.includes('cannot list resource "deployments"') ||
		normalizedMessage.toLowerCase().includes("forbidden")
	) {
		return "You do not have access to deployments in this namespace";
	}

	return normalizedMessage;
}

export function getDeploymentsApiErrorMessage(data, fallbackMessage) {
	const details = data?.details;

	if (typeof details === "string" && details.trim()) {
		return normalizeDeploymentsApiMessage(details, fallbackMessage);
	}

	if (details && typeof details === "object") {
		if (typeof details.message === "string" && details.message.trim()) {
			return normalizeDeploymentsApiMessage(details.message, fallbackMessage);
		}

		const detailsMessage = Object.values(details)
			.filter((value) => typeof value === "string" && value.trim())
			.join(" ");

		if (detailsMessage) {
			return normalizeDeploymentsApiMessage(detailsMessage, fallbackMessage);
		}
	}

	if (typeof data?.error === "string" && data.error.trim()) {
		return normalizeDeploymentsApiMessage(data.error, fallbackMessage);
	}

	return fallbackMessage;
}

export function parseDeploymentsResponse(data) {
	if (!Array.isArray(data?.deployments)) {
		throw new Error("Unexpected deployments response from backend");
	}

	return data.deployments
		.map((deployment) => {
			if (typeof deployment === "string") {
				return { name: deployment };
			}

			if (deployment && typeof deployment.name === "string") {
				return { name: deployment.name };
			}

			return null;
		})
		.filter(
			(deployment) =>
				typeof deployment?.name === "string" && deployment.name.trim(),
		)
		.map((deployment) => ({ name: deployment.name.trim() }));
}

export async function fetchClusterDeployments(
	fetchImpl,
	clusterId,
	namespace,
	apiBaseUrl,
) {
	const response = await fetchImpl(
		`${apiBaseUrl}/api/clusters/${clusterId}/namespaces/${encodeURIComponent(namespace)}/deployments`,
	);
	const data = await response.json().catch(() => ({}));

	if (!response.ok) {
		throw new Error(
			getDeploymentsApiErrorMessage(data, "Unable to load deployments"),
		);
	}

	return parseDeploymentsResponse(data);
}
