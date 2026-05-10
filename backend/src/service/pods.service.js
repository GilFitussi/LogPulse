const { AppError, KubernetesApiError } = require("../errors/app.error");
const { createKubeClient } = require("./kubeClient.service");

const NAMESPACE_NAME_PATTERN = /^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/;
const MAX_NAMESPACE_LENGTH = 63;

function validateNamespace(namespace) {
  if (
    typeof namespace !== "string" ||
    namespace.length === 0 ||
    namespace.length > MAX_NAMESPACE_LENGTH ||
    !NAMESPACE_NAME_PATTERN.test(namespace)
  ) {
    throw new AppError("Invalid namespace", {
      status: 400,
      details:
        "Namespace must be a valid Kubernetes namespace name (lowercase letters, numbers, and hyphens only).",
    });
  }
}

function getRestartCount(pod) {
  const statuses = [
    ...(pod.status?.initContainerStatuses || []),
    ...(pod.status?.containerStatuses || []),
  ];

  if (statuses.length === 0) {
    return undefined;
  }

  return statuses.reduce((total, status) => total + (status.restartCount || 0), 0);
}

function mapPod(pod) {
  return {
    name: pod.metadata?.name,
    status: pod.status?.phase,
    labels: pod.metadata?.labels || {},
    restartCount: getRestartCount(pod),
  };
}

async function listPods(namespace) {
  validateNamespace(namespace);

  try {
    const client = await createKubeClient();
    const response = await client.listNamespacedPod(namespace);
    const podList = response?.body || response;

    return (podList?.items || []).map(mapPod);
  } catch (error) {
    throw KubernetesApiError.from(error);
  }
}

module.exports = {
  listPods,
  validateNamespace,
};
