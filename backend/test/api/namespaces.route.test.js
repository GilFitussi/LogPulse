const request = require("supertest");
const {
	isValidNamespace,
	listNamespacesFromCurrentContext,
} = require("../../src/service/namespaces.service");
const {
	isValidDeployment,
	listDeploymentsFromCurrentContext,
} = require("../../src/service/deployments.service");
const {
	listPodsFromCurrentContext,
	listPodsForDeploymentFromCurrentContext,
} = require("../../src/service/pods.service");
const {
	KubernetesApiError,
	OpenShiftAuthError,
} = require("../../src/errors/app.error");

jest.mock("@kubernetes/client-node", () => ({
	AppsV1Api: class AppsV1Api {},
	CoreV1Api: class CoreV1Api {},
}));

jest.mock("../../src/service/namespaces.service", () => ({
	isValidNamespace: jest.fn(() => true),
	listNamespacesFromCurrentContext: jest.fn(),
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
	listNamespacesFromCurrentContext.mockReset();
	isValidNamespace.mockReset();
	isValidNamespace.mockReturnValue(true);
	listDeploymentsFromCurrentContext.mockReset();
	isValidDeployment.mockReset();
	isValidDeployment.mockReturnValue(true);
	listPodsFromCurrentContext.mockReset();
	listPodsForDeploymentFromCurrentContext.mockReset();
});

describe("GET /api/namespaces", () => {
	it("returns namespace names from the namespace service", async () => {
		listNamespacesFromCurrentContext.mockResolvedValue(["dev", "prod"]);

		const response = await request(app.callback()).get("/api/namespaces");

		expect(response.status).toBe(200);
		expect(response.body).toMatchObject({ namespaces: ["dev", "prod"] });
		expect(listNamespacesFromCurrentContext).toHaveBeenCalledTimes(1);
	});

	it("handles authentication failures through shared error middleware", async () => {
		listNamespacesFromCurrentContext.mockRejectedValue(
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
		listNamespacesFromCurrentContext.mockRejectedValue(
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
		listNamespacesFromCurrentContext.mockRejectedValue(
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
		listDeploymentsFromCurrentContext.mockResolvedValue(deployments);

		const response = await request(app.callback()).get(
			"/api/namespaces/my-project/deployments",
		);

		expect(response.status).toBe(200);
		expect(response.body).toMatchObject({ deployments });
		expect(isValidNamespace).toHaveBeenCalledWith("my-project");
		expect(listDeploymentsFromCurrentContext).toHaveBeenCalledWith("my-project");
	});

	it("rejects invalid namespace params before calling the deployments service", async () => {
		isValidNamespace.mockReturnValue(false);

		const response = await request(app.callback()).get(
			"/api/namespaces/Invalid_Namespace/deployments",
		);

		expect(response.status).toBe(400);
		expect(response.body.error).toBe("Invalid namespace");
		expect(listDeploymentsFromCurrentContext).not.toHaveBeenCalled();
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
		listPodsFromCurrentContext.mockResolvedValue(pods);

		const response = await request(app.callback()).get(
			"/api/namespaces/my-project/pods",
		);

		expect(response.status).toBe(200);
		expect(response.body).toMatchObject({ pods });
		expect(isValidNamespace).toHaveBeenCalledWith("my-project");
		expect(listPodsFromCurrentContext).toHaveBeenCalledWith("my-project");
	});

	it("handles an empty pod list from the pods service", async () => {
		listPodsFromCurrentContext.mockResolvedValue([]);

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
		expect(listPodsFromCurrentContext).not.toHaveBeenCalled();
	});

	it("handles pods service errors through shared error middleware", async () => {
		listPodsFromCurrentContext.mockRejectedValue(new KubernetesApiError("pods unavailable", 503));

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
		listPodsForDeploymentFromCurrentContext.mockResolvedValue(pods);

		const response = await request(app.callback()).get(
			"/api/namespaces/my-project/deployments/api/pods",
		);

		expect(response.status).toBe(200);
		expect(response.body).toMatchObject({ pods });
		expect(isValidNamespace).toHaveBeenCalledWith("my-project");
		expect(isValidDeployment).toHaveBeenCalledWith("api");
		expect(listPodsForDeploymentFromCurrentContext).toHaveBeenCalledWith("my-project", "api");
	});

	it("rejects invalid deployment params", async () => {
		isValidDeployment.mockReturnValue(false);

		const response = await request(app.callback()).get(
			"/api/namespaces/my-project/deployments/Invalid_Deployment/pods",
		);

		expect(response.status).toBe(400);
		expect(response.body.error).toBe("Invalid deployment");
		expect(listPodsForDeploymentFromCurrentContext).not.toHaveBeenCalled();
	});
});
