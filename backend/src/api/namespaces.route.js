const Router = require("@koa/router");
const { createKubeClient } = require("../service/kubeClient.service");

const router = new Router({ prefix: "/api" });

function getKubernetesStatus(error) {
  return error?.response?.statusCode || error?.statusCode || error?.code;
}

function getKubernetesMessage(error) {
  return (
    error?.response?.body?.message ||
    error?.body?.message ||
    error?.message ||
    "Unknown Kubernetes API error"
  );
}

function isHttpStatus(status) {
  return Number.isInteger(status) && status >= 400 && status <= 599;
}

function normalizeNamespaceList(response) {
  const namespaceList = response?.body || response;
  return (namespaceList?.items || [])
    .map((namespace) => namespace?.metadata?.name)
    .filter(Boolean);
}

router.get("/namespaces", async (ctx) => {
  let kubeClient;

  try {
    kubeClient = await createKubeClient();
  } catch (error) {
    ctx.status = 401;
    ctx.body = {
      error: "OpenShift authentication failed",
      details: error.message,
    };
    return;
  }

  try {
    const response = await kubeClient.listNamespace();
    ctx.body = { namespaces: normalizeNamespaceList(response) };
  } catch (error) {
    const status = getKubernetesStatus(error);
    const details = getKubernetesMessage(error);

    if (status === 401 || status === 403) {
      ctx.status = status;
      ctx.body = {
        error: "OpenShift authentication failed",
        details,
      };
      return;
    }

    ctx.status = isHttpStatus(status) ? status : 502;
    ctx.body = {
      error: "Kubernetes API error",
      details,
    };
  }
});

module.exports = router;
