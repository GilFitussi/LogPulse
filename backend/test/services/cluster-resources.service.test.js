const { getClusterById } = require("../../src/service/clusterManager.service");
const { runOcCommand } = require("../../src/service/ocCommand.service");
const {
	listClusterDeployments,
	listClusterNamespaces,
	listClusterPods,
	listClusterPodsForDeployment,
} = require("../../src/services/cluster-resources.service");

jest.mock("../../src/service/clusterManager.service", () => ({
	getClusterById: jest.fn(),
}));

jest.mock("../../src/service/ocCommand.service", () => ({
	getOcErrorMessage: jest.fn((error) => error.stderr || error.message),
	isOcNotInstalledError: jest.fn((error) => error.code === "ENOENT"),
	runOcCommand: jest.fn(),
}));

const cluster = {
	id: 1,
	name: "Dev",
	apiUrl: "https://api.dev.example.com:6443",
};

beforeEach(() => {
	getClusterById.mockResolvedValue(cluster);
	runOcCommand.mockReset();
});

describe("cluster resource service", () => {
	it("lists normalized namespaces from the selected cluster", async () => {
		runOcCommand.mockResolvedValue({
			stdout: JSON.stringify({
				items: [
					{
						metadata: { name: "dev", labels: { team: "core" } },
						status: { phase: "Active" },
					},
				],
			}),
		});

		await expect(listClusterNamespaces(1)).resolves.toEqual([
			{
				name: "dev",
				status: "Active",
				labels: { team: "core" },
			},
		]);
		expect(getClusterById).toHaveBeenCalledWith(1);
		expect(runOcCommand).toHaveBeenCalledWith([
			"--server",
			cluster.apiUrl,
			"get",
			"namespaces",
			"--output",
			"json",
		]);
	});

	it("lists normalized deployments from a namespace", async () => {
		runOcCommand.mockResolvedValue({
			stdout: JSON.stringify({
				items: [
					{
						metadata: {
							name: "api",
							namespace: "dev",
							labels: { app: "api" },
						},
						spec: {
							replicas: 2,
							selector: { matchLabels: { app: "api" } },
						},
						status: { readyReplicas: 1, availableReplicas: 1 },
					},
				],
			}),
		});

		await expect(listClusterDeployments(1, "dev")).resolves.toEqual([
			{
				name: "api",
				namespace: "dev",
				labels: { app: "api" },
				selector: "app=api",
				replicas: 2,
				readyReplicas: 1,
				availableReplicas: 1,
				updatedReplicas: 0,
			},
		]);
		expect(runOcCommand).toHaveBeenCalledWith([
			"--server",
			cluster.apiUrl,
			"get",
			"deployments",
			"--namespace",
			"dev",
			"--output",
			"json",
		]);
	});

	it("lists normalized pods from a namespace", async () => {
		runOcCommand.mockResolvedValue({
			stdout: JSON.stringify({
				items: [
					{
						metadata: {
							name: "api-123",
							namespace: "dev",
							creationTimestamp: "2026-01-01T00:00:00Z",
						},
						spec: { nodeName: "worker-1" },
						status: {
							phase: "Running",
							conditions: [{ type: "Ready", status: "True" }],
							containerStatuses: [{ restartCount: 2 }],
						},
					},
				],
			}),
		});

		await expect(listClusterPods(1, "dev")).resolves.toEqual([
			{
				name: "api-123",
				namespace: "dev",
				status: "Running",
				labels: {},
				ready: true,
				restartCount: 2,
				nodeName: "worker-1",
				createdAt: "2026-01-01T00:00:00Z",
			},
		]);
	});

	it("lists pods owned by the selected deployment", async () => {
		runOcCommand
			.mockResolvedValueOnce({
				stdout: JSON.stringify({
					metadata: { name: "api", uid: "deployment-uid" },
					spec: { selector: { matchLabels: { app: "api" } } },
				}),
			})
			.mockResolvedValueOnce({
				stdout: JSON.stringify({
					items: [
						{
							metadata: {
								uid: "rs-uid",
								ownerReferences: [
									{
										kind: "Deployment",
										name: "api",
										uid: "deployment-uid",
									},
								],
							},
						},
					],
				}),
			})
			.mockResolvedValueOnce({
				stdout: JSON.stringify({
					items: [
						{
							metadata: {
								name: "api-123",
								ownerReferences: [{ kind: "ReplicaSet", uid: "rs-uid" }],
							},
							status: { phase: "Running" },
						},
						{
							metadata: {
								name: "other-123",
								ownerReferences: [{ kind: "ReplicaSet", uid: "other-rs" }],
							},
							status: { phase: "Running" },
						},
					],
				}),
			});

		const pods = await listClusterPodsForDeployment(1, "dev", "api");

		expect(pods.map((pod) => pod.name)).toEqual(["api-123"]);
		expect(runOcCommand).toHaveBeenNthCalledWith(2, [
			"--server",
			cluster.apiUrl,
			"get",
			"replicasets",
			"--namespace",
			"dev",
			"--selector",
			"app=api",
			"--output",
			"json",
		]);
	});

	it("rejects unknown cluster ids", async () => {
		getClusterById.mockResolvedValue(null);

		await expect(listClusterNamespaces(999)).rejects.toMatchObject({
			status: 404,
			code: "CLUSTER_NOT_FOUND",
		});
		expect(runOcCommand).not.toHaveBeenCalled();
	});
});
