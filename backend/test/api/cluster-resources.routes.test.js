const request = require("supertest");
const { AppError } = require("../../src/errors/app.error");
const { getClusterById } = require("../../src/service/clusterManager.service");
const {
	getClusterPodLogs,
	listClusterDeployments,
	listClusterNamespaces,
	listClusterPods,
	listClusterPodsForDeployment,
} = require("../../src/service/clusterResources.service");

jest.mock("../../src/service/clusterManager.service", () => ({
	getClusterById: jest.fn(),
}));

jest.mock("../../src/service/clusterResources.service", () => ({
	getClusterPodLogs: jest.fn(),
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
	getClusterPodLogs.mockReset();
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

	it("returns batched pod logs and forwards valid query options", async () => {
		getClusterPodLogs.mockResolvedValue({
			logs: ["line 2", "line 1"],
			count: 2,
			limit: 500,
			hasMore: true,
			nextBeforeTimestamp: "2026-06-04T14:20:00.000Z",
		});

		const response = await request(app.callback()).get(
			"/api/clusters/1/namespaces/apps/pods/api-123/logs?container=%20api%20&limit=500&sinceSeconds=60&beforeTimestamp=2026-06-04T14:20:00.000Z",
		);

		expect(response.status).toBe(200);
		expect(response.body).toEqual({
			logs: ["line 2", "line 1"],
			count: 2,
			limit: 500,
			hasMore: true,
			nextBeforeTimestamp: "2026-06-04T14:20:00.000Z",
		});
		expect(getClusterPodLogs).toHaveBeenCalledWith(1, "apps", "api-123", {
			container: "api",
			limit: 500,
			sinceSeconds: 60,
			beforeTimestamp: "2026-06-04T14:20:00.000Z",
		});
	});

	it("omits container when it is empty after trim", async () => {
		getClusterPodLogs.mockResolvedValue({
			logs: ["line 1"],
			count: 1,
			limit: 10,
			hasMore: false,
			nextBeforeTimestamp: null,
		});

		const response = await request(app.callback()).get(
			"/api/clusters/1/namespaces/apps/pods/api-123/logs?container=%20%20%20&limit=10",
		);

		expect(response.status).toBe(200);
		expect(getClusterPodLogs).toHaveBeenCalledWith(1, "apps", "api-123", {
			limit: 10,
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

	it("rejects invalid pod log query values with 400", async () => {
		const response = await request(app.callback()).get(
			"/api/clusters/1/namespaces/apps/pods/api-123/logs?limit=0&sinceSeconds=nope&beforeTimestamp=not-a-date",
		);

		expect(response.status).toBe(400);
		expect(response.body).toEqual({
			error: "Invalid pod log query",
			details: {
				limit: '"limit" must be a positive number',
				sinceSeconds: '"sinceSeconds" must be a number',
				beforeTimestamp: '"beforeTimestamp" must be in iso format',
			},
		});
		expect(getClusterPodLogs).not.toHaveBeenCalled();
	});
});
