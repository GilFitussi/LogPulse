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
	createPodLogSearch,
	getPodLogSearchResults,
	listClusterDeployments,
	listClusterNamespaces,
	listClusterPods,
	listClusterPodsForDeployment,
	resetPodLogSearchSessions,
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
		resetPodLogSearchSessions();
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

	it("creates one combined log search session for multiple pods and returns the first batch", async () => {
		jest
			.spyOn(Date, "now")
			.mockReturnValue(Date.parse("2026-06-04T15:00:00.000Z"));
		const coreClient = {
			readNamespacedPod: jest
				.fn()
				.mockResolvedValueOnce({
					body: { spec: { containers: [{ name: "api" }] } },
				})
				.mockResolvedValueOnce({
					body: { spec: { containers: [{ name: "worker" }] } },
				}),
		};
		const logClient = {
			log: jest
				.fn()
				.mockImplementationOnce(
					async (_namespace, _podName, _containerName, stream) => {
						stream.end(
							[
								"2026-06-04T14:59:00.000Z api info ready",
								"2026-06-04T14:57:00.000Z api warn slow",
							].join("\n") + "\n",
						);
					},
				)
				.mockImplementationOnce(
					async (_namespace, _podName, _containerName, stream) => {
						stream.end(
							[
								'2026-06-04T14:58:30.000Z {"level":"error","message":"worker failed"}',
								"2026-06-04T14:56:00.000Z worker recovered",
							].join("\n") + "\n",
						);
					},
				),
		};
		mockGetClusterById.mockResolvedValue({ id: 1, name: "Dev" });
		mockGetClusterSession.mockReturnValue({
			clusterId: 1,
			kubeconfigContent: "cluster-1-config",
		});
		mockGetCoreV1Api.mockReturnValue(coreClient);
		mockGetLogClient.mockReturnValue(logClient);

		const result = await createPodLogSearch(1, "apps", {
			podNames: ["api-123", "worker-456"],
			sinceSeconds: 900,
			limit: 2,
		});

		expect(result).toMatchObject({
			searchSessionId: expect.any(String),
			namespace: "apps",
			podNames: ["api-123", "worker-456"],
			windowStartTimestamp: "2026-06-04T14:45:00.000Z",
			windowEndTimestamp: "2026-06-04T15:00:00.000Z",
			count: 2,
			limit: 2,
			offset: 0,
			totalCount: 4,
			hasMore: true,
			nextOffset: 2,
			logs: [
				{
					podName: "api-123",
					namespace: "apps",
					timestamp: "2026-06-04T14:59:00.000Z",
					level: "INFO",
					message: "api info ready",
				},
				{
					podName: "worker-456",
					namespace: "apps",
					timestamp: "2026-06-04T14:58:30.000Z",
					level: "ERROR",
					message: "worker failed",
				},
			],
		});
		expect(logClient.log).toHaveBeenNthCalledWith(
			1,
			"apps",
			"api-123",
			"api",
			expect.any(Object),
			{
				timestamps: true,
				sinceTime: "2026-06-04T14:45:00.000Z",
				untilTime: "2026-06-04T15:00:00.000Z",
			},
		);
		expect(logClient.log).toHaveBeenNthCalledWith(
			2,
			"apps",
			"worker-456",
			"worker",
			expect.any(Object),
			{
				timestamps: true,
				sinceTime: "2026-06-04T14:45:00.000Z",
				untilTime: "2026-06-04T15:00:00.000Z",
			},
		);
		Date.now.mockRestore();
	});

	it("filters the complete pod log search session before pagination", async () => {
		jest
			.spyOn(Date, "now")
			.mockReturnValue(Date.parse("2026-06-04T15:00:00.000Z"));
		const coreClient = {
			readNamespacedPod: jest.fn().mockResolvedValue({
				body: { spec: { containers: [{ name: "api" }] } },
			}),
		};
		const logClient = {
			log: jest.fn().mockImplementation(async (_namespace, _podName, _containerName, stream) => {
				stream.end(
					[
						'2026-06-04T14:59:00.000Z {"level":"error","message":"connection failed","statusCode":500}',
						'2026-06-04T14:58:00.000Z {"level":"info","message":"connection failed","statusCode":200}',
						'2026-06-04T14:57:00.000Z {"level":"error","message":"cache failed","statusCode":500}',
						'2026-06-04T14:56:00.000Z {"level":"error","message":"connection failed","statusCode":503}',
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

		const result = await createPodLogSearch(1, "apps", {
			podNames: ["api-123"],
			sinceSeconds: 900,
			limit: 1,
			query: "message:connection",
			filters: [
				{
					field: "statusCode",
					operator: "equals",
					value: "500",
				},
			],
		});

		expect(result).toMatchObject({
			count: 1,
			totalCount: 1,
			hasMore: false,
			nextOffset: null,
			logs: [
				{
					podName: "api-123",
					namespace: "apps",
					level: "ERROR",
					message: "connection failed",
				},
			],
		});
		Date.now.mockRestore();
	});

	it("returns older results from the cached combined session without refetching pod logs", async () => {
		jest
			.spyOn(Date, "now")
			.mockReturnValue(Date.parse("2026-06-04T15:00:00.000Z"));
		const coreClient = {
			readNamespacedPod: jest
				.fn()
				.mockResolvedValueOnce({
					body: { spec: { containers: [{ name: "api" }] } },
				})
				.mockResolvedValueOnce({
					body: { spec: { containers: [{ name: "worker" }] } },
				}),
		};
		const logClient = {
			log: jest
				.fn()
				.mockImplementationOnce(
					async (_namespace, _podName, _containerName, stream) => {
						stream.end(
							[
								"2026-06-04T14:59:00.000Z api info ready",
								"2026-06-04T14:57:00.000Z api warn slow",
							].join("\n") + "\n",
						);
					},
				)
				.mockImplementationOnce(
					async (_namespace, _podName, _containerName, stream) => {
						stream.end(
							[
								"2026-06-04T14:58:30.000Z worker failed",
								"2026-06-04T14:56:00.000Z worker recovered",
							].join("\n") + "\n",
						);
					},
				),
		};
		mockGetClusterById.mockResolvedValue({ id: 1, name: "Dev" });
		mockGetClusterSession.mockReturnValue({
			clusterId: 1,
			kubeconfigContent: "cluster-1-config",
		});
		mockGetCoreV1Api.mockReturnValue(coreClient);
		mockGetLogClient.mockReturnValue(logClient);

		const initial = await createPodLogSearch(1, "apps", {
			podNames: ["api-123", "worker-456"],
			sinceSeconds: 900,
			limit: 2,
		});
		const callsAfterSearch = logClient.log.mock.calls.length;

		const nextBatch = await getPodLogSearchResults(1, initial.searchSessionId, {
			offset: 2,
			limit: 2,
		});

		expect(logClient.log).toHaveBeenCalledTimes(callsAfterSearch);
		expect(nextBatch).toMatchObject({
			searchSessionId: initial.searchSessionId,
			count: 2,
			limit: 2,
			offset: 2,
			totalCount: 4,
			hasMore: false,
			nextOffset: null,
			logs: [
				{
					podName: "api-123",
					timestamp: "2026-06-04T14:57:00.000Z",
					level: "WARN",
					message: "api warn slow",
				},
				{
					podName: "worker-456",
					timestamp: "2026-06-04T14:56:00.000Z",
					level: null,
					message: "worker recovered",
				},
			],
		});
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
