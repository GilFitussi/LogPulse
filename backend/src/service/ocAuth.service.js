const {
  isOcNotInstalledError,
  runOcCommand,
} = require("./ocCommand.service");

const OC_NOT_INSTALLED_ERROR = "oc CLI is not installed or not available in PATH";
const OC_NOT_INSTALLED_ACTION = "Install the OpenShift CLI and ensure the oc command is available in PATH.";
const OC_NOT_LOGGED_IN_ERROR = "Not logged in to OpenShift";
const OC_NOT_LOGGED_IN_ACTION = "Run oc login in a terminal, then refresh LogPulse.";

function createOcNotInstalledStatus() {
  return {
    authenticated: false,
    status: 500,
    error: OC_NOT_INSTALLED_ERROR,
    code: "OC_NOT_INSTALLED",
    action: OC_NOT_INSTALLED_ACTION,
  };
}

function createNotLoggedInStatus() {
  return {
    authenticated: false,
    status: 401,
    error: OC_NOT_LOGGED_IN_ERROR,
    code: "AUTH_REQUIRED",
    action: OC_NOT_LOGGED_IN_ACTION,
  };
}

async function getOcToken() {
  const { stdout } = await runOcCommand(["whoami", "-t"]);
  return stdout.trim();
}

async function validateOcSession() {
  const { stdout } = await runOcCommand(["whoami"]);
  return stdout.trim();
}

async function checkOcAuth() {
  try {
    await runOcCommand(["version", "--client"]);
  } catch (_error) {
    return createOcNotInstalledStatus();
  }

  try {
    const token = await getOcToken();

    if (!token) {
      return createNotLoggedInStatus();
    }

    const username = await validateOcSession();

    if (!username) {
      return createNotLoggedInStatus();
    }
  } catch (error) {
    if (isOcNotInstalledError(error)) {
      return createOcNotInstalledStatus();
    }

    return createNotLoggedInStatus();
  }

  return { authenticated: true };
}

module.exports = {
  OC_NOT_INSTALLED_ACTION,
  OC_NOT_INSTALLED_ERROR,
  OC_NOT_LOGGED_IN_ACTION,
  OC_NOT_LOGGED_IN_ERROR,
  checkOcAuth,
  getOcToken,
};
