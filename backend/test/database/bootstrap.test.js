const fs = require("fs/promises");
const os = require("os");
const path = require("path");

const { bootstrapDatabase } = require("../../src/database/bootstrap");
const {
	DEFAULT_DATABASE_PATH,
	getDatabasePath,
} = require("../../src/database/sqlite");

describe("database bootstrap", () => {
	let tempDir;
	let database;

	afterEach(async () => {
		if (database) {
			await database.close();
			database = undefined;
		}

		if (tempDir) {
			await fs.rm(tempDir, { force: true, recursive: true });
			tempDir = undefined;
		}

		delete process.env.LOGPULSE_DB_PATH;
	});

	it("creates a local SQLite database and clusters table", async () => {
		tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "logpulse-db-"));
		const databasePath = path.join(tempDir, "metadata.sqlite");

		database = await bootstrapDatabase({ databasePath });

		const table = await database.get(
			"SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'clusters'",
		);
		const columns = await database.all("PRAGMA table_info(clusters)");

		expect(table).toEqual({ name: "clusters" });
		expect(columns.map((column) => column.name)).toEqual([
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
		]);
	});

	it("recreates incompatible local clusters tables", async () => {
		tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "logpulse-db-"));
		const databasePath = path.join(tempDir, "metadata.sqlite");

		database = await bootstrapDatabase({ databasePath });
		await database.exec("DROP TABLE clusters");
		await database.exec(`
			CREATE TABLE clusters (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				name TEXT NOT NULL,
				api_server TEXT NOT NULL
			);
		`);
		await database.exec(`
			INSERT INTO clusters (name, api_server)
			VALUES ('Legacy', 'https://api.legacy.example');
		`);
		await database.close();
		database = undefined;

		database = await bootstrapDatabase({ databasePath });

		const columns = await database.all("PRAGMA table_info(clusters)");
		const rows = await database.all("SELECT * FROM clusters");

		expect(columns.map((column) => column.name)).toEqual([
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
		]);
		expect(rows).toEqual([]);

		await database.run(
			`INSERT INTO clusters (name, apiUrl, createdAt, updatedAt)
			VALUES (?, ?, ?, ?)`,
			[
				"New",
				"https://api.new.example",
				new Date().toISOString(),
				new Date().toISOString(),
			],
		);
	});

	it("does not create secret storage columns", async () => {
		database = await bootstrapDatabase({ databasePath: ":memory:" });

		const columns = await database.all("PRAGMA table_info(clusters)");
		const columnNames = columns.map((column) => column.name);

		expect(columnNames).not.toEqual(
			expect.arrayContaining(["token", "password", "secret", "kubeconfig"]),
		);
	});

	it("uses a backend-local default database path", () => {
		expect(getDatabasePath()).toBe(DEFAULT_DATABASE_PATH);
		expect(DEFAULT_DATABASE_PATH).toContain(
			`${path.sep}backend${path.sep}.local${path.sep}`,
		);
	});
});
