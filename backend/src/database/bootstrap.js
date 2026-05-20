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

const CLUSTERS_COLUMN_NAMES = [
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

async function bootstrapDatabase(options = {}) {
	const database = await openSqliteDatabase(options.databasePath);

	await database.exec(`
		PRAGMA foreign_keys = ON;
		PRAGMA journal_mode = WAL;
		${CLUSTERS_TABLE_SQL}
	`);
	await ensureClustersTableSchema(database);

	return database;
}

async function ensureClustersTableSchema(database) {
	const columns = await database.all("PRAGMA table_info(clusters)");
	const columnNames = columns.map((column) => column.name);
	const schemaMatches =
		columnNames.join(",") === CLUSTERS_COLUMN_NAMES.join(",");

	if (schemaMatches) {
		return;
	}

	await database.exec(`
		DROP TABLE clusters;
		${CLUSTERS_TABLE_SQL}
	`);
}

module.exports = {
	CLUSTERS_TABLE_SQL,
	bootstrapDatabase,
};
