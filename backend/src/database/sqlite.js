const fs = require("fs/promises");
const path = require("path");
const sqlite3 = require("sqlite3").verbose();

const DEFAULT_DATABASE_DIR = path.resolve(__dirname, "../../.local");
const DEFAULT_DATABASE_PATH = path.join(
	DEFAULT_DATABASE_DIR,
	"logpulse.sqlite",
);

function getDatabasePath() {
	return process.env.LOGPULSE_DB_PATH || DEFAULT_DATABASE_PATH;
}

async function ensureDatabaseDirectory(databasePath) {
	if (databasePath === ":memory:") {
		return;
	}

	await fs.mkdir(path.dirname(databasePath), { recursive: true });
}

async function openSqliteDatabase(databasePath = getDatabasePath()) {
	await ensureDatabaseDirectory(databasePath);

	const db = await new Promise((resolve, reject) => {
		const connection = new sqlite3.Database(databasePath, (error) => {
			if (error) {
				reject(error);
				return;
			}

			resolve(connection);
		});
	});

	db.configure("busyTimeout", 5000);

	return {
		path: databasePath,
		run(sql, params = []) {
			return new Promise((resolve, reject) => {
				db.run(sql, params, function onRun(error) {
					if (error) {
						reject(error);
						return;
					}

					resolve({ changes: this.changes, lastID: this.lastID });
				});
			});
		},
		exec(sql) {
			return new Promise((resolve, reject) => {
				db.exec(sql, (error) => {
					if (error) {
						reject(error);
						return;
					}

					resolve();
				});
			});
		},
		get(sql, params = []) {
			return new Promise((resolve, reject) => {
				db.get(sql, params, (error, row) => {
					if (error) {
						reject(error);
						return;
					}

					resolve(row);
				});
			});
		},
		all(sql, params = []) {
			return new Promise((resolve, reject) => {
				db.all(sql, params, (error, rows) => {
					if (error) {
						reject(error);
						return;
					}

					resolve(rows);
				});
			});
		},
		close() {
			return new Promise((resolve, reject) => {
				db.close((error) => {
					if (error) {
						reject(error);
						return;
					}

					resolve();
				});
			});
		},
	};
}

module.exports = {
	DEFAULT_DATABASE_PATH,
	getDatabasePath,
	openSqliteDatabase,
};
