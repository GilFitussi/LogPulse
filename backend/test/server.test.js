describe("server startup", () => {
	beforeEach(() => {
		jest.resetModules();
	});

	it("resets persisted connected clusters before serving requests", async () => {
		const close = jest.fn((callback) => callback());
		const listen = jest.fn((port, callback) => {
			callback();
			return { close };
		});
		const app = { listen };
		const database = { close: jest.fn().mockResolvedValue() };
		const bootstrapDatabase = jest.fn().mockResolvedValue(database);
		const resetConnectedClustersOnStartup = jest.fn().mockResolvedValue(1);
		const processOn = jest
			.spyOn(process, "on")
			.mockImplementation(() => process);
		const consoleLog = jest.spyOn(console, "log").mockImplementation(() => {});
		const consoleError = jest
			.spyOn(console, "error")
			.mockImplementation(() => {});

		jest.doMock("../src/app", () => app);
		jest.doMock("../src/database/bootstrap", () => ({ bootstrapDatabase }));
		jest.doMock("../src/service/clusterManager.service", () => ({
			resetConnectedClustersOnStartup,
		}));

		require("../src/server");
		await new Promise(setImmediate);

		expect(bootstrapDatabase).toHaveBeenCalledTimes(1);
		expect(resetConnectedClustersOnStartup).toHaveBeenCalledWith({ database });
		expect(listen).toHaveBeenCalledTimes(1);
		expect(
			resetConnectedClustersOnStartup.mock.invocationCallOrder[0],
		).toBeLessThan(listen.mock.invocationCallOrder[0]);

		processOn.mockRestore();
		consoleLog.mockRestore();
		consoleError.mockRestore();
	});
});
