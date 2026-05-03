const request = require("supertest");
const app = require("../src/app");

describe("GET /health", () => {
  it("returns ok status", async () => {
    const response = await request(app.callback()).get("/health");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: "ok" });
  });
});
