const {
	KubernetesApiError,
	OpenShiftAuthError,
} = require("../errors/app.error");
const {
	getOcErrorMessage,
	isOcNotInstalledError,
	runOcCommand,
} = require("./ocCommand.service");
const {
	resolveOptionalCluster,
	withClusterServer,
} = require("./clusterResourceTarget.service");

const NAMESPACE_NAME_PATTERN = /^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/;
const MAX_NAMESPACE_LENGTH = 63;

function isValidNamespace(namespace) {
	return (
		typeof namespace === "string" &&
		namespace.length > 0 &&
		namespace.length <= MAX_NAMESPACE_LENGTH &&
		NAMESPACE_NAME_PATTERN.test(namespace)
	);
}

function parseProjectList(stdout) {
	return stdout
		.split("\n")
		.map((project) => project.trim())
		.filter(Boolean);
}

function isOcAuthError(error) {
	const message = getOcErrorMessage(error)?.toLowerCase() || "";
	return isOcNotInstalledError(error) || message.includes("must be logged in");
}

async function listNamespaces(clusterId) {
	const args = ["projects", "-q"];
	const cluster = await resolveOptionalCluster(clusterId);

	try {
		const { stdout } = await runOcCommand(
			cluster ? withClusterServer(args, cluster) : args,
		);
		return parseProjectList(stdout);
	} catch (error) {
		const message = getOcErrorMessage(error);

		if (isOcAuthError(error)) {
			throw new OpenShiftAuthError(message);
		}

		throw new KubernetesApiError(
			message || "Unable to list OpenShift projects",
		);
	}
}

module.exports = {
	isValidNamespace,
	listNamespaces,
};
