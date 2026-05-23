const request = require("supertest");
const {
	isValidNamespace,
	listNamespaces,
} = require("../../src/service/namespaces.service");
const {
	isValidDeployment,
	listDeployments,
} = require("../../src/service/deployments.service");
const {
	listPods,
	listPodsForDeployment,
} = require("../../src/service/pods.service");
const { getClusterById } = require("../../src/service/clusterManager.service");

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

jest.mock("../../src/service/clusterManager.service", () => ({
	getClusterById: jest.fn(),
}));

jest.mock("../../src/service/kubeClient.service", () => ({
	createKubeClient: jest.fn(),
	createKubeConfig: jest.fn(),
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
	listNamespaces.mockReset();
	isValidNamespace.mockReset();
	isValidNamespace.mockReturnValue(true);
	listDeployments.mockReset();
	isValidDeployment.mockReset();
	isValidDeployment.mockReturnValue(true);
	listPods.mockReset();
	listPodsForDeployment.mockReset();
});

describe("GET /api/clusters/:clusterId/namespaces", () => {
	it("returns namespace names for the selected cluster", async () => {
		listNamespaces.mockResolvedValue(["dev", "prod"]);

		const response = await request(app.callback()).get(
			"/api/clusters/1/namespaces",
		);

		expect(response.status).toBe(200);
		expect(response.body).toEqual({ namespaces: ["dev", "prod"] });
		expect(getClusterById).toHaveBeenCalledWith(1);
		expect(listNamespaces).toHaveBeenCalledWith(1);
	});

	it("returns 404 when the cluster does not exist", async () => {
		getClusterById.mockResolvedValue(null);

		const response = await request(app.callback()).get(
			"/api/clusters/999/namespaces",
		);

		expect(response.status).toBe(404);
		expect(response.body).toEqual({ error: "Cluster not found" });
		expect(listNamespaces).not.toHaveBeenCalled();
	});
});

describe("GET /api/clusters/:clusterId/namespaces/:namespace/deployments", () => {
	it("returns deployments from the deployments service", async () => {
		const deployments = [{ name: "api", selector: "app=api" }];
		listDeployments.mockResolvedValue(deployments);

		const response = await request(app.callback()).get(
			"/api/clusters/1/namespaces/my-project/deployments",
		);

		expect(response.status).toBe(200);
		expect(response.body).toEqual({ deployments });
		expect(isValidNamespace).toHaveBeenCalledWith("my-project");
		expect(listDeployments).toHaveBeenCalledWith(1, "my-project");
	});

	it("rejects invalid namespace params", async () => {
		isValidNamespace.mockReturnValue(false);

		const response = await request(app.callback()).get(
			"/api/clusters/1/namespaces/Invalid_Namespace/deployments",
		);

		expect(response.status).toBe(400);
		expect(response.body.error).toBe("Invalid namespace");
		expect(listDeployments).not.toHaveBeenCalled();
	});
});

describe("GET /api/clusters/:clusterId/namespaces/:namespace/pods", () => {
	it("returns pods from the pods service", async () => {
		const pods = [{ name: "api-123", status: "Running" }];
		listPods.mockResolvedValue(pods);

		const response = await request(app.callback()).get(
			"/api/clusters/1/namespaces/my-project/pods",
		);

		expect(response.status).toBe(200);
		expect(response.body).toEqual({ pods });
		expect(isValidNamespace).toHaveBeenCalledWith("my-project");
		expect(listPods).toHaveBeenCalledWith(1, "my-project");
	});
});

describe("GET /api/clusters/:clusterId/namespaces/:namespace/deployments/:deployment/pods", () => {
	it("returns pods for a deployment", async () => {
		const pods = [{ name: "api-123", status: "Running" }];
		listPodsForDeployment.mockResolvedValue(pods);

		const response = await request(app.callback()).get(
			"/api/clusters/1/namespaces/my-project/deployments/api/pods",
		);

		expect(response.status).toBe(200);
		expect(response.body).toEqual({ pods });
		expect(isValidNamespace).toHaveBeenCalledWith("my-project");
		expect(isValidDeployment).toHaveBeenCalledWith("api");
		expect(listPodsForDeployment).toHaveBeenCalledWith(1, "my-project", "api");
	});

	it("rejects invalid deployment params", async () => {
		isValidDeployment.mockReturnValue(false);

		const response = await request(app.callback()).get(
			"/api/clusters/1/namespaces/my-project/deployments/Invalid_Deployment/pods",
		);

		expect(response.status).toBe(400);
		expect(response.body.error).toBe("Invalid deployment");
		expect(listPodsForDeployment).not.toHaveBeenCalled();
	});
});
