const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { AppError } = require("../errors/app.error");
const {
	getClusterById,
	updateClusterConnectionStatus,
} = require("./clusterManager.service");
const {
	getOcErrorMessage,
	isOcNotInstalledError,
	runOcCommand,
} = require("./ocCommand.service");

const LOGIN_STATUS_CONNECTED = "connected";
const LOGIN_STATUS_FAILED = "failed";
const OC_NOT_INSTALLED_ERROR =
	"oc CLI is not installed or not available in PATH";

async function loginToCluster(clusterId, credentials) {
	const cluster = await getClusterById(clusterId);

	if (!cluster) {
		throw new AppError("Cluster not found", {
			status: 404,
			code: "CLUSTER_NOT_FOUND",
		});
	}

	const now = new Date().toISOString();
	const tempDirectory = await fs.mkdtemp(
		path.join(os.tmpdir(), "logpulse-oc-"),
	);
	const kubeconfigPath = path.join(tempDirectory, "config");
	const commandOptions = {
		env: {
			...process.env,
			KUBECONFIG: kubeconfigPath,
		},
	};

	try {
		await runOcCommand(
			buildLoginArgs(cluster.apiUrl, credentials),
			commandOptions,
		);

		const { stdout } = await runOcCommand(["whoami"], commandOptions);
		const username = stdout.trim();

		if (!username) {
			throw new Error("Unable to verify oc login");
		}

		const updatedCluster = await updateClusterConnectionStatus(cluster.id, {
			lastConnectedAt: now,
			lastConnectionStatus: LOGIN_STATUS_CONNECTED,
			lastConnectionError: null,
		});

		return {
			username,
			cluster: updatedCluster,
		};
	} catch (error) {
		const message = sanitizeOcError(
			isOcNotInstalledError(error)
				? OC_NOT_INSTALLED_ERROR
				: getOcErrorMessage(error) || "oc login failed",
			credentials,
		);
		const updatedCluster = await updateClusterConnectionStatus(cluster.id, {
			lastConnectedAt: now,
			lastConnectionStatus: LOGIN_STATUS_FAILED,
			lastConnectionError: message,
		});

		throw new AppError("Cluster login failed", {
			status: isOcNotInstalledError(error) ? 500 : 401,
			code: "CLUSTER_LOGIN_FAILED",
			details: {
				message,
				cluster: updatedCluster,
			},
			action: "Check the cluster API URL and credentials, then try again.",
		});
	} finally {
		await fs.rm(tempDirectory, { recursive: true, force: true });
	}
}

function sanitizeOcError(message, credentials) {
	let sanitized = message || "oc login failed";

	for (const secret of [credentials?.password, credentials?.token]) {
		if (typeof secret === "string" && secret.length > 0) {
			sanitized = sanitized.split(secret).join("[redacted]");
		}
	}

	return sanitized;
}

function buildLoginArgs(apiUrl, credentials) {
	if (credentials?.loginMethod === "token") {
		return ["login", apiUrl, "--token", credentials.token];
	}

	return [
		"login",
		apiUrl,
		"--username",
		credentials.username,
		"--password",
		credentials.password,
	];
}

module.exports = {
	LOGIN_STATUS_CONNECTED,
	LOGIN_STATUS_FAILED,
	loginToCluster,
};
