const request = require("supertest");
const { createKubeClient } = require("../../src/service/kubeClient.service");

jest.mock("../../src/service/kubeClient.service", () => ({
  createKubeClient: jest.fn(),
}));

const app = require("../../src/app");

describe("GET /api/namespaces", () => {
  beforeEach(() => {
    createKubeClient.mockReset();
  });

  it("returns namespace names only", async () => {
    createKubeClient.mockResolvedValue({
      listNamespace: jest.fn().mockResolvedValue({
        items: [
          { metadata: { name: "dev", labels: { team: "a" } } },
          { metadata: { name: "prod" }, status: { phase: "Active" } },
        ],
      }),
    });

    const response = await request(app.callback()).get("/api/namespaces");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ namespaces: ["dev", "prod"] });
    expect(response.body).not.toHaveProperty("items");
  });

  it("handles authentication failures while creating the Kubernetes client", async () => {
    createKubeClient.mockRejectedValue(
      new Error("Unable to create Kubernetes client without an oc token"),
    );

    const response = await request(app.callback()).get("/api/namespaces");

    expect(response.status).toBe(401);
    expect(response.body).toEqual({
      error: "OpenShift authentication failed",
      details: "Unable to create Kubernetes client without an oc token",
    });
  });

  it("handles Kubernetes API authentication errors clearly", async () => {
    createKubeClient.mockResolvedValue({
      listNamespace: jest.fn().mockRejectedValue({
        response: {
          statusCode: 403,
          body: { message: "namespaces is forbidden" },
        },
      }),
    });

    const response = await request(app.callback()).get("/api/namespaces");

    expect(response.status).toBe(403);
    expect(response.body).toEqual({
      error: "OpenShift authentication failed",
      details: "namespaces is forbidden",
    });
  });

  it("handles Kubernetes API errors clearly", async () => {
    createKubeClient.mockResolvedValue({
      listNamespace: jest.fn().mockRejectedValue({
        response: {
          statusCode: 500,
          body: { message: "apiserver unavailable" },
        },
      }),
    });

    const response = await request(app.callback()).get("/api/namespaces");

    expect(response.status).toBe(500);
    expect(response.body).toEqual({
      error: "Kubernetes API error",
      details: "apiserver unavailable",
    });
  });
});
