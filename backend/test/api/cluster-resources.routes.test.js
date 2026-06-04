const request = require("supertest");
const { AppError } = require("../../src/errors/app.error");
const { getClusterById } = require("../../src/service/clusterManager.service");
const {
	createPodLogSearch,
	getPodLogSearchResults,
	listClusterDeployments,
	listClusterNamespaces,
	listClusterPods,
	listClusterPodsForDeployment,
} = require("../../src/service/clusterResources.service");

jest.mock("../../src/service/clusterManager.service", () => ({
	getClusterById: jest.fn(),
}));

jest.mock("../../src/service/clusterResources.service", () => ({
	createPodLogSearch: jest.fn(),
	getPodLogSearchResults: jest.fn(),
	listClusterDeployments: jest.fn(),
	listClusterNamespaces: jest.fn(),
	listClusterPods: jest.fn(),
	listClusterPodsForDeployment: jest.fn(),
}));

const app = require("../../src/app");

const cluster = {
	id: 1,
	name: "Dev",
	apiUrl: "https://api.dev.example.com:6443",
};

beforeEach(() => {
	getClusterById.mockReset();
	listClusterNamespaces.mockReset();
	listClusterDeployments.mockReset();
	listClusterPods.mockReset();
	listClusterPodsForDeployment.mockReset();
	createPodLogSearch.mockReset();
	getPodLogSearchResults.mockReset();
	getClusterById.mockResolvedValue(cluster);
});

