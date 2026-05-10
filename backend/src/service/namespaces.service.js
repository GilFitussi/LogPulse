const { KubernetesApiError, OpenShiftAuthError } = require("../errors/app.error");
const {
  getOcErrorMessage,
  isOcNotInstalledError,
  runOcCommand,
} = require("./ocCommand.service");

function parseProjectList(stdout) {
  return stdout
    .split("\n")
    .map((project) => project.trim())
    .filter(Boolean);
}

function isOcAuthError(error) {
  const message = getOcErrorMessage(error)?.toLowerCase() || "";
  return isOcNotInstalledError(error) || message.includes("must be logged in");
}

async function listNamespaces() {
  try {
    const { stdout } = await runOcCommand(["projects", "-q"]);
    return parseProjectList(stdout);
  } catch (error) {
    const message = getOcErrorMessage(error);

    if (isOcAuthError(error)) {
      throw new OpenShiftAuthError(message);
    }

    throw new KubernetesApiError(message || "Unable to list OpenShift projects");
  }
}

module.exports = {
  listNamespaces,
};
