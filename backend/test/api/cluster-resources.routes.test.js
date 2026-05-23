const request = require("supertest");
const { isValidNamespace } = require("../../src/service/namespaces.service");
const { isValidDeployment } = require("../../src/service/deployments.service");
const { getClusterById } = require("../../src/service/clusterManager.service");
const {
	listClusterDeployments,
	listClusterNamespaces,
	listClusterPods,
	listClusterPodsForDeployment,
} = require("../../src/services/cluster-resources.service");

jest.mock("../../src/service/namespaces.service", () => ({
	isValidNamespace: jest.fn(() => true),
}));

jest.mock("../../src/service/deployments.service", () => ({
	isValidDeployment: jest.fn(() => true),
}));

jest.mock("../../src/service/pods.service", () => ({
	isValidPod: jest.fn(() => true),
}));

jest.mock("../../src/services/cluster-resources.service", () => ({
	listClusterDeployments: jest.fn(),
	listClusterNamespaces: jest.fn(),
	listClusterPods: jest.fn(),
	listClusterPodsForDeployment: jest.fn(),
}));

jest.mock("../../src/service/clusterManager.service", () => ({
	getClusterById: jest.fn(),
}));

const app = require("../../src/app");

const cluster = {
	id: 1,
	name: "Dev",
	apiUrl: "https://api.dev.example.com:6443",
};

beforeEach(() => {
	getClusterById.mockReset();
	getClusterById.mockResolvedValue(cluster);
	listClusterNamespaces.mockReset();
	listClusterDeployments.mockReset();
	listClusterPods.mockReset();
	listClusterPodsForDeployment.mockReset();
	isValidNamespace.mockReset();
	isValidNamespace.mockReturnValue(true);
	isValidDeployment.mockReset();
	isValidDeployment.mockReturnValue(true);
});

describe("GET /api/clusters/:clusterId/namespaces", () => {
	it("returns namespace names for the selected cluster", async () => {
		listClusterNamespaces.mockResolvedValue(["dev", "prod"]);

		const response = await request(app.callback()).get(
			"/api/clusters/1/namespaces",
		);

		expect(response.status).toBe(200);
		expect(response.body).toEqual({ namespaces: ["dev", "prod"] });
		expect(getClusterById).toHaveBeenCalledWith(1);
		expect(listClusterNamespaces).toHaveBeenCalledWith(1);
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
});

describe("GET /api/clusters/:clusterId/namespaces/:namespace/deployments", () => {
	it("returns deployments from the deployments service", async () => {
		const deployments = [{ name: "api", selector: "app=api" }];
		listClusterDeployments.mockResolvedValue(deployments);

		const response = await request(app.callback()).get(
			"/api/clusters/1/namespaces/my-project/deployments",
		);

		expect(response.status).toBe(200);
		expect(response.body).toEqual({ deployments });
		expect(isValidNamespace).toHaveBeenCalledWith("my-project");
		expect(listClusterDeployments).toHaveBeenCalledWith(1, "my-project");
	});

	it("rejects invalid namespace params", async () => {
		isValidNamespace.mockReturnValue(false);

		const response = await request(app.callback()).get(
			"/api/clusters/1/namespaces/Invalid_Namespace/deployments",
		);

		expect(response.status).toBe(400);
		expect(response.body.error).toBe("Invalid namespace");
		expect(listClusterDeployments).not.toHaveBeenCalled();
	});
});

describe("GET /api/clusters/:clusterId/namespaces/:namespace/pods", () => {
	it("returns pods from the pods service", async () => {
		const pods = [{ name: "api-123", status: "Running" }];
		listClusterPods.mockResolvedValue(pods);

		const response = await request(app.callback()).get(
			"/api/clusters/1/namespaces/my-project/pods",
		);

		expect(response.status).toBe(200);
		expect(response.body).toEqual({ pods });
		expect(isValidNamespace).toHaveBeenCalledWith("my-project");
		expect(listClusterPods).toHaveBeenCalledWith(1, "my-project");
	});
});

describe("GET /api/clusters/:clusterId/namespaces/:namespace/deployments/:deployment/pods", () => {
	it("returns pods for a deployment", async () => {
		const pods = [{ name: "api-123", status: "Running" }];
		listClusterPodsForDeployment.mockResolvedValue(pods);

		const response = await request(app.callback()).get(
			"/api/clusters/1/namespaces/my-project/deployments/api/pods",
		);

		expect(response.status).toBe(200);
		expect(response.body).toEqual({ pods });
		expect(isValidNamespace).toHaveBeenCalledWith("my-project");
		expect(isValidDeployment).toHaveBeenCalledWith("api");
		expect(listClusterPodsForDeployment).toHaveBeenCalledWith(
			1,
			"my-project",
			"api",
		);
	});

	it("rejects invalid deployment params", async () => {
		isValidDeployment.mockReturnValue(false);

		const response = await request(app.callback()).get(
			"/api/clusters/1/namespaces/my-project/deployments/Invalid_Deployment/pods",
		);

		expect(response.status).toBe(400);
		expect(response.body.error).toBe("Invalid deployment");
		expect(listClusterPodsForDeployment).not.toHaveBeenCalled();
	});
});
