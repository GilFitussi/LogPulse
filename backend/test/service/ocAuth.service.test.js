const childProcess = require("node:child_process");
const {
  OC_NOT_INSTALLED_ERROR,
  OC_NOT_LOGGED_IN_ERROR,
  checkOcAuth,
  getOcToken,
} = require("../../src/service/ocAuth.service");

jest.mock("node:child_process", () => ({
  execFile: jest.fn(),
}));

function mockOcCommand(handler) {
  childProcess.execFile.mockImplementation((command, args, options, callback) => {
    handler({ command, args, options, callback });
  });
}

describe("OpenShift authentication helpers", () => {
  beforeEach(() => {
    childProcess.execFile.mockReset();
  });

  it("returns the token internally from oc whoami -t", async () => {
    mockOcCommand(({ command, args, callback }) => {
      expect(command).toBe("oc");
      expect(args).toEqual(["whoami", "-t"]);
      callback(null, "internal-token\n", "");
    });

    await expect(getOcToken()).resolves.toBe("internal-token");
  });

  it("returns authenticated when the oc CLI has a token and the server accepts it", async () => {
    mockOcCommand(({ args, callback }) => {
      if (args[0] === "version") {
        callback(null, "Client Version: 4.16\n", "");
        return;
      }

      if (args[0] === "whoami" && args[1] === "-t") {
        callback(null, "super-secret-token\n", "");
        return;
      }

      callback(null, "developer\n", "");
    });

    await expect(checkOcAuth()).resolves.toEqual({ authenticated: true });
    expect(childProcess.execFile).toHaveBeenCalledWith(
      "oc",
      ["whoami", "-t"],
      expect.any(Object),
      expect.any(Function),
    );
    expect(childProcess.execFile).toHaveBeenCalledWith(
      "oc",
      ["whoami"],
      expect.any(Object),
      expect.any(Function),
    );
  });

  it("returns a 500 status when the oc CLI is not installed", async () => {
    mockOcCommand(({ callback }) => {
      const error = new Error("spawn oc ENOENT");
      error.code = "ENOENT";
      callback(error, "", "");
    });

    await expect(checkOcAuth()).resolves.toMatchObject({
      authenticated: false,
      status: 500,
      error: OC_NOT_INSTALLED_ERROR,
    });
  });

  it("returns a 401 status when the user is not logged in", async () => {
    mockOcCommand(({ args, callback }) => {
      if (args[0] === "version") {
        callback(null, "Client Version: 4.16\n", "");
        return;
      }

      callback(new Error("not logged in"), "", "error: not logged in");
    });

    await expect(checkOcAuth()).resolves.toMatchObject({
      authenticated: false,
      status: 401,
      error: OC_NOT_LOGGED_IN_ERROR,
    });
  });

  it("returns a 401 status when oc returns an empty token", async () => {
    mockOcCommand(({ args, callback }) => {
      if (args[0] === "version") {
        callback(null, "Client Version: 4.16\n", "");
        return;
      }

      callback(null, "\n", "");
    });

    await expect(checkOcAuth()).resolves.toMatchObject({
      authenticated: false,
      status: 401,
      error: OC_NOT_LOGGED_IN_ERROR,
    });
  });

  it("returns a 401 status when a token exists but the server rejects the session", async () => {
    mockOcCommand(({ args, callback }) => {
      if (args[0] === "version") {
        callback(null, "Client Version: 4.16\n", "");
        return;
      }

      if (args[0] === "whoami" && args[1] === "-t") {
        callback(null, "stale-token\n", "");
        return;
      }

      callback(
        new Error("not logged in"),
        "",
        "error: You must be logged in to the server",
      );
    });

    await expect(checkOcAuth()).resolves.toMatchObject({
      authenticated: false,
      status: 401,
      error: OC_NOT_LOGGED_IN_ERROR,
    });
  });
});
