async function errorMiddleware(ctx, next) {
  try {
    await next();
  } catch (error) {
    if (error.expose && error.status) {
      ctx.status = error.status;
      ctx.body = {
        error: error.message,
        details: error.details,
        code: error.code,
        action: error.action,
      };
      return;
    }

    ctx.status = 500;
    ctx.body = {
      error: "Internal server error",
    };
  }
}

module.exports = errorMiddleware;
