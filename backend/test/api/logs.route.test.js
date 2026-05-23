const http = require("http");
const app = require("../../src/app");
const { createLogBatcher } = require("../../src/api/logs.route");
const { streamPodLogs } = require("../../src/service/logs.service");
const { isValidNamespace } = require("../../src/service/namespaces.service");
const { isValidPod } = require("../../src/service/pods.service");

jest.mock("@kubernetes/client-node", () => ({
	AppsV1Api: class AppsV1Api {},
	CoreV1Api: class CoreV1Api {},
}));

jest.mock("../../src/service/logs.service", () => ({
	streamPodLogs: jest.fn(),
}));

jest.mock("../../src/service/namespaces.service", () => ({
	isValidNamespace: jest.fn(() => true),
}));

jest.mock("../../src/service/pods.service", () => ({
	isValidPod: jest.fn(() => true),
}));

jest.mock("../../src/service/kubeClient.service", () => ({
	createKubeClient: jest.fn(),
	createKubeConfig: jest.fn(),
}));

function waitForTick() {
	return new Promise((resolve) => setImmediate(resolve));
}

function delay(ms) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

function openLogStream(path = "/api/logs/my-project/api-123") {
	const server = app.listen();
	const { port } = server.address();

	return new Promise((resolve, reject) => {
		let body = "";
		const request = http.get(
			{
				host: "127.0.0.1",
				port,
				path,
				headers: { Accept: "text/event-stream" },
			},
			(response) => {
				response.setEncoding("utf8");
				response.on("data", (chunk) => {
					body += chunk;

					if (body.includes(": connected\n\n")) {
						resolve({
							response,
							getBody: () => body,
							close: () => {
								request.destroy();
								server.close();
							},
						});
					}
				});
			},
		);

		request.on("error", reject);
		server.on("error", reject);
	});
}

describe("GET /api/logs/:namespace/:pod", () => {
	beforeEach(() => {
		jest.clearAllMocks();
		isValidNamespace.mockReturnValue(true);
		isValidPod.mockReturnValue(true);
	});

	it("buffers log lines and sends them as SSE batches", async () => {
		let onLogLine;
		const abort = jest.fn();
		streamPodLogs.mockImplementation(async (_namespace, _pod, callback) => {
			onLogLine = callback;
			return { abort };
		});

		const stream = await openLogStream();
		await waitForTick();

		onLogLine({ timestamp: "2026-05-10T12:13:14Z", line: "first" });
		onLogLine({ line: "second" });
		await delay(150);

		expect(stream.response.statusCode).toBe(200);
		expect(stream.response.headers["content-type"]).toContain(
			"text/event-stream",
		);
		expect(stream.getBody()).toContain("event: log\n");
		expect(stream.getBody()).toContain(
			`data: ${JSON.stringify([
				{ timestamp: "2026-05-10T12:13:14Z", line: "first" },
				{ line: "second" },
			])}\n\n`,
		);
		expect(streamPodLogs).toHaveBeenCalledWith(
			"my-project",
			"api-123",
			expect.any(Function),
			undefined,
		);

		stream.close();
	});

	it("flushes buffered logs when stopped during disconnect cleanup", () => {
		const write = jest.fn();
		const batcher = createLogBatcher({
			destroyed: false,
			writableEnded: false,
			write,
		});

		batcher.add({ line: "pending" });
		batcher.stop();

		expect(write).toHaveBeenCalledWith("event: log\n");
		expect(write).toHaveBeenCalledWith(
			`data: ${JSON.stringify([{ line: "pending" }])}\n\n`,
		);
	});

	it("passes a requested container to the log stream service", async () => {
		streamPodLogs.mockResolvedValue({ abort: jest.fn() });

		const stream = await openLogStream(
			"/api/logs/my-project/api-123?container=api",
		);
		await waitForTick();

		expect(streamPodLogs).toHaveBeenCalledWith(
			"my-project",
			"api-123",
			expect.any(Function),
			"api",
		);

		stream.close();
	});

	it("rejects invalid namespace params before opening a stream", async () => {
		isValidNamespace.mockReturnValue(false);

		const server = app.listen();
		const response = await new Promise((resolve, reject) => {
			const request = http.get(
				{
					host: "127.0.0.1",
					port: server.address().port,
					path: "/api/logs/Invalid_Namespace/api-123",
				},
				resolve,
			);
			request.on("error", reject);
		});

		expect(response.statusCode).toBe(400);
		expect(streamPodLogs).not.toHaveBeenCalled();
		server.close();
	});
});
