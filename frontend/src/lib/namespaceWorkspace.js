export function createNamespaceWorkspaceState(
	clusterId = null,
	overrides = {},
) {
	return {
		clusterId,
		namespaces: [],
		selectedNamespaceName: "",
		searchText: "",
		isDropdownOpen: false,
		isLoading: false,
		error: "",
		...overrides,
	};
}

export function getNamespaceApiErrorMessage(data, fallbackMessage) {
	const details = data?.details;

	if (typeof details === "string" && details.trim()) {
		return details;
	}

	if (details && typeof details === "object") {
		if (typeof details.message === "string" && details.message.trim()) {
			return details.message;
		}

		const detailsMessage = Object.values(details)
			.filter((value) => typeof value === "string" && value.trim())
			.join(" ");

		if (detailsMessage) {
			return detailsMessage;
		}
	}

	if (typeof data?.error === "string" && data.error.trim()) {
		return data.error;
	}

	return fallbackMessage;
}

export function parseNamespacesResponse(data) {
	if (!Array.isArray(data?.namespaces)) {
		throw new Error("Unexpected namespaces response from backend");
	}

	return data.namespaces
		.map((namespace) => {
			if (typeof namespace === "string") {
				return { name: namespace };
			}

			if (namespace && typeof namespace.name === "string") {
				return { name: namespace.name };
			}

			return null;
		})
		.filter(
			(namespace) =>
				typeof namespace?.name === "string" && namespace.name.trim(),
		)
		.map((namespace) => ({ name: namespace.name.trim() }));
}

export function filterNamespacesBySearch(namespaces, searchText = "") {
	const normalizedSearch = String(searchText).trim().toLowerCase();

	if (!normalizedSearch) {
		return namespaces;
	}

	return namespaces.filter((namespace) =>
		String(namespace?.name || "")
			.toLowerCase()
			.includes(normalizedSearch),
	);
}

export function closeNamespaceSelector(state) {
	return {
		...state,
		isDropdownOpen: false,
		searchText: "",
	};
}

export function selectNamespace(state, namespaceName) {
	return {
		...state,
		selectedNamespaceName: namespaceName,
		isDropdownOpen: false,
		searchText: "",
	};
}

export async function fetchClusterNamespaces(fetchImpl, clusterId, apiBaseUrl) {
	const response = await fetchImpl(
		`${apiBaseUrl}/api/clusters/${clusterId}/namespaces`,
	);
	const data = await response.json().catch(() => ({}));

	if (!response.ok) {
		throw new Error(
			getNamespaceApiErrorMessage(data, "Unable to load namespaces"),
		);
	}

	return parseNamespacesResponse(data);
}
