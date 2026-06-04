const mockGetClusterById = jest.fn();
const mockGetClusterSession = jest.fn();
const mockGetAppsV1Api = jest.fn();
const mockGetCoreV1Api = jest.fn();
const mockGetLogClient = jest.fn();
const mockRunOcCommand = jest.fn();
const mockGetOcErrorMessage = jest.fn(
	(error) => error?.stderr?.trim() || error?.stdout?.trim() || error?.message,
);
const mockIsOcNotInstalledError = jest.fn((error) => error?.code === "ENOENT");

jest.mock("../../src/service/clusterManager.service", () => ({
	getClusterById: (...args) => mockGetClusterById(...args),
}));

jest.mock("../../src/service/clusterSessionRegistry.service", () => ({
	getClusterSession: (...args) => mockGetClusterSession(...args),
}));

jest.mock("../../src/service/kubernetesClientFactory.service", () => ({
	getAppsV1Api: (...args) => mockGetAppsV1Api(...args),
	getCoreV1Api: (...args) => mockGetCoreV1Api(...args),
	getLogClient: (...args) => mockGetLogClient(...args),
}));

jest.mock("../../src/service/ocCommand.service", () => ({
	getOcErrorMessage: (...args) => mockGetOcErrorMessage(...args),
	isOcNotInstalledError: (...args) => mockIsOcNotInstalledError(...args),
	runOcCommand: (...args) => mockRunOcCommand(...args),
}));

const {
	CLUSTER_NOT_CONNECTED_MESSAGE,
	getClusterPodLogs,
	listClusterDeployments,
	listClusterNamespaces,
	listClusterPods,
	listClusterPodsForDeployment,
} = require("../../src/service/clusterResources.service");

