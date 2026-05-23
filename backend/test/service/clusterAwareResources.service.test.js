const cluster = {
	id: 1,
	apiUrl: "https://api.dev.example.com:6443",
};

function loadClusterAwareServices() {
	jest.resetModules();

	jest.doMock("../../src/service/clusterManager.service", () => ({
		getClusterById: jest.fn().mockResolvedValue(cluster),
	}));
	jest.doMock("../../src/service/ocCommand.service", () => ({
		getOcErrorMessage: jest.fn((error) => error?.stderr || error?.message),
		isOcNotInstalledError: jest.fn((error) => error?.code === "ENOENT"),
		runOcCommand: jest.fn(),
	}));
	jest.doMock("@kubernetes/client-node", () => ({
		AppsV1Api: class AppsV1Api {},
		CoreV1Api: class CoreV1Api {},
	}));
	jest.doMock("../../src/service/kubeClient.service", () => ({
		createKubeClient: jest.fn(),
		createKubeConfig: jest.fn(),
	}));

	return {
		clusterManager: require("../../src/service/clusterManager.service"),
		ocCommand: require("../../src/service/ocCommand.service"),
		namespaces: require("../../src/service/namespaces.service"),
		deployments: require("../../src/service/deployments.service"),
		pods: require("../../src/service/pods.service"),
	};
}

describe("cluster-aware resource services", () => {
	afterEach(() => {
		jest.dontMock("../../src/service/clusterManager.service");
		jest.dontMock("../../src/service/ocCommand.service");
		jest.dontMock("../../src/service/kubeClient.service");
		jest.dontMock("@kubernetes/client-node");
	});

	it("validates clusterId and scopes namespace oc commands to the cluster server", async () => {
		const { clusterManager, namespaces, ocCommand } =
			loadClusterAwareServices();
		ocCommand.runOcCommand.mockResolvedValue({
			stdout: "dev\nprod\n",
			stderr: "",
		});

		await expect(namespaces.listNamespaces(1)).resolves.toEqual([
			"dev",
			"prod",
		]);

		expect(clusterManager.getClusterById).toHaveBeenCalledWith(1);
		expect(ocCommand.runOcCommand).toHaveBeenCalledWith([
			"projects",
			"-q",
			"--server",
			cluster.apiUrl,
		]);
	});

	it("lists deployments from the selected cluster without persisting resources", async () => {
		const { deployments, ocCommand } = loadClusterAwareServices();
		ocCommand.runOcCommand.mockResolvedValue({
			stdout: JSON.stringify({
				items: [
					{
						metadata: { name: "api", labels: { app: "api" } },
						spec: { replicas: 2, selector: { matchLabels: { app: "api" } } },
						status: { readyReplicas: 1, availableReplicas: 1 },
					},
				],
			}),
			stderr: "",
		});

		await expect(deployments.listDeployments(1, "dev")).resolves.toEqual([
			{
				name: "api",
				labels: { app: "api" },
				selector: "app=api",
				replicas: 2,
				readyReplicas: 1,
				availableReplicas: 1,
			},
		]);

		expect(ocCommand.runOcCommand).toHaveBeenCalledWith([
			"get",
			"deployments",
			"-n",
			"dev",
			"-o",
			"json",
			"--server",
			cluster.apiUrl,
		]);
	});

	it("lists deployment pods from the selected cluster using shared filtering logic", async () => {
		const { pods, ocCommand } = loadClusterAwareServices();
		ocCommand.runOcCommand
			.mockResolvedValueOnce({
				stdout: JSON.stringify({
					metadata: { uid: "deployment-uid" },
					spec: { selector: { matchLabels: { app: "api" } } },
				}),
				stderr: "",
			})
			.mockResolvedValueOnce({
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
				stderr: "",
			})
			.mockResolvedValueOnce({
				stdout: JSON.stringify({
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
					],
				}),
				stderr: "",
			});

		await expect(pods.listPodsForDeployment(1, "dev", "api")).resolves.toEqual([
			{
				name: "api-current",
				status: "Running",
				labels: {},
				ready: true,
				restartCount: undefined,
			},
		]);

		expect(ocCommand.runOcCommand).toHaveBeenNthCalledWith(3, [
			"get",
			"pods",
			"-n",
			"dev",
			"-o",
			"json",
			"-l",
			"app=api",
			"--server",
			cluster.apiUrl,
		]);
	});
});
