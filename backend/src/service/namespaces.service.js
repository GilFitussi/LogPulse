const { execFile } = require("node:child_process");
const { KubernetesApiError, OpenShiftAuthError } = require("../errors/app.error");

function runOcCommand(args) {
  return new Promise((resolve, reject) => {
    execFile(
      "oc",
      args,
      {
        encoding: "utf8",
        timeout: 10_000,
        maxBuffer: 1024 * 1024,
      },
      (error, stdout, stderr) => {
        if (error) {
          error.stdout = stdout;
          error.stderr = stderr;
          reject(error);
          return;
        }

        resolve({ stdout, stderr });
      },
    );
  });
}

function parseProjectList(stdout) {
  return stdout
    .split("\n")
    .map((project) => project.trim())
    .filter(Boolean);
}

function getOcErrorMessage(error) {
  return error?.stderr?.trim() || error?.stdout?.trim() || error?.message;
}

function isOcAuthError(error) {
  const message = getOcErrorMessage(error)?.toLowerCase() || "";
  return error?.code === "ENOENT" || message.includes("must be logged in");
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
