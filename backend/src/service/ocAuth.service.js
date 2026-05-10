const { execFile } = require("node:child_process");

const OC_NOT_INSTALLED_ERROR = "oc CLI is not installed or not available in PATH";
const OC_NOT_LOGGED_IN_ERROR = "Not logged in to OpenShift";

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

function isOcNotInstalledError(error) {
  return error && error.code === "ENOENT";
}

async function getOcToken() {
  const { stdout } = await runOcCommand(["whoami", "-t"]);
  return stdout.trim();
}

async function checkOcAuth() {
  try {
    await runOcCommand(["version", "--client"]);
  } catch (error) {
    if (isOcNotInstalledError(error)) {
      return {
        authenticated: false,
        status: 500,
        error: OC_NOT_INSTALLED_ERROR,
      };
    }

    return {
      authenticated: false,
      status: 500,
      error: OC_NOT_INSTALLED_ERROR,
    };
  }

  try {
    const token = await getOcToken();

    if (!token) {
      return {
        authenticated: false,
        status: 401,
        error: OC_NOT_LOGGED_IN_ERROR,
      };
    }
  } catch (error) {
    if (isOcNotInstalledError(error)) {
      return {
        authenticated: false,
        status: 500,
        error: OC_NOT_INSTALLED_ERROR,
      };
    }

    return {
      authenticated: false,
      status: 401,
      error: OC_NOT_LOGGED_IN_ERROR,
    };
  }

  return { authenticated: true };
}

module.exports = {
  OC_NOT_INSTALLED_ERROR,
  OC_NOT_LOGGED_IN_ERROR,
  checkOcAuth,
  getOcToken,
};
