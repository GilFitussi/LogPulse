const { bootstrapDatabase } = require("../database/bootstrap");

const CLUSTER_FIELDS = [
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

const MUTABLE_FIELDS = [
	"name",
	"apiUrl",
	"defaultNamespace",
	"description",
	"lastConnectedAt",
	"lastConnectionStatus",
	"lastConnectionError",
];

function toCluster(row) {
	if (!row) {
		return null;
	}

	return CLUSTER_FIELDS.reduce((cluster, field) => {
		cluster[field] = row[field];
		return cluster;
	}, {});
}

async function withDatabase(database, callback) {
	if (database) {
		return callback(database);
	}

	const managedDatabase = await bootstrapDatabase();

	try {
		return await callback(managedDatabase);
	} finally {
		await managedDatabase.close();
	}
}

function requireString(value, field) {
	if (typeof value !== "string" || value.trim().length === 0) {
		throw new TypeError(`${field} is required`);
	}

	return value.trim();
}

function optionalString(value, field) {
	if (value === undefined || value === null) {
		return null;
	}

	if (typeof value !== "string") {
		throw new TypeError(`${field} must be a string`);
	}

	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : null;
}

function buildClusterRecord(input) {
	return {
		name: requireString(input?.name, "name"),
		apiUrl: requireString(input?.apiUrl, "apiUrl"),
		defaultNamespace: optionalString(
			input?.defaultNamespace,
			"defaultNamespace",
		),
		description: optionalString(input?.description, "description"),
		lastConnectedAt: optionalString(input?.lastConnectedAt, "lastConnectedAt"),
		lastConnectionStatus: optionalString(
			input?.lastConnectionStatus,
			"lastConnectionStatus",
		),
		lastConnectionError: optionalString(
			input?.lastConnectionError,
			"lastConnectionError",
		),
	};
}

async function createCluster(input, options = {}) {
	const cluster = buildClusterRecord(input);
	const now = new Date().toISOString();

	return withDatabase(options.database, async (database) => {
		const result = await database.run(
			`INSERT INTO clusters (
				name,
				apiUrl,
				defaultNamespace,
				description,
				createdAt,
				updatedAt,
				lastConnectedAt,
				lastConnectionStatus,
				lastConnectionError
			) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
			[
				cluster.name,
				cluster.apiUrl,
				cluster.defaultNamespace,
				cluster.description,
				now,
				now,
				cluster.lastConnectedAt,
				cluster.lastConnectionStatus,
				cluster.lastConnectionError,
			],
		);

		return getClusterById(result.lastID, { database });
	});
}

async function listClusters(options = {}) {
	return withDatabase(options.database, async (database) => {
		const rows = await database.all(
			`SELECT ${CLUSTER_FIELDS.join(", ")}
			FROM clusters
			ORDER BY name COLLATE NOCASE ASC, id ASC`,
		);

		return rows.map(toCluster);
	});
}

async function getClusterById(id, options = {}) {
	return withDatabase(options.database, async (database) => {
		const row = await database.get(
			`SELECT ${CLUSTER_FIELDS.join(", ")}
			FROM clusters
			WHERE id = ?`,
			[id],
		);

		return toCluster(row);
	});
}

async function updateCluster(id, input, options = {}) {
	const updates = {};

	for (const field of MUTABLE_FIELDS) {
		if (Object.hasOwn(input || {}, field)) {
			if (field === "name" || field === "apiUrl") {
				updates[field] = requireString(input[field], field);
			} else {
				updates[field] = optionalString(input[field], field);
			}
		}
	}

	const fields = Object.keys(updates);
	if (fields.length === 0) {
		return getClusterById(id, options);
	}

	updates.updatedAt = new Date().toISOString();

	return withDatabase(options.database, async (database) => {
		const setClause = Object.keys(updates)
			.map((field) => `${field} = ?`)
			.join(", ");
		const result = await database.run(
			`UPDATE clusters SET ${setClause} WHERE id = ?`,
			[...Object.values(updates), id],
		);

		if (result.changes === 0) {
			return null;
		}

		return getClusterById(id, { database });
	});
}

async function deleteCluster(id, options = {}) {
	return withDatabase(options.database, async (database) => {
		const result = await database.run("DELETE FROM clusters WHERE id = ?", [
			id,
		]);
		return result.changes > 0;
	});
}

async function clusterExists(id, options = {}) {
	return withDatabase(options.database, async (database) => {
		const row = await database.get(
			"SELECT 1 AS found FROM clusters WHERE id = ?",
			[id],
		);
		return Boolean(row);
	});
}

module.exports = {
	createCluster,
	listClusters,
	getClusterById,
	updateCluster,
	deleteCluster,
	clusterExists,
};
