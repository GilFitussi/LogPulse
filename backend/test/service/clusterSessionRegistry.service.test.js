describe("cluster session registry service", () => {
	function loadRegistry() {
		jest.resetModules();
		return require("../../src/service/clusterSessionRegistry.service");
	}

	it("stores, reads, checks, and clears a cluster session", () => {
		const registry = loadRegistry();
		const session = {
			clusterId: 1,
			kubeconfigContent: "apiVersion: v1\n",
			username: "developer",
			connectedAt: "2026-05-20T10:00:00.000Z",
		};

		expect(registry.hasClusterSession(1)).toBe(false);
		expect(registry.getClusterSession(1)).toBeUndefined();

		registry.setClusterSession(1, session);

		expect(registry.hasClusterSession(1)).toBe(true);
		expect(registry.getClusterSession(1)).toEqual(session);
		expect(registry.clearClusterSession(1)).toBe(true);
		expect(registry.hasClusterSession(1)).toBe(false);
		expect(registry.getClusterSession(1)).toBeUndefined();
	});

	it("keeps cluster sessions isolated per clusterId", () => {
		const registry = loadRegistry();

		registry.setClusterSession(1, {
			clusterId: 1,
			kubeconfigContent: "cluster-1",
			username: "dev-1",
			connectedAt: "2026-05-20T10:00:00.000Z",
		});
		registry.setClusterSession(2, {
			clusterId: 2,
			kubeconfigContent: "cluster-2",
			username: "dev-2",
			connectedAt: "2026-05-20T11:00:00.000Z",
		});

		expect(registry.getClusterSession(1)).toMatchObject({
			clusterId: 1,
			kubeconfigContent: "cluster-1",
		});
		expect(registry.getClusterSession(2)).toMatchObject({
			clusterId: 2,
			kubeconfigContent: "cluster-2",
		});

		registry.clearClusterSession(1);

		expect(registry.getClusterSession(1)).toBeUndefined();
		expect(registry.getClusterSession(2)).toMatchObject({
			clusterId: 2,
			kubeconfigContent: "cluster-2",
		});
	});
});
