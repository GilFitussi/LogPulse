const childProcess = require("node:child_process");
const { getClusterById } = require("../../src/service/clusterManager.service");
const {
	isValidNamespace,
	listNamespaces,
} = require("../../src/service/namespaces.service");

jest.mock("node:child_process", () => ({
	execFile: jest.fn(),
}));

jest.mock("../../src/service/clusterManager.service", () => ({
	getClusterById: jest.fn(),
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

describe("listNamespaces", () => {
	beforeEach(() => {
		childProcess.execFile.mockReset();
		getClusterById.mockReset();
		getClusterById.mockResolvedValue({
			id: 1,
			apiUrl: "https://api.dev.example.com:6443",
		});
	});

	it("returns OpenShift project names visible to the current user", async () => {
		mockOcCommand(({ command, args, callback }) => {
			expect(command).toBe("oc");
			expect(args).toEqual(["projects", "-q"]);
			callback(null, "dev\nprod\n\n", "");
		});

		await expect(listNamespaces()).resolves.toEqual(["dev", "prod"]);
	});

	it("lists namespaces against the selected cluster", async () => {
		mockOcCommand(({ command, args, callback }) => {
			expect(command).toBe("oc");
			expect(args).toEqual([
				"projects",
				"-q",
				"--server",
				"https://api.dev.example.com:6443",
			]);
			callback(null, "dev\nprod\n", "");
		});

		await expect(listNamespaces(1)).resolves.toEqual(["dev", "prod"]);
		expect(getClusterById).toHaveBeenCalledWith(1);
	});

	it("throws when the selected cluster does not exist", async () => {
		getClusterById.mockResolvedValue(null);

		await expect(listNamespaces(999)).rejects.toMatchObject({
			status: 404,
			message: "Cluster not found",
			code: "CLUSTER_NOT_FOUND",
		});
		expect(childProcess.execFile).not.toHaveBeenCalled();
	});

	it("throws an OpenShift auth error when oc is not logged in", async () => {
		mockOcCommand(({ callback }) => {
			callback(
				new Error("not logged in"),
				"",
				"error: You must be logged in to the server",
			);
		});

		await expect(listNamespaces()).rejects.toMatchObject({
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

		await expect(listNamespaces()).rejects.toMatchObject({
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

		await expect(listNamespaces()).rejects.toMatchObject({
			status: 502,
			message: "Kubernetes API error",
			details: "apiserver unavailable",
			expose: true,
		});
	});
});
