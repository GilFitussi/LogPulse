const { bootstrapDatabase } = require("../../src/database/bootstrap");
const {
	clusterExists,
	createCluster,
	deleteCluster,
	getClusterById,
	listClusters,
	resetConnectedClustersOnStartup,
	updateCluster,
	updateClusterConnectionStatus,
} = require("../../src/service/clusterManager.service");

const EXPECTED_CLUSTER_FIELDS = [
	"id",
	"name",
	"apiUrl",
	"defaultNamespace",
	"description",
	"createdAt",
	"updatedAt",
	"lastConnectedAt",
	"lastConnectionStatus",
	"lastConnectionError",
];

describe("cluster manager service", () => {
	let database;

	beforeEach(async () => {
		database = await bootstrapDatabase({ databasePath: ":memory:" });
	});

	afterEach(async () => {
		await database.close();
	});

	it("creates and reads clusters with only supported metadata fields", async () => {
		const cluster = await createCluster(
			{
				name: "Dev",
				apiUrl: "https://api.dev.example.com:6443",
				defaultNamespace: "apps",
				description: "Development cluster",
				token: "must-not-be-stored",
			},
			{ database },
		);

		expect(Object.keys(cluster)).toEqual(EXPECTED_CLUSTER_FIELDS);
		expect(cluster).toMatchObject({
			id: expect.any(Number),
			name: "Dev",
			apiUrl: "https://api.dev.example.com:6443",
			defaultNamespace: "apps",
			description: "Development cluster",
			lastConnectedAt: null,
			lastConnectionStatus: null,
			lastConnectionError: null,
		});
		expect(cluster.createdAt).toEqual(expect.any(String));
		expect(cluster.updatedAt).toBe(cluster.createdAt);

		await expect(getClusterById(cluster.id, { database })).resolves.toEqual(
			cluster,
		);
	});

	it("lists clusters ordered by name", async () => {
		const prod = await createCluster(
			{ name: "Prod", apiUrl: "https://api.prod.example.com:6443" },
			{ database },
		);
		const dev = await createCluster(
			{ name: "dev", apiUrl: "https://api.dev.example.com:6443" },
			{ database },
		);

		await expect(listClusters({ database })).resolves.toEqual([dev, prod]);
	});

	it("updates cluster metadata and connection status", async () => {
		const cluster = await createCluster(
			{ name: "Dev", apiUrl: "https://old.example.com" },
			{ database },
		);

		const updated = await updateCluster(
			cluster.id,
			{
				apiUrl: "https://new.example.com",
				defaultNamespace: "payments",
				lastConnectedAt: "2026-05-20T10:00:00.000Z",
				lastConnectionStatus: "connected",
				lastConnectionError: "",
			},
			{ database },
		);

		expect(updated).toMatchObject({
			id: cluster.id,
			name: "Dev",
			apiUrl: "https://new.example.com",
			defaultNamespace: "payments",
			lastConnectedAt: "2026-05-20T10:00:00.000Z",
			lastConnectionStatus: "connected",
			lastConnectionError: null,
		});
		expect(updated.createdAt).toBe(cluster.createdAt);
		expect(updated.updatedAt).toEqual(expect.any(String));
	});

	it("updates only cluster connection status fields without changing updatedAt", async () => {
		const cluster = await createCluster(
			{ name: "Dev", apiUrl: "https://api.dev.example.com:6443" },
			{ database },
		);

		const updated = await updateClusterConnectionStatus(
			cluster.id,
			{
				lastConnectedAt: "2026-05-20T10:00:00.000Z",
				lastConnectionStatus: "connected",
				lastConnectionError: "",
			},
			{ database },
		);

		expect(updated).toMatchObject({
			id: cluster.id,
			name: "Dev",
			apiUrl: "https://api.dev.example.com:6443",
			lastConnectedAt: "2026-05-20T10:00:00.000Z",
			lastConnectionStatus: "connected",
			lastConnectionError: null,
		});
		expect(updated.createdAt).toBe(cluster.createdAt);
		expect(updated.updatedAt).toBe(cluster.updatedAt);
	});

	it("resets persisted connected clusters to disconnected on startup", async () => {
		const connected = await createCluster(
			{
				name: "Connected",
				apiUrl: "https://connected.example.com",
				lastConnectedAt: "2026-05-20T10:00:00.000Z",
				lastConnectionStatus: "connected",
				lastConnectionError: "stale",
			},
			{ database },
		);
		const failed = await createCluster(
			{
				name: "Failed",
				apiUrl: "https://failed.example.com",
				lastConnectionStatus: "failed",
				lastConnectionError: "still failed",
			},
			{ database },
		);

		await expect(resetConnectedClustersOnStartup({ database })).resolves.toBe(
			1,
		);

		await expect(
			getClusterById(connected.id, { database }),
		).resolves.toMatchObject({
			id: connected.id,
			lastConnectedAt: "2026-05-20T10:00:00.000Z",
			lastConnectionStatus: "disconnected",
			lastConnectionError: null,
		});
		await expect(
			getClusterById(failed.id, { database }),
		).resolves.toMatchObject({
			id: failed.id,
			lastConnectionStatus: "failed",
			lastConnectionError: "still failed",
		});
	});

	it("returns null or false for missing clusters", async () => {
		await expect(getClusterById(404, { database })).resolves.toBeNull();
		await expect(
			updateCluster(404, { name: "Missing" }, { database }),
		).resolves.toBeNull();
		await expect(deleteCluster(404, { database })).resolves.toBe(false);
		await expect(
			updateClusterConnectionStatus(
				404,
				{ lastConnectionStatus: "failed" },
				{ database },
			),
		).resolves.toBeNull();
		await expect(clusterExists(404, { database })).resolves.toBe(false);
	});

	it("deletes clusters and reports existence", async () => {
		const cluster = await createCluster(
			{ name: "Dev", apiUrl: "https://api.dev.example.com:6443" },
			{ database },
		);

		await expect(clusterExists(cluster.id, { database })).resolves.toBe(true);
		await expect(deleteCluster(cluster.id, { database })).resolves.toBe(true);
		await expect(clusterExists(cluster.id, { database })).resolves.toBe(false);
		await expect(getClusterById(cluster.id, { database })).resolves.toBeNull();
	});

	it("requires name and apiUrl when creating clusters", async () => {
		await expect(
			createCluster({ apiUrl: "https://example.com" }, { database }),
		).rejects.toThrow("name is required");
		await expect(createCluster({ name: "Dev" }, { database })).rejects.toThrow(
			"apiUrl is required",
		);
	});
});
