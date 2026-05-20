const request = require("supertest");
const {
	createCluster,
	deleteCluster,
	getClusterById,
	listClusters,
	updateCluster,
} = require("../../src/service/clusterManager.service");

jest.mock("../../src/service/clusterManager.service", () => ({
	createCluster: jest.fn(),
	deleteCluster: jest.fn(),
	getClusterById: jest.fn(),
	listClusters: jest.fn(),
	updateCluster: jest.fn(),
}));

jest.mock("../../src/service/namespaces.service", () => ({
	isValidNamespace: jest.fn(() => true),
	listNamespaces: jest.fn(),
}));

jest.mock("../../src/service/deployments.service", () => ({
	isValidDeployment: jest.fn(() => true),
	listDeployments: jest.fn(),
}));

jest.mock("../../src/service/pods.service", () => ({
	listPods: jest.fn(),
	listPodsForDeployment: jest.fn(),
}));

const app = require("../../src/app");

beforeEach(() => {
	createCluster.mockReset();
	deleteCluster.mockReset();
	getClusterById.mockReset();
	listClusters.mockReset();
	updateCluster.mockReset();
});

describe("GET /clusters", () => {
	it("returns clusters from the cluster manager service", async () => {
		const clusters = [
			{
				id: 1,
				name: "Dev",
				apiUrl: "https://api.dev.example.com:6443",
				defaultNamespace: "apps",
				description: "Development cluster",
				createdAt: "2026-05-20T10:00:00.000Z",
				updatedAt: "2026-05-20T10:00:00.000Z",
				lastConnectedAt: null,
				lastConnectionStatus: null,
				lastConnectionError: null,
			},
		];
		listClusters.mockResolvedValue(clusters);

		const response = await request(app.callback()).get("/clusters");

		expect(response.status).toBe(200);
		expect(response.body).toEqual({ clusters });
		expect(listClusters).toHaveBeenCalledTimes(1);
	});
});

describe("GET /clusters/:clusterId", () => {
	it("returns a cluster from the cluster manager service", async () => {
		const cluster = {
			id: 1,
			name: "Dev",
			apiUrl: "https://api.dev.example.com:6443",
			defaultNamespace: "apps",
			description: "Development cluster",
			createdAt: "2026-05-20T10:00:00.000Z",
			updatedAt: "2026-05-20T10:00:00.000Z",
			lastConnectedAt: null,
			lastConnectionStatus: null,
			lastConnectionError: null,
		};
		getClusterById.mockResolvedValue(cluster);

		const response = await request(app.callback()).get("/clusters/1");

		expect(response.status).toBe(200);
		expect(response.body).toEqual({ cluster });
		expect(getClusterById).toHaveBeenCalledWith(1);
	});

	it("returns 404 when the cluster does not exist", async () => {
		getClusterById.mockResolvedValue(null);

		const response = await request(app.callback()).get("/clusters/999");

		expect(response.status).toBe(404);
		expect(response.body).toEqual({ error: "Cluster not found" });
		expect(getClusterById).toHaveBeenCalledWith(999);
	});
});

