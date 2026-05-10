const k8s = require("@kubernetes/client-node");
const { getOcToken } = require("./ocAuth.service");

async function createKubeClient(apiClientClass = k8s.CoreV1Api) {
  const kubeConfig = new k8s.KubeConfig();
  kubeConfig.loadFromDefault();

  const token = await getOcToken();

  if (!token) {
    throw new Error("Unable to create Kubernetes client without an oc token");
  }

  const currentUser = kubeConfig.getCurrentUser();

  if (!currentUser) {
    throw new Error("No current Kubernetes user found in kubeconfig");
  }

  currentUser.token = token;

  return kubeConfig.makeApiClient(apiClientClass);
}

module.exports = {
  createKubeClient,
};
