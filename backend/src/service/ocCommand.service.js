const { execFile } = require("node:child_process");

function runOcCommand(args, options = {}) {
	return new Promise((resolve, reject) => {
		execFile(
			"oc",
			args,
			{
				encoding: "utf8",
				timeout: 10_000,
				maxBuffer: 1024 * 1024,
				...options,
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

function getOcErrorMessage(error) {
	return error?.stderr?.trim() || error?.stdout?.trim() || error?.message;
}

function isOcNotInstalledError(error) {
	return error && error.code === "ENOENT";
}

module.exports = {
	getOcErrorMessage,
	isOcNotInstalledError,
	runOcCommand,
};
