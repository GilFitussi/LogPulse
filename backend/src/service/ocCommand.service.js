const { execFile } = require("node:child_process");

function runOcCommand(args, options = {}) {
	const { input, ...execOptions } = options;

	return new Promise((resolve, reject) => {
		const child = execFile(
			"oc",
			args,
			{
				encoding: "utf8",
				timeout: 10_000,
				maxBuffer: 1024 * 1024,
				...execOptions,
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

		if (child?.stdin) {
			if (input !== undefined) {
				child.stdin.end(input);
				return;
			}

			child.stdin.end();
		}
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
