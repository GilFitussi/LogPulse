const { PassThrough } = require("stream");

jest.mock("node-fetch", () => jest.fn());

jest.mock("../../src/service/kubeClient.service", () => ({
	createKubeConfig: jest.fn(),
}));

const fetch = require("node-fetch");
const { createKubeConfig } = require("../../src/service/kubeClient.service");
const {
	parseLogLine,
	streamPodLogs,
} = require("../../src/service/logs.service");

function waitForStream() {
	return new Promise((resolve) => setImmediate(resolve));
}

describe("parseLogLine", () => {
	it("extracts an RFC3339 timestamp when Kubernetes includes one", () => {
		expect(parseLogLine("2026-05-10T12:13:14.123456789Z app started")).toEqual({
			timestamp: "2026-05-10T12:13:14.123456789Z",
			line: "app started",
		});
	});

	it("returns only line text when no timestamp is available", () => {
		expect(parseLogLine("app started")).toEqual({ line: "app started" });
	});
});

describe("streamPodLogs", () => {
	const kubeConfig = {
		getCurrentCluster: jest.fn(),
		applyToFetchOptions: jest.fn(),
	};

	beforeEach(() => {
		jest.clearAllMocks();
		kubeConfig.getCurrentCluster.mockReturnValue({
			server: "https://api.example.test",
		});
		kubeConfig.applyToFetchOptions.mockResolvedValue({
			headers: { authorization: "Bearer token" },
		});
		createKubeConfig.mockResolvedValue(kubeConfig);
	});

	it("streams Kubernetes log chunks as individual parsed lines", async () => {
		const body = new PassThrough();
		const lines = [];
		fetch.mockResolvedValue({ ok: true, body });

		await streamPodLogs("my-project", "api-123", (line) => lines.push(line));

		body.write("2026-05-10T12:13:14Z first line\nplain");
		body.write(" line\n");
		await waitForStream();

		expect(fetch).toHaveBeenCalledWith(
			"https://api.example.test/api/v1/namespaces/my-project/pods/api-123/log?follow=true&timestamps=true",
			expect.objectContaining({
				method: "GET",
				headers: { authorization: "Bearer token" },
			}),
		);
		expect(lines).toEqual([
			{ timestamp: "2026-05-10T12:13:14Z", line: "first line" },
			{ line: "plain line" },
		]);
	});

	it("aborts the Kubernetes request and destroys streams during cleanup", async () => {
		const body = new PassThrough();
		let requestOptions;
		fetch.mockImplementation((_url, options) => {
			requestOptions = options;
			return Promise.resolve({ ok: true, body });
		});

		const stream = await streamPodLogs("my-project", "api-123", jest.fn());
		stream.abort();

		expect(requestOptions.signal.aborted).toBe(true);
		expect(body.destroyed).toBe(true);
	});

	it("maps Kubernetes log API errors", async () => {
		const body = { message: 'pods "missing" not found' };
		fetch.mockResolvedValue({
			ok: false,
			status: 404,
			json: jest.fn().mockResolvedValue(body),
		});

		await expect(
			streamPodLogs("my-project", "missing", jest.fn()),
		).rejects.toMatchObject({
			message: "Kubernetes API error",
			details: 'pods "missing" not found',
			status: 404,
		});
	});
});
