const request = require("supertest");

jest.mock("../src/service/kubeClient.service", () => ({
  createKubeClient: jest.fn(),
}));

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
