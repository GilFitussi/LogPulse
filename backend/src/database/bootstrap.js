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

async function bootstrapDatabase(options = {}) {
	const database = await openSqliteDatabase(options.databasePath);

	await database.exec(`
		PRAGMA foreign_keys = ON;
		PRAGMA journal_mode = WAL;
		${CLUSTERS_TABLE_SQL}
	`);

	return database;
}

module.exports = {
	CLUSTERS_TABLE_SQL,
	bootstrapDatabase,
};
