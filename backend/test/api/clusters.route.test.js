const request = require("supertest");
const {
	createCluster,
	listClusters,
} = require("../../src/service/clusterManager.service");

jest.mock("../../src/service/clusterManager.service", () => ({
	createCluster: jest.fn(),
	listClusters: jest.fn(),
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
	listClusters.mockReset();
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
				name: "name is required",
				apiUrl: "apiUrl is required",
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
				apiUrl: "apiUrl must be a valid http or https URL",
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
