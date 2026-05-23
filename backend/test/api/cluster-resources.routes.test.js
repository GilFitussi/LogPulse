const request = require("supertest");
const { getClusterById } = require("../../src/service/clusterManager.service");
const {
	NOT_IMPLEMENTED_MESSAGE,
} = require("../../src/api/cluster-resources.routes");

jest.mock("../../src/service/clusterManager.service", () => ({
	getClusterById: jest.fn(),
}));

const app = require("../../src/app");

const cluster = {
	id: 1,
	name: "Dev",
	apiUrl: "https://api.dev.example.com:6443",
};

beforeEach(() => {
	getClusterById.mockReset();
	getClusterById.mockResolvedValue(cluster);
});

const resourceEndpointPaths = [
	"/api/clusters/1/namespaces",
	"/api/clusters/1/namespaces/my-project/deployments",
	"/api/clusters/1/namespaces/my-project/pods",
	"/api/clusters/1/namespaces/my-project/deployments/api/pods",
	"/api/clusters/1/namespaces/my-project/pods/api-123/logs",
];

describe("cluster-scoped resource endpoints", () => {
	it.each(resourceEndpointPaths)(
		"returns 501 for existing cluster resource endpoint %s",
		async (path) => {
			const response = await request(app.callback()).get(path);

			expect(response.status).toBe(501);
			expect(response.body).toEqual({ error: NOT_IMPLEMENTED_MESSAGE });
			expect(getClusterById).toHaveBeenCalledWith(1);
		},
	);

	it("returns 404 when the cluster does not exist", async () => {
		getClusterById.mockResolvedValue(null);

		const response = await request(app.callback()).get(
			"/api/clusters/999/namespaces",
		);

		expect(response.status).toBe(404);
		expect(response.body).toEqual({ error: "Cluster not found" });
	});
});
