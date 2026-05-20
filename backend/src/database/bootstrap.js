const { openSqliteDatabase } = require("./sqlite");

const CLUSTERS_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS clusters (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	name TEXT NOT NULL,
	api_server TEXT NOT NULL,
	context_name TEXT,
	namespace TEXT,
	last_seen_at TEXT,
	created_at TEXT NOT NULL DEFAULT (datetime('now')),
	updated_at TEXT NOT NULL DEFAULT (datetime('now')),
	UNIQUE (api_server, context_name)
);
`;

const CLUSTERS_UPDATED_AT_TRIGGER_SQL = `
CREATE TRIGGER IF NOT EXISTS clusters_set_updated_at
AFTER UPDATE ON clusters
FOR EACH ROW
BEGIN
	UPDATE clusters
	SET updated_at = datetime('now')
	WHERE id = OLD.id;
END;
`;

async function bootstrapDatabase(options = {}) {
	const database = await openSqliteDatabase(options.databasePath);

	await database.exec(`
		PRAGMA foreign_keys = ON;
		PRAGMA journal_mode = WAL;
		${CLUSTERS_TABLE_SQL}
		${CLUSTERS_UPDATED_AT_TRIGGER_SQL}
	`);

	return database;
}

module.exports = {
	CLUSTERS_TABLE_SQL,
	bootstrapDatabase,
};
