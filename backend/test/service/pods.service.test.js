const { createKubeClient } = require("../../src/service/kubeClient.service");
const {
	buildLabelSelector,
	getDeployment,
	listReplicaSetsForDeployment,
} = require("../../src/service/deployments.service");
const {
	isValidPod,
	listPods,
	listPodsForDeployment,
} = require("../../src/service/pods.service");

jest.mock("../../src/service/kubeClient.service", () => ({
	createKubeClient: jest.fn(),
}));

jest.mock("../../src/service/deployments.service", () => ({
	buildLabelSelector: jest.fn(),
	getDeployment: jest.fn(),
	listReplicaSetsForDeployment: jest.fn(),
}));

describe("isValidPod", () => {
	it("accepts valid Kubernetes pod names", () => {
		expect(isValidPod("api-123")).toBe(true);
		expect(isValidPod("api.worker-123")).toBe(true);
	});

	it("rejects invalid Kubernetes pod names", () => {
		expect(isValidPod("")).toBe(false);
		expect(isValidPod("Api-123")).toBe(false);
		expect(isValidPod("-api-123")).toBe(false);
		expect(isValidPod("api-123-")).toBe(false);
		expect(isValidPod(undefined)).toBe(false);
	});
});

describe("listPods", () => {
	beforeEach(() => {
		createKubeClient.mockReset();
	});

	it("lists pods in the requested namespace", async () => {
		const listNamespacedPod = jest.fn().mockResolvedValue({
			items: [
				{
					metadata: {
						name: "api-123",
						labels: { app: "api" },
					},
					status: {
						phase: "Running",
						conditions: [{ type: "Ready", status: "True" }],
						initContainerStatuses: [{ restartCount: 1 }],
						containerStatuses: [{ restartCount: 2 }, { restartCount: 3 }],
					},
				},
			],
		});
		createKubeClient.mockResolvedValue({ listNamespacedPod });

		await expect(listPods("my-project")).resolves.toEqual([
			{
				name: "api-123",
				status: "Running",
				labels: { app: "api" },
				ready: true,
				restartCount: 6,
			},
		]);
		expect(listNamespacedPod).toHaveBeenCalledWith({ namespace: "my-project" });
	});

	it("passes a label selector when provided", async () => {
		const listNamespacedPod = jest.fn().mockResolvedValue({ items: [] });
		createKubeClient.mockResolvedValue({ listNamespacedPod });

		await expect(listPods("my-project", "app=api")).resolves.toEqual([]);
		expect(listNamespacedPod).toHaveBeenCalledWith({
			labelSelector: "app=api",
			namespace: "my-project",
		});
	});

	it("handles Kubernetes client responses that wrap the pod list in body", async () => {
		createKubeClient.mockResolvedValue({
			listNamespacedPod: jest.fn().mockResolvedValue({ body: { items: [] } }),
		});

		await expect(listPods("empty-project")).resolves.toEqual([]);
	});

	it("returns an empty list when no pods are available", async () => {
		createKubeClient.mockResolvedValue({
			listNamespacedPod: jest.fn().mockResolvedValue({ items: [] }),
		});

		await expect(listPods("empty-project")).resolves.toEqual([]);
	});

	it("filters inactive pods", async () => {
		createKubeClient.mockResolvedValue({
			listNamespacedPod: jest.fn().mockResolvedValue({
				items: [
					{
						metadata: { name: "active-pod" },
						status: {
							phase: "Running",
							conditions: [{ type: "Ready", status: "True" }],
						},
					},
					{
						metadata: {
							name: "terminating-pod",
							deletionTimestamp: "2026-05-13T00:00:00Z",
						},
						status: { phase: "Running" },
					},
					{
						metadata: { name: "completed-pod" },
						status: { phase: "Succeeded" },
					},
				],
			}),
		});

		await expect(listPods("my-project")).resolves.toEqual([
			{
				name: "active-pod",
				status: "Running",
				labels: {},
				ready: true,
				restartCount: undefined,
			},
		]);
	});

	it("filters pending pods", async () => {
		createKubeClient.mockResolvedValue({
			listNamespacedPod: jest.fn().mockResolvedValue({
				items: [
					{
						metadata: { name: "pending-pod" },
						status: { phase: "Pending" },
					},
				],
			}),
		});

		await expect(listPods("my-project")).resolves.toEqual([]);
	});

	it("wraps Kubernetes client errors", async () => {
		createKubeClient.mockResolvedValue({
			listNamespacedPod: jest.fn().mockRejectedValue({
				response: { statusCode: 404, body: { message: "namespace not found" } },
			}),
		});

		await expect(listPods("missing-project")).rejects.toMatchObject({
			status: 404,
			message: "Pod not found",
			details: "namespace not found",
			code: "POD_NOT_FOUND",
			expose: true,
		});
	});
});