describe("cluster resources service", () => {
	beforeEach(() => {
		jest.clearAllMocks();
		mockGetClusterById.mockReset();
		mockGetClusterSession.mockReset();
		mockGetAppsV1Api.mockReset();
		mockGetCoreV1Api.mockReset();
		mockGetLogClient.mockReset();
		mockRunOcCommand.mockReset();
		mockGetOcErrorMessage.mockImplementation(
			(error) =>
				error?.stderr?.trim() || error?.stdout?.trim() || error?.message,
		);
		mockIsOcNotInstalledError.mockImplementation(
			(error) => error?.code === "ENOENT",
		);
	});

	it("throws a cluster not found error for invalid cluster ids", async () => {
		mockGetClusterById.mockResolvedValue(null);

		await expect(listClusterNamespaces(999)).rejects.toMatchObject({
			message: "Cluster not found",
			status: 404,
			code: "CLUSTER_NOT_FOUND",
		});
		expect(mockGetClusterSession).not.toHaveBeenCalled();
		expect(mockRunOcCommand).not.toHaveBeenCalled();
	});

	it("throws a clear cluster is not connected error when no runtime session exists", async () => {
		mockGetClusterById.mockResolvedValue({ id: 1, name: "Dev" });
		mockGetClusterSession.mockReturnValue(undefined);

		await expect(listClusterDeployments(1, "apps")).rejects.toMatchObject({
			message: CLUSTER_NOT_CONNECTED_MESSAGE,
			status: 409,
			code: "CLUSTER_NOT_CONNECTED",
			details: {
				message: "No active cluster session found for clusterId 1",
			},
		});
		expect(mockGetAppsV1Api).not.toHaveBeenCalled();
	});

	it("lists visible OpenShift namespaces using the cluster-specific runtime session", async () => {
		mockGetClusterById.mockResolvedValue({ id: 1, name: "Dev" });
		mockGetClusterSession.mockReturnValue({
			clusterId: 1,
			kubeconfigContent: "apiVersion: v1\nclusters: []\n",
		});
		mockRunOcCommand.mockResolvedValue({
			stdout: "alpha\nbeta\n\n",
			stderr: "",
		});

		await expect(listClusterNamespaces(1)).resolves.toEqual([
			{ name: "alpha" },
			{ name: "beta" },
		]);
		expect(mockRunOcCommand).toHaveBeenCalledWith([
			"--kubeconfig",
			expect.stringMatching(/logpulse-kubeconfig-.*[\\/]config$/),
			"projects",
			"-q",
		]);
	});

	it("normalizes deployments from the Kubernetes AppsV1Api", async () => {
		const appsClient = {
			listNamespacedDeployment: jest.fn().mockResolvedValue({
				items: [
					{
						metadata: {
							name: "api",
							namespace: "apps",
							creationTimestamp: "2026-05-20T10:00:00.000Z",
						},
						spec: { replicas: 3 },
						status: { readyReplicas: 2, updatedReplicas: 3 },
					},
				],
			}),
		};
		mockGetClusterById.mockResolvedValue({ id: 1, name: "Dev" });
		mockGetClusterSession.mockReturnValue({
			clusterId: 1,
			kubeconfigContent: "cluster-1-config",
		});
		mockGetAppsV1Api.mockReturnValue(appsClient);

		await expect(listClusterDeployments(1, "apps")).resolves.toEqual([
			{
				name: "api",
				namespace: "apps",
				replicas: 3,
				readyReplicas: 2,
				updatedReplicas: 3,
				createdAt: "2026-05-20T10:00:00.000Z",
			},
		]);
		expect(mockGetAppsV1Api).toHaveBeenCalledWith(1);
		expect(appsClient.listNamespacedDeployment).toHaveBeenCalledWith({
			namespace: "apps",
		});
	});

	it("returns an empty list when list deployments returns a 404", async () => {
		const appsClient = {
			listNamespacedDeployment: jest.fn().mockRejectedValue({
				statusCode: 404,
				message: 'namespaces "apps" not found',
			}),
		};
		mockGetClusterById.mockResolvedValue({ id: 1, name: "Dev" });
		mockGetClusterSession.mockReturnValue({
			clusterId: 1,
			kubeconfigContent: "cluster-1-config",
		});
		mockGetAppsV1Api.mockReturnValue(appsClient);

		await expect(listClusterDeployments(1, "apps")).resolves.toEqual([]);
	});

	it("surfaces a clean forbidden error when deployment access is denied", async () => {
		const appsClient = {
			listNamespacedDeployment: jest.fn().mockRejectedValue({
				statusCode: 403,
				body: JSON.stringify({
					message:
						'deployments.apps is forbidden: User "gigo1985" cannot list resource "deployments" in API group "apps" in the namespace "openshift-virtualization-os-images"',
					code: 403,
				}),
			}),
		};
		mockGetClusterById.mockResolvedValue({ id: 1, name: "Dev" });
		mockGetClusterSession.mockReturnValue({
			clusterId: 1,
			kubeconfigContent: "cluster-1-config",
		});
		mockGetAppsV1Api.mockReturnValue(appsClient);

		await expect(listClusterDeployments(1, "apps")).rejects.toMatchObject({
			message: "Unable to list cluster deployments",
			status: 403,
			code: "CLUSTER_DEPLOYMENTS_FORBIDDEN",
			details: {
				message:
					'deployments.apps is forbidden: User "gigo1985" cannot list resource "deployments" in API group "apps" in the namespace "openshift-virtualization-os-images"',
			},
		});
	});

	it("normalizes pods from the Kubernetes CoreV1Api", async () => {
		const coreClient = {
			listNamespacedPod: jest.fn().mockResolvedValue({
				items: [
					{
						metadata: {
							name: "api-123",
							namespace: "apps",
							creationTimestamp: "2026-05-20T11:00:00.000Z",
						},
						spec: {
							containers: [{ name: "api" }, { name: "sidecar" }],
						},
						status: {
							phase: "Running",
							containerStatuses: [
								{ ready: true, restartCount: 1 },
								{ ready: true, restartCount: 2 },
							],
						},
					},
				],
			}),
		};
		mockGetClusterById.mockResolvedValue({ id: 1, name: "Dev" });
		mockGetClusterSession.mockReturnValue({
			clusterId: 1,
			kubeconfigContent: "cluster-1-config",
		});
		mockGetCoreV1Api.mockReturnValue(coreClient);

		await expect(listClusterPods(1, "apps")).resolves.toEqual([
			{
				name: "api-123",
				namespace: "apps",
				status: "Running",
				ready: true,
				restarts: 3,
				createdAt: "2026-05-20T11:00:00.000Z",
				containers: ["api", "sidecar"],
			},
		]);
		expect(coreClient.listNamespacedPod).toHaveBeenCalledWith({
			namespace: "apps",
			labelSelector: undefined,
		});
	});

	it("lists deployment pods using the deployment selector labels", async () => {
		const appsClient = {
			readNamespacedDeployment: jest.fn().mockResolvedValue({
				body: {
					spec: {
						selector: {
							matchLabels: {
								app: "api",
								component: "backend",
							},
						},
					},
				},
			}),
		};
		const coreClient = {
			listNamespacedPod: jest.fn().mockResolvedValue({
				items: [
					{
						metadata: {
							name: "api-123",
							namespace: "apps",
							creationTimestamp: "2026-05-20T11:00:00.000Z",
						},
						spec: { containers: [{ name: "api" }] },
						status: {
							phase: "Running",
							containerStatuses: [{ ready: true, restartCount: 0 }],
						},
					},
				],
			}),
		};
		mockGetClusterById.mockResolvedValue({ id: 1, name: "Dev" });
		mockGetClusterSession.mockReturnValue({
			clusterId: 1,
			kubeconfigContent: "cluster-1-config",
		});
		mockGetAppsV1Api.mockReturnValue(appsClient);
		mockGetCoreV1Api.mockReturnValue(coreClient);

		await expect(
			listClusterPodsForDeployment(1, "apps", "api"),
		).resolves.toEqual([
			{
				name: "api-123",
				namespace: "apps",
				status: "Running",
				ready: true,
				restarts: 0,
				createdAt: "2026-05-20T11:00:00.000Z",
				containers: ["api"],
			},
		]);
		expect(appsClient.readNamespacedDeployment).toHaveBeenCalledWith({
			name: "api",
			namespace: "apps",
		});
		expect(coreClient.listNamespacedPod).toHaveBeenCalledWith({
			namespace: "apps",
			labelSelector: "app=api,component=backend",
		});
	});

	it("retrieves pod logs in newest-first batches within the selected time range", async () => {
		jest
			.spyOn(Date, "now")
			.mockReturnValue(Date.parse("2026-06-04T15:00:00.000Z"));
		const coreClient = {
			readNamespacedPod: jest.fn().mockResolvedValue({
				body: {
					spec: { containers: [{ name: "api" }] },
				},
			}),
		};
		const logClient = {
			log: jest.fn(async (namespace, podName, containerName, stream) => {
				expect(namespace).toBe("apps");
				expect(podName).toBe("api-123");
				expect(containerName).toBe("api");
				stream.end(
					[
						"2026-06-04T13:50:00.000000000Z outside range",
						"2026-06-04T14:05:00.000000000Z oldest kept",
						"2026-06-04T14:10:00.000000000Z older kept",
						"2026-06-04T14:20:00.000000000Z newer kept",
						"2026-06-04T14:30:00.000000000Z newest kept",
					].join("\n") + "\n",
				);
			}),
		};
		mockGetClusterById.mockResolvedValue({ id: 1, name: "Dev" });
		mockGetClusterSession.mockReturnValue({
			clusterId: 1,
			kubeconfigContent: "cluster-1-config",
		});
		mockGetCoreV1Api.mockReturnValue(coreClient);
		mockGetLogClient.mockReturnValue(logClient);

		await expect(
			getClusterPodLogs(1, "apps", "api-123", {
				limit: 2,
				sinceSeconds: 3600,
			}),
		).resolves.toEqual({
			logs: [
				"2026-06-04T14:30:00.000000000Z newest kept",
				"2026-06-04T14:20:00.000000000Z newer kept",
			],
			count: 2,
			limit: 2,
			hasMore: true,
			nextBeforeTimestamp: "2026-06-04T14:20:00.000Z",
		});
		expect(coreClient.readNamespacedPod).toHaveBeenCalledWith({
			name: "api-123",
			namespace: "apps",
		});
		expect(logClient.log).toHaveBeenCalledWith(
			"apps",
			"api-123",
			"api",
			expect.any(Object),
			{
				sinceSeconds: 3600,
				timestamps: true,
			},
		);
		Date.now.mockRestore();
	});

	it("loads the next batch of older logs before the requested timestamp", async () => {
		jest
			.spyOn(Date, "now")
			.mockReturnValue(Date.parse("2026-06-04T15:00:00.000Z"));
		const coreClient = {
			readNamespacedPod: jest.fn().mockResolvedValue({
				body: {
					spec: { containers: [{ name: "api" }] },
				},
			}),
		};
		const logClient = {
			log: jest.fn(async (namespace, podName, containerName, stream) => {
				stream.end(
					[
						"2026-06-04T14:05:00.000000000Z oldest kept",
						"2026-06-04T14:10:00.000000000Z older kept",
						"2026-06-04T14:20:00.000000000Z already loaded boundary",
						"2026-06-04T14:30:00.000000000Z newer than boundary",
					].join("\n") + "\n",
				);
			}),
		};
		mockGetClusterById.mockResolvedValue({ id: 1, name: "Dev" });
		mockGetClusterSession.mockReturnValue({
			clusterId: 1,
			kubeconfigContent: "cluster-1-config",
		});
		mockGetCoreV1Api.mockReturnValue(coreClient);
		mockGetLogClient.mockReturnValue(logClient);

		await expect(
			getClusterPodLogs(1, "apps", "api-123", {
				limit: 2,
				sinceSeconds: 3600,
				beforeTimestamp: "2026-06-04T14:20:00.000Z",
			}),
		).resolves.toEqual({
			logs: [
				"2026-06-04T14:10:00.000000000Z older kept",
				"2026-06-04T14:05:00.000000000Z oldest kept",
			],
			count: 2,
			limit: 2,
			hasMore: false,
			nextBeforeTimestamp: null,
		});
		expect(logClient.log).toHaveBeenCalledWith(
			"apps",
			"api-123",
			"api",
			expect.any(Object),
			{
				sinceSeconds: 3600,
				untilTime: "2026-06-04T14:20:00.000Z",
				timestamps: true,
			},
		);
		Date.now.mockRestore();
	});

	it("keeps runtime sessions isolated across multiple clusters", async () => {
		const appsClientOne = {
			listNamespacedDeployment: jest.fn().mockResolvedValue({ items: [] }),
		};
		const appsClientTwo = {
			listNamespacedDeployment: jest.fn().mockResolvedValue({ items: [] }),
		};
		mockGetClusterById.mockImplementation(async (clusterId) => ({
			id: clusterId,
			name: `cluster-${clusterId}`,
		}));
		mockGetClusterSession.mockImplementation((clusterId) => ({
			clusterId,
			kubeconfigContent: `cluster-${clusterId}-config`,
		}));
		mockGetAppsV1Api
			.mockReturnValueOnce(appsClientOne)
			.mockReturnValueOnce(appsClientTwo);

		await listClusterDeployments(1, "apps");
		await listClusterDeployments(2, "apps");

		expect(mockGetAppsV1Api).toHaveBeenNthCalledWith(1, 1);
		expect(mockGetAppsV1Api).toHaveBeenNthCalledWith(2, 2);
		expect(appsClientOne.listNamespacedDeployment).toHaveBeenCalledWith({
			namespace: "apps",
		});
		expect(appsClientTwo.listNamespacedDeployment).toHaveBeenCalledWith({
			namespace: "apps",
		});
	});
});
