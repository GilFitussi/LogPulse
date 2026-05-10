const { createKubeClient } = require("../../src/service/kubeClient.service");

jest.mock("../../src/service/kubeClient.service", () => ({
  createKubeClient: jest.fn(),
}));

const { listNamespaces } = require("../../src/service/namespaces.service");

describe("listNamespaces", () => {
  beforeEach(() => {
    createKubeClient.mockReset();
  });

  it("returns namespace names only", async () => {
    createKubeClient.mockResolvedValue({
      listNamespace: jest.fn().mockResolvedValue({
        items: [
          { metadata: { name: "dev", labels: { team: "a" } } },
          { metadata: { name: "prod" }, status: { phase: "Active" } },
          { metadata: {} },
        ],
      }),
    });

    await expect(listNamespaces()).resolves.toEqual(["dev", "prod"]);
    expect(createKubeClient).toHaveBeenCalledTimes(1);
  });

  it("supports Kubernetes client responses wrapped in body", async () => {
    createKubeClient.mockResolvedValue({
      listNamespace: jest.fn().mockResolvedValue({
        body: {
          items: [{ metadata: { name: "wrapped" } }],
        },
      }),
    });

    await expect(listNamespaces()).resolves.toEqual(["wrapped"]);
  });

  it("throws an OpenShift auth error when client creation fails", async () => {
    createKubeClient.mockRejectedValue(
      new Error("Unable to create Kubernetes client without an oc token"),
    );

    await expect(listNamespaces()).rejects.toMatchObject({
      status: 401,
      message: "OpenShift authentication failed",
      details: "Unable to create Kubernetes client without an oc token",
      expose: true,
    });
  });

  it("throws an OpenShift auth error for Kubernetes 401/403 responses", async () => {
    createKubeClient.mockResolvedValue({
      listNamespace: jest.fn().mockRejectedValue({
        response: {
          statusCode: 403,
          body: { message: "namespaces is forbidden" },
        },
      }),
    });

    await expect(listNamespaces()).rejects.toMatchObject({
      status: 403,
      message: "OpenShift authentication failed",
      details: "namespaces is forbidden",
      expose: true,
    });
  });

  it("throws a Kubernetes API error for other Kubernetes failures", async () => {
    createKubeClient.mockResolvedValue({
      listNamespace: jest.fn().mockRejectedValue({
        response: {
          statusCode: 500,
          body: { message: "apiserver unavailable" },
        },
      }),
    });

    await expect(listNamespaces()).rejects.toMatchObject({
      status: 500,
      message: "Kubernetes API error",
      details: "apiserver unavailable",
      expose: true,
    });
  });

  it("uses 502 for Kubernetes failures without an HTTP status", async () => {
    createKubeClient.mockResolvedValue({
      listNamespace: jest.fn().mockRejectedValue(new Error("socket hang up")),
    });

    await expect(listNamespaces()).rejects.toMatchObject({
      status: 502,
      message: "Kubernetes API error",
      details: "socket hang up",
      expose: true,
    });
  });
});