describe("listPodsForDeployment", () => {
	beforeEach(() => {
		createKubeClient.mockReset();
		getDeployment.mockReset();
		buildLabelSelector.mockReset();
		listReplicaSetsForDeployment.mockReset();
	});

	it("lists pods owned by the deployment replica sets", async () => {
		const deployment = {
			metadata: { uid: "deployment-uid" },
			spec: { selector: { matchLabels: { app: "api" } } },
		};
		const listNamespacedPod = jest.fn().mockResolvedValue({
			items: [
				{
					metadata: {
						name: "api-current",
						ownerReferences: [{ kind: "ReplicaSet", uid: "rs-current" }],
					},
					status: {
						phase: "Running",
						conditions: [{ type: "Ready", status: "True" }],
					},
				},
				{
					metadata: {
						name: "api-terminating",
						deletionTimestamp: "2026-05-13T00:00:00Z",
						ownerReferences: [{ kind: "ReplicaSet", uid: "rs-current" }],
					},
					status: { phase: "Running" },
				},
				{
					metadata: {
						name: "api-unrelated",
						ownerReferences: [{ kind: "ReplicaSet", uid: "rs-other" }],
					},
					status: { phase: "Running" },
				},
			],
		});
		getDeployment.mockResolvedValue(deployment);
		buildLabelSelector.mockReturnValue("app=api");
		listReplicaSetsForDeployment.mockResolvedValue([
			{ metadata: { uid: "rs-current" } },
		]);
		createKubeClient.mockResolvedValue({ listNamespacedPod });

		await expect(listPodsForDeployment("my-project", "api")).resolves.toEqual([
			{
				name: "api-current",
				status: "Running",
				labels: {},
				ready: true,
				restartCount: undefined,
			},
		]);
		expect(getDeployment).toHaveBeenCalledWith("my-project", "api");
		expect(buildLabelSelector).toHaveBeenCalledWith(deployment.spec.selector);
		expect(listReplicaSetsForDeployment).toHaveBeenCalledWith(
			"my-project",
			"api",
			"deployment-uid",
			"app=api",
		);
		expect(listNamespacedPod).toHaveBeenCalledWith({
			labelSelector: "app=api",
			namespace: "my-project",
		});
	});

	it("returns an empty list when a deployment has no selector", async () => {
		getDeployment.mockResolvedValue({ spec: {} });
		buildLabelSelector.mockReturnValue("");

		await expect(listPodsForDeployment("my-project", "api")).resolves.toEqual(
			[],
		);
		expect(createKubeClient).not.toHaveBeenCalled();
	});

	it("returns an empty list when the deployment has no replica sets", async () => {
		getDeployment.mockResolvedValue({
			metadata: { uid: "deployment-uid" },
			spec: { selector: { matchLabels: { app: "api" } } },
		});
		buildLabelSelector.mockReturnValue("app=api");
		listReplicaSetsForDeployment.mockResolvedValue([]);

		await expect(listPodsForDeployment("my-project", "api")).resolves.toEqual(
			[],
		);
		expect(createKubeClient).not.toHaveBeenCalled();
	});
});
