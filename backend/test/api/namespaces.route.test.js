const request = require("supertest");
const { listNamespaces } = require("../../src/service/namespaces.service");
const { KubernetesApiError, OpenShiftAuthError } = require("../../src/errors/app.error");

jest.mock("../../src/service/namespaces.service", () => ({
  listNamespaces: jest.fn(),
}));

jest.mock("../../src/service/pods.service", () => ({
  listPods: jest.fn(),
}));

const app = require("../../src/app");

describe("GET /api/namespaces", () => {
  beforeEach(() => {
    listNamespaces.mockReset();
  });

  it("returns namespace names from the namespace service", async () => {
    listNamespaces.mockResolvedValue(["dev", "prod"]);

    const response = await request(app.callback()).get("/api/namespaces");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ namespaces: ["dev", "prod"] });
    expect(listNamespaces).toHaveBeenCalledTimes(1);
  });

  it("handles authentication failures through shared error middleware", async () => {
    listNamespaces.mockRejectedValue(
      new OpenShiftAuthError("Unable to create Kubernetes client without an oc token"),
    );

    const response = await request(app.callback()).get("/api/namespaces");

    expect(response.status).toBe(401);
    expect(response.body).toEqual({
      error: "OpenShift authentication failed",
      details: "Unable to create Kubernetes client without an oc token",
    });
  });

  it("handles Kubernetes API authentication errors through shared error middleware", async () => {
    listNamespaces.mockRejectedValue(
      new OpenShiftAuthError("namespaces is forbidden", 403),
    );

    const response = await request(app.callback()).get("/api/namespaces");

    expect(response.status).toBe(403);
    expect(response.body).toEqual({
      error: "OpenShift authentication failed",
      details: "namespaces is forbidden",
    });
  });

  it("handles Kubernetes API errors through shared error middleware", async () => {
    listNamespaces.mockRejectedValue(
      new KubernetesApiError("apiserver unavailable", 500),
    );

    const response = await request(app.callback()).get("/api/namespaces");

    expect(response.status).toBe(500);
    expect(response.body).toEqual({
      error: "Kubernetes API error",
      details: "apiserver unavailable",
    });
  });
});
