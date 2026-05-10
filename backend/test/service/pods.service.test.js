const { createKubeClient } = require("../../src/service/kubeClient.service");
const { isValidPod, listPods } = require("../../src/service/pods.service");

jest.mock("../../src/service/kubeClient.service", () => ({
	createKubeClient: jest.fn(),
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
				restartCount: 6,
			},
		]);
		expect(listNamespacedPod).toHaveBeenCalledWith({ namespace: "my-project" });
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

	it("omits restartCount when container status is unavailable", async () => {
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

		await expect(listPods("my-project")).resolves.toEqual([
			{
				name: "pending-pod",
				status: "Pending",
				labels: {},
				restartCount: undefined,
			},
		]);
	});

	it("wraps Kubernetes client errors", async () => {
		createKubeClient.mockResolvedValue({
			listNamespacedPod: jest.fn().mockRejectedValue({
				response: { statusCode: 404, body: { message: "namespace not found" } },
			}),
		});

		await expect(listPods("missing-project")).rejects.toMatchObject({
			status: 404,
			message: "Kubernetes API error",
			details: "namespace not found",
			expose: true,
		});
	});
});
