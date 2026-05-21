const fs = require("node:fs/promises");
const {
	getClusterById,
	updateClusterConnectionStatus,
} = require("../../src/service/clusterManager.service");
const { runOcCommand } = require("../../src/service/ocCommand.service");
const {
	LOGIN_STATUS_CONNECTED,
	LOGIN_STATUS_FAILED,
	loginToCluster,
} = require("../../src/service/clusterOcLogin.service");

jest.mock("../../src/service/clusterManager.service", () => ({
	getClusterById: jest.fn(),
	updateClusterConnectionStatus: jest.fn(),
}));

jest.mock("../../src/service/ocCommand.service", () => ({
	getOcErrorMessage: jest.fn(
		(error) => error?.stderr?.trim() || error?.stdout?.trim() || error?.message,
	),
	isOcNotInstalledError: jest.fn((error) => error?.code === "ENOENT"),
	runOcCommand: jest.fn(),
}));

describe("cluster oc login service", () => {
	beforeEach(() => {
		getClusterById.mockReset();
		updateClusterConnectionStatus.mockReset();
		runOcCommand.mockReset();
	});

	it("runs oc login against the cluster apiUrl, verifies with whoami, and updates connection status", async () => {
		const cluster = {
			id: 1,
			apiUrl: "https://api.dev.example.com:6443",
		};
		const updatedCluster = {
			...cluster,
			lastConnectedAt: "2026-05-20T10:00:00.000Z",
			lastConnectionStatus: LOGIN_STATUS_CONNECTED,
			lastConnectionError: null,
		};
		getClusterById.mockResolvedValue(cluster);
		runOcCommand
			.mockResolvedValueOnce({ stdout: "", stderr: "" })
			.mockResolvedValueOnce({ stdout: "developer\n", stderr: "" });
		updateClusterConnectionStatus.mockResolvedValue(updatedCluster);

		const result = await loginToCluster(1, {
			username: "developer",
			password: "secret",
		});

		expect(result).toEqual({
			username: "developer",
			cluster: updatedCluster,
		});
		expect(runOcCommand).toHaveBeenNthCalledWith(
			1,
			[
				"login",
				"https://api.dev.example.com:6443",
				"--username",
				"developer",
				"--password",
				"secret",
			],
			expect.objectContaining({
				env: expect.objectContaining({
					KUBECONFIG: expect.stringContaining("config"),
				}),
			}),
		);
		expect(runOcCommand).toHaveBeenNthCalledWith(
			2,
			["whoami"],
			expect.objectContaining({
				env: expect.objectContaining({
					KUBECONFIG: expect.stringContaining("config"),
				}),
			}),
		);
		expect(updateClusterConnectionStatus).toHaveBeenCalledWith(1, {
			lastConnectedAt: expect.any(String),
			lastConnectionStatus: LOGIN_STATUS_CONNECTED,
			lastConnectionError: null,
		});
	});

	it("runs oc login with an OpenShift token", async () => {
		const cluster = {
			id: 1,
			apiUrl: "https://api.dev.example.com:6443",
		};
		const updatedCluster = {
			...cluster,
			lastConnectionStatus: LOGIN_STATUS_CONNECTED,
			lastConnectionError: null,
		};
		getClusterById.mockResolvedValue(cluster);
		runOcCommand
			.mockResolvedValueOnce({ stdout: "", stderr: "" })
			.mockResolvedValueOnce({ stdout: "token-user\n", stderr: "" });
		updateClusterConnectionStatus.mockResolvedValue(updatedCluster);

		const result = await loginToCluster(1, {
			loginMethod: "token",
			token: "sha256~secret-token",
		});

		expect(result).toEqual({
			username: "token-user",
			cluster: updatedCluster,
		});
		expect(runOcCommand).toHaveBeenNthCalledWith(
			1,
			[
				"login",
				"https://api.dev.example.com:6443",
				"--token",
				"sha256~secret-token",
			],
			expect.objectContaining({
				env: expect.objectContaining({
					KUBECONFIG: expect.stringContaining("config"),
				}),
			}),
		);
		expect(runOcCommand).toHaveBeenNthCalledWith(
			2,
			["whoami"],
			expect.any(Object),
		);
	});

	it("updates only connection fields when oc login fails and redacts the password", async () => {
		const cluster = {
			id: 1,
			apiUrl: "https://api.dev.example.com:6443",
		};
		const error = new Error("Command failed");
		error.stderr = "Invalid password secret";
		const updatedCluster = {
			...cluster,
			lastConnectionStatus: LOGIN_STATUS_FAILED,
			lastConnectionError: "Invalid password [redacted]",
		};
		getClusterById.mockResolvedValue(cluster);
		runOcCommand.mockRejectedValue(error);
		updateClusterConnectionStatus.mockResolvedValue(updatedCluster);

		await expect(
			loginToCluster(1, {
				username: "developer",
				password: "secret",
			}),
		).rejects.toMatchObject({
			message: "Cluster login failed",
			status: 401,
			code: "CLUSTER_LOGIN_FAILED",
			details: {
				message: "Invalid password [redacted]",
				cluster: updatedCluster,
			},
		});
		expect(updateClusterConnectionStatus).toHaveBeenCalledWith(1, {
			lastConnectedAt: expect.any(String),
			lastConnectionStatus: LOGIN_STATUS_FAILED,
			lastConnectionError: "Invalid password [redacted]",
		});
		expect(updateClusterConnectionStatus.mock.calls[0][1]).toEqual(
			expect.not.objectContaining({
				username: expect.any(String),
				password: expect.any(String),
				token: expect.any(String),
			}),
		);
	});

	it("redacts token login failures", async () => {
		const cluster = {
			id: 1,
			apiUrl: "https://api.dev.example.com:6443",
		};
		const error = new Error("Command failed");
		error.stderr = "Invalid token sha256~secret-token";
		const updatedCluster = {
			...cluster,
			lastConnectionStatus: LOGIN_STATUS_FAILED,
			lastConnectionError: "Invalid token [redacted]",
		};
		getClusterById.mockResolvedValue(cluster);
		runOcCommand.mockRejectedValue(error);
		updateClusterConnectionStatus.mockResolvedValue(updatedCluster);

		await expect(
			loginToCluster(1, {
				loginMethod: "token",
				token: "sha256~secret-token",
			}),
		).rejects.toMatchObject({
			message: "Cluster login failed",
			status: 401,
			details: {
				message: "Invalid token [redacted]",
				cluster: updatedCluster,
			},
		});
		expect(
			JSON.stringify(updateClusterConnectionStatus.mock.calls),
		).not.toContain("sha256~secret-token");
	});

	it("throws an app error without running oc when the cluster is missing", async () => {
		getClusterById.mockResolvedValue(null);

		await expect(
			loginToCluster(999, { username: "developer", password: "secret" }),
		).rejects.toMatchObject({
			message: "Cluster not found",
			status: 404,
			code: "CLUSTER_NOT_FOUND",
		});
		expect(runOcCommand).not.toHaveBeenCalled();
		expect(updateClusterConnectionStatus).not.toHaveBeenCalled();
	});

	it("removes the temporary kubeconfig directory", async () => {
		const rmSpy = jest.spyOn(fs, "rm");
		getClusterById.mockResolvedValue({
			id: 1,
			apiUrl: "https://api.dev.example.com:6443",
		});
		runOcCommand
			.mockResolvedValueOnce({ stdout: "", stderr: "" })
			.mockResolvedValueOnce({ stdout: "developer\n", stderr: "" });
		updateClusterConnectionStatus.mockResolvedValue({ id: 1 });

		await loginToCluster(1, { username: "developer", password: "secret" });

		expect(rmSpy).toHaveBeenCalledWith(expect.any(String), {
			recursive: true,
			force: true,
		});
		rmSpy.mockRestore();
	});
});
