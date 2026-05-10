const request = require("supertest");

jest.mock("../src/service/kubeClient.service", () => ({
  createKubeClient: jest.fn(),
}));

const { createKubeClient } = require("../src/service/kubeClient.service");
const app = require("../src/app");

describe("GET /health", () => {
  it("returns ok status", async () => {
    const response = await request(app.callback()).get("/health");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: "ok" });
  });

  it("allows requests from the local frontend", async () => {
    const response = await request(app.callback())
      .get("/health")
      .set("Origin", "http://localhost:5173");

    expect(response.headers["access-control-allow-origin"]).toBe(
      "http://localhost:5173",
    );
  });
});

describe("GET /api/namespaces/:namespace/pods", () => {
  beforeEach(() => {
    createKubeClient.mockReset();
  });

  it("returns pods for a namespace", async () => {
    createKubeClient.mockResolvedValue({
      listNamespacedPod: jest.fn().mockResolvedValue({
        items: [
          {
            metadata: {
              name: "api-123",
              labels: { app: "api" },
            },
            status: {
              phase: "Running",
              containerStatuses: [{ restartCount: 1 }, { restartCount: 2 }],
            },
          },
        ],
      }),
    });

    const response = await request(app.callback()).get(
      "/api/namespaces/my-project/pods",
    );

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      pods: [
        {
          name: "api-123",
          status: "Running",
          labels: { app: "api" },
          restartCount: 3,
        },
      ],
    });
  });

  it("handles an empty pod list", async () => {
    createKubeClient.mockResolvedValue({
      listNamespacedPod: jest.fn().mockResolvedValue({ items: [] }),
    });

    const response = await request(app.callback()).get(
      "/api/namespaces/empty-project/pods",
    );

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ pods: [] });
  });

  it("rejects invalid namespace params", async () => {
    const response = await request(app.callback()).get(
      "/api/namespaces/Invalid_Namespace/pods",
    );

    expect(response.status).toBe(400);
    expect(response.body.error).toBe("Invalid namespace");
    expect(createKubeClient).not.toHaveBeenCalled();
  });
});
