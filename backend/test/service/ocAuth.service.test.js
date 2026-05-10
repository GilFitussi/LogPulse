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

  it("returns authenticated when the oc CLI is installed and has a token", async () => {
    mockOcCommand(({ args, callback }) => {
      if (args[0] === "version") {
        callback(null, "Client Version: 4.16\n", "");
        return;
      }

      callback(null, "super-secret-token\n", "");
    });

    await expect(checkOcAuth()).resolves.toEqual({ authenticated: true });
    expect(childProcess.execFile).toHaveBeenCalledWith(
      "oc",
      ["whoami", "-t"],
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

    await expect(checkOcAuth()).resolves.toEqual({
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

    await expect(checkOcAuth()).resolves.toEqual({
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

    await expect(checkOcAuth()).resolves.toEqual({
      authenticated: false,
      status: 401,
      error: OC_NOT_LOGGED_IN_ERROR,
    });
  });
});
