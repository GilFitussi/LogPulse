const mockKubeConfigInstance = {
  loadFromDefault: jest.fn(),
  getCurrentUser: jest.fn(),
  makeApiClient: jest.fn(),
};

class mockCoreV1Api {}
class CustomApi {}

jest.mock("@kubernetes/client-node", () => ({
  KubeConfig: jest.fn(() => mockKubeConfigInstance),
  CoreV1Api: mockCoreV1Api,
}));

jest.mock("../../src/service/ocAuth.service", () => ({
  getOcToken: jest.fn(),
}));

const k8s = require("@kubernetes/client-node");
const { getOcToken } = require("../../src/service/ocAuth.service");
const { createKubeClient } = require("../../src/service/kubeClient.service");

describe("createKubeClient", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("loads the default kubeconfig and creates an authenticated CoreV1Api client", async () => {
    const currentUser = { name: "developer" };
    const apiClient = { listNamespace: jest.fn() };

    getOcToken.mockResolvedValue("oc-token");
    mockKubeConfigInstance.getCurrentUser.mockReturnValue(currentUser);
    mockKubeConfigInstance.makeApiClient.mockReturnValue(apiClient);

    const client = await createKubeClient();

    expect(k8s.KubeConfig).toHaveBeenCalledTimes(1);
    expect(mockKubeConfigInstance.loadFromDefault).toHaveBeenCalledTimes(1);
    expect(getOcToken).toHaveBeenCalledTimes(1);
    expect(currentUser.token).toBe("oc-token");
    expect(mockKubeConfigInstance.makeApiClient).toHaveBeenCalledWith(k8s.CoreV1Api);
    expect(client).toBe(apiClient);
    expect(client).not.toHaveProperty("token");
  });

  it("creates the requested Kubernetes API client type", async () => {
    const currentUser = { name: "developer" };
    const apiClient = { listPodForAllNamespaces: jest.fn() };

    getOcToken.mockResolvedValue("oc-token");
    mockKubeConfigInstance.getCurrentUser.mockReturnValue(currentUser);
    mockKubeConfigInstance.makeApiClient.mockReturnValue(apiClient);

    const client = await createKubeClient(CustomApi);

    expect(mockKubeConfigInstance.makeApiClient).toHaveBeenCalledWith(CustomApi);
    expect(client).toBe(apiClient);
  });

  it("fails when an oc token is not available", async () => {
    getOcToken.mockResolvedValue("");

    await expect(createKubeClient()).rejects.toThrow(
      "Unable to create Kubernetes client without an oc token",
    );
    expect(mockKubeConfigInstance.getCurrentUser).not.toHaveBeenCalled();
    expect(mockKubeConfigInstance.makeApiClient).not.toHaveBeenCalled();
  });

  it("fails when the default kubeconfig has no current user", async () => {
    getOcToken.mockResolvedValue("oc-token");
    mockKubeConfigInstance.getCurrentUser.mockReturnValue(undefined);

    await expect(createKubeClient()).rejects.toThrow(
      "No current Kubernetes user found in kubeconfig",
    );
    expect(mockKubeConfigInstance.makeApiClient).not.toHaveBeenCalled();
  });
});
