const errorMiddleware = require("../../src/middleware/error.middleware");
const { AppError } = require("../../src/errors/app.error");

describe("errorMiddleware", () => {
  it("does nothing when downstream middleware succeeds", async () => {
    const ctx = {};
    const next = jest.fn().mockResolvedValue(undefined);

    await errorMiddleware(ctx, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(ctx.status).toBeUndefined();
    expect(ctx.body).toBeUndefined();
  });

  it("serializes exposed application errors", async () => {
    const ctx = {};
    const next = jest.fn().mockRejectedValue(
      new AppError("Kubernetes API error", {
        status: 503,
        details: "apiserver unavailable",
      }),
    );

    await errorMiddleware(ctx, next);

    expect(ctx.status).toBe(503);
    expect(ctx.body).toEqual({
      error: "Kubernetes API error",
      details: "apiserver unavailable",
    });
  });

  it("hides unexpected errors", async () => {
    const ctx = {};
    const next = jest.fn().mockRejectedValue(new Error("secret failure"));

    await errorMiddleware(ctx, next);

    expect(ctx.status).toBe(500);
    expect(ctx.body).toEqual({
      error: "Internal server error",
    });
  });
});
