const app = require("./app");
const { bootstrapDatabase } = require("./database/bootstrap");

const port = process.env.PORT || 3000;

async function startServer() {
	const database = await bootstrapDatabase();
	const server = app.listen(port, () => {
		console.log(`Server running on port ${port}`);
	});

	async function shutdown() {
		server.close(async () => {
			await database.close();
			process.exit(0);
		});
	}

	process.on("SIGINT", shutdown);
	process.on("SIGTERM", shutdown);
}

startServer().catch((error) => {
	console.error("Failed to start server", error);
	process.exit(1);
});