describe("cluster-scoped resource endpoints", () => {
	it("returns namespaces from the cluster resources service", async () => {
		const namespaces = [{ name: "apps" }, { name: "dev" }];
		listClusterNamespaces.mockResolvedValue(namespaces);

		const response = await request(app.callback()).get(
			"/api/clusters/1/namespaces",
		);

		expect(response.status).toBe(200);
		expect(response.body).toEqual({ namespaces });
		expect(getClusterById).toHaveBeenCalledWith(1);
		expect(listClusterNamespaces).toHaveBeenCalledWith(1);
	});

	it("returns deployments from the cluster resources service", async () => {
		const deployments = [{ name: "api", namespace: "apps" }];
		listClusterDeployments.mockResolvedValue(deployments);

		const response = await request(app.callback()).get(
			"/api/clusters/1/namespaces/apps/deployments",
		);

		expect(response.status).toBe(200);
		expect(response.body).toEqual({ deployments });
		expect(listClusterDeployments).toHaveBeenCalledWith(1, "apps");
	});

	it("returns pods from the cluster resources service", async () => {
		const pods = [{ name: "api-123", namespace: "apps" }];
		listClusterPods.mockResolvedValue(pods);

		const response = await request(app.callback()).get(
			"/api/clusters/1/namespaces/apps/pods",
		);

		expect(response.status).toBe(200);
		expect(response.body).toEqual({ pods });
		expect(listClusterPods).toHaveBeenCalledWith(1, "apps");
	});

	it("returns deployment pods from the cluster resources service", async () => {
		const pods = [{ name: "api-123", namespace: "apps" }];
		listClusterPodsForDeployment.mockResolvedValue(pods);

		const response = await request(app.callback()).get(
			"/api/clusters/1/namespaces/apps/deployments/api/pods",
		);

		expect(response.status).toBe(200);
		expect(response.body).toEqual({ pods });
		expect(listClusterPodsForDeployment).toHaveBeenCalledWith(1, "apps", "api");
	});

	it("creates a pod log search session and returns the first combined batch", async () => {
		createPodLogSearch.mockResolvedValue({
			searchSessionId: "session-1",
			namespace: "apps",
			podNames: ["api-123", "api-456"],
			windowStartTimestamp: "2026-06-04T14:45:00.000Z",
			windowEndTimestamp: "2026-06-04T15:00:00.000Z",
			count: 2,
			limit: 500,
			offset: 0,
			totalCount: 2,
			hasMore: false,
			nextOffset: null,
			logs: [
				{
					podName: "api-123",
					namespace: "apps",
					timestamp: "2026-06-04T14:59:00.000Z",
					level: "INFO",
					message: "started",
				},
			],
		});

		const response = await request(app.callback())
			.post("/api/clusters/1/namespaces/apps/log-searches")
			.send({
				podNames: ["api-123", "api-456"],
				sinceSeconds: 900,
				limit: 500,
			});

		expect(response.status).toBe(200);
		expect(response.body.searchSessionId).toBe("session-1");
		expect(createPodLogSearch).toHaveBeenCalledWith(1, "apps", {
			podNames: ["api-123", "api-456"],
			sinceSeconds: 900,
			limit: 500,
		});
	});

	it("returns more results from an existing pod log search session", async () => {
		getPodLogSearchResults.mockResolvedValue({
			searchSessionId: "session-1",
			namespace: "apps",
			podNames: ["api-123", "api-456"],
			windowStartTimestamp: "2026-06-04T14:45:00.000Z",
			windowEndTimestamp: "2026-06-04T15:00:00.000Z",
			count: 1,
			limit: 500,
			offset: 500,
			totalCount: 501,
			hasMore: false,
			nextOffset: null,
			logs: [
				{
					podName: "api-456",
					namespace: "apps",
					timestamp: "2026-06-04T14:30:00.000Z",
					level: "ERROR",
					message: "failed",
				},
			],
		});

		const response = await request(app.callback()).get(
			"/api/clusters/1/log-searches/session-1?offset=500&limit=500",
		);

		expect(response.status).toBe(200);
		expect(getPodLogSearchResults).toHaveBeenCalledWith(1, "session-1", {
			offset: 500,
			limit: 500,
		});
	});

	it("returns 404 when the cluster does not exist", async () => {
		getClusterById.mockResolvedValue(null);

		const response = await request(app.callback()).get(
			"/api/clusters/999/namespaces",
		);

		expect(response.status).toBe(404);
		expect(response.body).toEqual({ error: "Cluster not found" });
		expect(listClusterNamespaces).not.toHaveBeenCalled();
	});

	it("returns service AppErrors through the error middleware", async () => {
		listClusterNamespaces.mockRejectedValue(
			new AppError("Cluster is not connected", {
				status: 409,
				code: "CLUSTER_NOT_CONNECTED",
				details: {
					message: "No active cluster session found for clusterId 1",
				},
				action: "Login to the cluster and try again.",
			}),
		);

		const response = await request(app.callback()).get(
			"/api/clusters/1/namespaces",
		);

		expect(response.status).toBe(409);
		expect(response.body).toEqual({
			error: "Cluster is not connected",
			code: "CLUSTER_NOT_CONNECTED",
			details: {
				message: "No active cluster session found for clusterId 1",
			},
			action: "Login to the cluster and try again.",
		});
	});

	it("rejects invalid pod log search bodies with 400", async () => {
		const response = await request(app.callback())
			.post("/api/clusters/1/namespaces/apps/log-searches")
			.send({
				podNames: [],
				sinceSeconds: "nope",
				limit: 0,
				windowEndTimestamp: "not-a-date",
			});

		expect(response.status).toBe(400);
		expect(response.body).toEqual({
			error: "Invalid pod log search body",
			details: {
				podNames: '"podNames" does not contain 1 required value(s)',
				sinceSeconds: '"sinceSeconds" must be a number',
				limit: '"limit" must be a positive number',
				windowEndTimestamp: '"windowEndTimestamp" must be in iso format',
			},
		});
		expect(createPodLogSearch).not.toHaveBeenCalled();
	});

	it("rejects invalid pod log search query values with 400", async () => {
		const response = await request(app.callback()).get(
			"/api/clusters/1/log-searches/session-1?offset=-1&limit=0",
		);

		expect(response.status).toBe(400);
		expect(response.body).toEqual({
			error: "Invalid pod log search query",
			details: {
				offset: '"offset" must be greater than or equal to 0',
				limit: '"limit" must be a positive number',
			},
		});
		expect(getPodLogSearchResults).not.toHaveBeenCalled();
	});
});
