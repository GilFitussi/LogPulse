const mockGetClusterSession = jest.fn();
const kubeConfigInstances = [];

class MockCoreV1Api {}
class MockAppsV1Api {}
class MockLog {
	constructor(config) {
		this.config = config;
	}
}

jest.mock("../../src/service/clusterSessionRegistry.service", () => ({
	getClusterSession: (...args) => mockGetClusterSession(...args),
}));

jest.mock("@kubernetes/client-node", () => ({
	KubeConfig: jest.fn(() => {
		const instance = {
			loadFromString: jest.fn(),
			makeApiClient: jest.fn((ApiClass) => ({
				apiClass: ApiClass,
				instanceId: kubeConfigInstances.length + 1,
			})),
		};
		kubeConfigInstances.push(instance);
		return instance;
	}),
	CoreV1Api: MockCoreV1Api,
	AppsV1Api: MockAppsV1Api,
	Log: MockLog,
}));

const k8s = require("@kubernetes/client-node");
const {
	getAppsV1Api,
	getCoreV1Api,
	getLogClient,
} = require("../../src/service/kubernetesClientFactory.service");

describe("kubernetes client factory service", () => {
	beforeEach(() => {
		jest.clearAllMocks();
		mockGetClusterSession.mockReset();
		kubeConfigInstances.length = 0;
	});

	it("creates a CoreV1Api client from the stored kubeconfig content", () => {
		mockGetClusterSession.mockReturnValue({
			clusterId: 1,
			kubeconfigContent: "apiVersion: v1\nclusters: []\n",
		});

		const client = getCoreV1Api(1);

		expect(mockGetClusterSession).toHaveBeenCalledWith(1);
		expect(k8s.KubeConfig).toHaveBeenCalledTimes(1);
		expect(kubeConfigInstances[0].loadFromString).toHaveBeenCalledWith(
			"apiVersion: v1\nclusters: []\n",
		);
		expect(kubeConfigInstances[0].makeApiClient).toHaveBeenCalledWith(
			k8s.CoreV1Api,
		);
		expect(client).toEqual({
			apiClass: k8s.CoreV1Api,
			instanceId: expect.any(Number),
		});
	});

	it("creates an AppsV1Api client and a Log client on demand per cluster", () => {
		mockGetClusterSession
			.mockReturnValueOnce({
				clusterId: 1,
				kubeconfigContent: "cluster-1-config",
			})
			.mockReturnValueOnce({
				clusterId: 2,
				kubeconfigContent: "cluster-2-config",
			});

		const appsClient = getAppsV1Api(1);
		const logClient = getLogClient(2);

		expect(appsClient).toEqual({
			apiClass: k8s.AppsV1Api,
			instanceId: expect.any(Number),
		});
		expect(logClient).toBeInstanceOf(k8s.Log);
		expect(logClient.config).toBe(kubeConfigInstances[1]);
		expect(kubeConfigInstances[0].loadFromString).toHaveBeenCalledWith(
			"cluster-1-config",
		);
		expect(kubeConfigInstances[1].loadFromString).toHaveBeenCalledWith(
			"cluster-2-config",
		);
	});

	it("throws a clear error when the cluster session is missing", () => {
		mockGetClusterSession.mockReturnValue(undefined);

		expect(() => getCoreV1Api(999)).toThrow(
			"No active cluster session found for clusterId 999",
		);
		expect(k8s.KubeConfig).not.toHaveBeenCalled();
	});
});
