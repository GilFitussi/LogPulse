const { KubernetesApiError, OpenShiftAuthError } = require("../errors/app.error");
const { createKubeClient } = require("./kubeClient.service");

function normalizeNamespaceList(response) {
  const namespaceList = response?.body || response;
  return (namespaceList?.items || [])
    .map((namespace) => namespace?.metadata?.name)
    .filter(Boolean);
}

async function listNamespaces() {
  let kubeClient;

  try {
    kubeClient = await createKubeClient();
  } catch (error) {
    throw new OpenShiftAuthError(error.message);
  }

  try {
    const response = await kubeClient.listNamespace();
    return normalizeNamespaceList(response);
  } catch (error) {
    throw KubernetesApiError.from(error);
  }
}

module.exports = {
  listNamespaces,
};
