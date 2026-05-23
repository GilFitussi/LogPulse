const { getClusterById } = require("../../src/service/clusterManager.service");
const { runOcCommand } = require("../../src/service/ocCommand.service");
const {
	buildLabelSelector,
	isValidDeployment,
	listDeployments,
	listReplicaSetsForDeployment,
} = require("../../src/service/deployments.service");

jest.mock("../../src/service/ocCommand.service", () => ({
	runOcCommand: jest.fn(),
}));

jest.mock("../../src/service/clusterManager.service", () => ({
	getClusterById: jest.fn(),
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
		runOcCommand.mockReset();
		getClusterById.mockReset();
		getClusterById.mockResolvedValue({
			id: 1,
			apiUrl: "https://api.dev.example.com:6443",
		});
	});

	it("lists deployments in the requested namespace", async () => {
		runOcCommand.mockResolvedValue({
			stdout: JSON.stringify({
				items: [
					{
						metadata: { name: "api", labels: { app: "api" } },
						spec: { replicas: 2, selector: { matchLabels: { app: "api" } } },
						status: { readyReplicas: 1, availableReplicas: 1 },
					},
				],
			}),
		});

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
		expect(runOcCommand).toHaveBeenCalledWith([
			"get",
			"deployments",
			"-n",
			"my-project",
			"-o",
			"json",
		]);
	});

	it("lists deployments against the selected cluster", async () => {
		runOcCommand.mockResolvedValue({
			stdout: JSON.stringify({
				items: [
					{
						metadata: { name: "api", labels: { app: "api" } },
						spec: {
							replicas: 2,
							selector: { matchLabels: { app: "api" } },
						},
						status: { readyReplicas: 1, availableReplicas: 1 },
					},
				],
			}),
		});

		await expect(listDeployments(1, "my-project")).resolves.toEqual([
			{
				name: "api",
				labels: { app: "api" },
				selector: "app=api",
				replicas: 2,
				readyReplicas: 1,
				availableReplicas: 1,
			},
		]);
		expect(getClusterById).toHaveBeenCalledWith(1);
		expect(runOcCommand).toHaveBeenCalledWith([
			"get",
			"deployments",
			"-n",
			"my-project",
			"-o",
			"json",
			"--server",
			"https://api.dev.example.com:6443",
		]);
	});

	it("throws when the selected cluster does not exist", async () => {
		getClusterById.mockResolvedValue(null);

		await expect(listDeployments(999, "my-project")).rejects.toMatchObject({
			status: 404,
			message: "Cluster not found",
			code: "CLUSTER_NOT_FOUND",
		});
		expect(runOcCommand).not.toHaveBeenCalled();
	});

	it("wraps Kubernetes client errors", async () => {
		runOcCommand.mockRejectedValue({
			response: { statusCode: 403, body: { message: "forbidden" } },
		});

		await expect(listDeployments("my-project")).rejects.toMatchObject({
			status: 403,
			details: "forbidden",
		});
	});
});

describe("listReplicaSetsForDeployment", () => {
	beforeEach(() => {
		runOcCommand.mockReset();
		getClusterById.mockReset();
		getClusterById.mockResolvedValue({
			id: 1,
			apiUrl: "https://api.dev.example.com:6443",
		});
	});

	it("lists replica sets against the selected cluster", async () => {
		runOcCommand.mockResolvedValue({
			stdout: JSON.stringify({
				items: [
					{
						metadata: {
							uid: "rs-current",
							ownerReferences: [
								{ kind: "Deployment", name: "api", uid: "deployment-uid" },
							],
						},
					},
				],
			}),
		});

		const replicaSets = await listReplicaSetsForDeployment(
			1,
			"my-project",
			"api",
			"deployment-uid",
			"app=api",
		);

		expect(replicaSets).toHaveLength(1);
		expect(replicaSets[0].metadata.uid).toBe("rs-current");
		expect(runOcCommand).toHaveBeenCalledWith([
			"get",
			"replicasets",
			"-n",
			"my-project",
			"-o",
			"json",
			"-l",
			"app=api",
			"--server",
			"https://api.dev.example.com:6443",
		]);
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
		runOcCommand.mockResolvedValue({
			stdout: JSON.stringify({
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
			}),
		});

		await expect(
			listReplicaSetsForDeployment(
				"my-project",
				"api",
				"deployment-uid",
				"app=api",
			),
		).resolves.toEqual([ownedReplicaSet]);
		expect(runOcCommand).toHaveBeenCalledWith([
			"get",
			"replicasets",
			"-n",
			"my-project",
			"-o",
			"json",
			"-l",
			"app=api",
		]);
	});
});
