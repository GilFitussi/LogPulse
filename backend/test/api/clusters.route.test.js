const request = require("supertest");
const { AppError } = require("../../src/errors/app.error");
const {
	createCluster,
	deleteCluster,
	getClusterById,
	listClusters,
	updateCluster,
} = require("../../src/service/clusterManager.service");
const {
	loginToCluster,
	logoutFromCluster,
} = require("../../src/service/clusterOcLogin.service");

jest.mock("../../src/service/clusterManager.service", () => ({
	createCluster: jest.fn(),
	deleteCluster: jest.fn(),
	getClusterById: jest.fn(),
	listClusters: jest.fn(),
	updateCluster: jest.fn(),
}));

jest.mock("../../src/service/clusterOcLogin.service", () => ({
	loginToCluster: jest.fn(),
	logoutFromCluster: jest.fn(),
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

jest.mock("../../src/service/kubeClient.service", () => ({
	createKubeClient: jest.fn(),
	createKubeConfig: jest.fn(),
}));

const app = require("../../src/app");

beforeEach(() => {
	createCluster.mockReset();
	deleteCluster.mockReset();
	getClusterById.mockReset();
	listClusters.mockReset();
	updateCluster.mockReset();
	loginToCluster.mockReset();
	logoutFromCluster.mockReset();
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

describe("POST /clusters/:clusterId/login", () => {
	it("logs in to a cluster with username and password", async () => {
		const cluster = {
			id: 1,
			name: "Dev",
			apiUrl: "https://api.dev.example.com:6443",
			defaultNamespace: null,
			description: null,
			createdAt: "2026-05-20T10:00:00.000Z",
			updatedAt: "2026-05-20T10:01:00.000Z",
			lastConnectedAt: "2026-05-20T10:01:00.000Z",
			lastConnectionStatus: "connected",
			lastConnectionError: null,
		};
		loginToCluster.mockResolvedValue({
			username: "developer",
			cluster,
		});

		const response = await request(app.callback())
			.post("/clusters/1/login")
			.send({ username: " developer ", password: "secret" });

		expect(response.status).toBe(200);
		expect(response.body).toEqual({ cluster, username: "developer" });
		expect(loginToCluster).toHaveBeenCalledWith(1, {
			loginMethod: "credentials",
			username: "developer",
			password: "secret",
		});
	});

	it("logs in to a cluster with an OpenShift token", async () => {
		const cluster = {
			id: 1,
			name: "Dev",
			apiUrl: "https://api.dev.example.com:6443",
			lastConnectionStatus: "connected",
			lastConnectionError: null,
		};
		loginToCluster.mockResolvedValue({
			username: "token-user",
			cluster,
		});

		const response = await request(app.callback())
			.post("/clusters/1/login")
			.send({ loginMethod: "token", token: " sha256~secret-token " });

		expect(response.status).toBe(200);
		expect(response.body).toEqual({ cluster, username: "token-user" });
		expect(loginToCluster).toHaveBeenCalledWith(1, {
			loginMethod: "token",
			token: "sha256~secret-token",
		});
	});

	it("uses error middleware when logging in to a missing cluster", async () => {
		loginToCluster.mockRejectedValue(
			new AppError("Cluster not found", {
				status: 404,
				code: "CLUSTER_NOT_FOUND",
			}),
		);

		const response = await request(app.callback())
			.post("/clusters/999/login")
			.send({ username: "developer", password: "secret" });

		expect(response.status).toBe(404);
		expect(response.body).toEqual({
			error: "Cluster not found",
			code: "CLUSTER_NOT_FOUND",
		});
		expect(loginToCluster).toHaveBeenCalledWith(999, {
			loginMethod: "credentials",
			username: "developer",
			password: "secret",
		});
	});

	it("returns login errors without credentials", async () => {
		const cluster = {
			id: 1,
			lastConnectedAt: "2026-05-20T10:01:00.000Z",
			lastConnectionStatus: "failed",
			lastConnectionError: "Invalid credentials",
		};
		loginToCluster.mockRejectedValue(
			new AppError("Cluster login failed", {
				status: 401,
				code: "CLUSTER_LOGIN_FAILED",
				details: {
					message: "Invalid credentials",
					cluster,
				},
				action: "Check the cluster API URL and credentials, then try again.",
			}),
		);

		const response = await request(app.callback())
			.post("/clusters/1/login")
			.send({ username: "developer", password: "secret" });

		expect(response.status).toBe(401);
		expect(response.body).toEqual({
			error: "Cluster login failed",
			details: {
				message: "Invalid credentials",
				cluster,
			},
			code: "CLUSTER_LOGIN_FAILED",
			action: "Check the cluster API URL and credentials, then try again.",
		});
		expect(JSON.stringify(response.body)).not.toContain("secret");
	});

	it("rejects missing credentials", async () => {
		const response = await request(app.callback())
			.post("/clusters/1/login")
			.send({ username: "" });

		expect(response.status).toBe(400);
		expect(response.body).toEqual({
			error: "Invalid login input",
			details: {
				username: '"username" is not allowed to be empty',
				password: '"password" is required',
			},
		});
		expect(loginToCluster).not.toHaveBeenCalled();
	});

	it("rejects missing token", async () => {
		const response = await request(app.callback())
			.post("/clusters/1/login")
			.send({ loginMethod: "token", token: "" });

		expect(response.status).toBe(400);
		expect(response.body).toEqual({
			error: "Invalid login input",
			details: {
				token: '"token" is not allowed to be empty',
			},
		});
		expect(loginToCluster).not.toHaveBeenCalled();
	});
});

describe("POST /clusters/:clusterId/logout", () => {
	it("logs out from a cluster", async () => {
		const cluster = {
			id: 1,
			name: "Dev",
			apiUrl: "https://api.dev.example.com:6443",
			lastConnectedAt: "2026-05-20T10:01:00.000Z",
			lastConnectionStatus: "disconnected",
			lastConnectionError: null,
		};
		logoutFromCluster.mockResolvedValue(cluster);

		const response = await request(app.callback()).post("/clusters/1/logout");

		expect(response.status).toBe(200);
		expect(response.body).toEqual({ cluster });
		expect(logoutFromCluster).toHaveBeenCalledWith(1);
	});

	it("uses error middleware when logging out from a missing cluster", async () => {
		logoutFromCluster.mockRejectedValue(
			new AppError("Cluster not found", {
				status: 404,
				code: "CLUSTER_NOT_FOUND",
			}),
		);

		const response = await request(app.callback()).post("/clusters/999/logout");

		expect(response.status).toBe(404);
		expect(response.body).toEqual({
			error: "Cluster not found",
			code: "CLUSTER_NOT_FOUND",
		});
		expect(logoutFromCluster).toHaveBeenCalledWith(999);
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
