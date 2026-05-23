const request = require("supertest");
const {
	isValidNamespace,
	listNamespaces,
} = require("../../src/service/namespaces.service");
const {
	isValidDeployment,
	listDeploymentsFromCurrentContext: listDeployments,
} = require("../../src/service/deployments.service");
const {
	listPodsFromCurrentContext: listPods,
	listPodsForDeploymentFromCurrentContext: listPodsForDeployment,
} = require("../../src/service/pods.service");
const {
	KubernetesApiError,
	OpenShiftAuthError,
} = require("../../src/errors/app.error");

jest.mock("../../src/service/namespaces.service", () => ({
	isValidNamespace: jest.fn(() => true),
	listNamespaces: jest.fn(),
}));

jest.mock("../../src/service/deployments.service", () => ({
	isValidDeployment: jest.fn(() => true),
	listDeploymentsFromCurrentContext: jest.fn(),
}));

jest.mock("../../src/service/pods.service", () => ({
	listPodsFromCurrentContext: jest.fn(),
	listPodsForDeploymentFromCurrentContext: jest.fn(),
}));

jest.mock("../../src/service/kubeClient.service", () => ({
	createKubeClient: jest.fn(),
	createKubeConfig: jest.fn(),
}));

const app = require("../../src/app");

beforeEach(() => {
	listNamespaces.mockReset();
	isValidNamespace.mockReset();
	isValidNamespace.mockReturnValue(true);
	listDeployments.mockReset();
	isValidDeployment.mockReset();
	isValidDeployment.mockReturnValue(true);
	listPods.mockReset();
	listPodsForDeployment.mockReset();
});

describe("GET /api/namespaces", () => {
	it("returns namespace names from the namespace service", async () => {
		listNamespaces.mockResolvedValue(["dev", "prod"]);

		const response = await request(app.callback()).get("/api/namespaces");

		expect(response.status).toBe(200);
		expect(response.body).toMatchObject({ namespaces: ["dev", "prod"] });
		expect(listNamespaces).toHaveBeenCalledTimes(1);
	});

	it("handles authentication failures through shared error middleware", async () => {
		listNamespaces.mockRejectedValue(
			new OpenShiftAuthError(
				"Unable to create Kubernetes client without an oc token",
			),
		);

		const response = await request(app.callback()).get("/api/namespaces");

		expect(response.status).toBe(401);
		expect(response.body).toMatchObject({
			error: "OpenShift authentication failed",
			details: "Unable to create Kubernetes client without an oc token",
		});
	});

	it("handles Kubernetes API authentication errors through shared error middleware", async () => {
		listNamespaces.mockRejectedValue(
			new OpenShiftAuthError("namespaces is forbidden", 403),
		);

		const response = await request(app.callback()).get("/api/namespaces");

		expect(response.status).toBe(403);
		expect(response.body).toMatchObject({
			error: "OpenShift authentication failed",
			details: "namespaces is forbidden",
		});
	});

	it("handles Kubernetes API errors through shared error middleware", async () => {
		listNamespaces.mockRejectedValue(
			new KubernetesApiError("apiserver unavailable", 500),
		);

		const response = await request(app.callback()).get("/api/namespaces");

		expect(response.status).toBe(500);
		expect(response.body).toMatchObject({
			error: "Kubernetes API error",
			details: "apiserver unavailable",
		});
	});
});

describe("GET /api/namespaces/:namespace/deployments", () => {
	it("returns deployments from the deployments service", async () => {
		const deployments = [
			{
				name: "api",
				selector: "app=api",
				replicas: 2,
				readyReplicas: 1,
			},
		];
		listDeployments.mockResolvedValue(deployments);

		const response = await request(app.callback()).get(
			"/api/namespaces/my-project/deployments",
		);

		expect(response.status).toBe(200);
		expect(response.body).toMatchObject({ deployments });
		expect(isValidNamespace).toHaveBeenCalledWith("my-project");
		expect(listDeployments).toHaveBeenCalledWith("my-project");
	});

	it("rejects invalid namespace params before calling the deployments service", async () => {
		isValidNamespace.mockReturnValue(false);

		const response = await request(app.callback()).get(
			"/api/namespaces/Invalid_Namespace/deployments",
		);

		expect(response.status).toBe(400);
		expect(response.body.error).toBe("Invalid namespace");
		expect(listDeployments).not.toHaveBeenCalled();
	});
});

describe("GET /api/namespaces/:namespace/pods", () => {
	it("returns pods from the pods service", async () => {
		const pods = [
			{
				name: "api-123",
				status: "Running",
				labels: { app: "api" },
				restartCount: 3,
			},
		];
		listPods.mockResolvedValue(pods);

		const response = await request(app.callback()).get(
			"/api/namespaces/my-project/pods",
		);

		expect(response.status).toBe(200);
		expect(response.body).toMatchObject({ pods });
		expect(isValidNamespace).toHaveBeenCalledWith("my-project");
		expect(listPods).toHaveBeenCalledWith("my-project");
	});

	it("handles an empty pod list from the pods service", async () => {
		listPods.mockResolvedValue([]);

		const response = await request(app.callback()).get(
			"/api/namespaces/empty-project/pods",
		);

		expect(response.status).toBe(200);
		expect(response.body).toMatchObject({ pods: [] });
	});

	it("rejects invalid namespace params before calling the pods service", async () => {
		isValidNamespace.mockReturnValue(false);

		const response = await request(app.callback()).get(
			"/api/namespaces/Invalid_Namespace/pods",
		);

		expect(response.status).toBe(400);
		expect(response.body.error).toBe("Invalid namespace");
		expect(listPods).not.toHaveBeenCalled();
	});

	it("handles pods service errors through shared error middleware", async () => {
		listPods.mockRejectedValue(new KubernetesApiError("pods unavailable", 503));

		const response = await request(app.callback()).get(
			"/api/namespaces/my-project/pods",
		);

		expect(response.status).toBe(503);
		expect(response.body).toMatchObject({
			error: "Kubernetes API error",
			details: "pods unavailable",
		});
	});
});

describe("GET /api/namespaces/:namespace/deployments/:deployment/pods", () => {
	it("returns pods for a deployment", async () => {
		const pods = [{ name: "api-123", status: "Running" }];
		listPodsForDeployment.mockResolvedValue(pods);

		const response = await request(app.callback()).get(
			"/api/namespaces/my-project/deployments/api/pods",
		);

		expect(response.status).toBe(200);
		expect(response.body).toMatchObject({ pods });
		expect(isValidNamespace).toHaveBeenCalledWith("my-project");
		expect(isValidDeployment).toHaveBeenCalledWith("api");
		expect(listPodsForDeployment).toHaveBeenCalledWith("my-project", "api");
	});

	it("rejects invalid deployment params", async () => {
		isValidDeployment.mockReturnValue(false);

		const response = await request(app.callback()).get(
			"/api/namespaces/my-project/deployments/Invalid_Deployment/pods",
		);

		expect(response.status).toBe(400);
		expect(response.body.error).toBe("Invalid deployment");
		expect(listPodsForDeployment).not.toHaveBeenCalled();
	});
});
