const { openSqliteDatabase } = require("./sqlite");

const CLUSTERS_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS clusters (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	name TEXT NOT NULL,
	apiUrl TEXT NOT NULL,
	defaultNamespace TEXT,
	description TEXT,
	createdAt TEXT NOT NULL,
	updatedAt TEXT NOT NULL,
	lastConnectedAt TEXT,
	lastConnectionStatus TEXT,
	lastConnectionError TEXT
);
`;

const CLUSTERS_COLUMNS = [
	{ name: "id", definition: "INTEGER PRIMARY KEY AUTOINCREMENT" },
	{ name: "name", definition: "TEXT NOT NULL" },
	{ name: "apiUrl", definition: "TEXT NOT NULL" },
	{ name: "defaultNamespace", definition: "TEXT" },
	{ name: "description", definition: "TEXT" },
	{ name: "createdAt", definition: "TEXT NOT NULL" },
	{ name: "updatedAt", definition: "TEXT NOT NULL" },
	{ name: "lastConnectedAt", definition: "TEXT" },
	{ name: "lastConnectionStatus", definition: "TEXT" },
	{ name: "lastConnectionError", definition: "TEXT" },
];

const CLUSTERS_COLUMN_NAMES = CLUSTERS_COLUMNS.map((column) => column.name);

async function bootstrapDatabase(options = {}) {
	const database = await openSqliteDatabase(options.databasePath);

	await database.exec(`
		PRAGMA foreign_keys = ON;
		PRAGMA journal_mode = WAL;
		${CLUSTERS_TABLE_SQL}
	`);
	await normalizeClustersTable(database);

	return database;
}

async function normalizeClustersTable(database) {
	const columns = await database.all("PRAGMA table_info(clusters)");
	const existingColumnNames = new Set(columns.map((column) => column.name));
	const currentColumnNames = columns.map((column) => column.name);

	if (currentColumnNames.join(",") === CLUSTERS_COLUMN_NAMES.join(",")) {
		return;
	}

	const sourceExpression = (...candidateColumns) => {
		const availableColumns = candidateColumns.filter((column) =>
			existingColumnNames.has(column),
		);

		if (availableColumns.length === 0) {
			return "NULL";
		}

		return availableColumns.length === 1
			? availableColumns[0]
			: `COALESCE(${availableColumns.join(", ")})`;
	};

	await database.exec("BEGIN TRANSACTION;");

	try {
		await database.exec(`
			CREATE TABLE clusters_next (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				name TEXT NOT NULL,
				apiUrl TEXT NOT NULL,
				defaultNamespace TEXT,
				description TEXT,
				createdAt TEXT NOT NULL,
				updatedAt TEXT NOT NULL,
				lastConnectedAt TEXT,
				lastConnectionStatus TEXT,
				lastConnectionError TEXT
			);
		`);
		await database.exec(`
			INSERT INTO clusters_next (
				id,
				name,
				apiUrl,
				defaultNamespace,
				description,
				createdAt,
				updatedAt,
				lastConnectedAt,
				lastConnectionStatus,
				lastConnectionError
			)
			SELECT
				id,
				COALESCE(${sourceExpression("name")}, ''),
				COALESCE(${sourceExpression("apiUrl", "api_server")}, ''),
				${sourceExpression("defaultNamespace", "namespace")},
				${sourceExpression("description")},
				COALESCE(${sourceExpression("createdAt", "created_at")}, datetime('now')),
				COALESCE(${sourceExpression("updatedAt", "updated_at")}, datetime('now')),
				${sourceExpression("lastConnectedAt", "last_seen_at")},
				${sourceExpression("lastConnectionStatus")},
				${sourceExpression("lastConnectionError")}
			FROM clusters;
		`);
		await database.exec("DROP TABLE clusters;");
		await database.exec("ALTER TABLE clusters_next RENAME TO clusters;");
		await database.exec("COMMIT;");
	} catch (error) {
		await database.exec("ROLLBACK;");
		throw error;
	}
}

module.exports = {
	CLUSTERS_TABLE_SQL,
	bootstrapDatabase,
};
