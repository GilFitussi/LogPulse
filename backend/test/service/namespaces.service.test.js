const childProcess = require("node:child_process");
const {
	isValidNamespace,
	listNamespacesFromCurrentContext,
} = require("../../src/service/namespaces.service");

jest.mock("node:child_process", () => ({
	execFile: jest.fn(),
}));

function mockOcCommand(handler) {
	childProcess.execFile.mockImplementation(
		(command, args, options, callback) => {
			handler({ command, args, options, callback });
		},
	);
}

describe("isValidNamespace", () => {
	it("accepts valid Kubernetes namespace names", () => {
		expect(isValidNamespace("dev")).toBe(true);
		expect(isValidNamespace("my-project-1")).toBe(true);
	});

	it("rejects invalid Kubernetes namespace names", () => {
		expect(isValidNamespace("")).toBe(false);
		expect(isValidNamespace("Invalid_Namespace")).toBe(false);
		expect(isValidNamespace("-dev")).toBe(false);
		expect(isValidNamespace("dev-")).toBe(false);
		expect(isValidNamespace("a".repeat(64))).toBe(false);
	});
});

describe("listNamespacesFromCurrentContext", () => {
	beforeEach(() => {
		childProcess.execFile.mockReset();
	});

	it("returns OpenShift project names visible to the current user", async () => {
		mockOcCommand(({ command, args, callback }) => {
			expect(command).toBe("oc");
			expect(args).toEqual(["projects", "-q"]);
			callback(null, "dev\nprod\n\n", "");
		});

		await expect(listNamespacesFromCurrentContext()).resolves.toEqual(["dev", "prod"]);
	});

	it("throws an OpenShift auth error when oc is not logged in", async () => {
		mockOcCommand(({ callback }) => {
			callback(
				new Error("not logged in"),
				"",
				"error: You must be logged in to the server",
			);
		});

		await expect(listNamespacesFromCurrentContext()).rejects.toMatchObject({
			status: 401,
			message: "OpenShift authentication failed",
			details: "error: You must be logged in to the server",
			expose: true,
		});
	});

	it("throws an OpenShift auth error when oc is not installed", async () => {
		mockOcCommand(({ callback }) => {
			const error = new Error("spawn oc ENOENT");
			error.code = "ENOENT";
			callback(error, "", "");
		});

		await expect(listNamespacesFromCurrentContext()).rejects.toMatchObject({
			status: 401,
			message: "OpenShift authentication failed",
			details: "spawn oc ENOENT",
			expose: true,
		});
	});

	it("throws a Kubernetes API error for other project listing failures", async () => {
		mockOcCommand(({ callback }) => {
			callback(new Error("command failed"), "", "apiserver unavailable");
		});

		await expect(listNamespacesFromCurrentContext()).rejects.toMatchObject({
			status: 502,
			message: "Kubernetes API error",
			details: "apiserver unavailable",
			expose: true,
		});
	});
});
