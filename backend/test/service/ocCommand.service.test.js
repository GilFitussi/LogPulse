const childProcess = require("node:child_process");
const {
	getOcErrorMessage,
	isOcNotInstalledError,
	runOcCommand,
} = require("../../src/service/ocCommand.service");

jest.mock("node:child_process", () => ({
	execFile: jest.fn(),
}));

describe("oc command helpers", () => {
	beforeEach(() => {
		childProcess.execFile.mockReset();
	});

	it("runs oc commands with shared defaults", async () => {
		childProcess.execFile.mockImplementation(
			(command, args, options, callback) => {
				callback(null, "output\n", "");
				return { stdin: { end: jest.fn() } };
			},
		);

		await expect(runOcCommand(["whoami"])).resolves.toEqual({
			stdout: "output\n",
			stderr: "",
		});
		expect(childProcess.execFile).toHaveBeenCalledWith(
			"oc",
			["whoami"],
			{
				encoding: "utf8",
				timeout: 10_000,
				maxBuffer: 1024 * 1024,
			},
			expect.any(Function),
		);
	});

	it("attaches stdout and stderr to rejected errors", async () => {
		const error = new Error("command failed");
		childProcess.execFile.mockImplementation(
			(command, args, options, callback) => {
				callback(error, "partial output", "failure details");
				return { stdin: { end: jest.fn() } };
			},
		);

		await expect(runOcCommand(["projects", "-q"])).rejects.toMatchObject({
			message: "command failed",
			stdout: "partial output",
			stderr: "failure details",
		});
	});

	it("writes provided stdin input to the oc child process", async () => {
		const end = jest.fn();
		childProcess.execFile.mockImplementation(
			(command, args, options, callback) => {
				callback(null, "output\n", "");
				return { stdin: { end } };
			},
		);

		await expect(
			runOcCommand(["--kubeconfig", "/dev/stdin", "projects", "-q"], {
				input: "apiVersion: v1\n",
			}),
		).resolves.toEqual({
			stdout: "output\n",
			stderr: "",
		});
		expect(end).toHaveBeenCalledWith("apiVersion: v1\n");
	});

	it("returns a useful oc error message", () => {
		expect(
			getOcErrorMessage({ stderr: " stderr message ", stdout: "stdout" }),
		).toBe("stderr message");
		expect(getOcErrorMessage({ stdout: " stdout message " })).toBe(
			"stdout message",
		);
		expect(getOcErrorMessage(new Error("error message"))).toBe("error message");
	});

	it("detects oc not installed errors", () => {
		expect(isOcNotInstalledError({ code: "ENOENT" })).toBe(true);
		expect(isOcNotInstalledError({ code: 1 })).toBe(false);
	});
});
