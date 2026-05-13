jest.mock("@kubernetes/client-node", () => ({
	AppsV1Api: class AppsV1Api {},
}));

const k8s = require("@kubernetes/client-node");
const { createKubeClient } = require("../../src/service/kubeClient.service");
const {
	buildLabelSelector,
	isValidDeployment,
	listDeployments,
	listReplicaSetsForDeployment,
} = require("../../src/service/deployments.service");

jest.mock("../../src/service/kubeClient.service", () => ({
	createKubeClient: jest.fn(),
}));

describe("isValidDeployment", () => {
	it("accepts valid Kubernetes deployment names", () => {
		expect(isValidDeployment("api")).toBe(true);
		expect(isValidDeployment("api-worker-123")).toBe(true);
	});

	it("rejects invalid Kubernetes deployment names", () => {
		expect(isValidDeployment("")).toBe(false);
		expect(isValidDeployment("Api")).toBe(false);
		expect(isValidDeployment("-api")).toBe(false);
		expect(isValidDeployment("api-")).toBe(false);
		expect(isValidDeployment(undefined)).toBe(false);
	});
});

describe("buildLabelSelector", () => {
	it("builds Kubernetes label selectors from match labels and expressions", () => {
		expect(
			buildLabelSelector({
				matchLabels: { app: "api", tier: "backend" },
				matchExpressions: [
					{ key: "track", operator: "In", values: ["stable", "canary"] },
					{ key: "debug", operator: "DoesNotExist" },
				],
			}),
		).toBe("app=api,tier=backend,track in (stable,canary),!debug");
	});
});

describe("listDeployments", () => {
	beforeEach(() => {
		createKubeClient.mockReset();
	});

	it("lists deployments in the requested namespace", async () => {
		const listNamespacedDeployment = jest.fn().mockResolvedValue({
			items: [
				{
					metadata: { name: "api", labels: { app: "api" } },
					spec: { replicas: 2, selector: { matchLabels: { app: "api" } } },
					status: { readyReplicas: 1, availableReplicas: 1 },
				},
			],
		});
		createKubeClient.mockResolvedValue({ listNamespacedDeployment });

		await expect(listDeployments("my-project")).resolves.toEqual([
			{
				name: "api",
				labels: { app: "api" },
				selector: "app=api",
				replicas: 2,
				readyReplicas: 1,
				availableReplicas: 1,
			},
		]);
		expect(createKubeClient).toHaveBeenCalledWith(k8s.AppsV1Api);
		expect(listNamespacedDeployment).toHaveBeenCalledWith({
			namespace: "my-project",
		});
	});

	it("wraps Kubernetes client errors", async () => {
		createKubeClient.mockResolvedValue({
			listNamespacedDeployment: jest.fn().mockRejectedValue({
				response: { statusCode: 403, body: { message: "forbidden" } },
			}),
		});

		await expect(listDeployments("my-project")).rejects.toMatchObject({
			status: 403,
			details: "forbidden",
		});
	});
});

describe("listReplicaSetsForDeployment", () => {
	beforeEach(() => {
		createKubeClient.mockReset();
	});

	it("lists only replica sets owned by the selected deployment", async () => {
		const ownedReplicaSet = {
			metadata: {
				uid: "rs-current",
				ownerReferences: [
					{ kind: "Deployment", name: "api", uid: "deployment-uid" },
				],
			},
		};
		const listNamespacedReplicaSet = jest.fn().mockResolvedValue({
			items: [
				ownedReplicaSet,
				{
					metadata: {
						uid: "rs-other",
						ownerReferences: [
							{ kind: "Deployment", name: "other", uid: "other-uid" },
						],
					},
				},
			],
		});
		createKubeClient.mockResolvedValue({ listNamespacedReplicaSet });

		await expect(
			listReplicaSetsForDeployment(
				"my-project",
				"api",
				"deployment-uid",
				"app=api",
			),
		).resolves.toEqual([ownedReplicaSet]);
		expect(createKubeClient).toHaveBeenCalledWith(k8s.AppsV1Api);
		expect(listNamespacedReplicaSet).toHaveBeenCalledWith({
			labelSelector: "app=api",
			namespace: "my-project",
		});
	});
});