describe("POST /clusters", () => {
	it("validates and creates a cluster", async () => {
		const cluster = {
			id: 1,
			name: "Dev",
			apiUrl: "https://api.dev.example.com:6443",
			defaultNamespace: "apps",
			description: null,
			createdAt: "2026-05-20T10:00:00.000Z",
			updatedAt: "2026-05-20T10:00:00.000Z",
			lastConnectedAt: null,
			lastConnectionStatus: null,
			lastConnectionError: null,
		};
		createCluster.mockResolvedValue(cluster);

		const response = await request(app.callback()).post("/clusters").send({
			name: " Dev ",
			apiUrl: "https://api.dev.example.com:6443",
			defaultNamespace: " apps ",
		});

		expect(response.status).toBe(201);
		expect(response.body).toEqual({ cluster });
		expect(createCluster).toHaveBeenCalledWith({
			name: "Dev",
			apiUrl: "https://api.dev.example.com:6443",
			defaultNamespace: "apps",
			description: null,
		});
	});

	it("rejects missing required fields", async () => {
		const response = await request(app.callback()).post("/clusters").send({
			name: "",
		});

		expect(response.status).toBe(400);
		expect(response.body).toEqual({
			error: "Invalid cluster input",
			details: {
				name: '"name" is not allowed to be empty',
				apiUrl: '"apiUrl" is required',
			},
		});
		expect(createCluster).not.toHaveBeenCalled();
	});

	it("rejects invalid apiUrl values", async () => {
		const response = await request(app.callback()).post("/clusters").send({
			name: "Dev",
			apiUrl: "javascript:alert(1)",
		});

		expect(response.status).toBe(400);
		expect(response.body).toEqual({
			error: "Invalid cluster input",
			details: {
				apiUrl:
					'"apiUrl" must be a valid uri with a scheme matching the http|https pattern',
			},
		});
		expect(createCluster).not.toHaveBeenCalled();
	});

	it("rejects malformed JSON bodies", async () => {
		const response = await request(app.callback())
			.post("/clusters")
			.set("Content-Type", "application/json")
			.send("{invalid json");

		expect(response.status).toBe(400);
		expect(response.body).toEqual({ error: "Invalid JSON request body" });
		expect(createCluster).not.toHaveBeenCalled();
	});
});

describe("PATCH /clusters/:clusterId", () => {
	it("validates and updates a cluster", async () => {
		const cluster = {
			id: 1,
			name: "Prod",
			apiUrl: "https://api.dev.example.com:6443",
			defaultNamespace: null,
			description: "Production cluster",
			createdAt: "2026-05-20T10:00:00.000Z",
			updatedAt: "2026-05-20T10:01:00.000Z",
			lastConnectedAt: null,
			lastConnectionStatus: null,
			lastConnectionError: null,
		};
		updateCluster.mockResolvedValue(cluster);

		const response = await request(app.callback()).patch("/clusters/1").send({
			name: " Prod ",
			description: " Production cluster ",
		});

		expect(response.status).toBe(200);
		expect(response.body).toEqual({ cluster });
		expect(updateCluster).toHaveBeenCalledWith(1, {
			name: "Prod",
			description: "Production cluster",
		});
	});

	it("returns 404 when the cluster does not exist", async () => {
		updateCluster.mockResolvedValue(null);

		const response = await request(app.callback())
			.patch("/clusters/999")
			.send({ name: "Missing" });

		expect(response.status).toBe(404);
		expect(response.body).toEqual({ error: "Cluster not found" });
		expect(updateCluster).toHaveBeenCalledWith(999, { name: "Missing" });
	});

	it("rejects invalid update input", async () => {
		const response = await request(app.callback()).patch("/clusters/1").send({
			apiUrl: "ftp://api.dev.example.com",
		});

		expect(response.status).toBe(400);
		expect(response.body).toEqual({
			error: "Invalid cluster input",
			details: {
				apiUrl:
					'"apiUrl" must be a valid uri with a scheme matching the http|https pattern',
			},
		});
		expect(updateCluster).not.toHaveBeenCalled();
	});
});

describe("DELETE /clusters/:clusterId", () => {
	it("deletes a cluster through the cluster manager service", async () => {
		deleteCluster.mockResolvedValue(true);

		const response = await request(app.callback()).delete("/clusters/1");

		expect(response.status).toBe(204);
		expect(response.body).toEqual({});
		expect(deleteCluster).toHaveBeenCalledWith(1);
	});

	it("returns 404 when the cluster does not exist", async () => {
		deleteCluster.mockResolvedValue(false);

		const response = await request(app.callback()).delete("/clusters/999");

		expect(response.status).toBe(404);
		expect(response.body).toEqual({ error: "Cluster not found" });
		expect(deleteCluster).toHaveBeenCalledWith(999);
	});
});
