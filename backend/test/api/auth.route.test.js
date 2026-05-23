const request = require("supertest");
const {
	OC_NOT_INSTALLED_ERROR,
	OC_NOT_LOGGED_IN_ERROR,
	checkOcAuth,
} = require("../../src/service/ocAuth.service");

jest.mock("../../src/service/ocAuth.service", () => ({
	OC_NOT_INSTALLED_ERROR: "oc CLI is not installed or not available in PATH",
	OC_NOT_LOGGED_IN_ERROR: "Not logged in to OpenShift",
	checkOcAuth: jest.fn(),
}));

const app = require("../../src/app");

describe("GET /api/auth/status", () => {
	beforeEach(() => {
		checkOcAuth.mockReset();
	});

	it("returns authenticated without exposing the OpenShift token", async () => {
		checkOcAuth.mockResolvedValue({
			authenticated: true,
			token: "super-secret-token",
		});

		const response = await request(app.callback()).get("/api/auth/status");

		expect(response.status).toBe(200);
		expect(response.body).toEqual({ authenticated: true });
		expect(JSON.stringify(response.body)).not.toContain("super-secret-token");
	});

	it("returns a 500 response when the oc CLI is not installed", async () => {
		checkOcAuth.mockResolvedValue({
			authenticated: false,
			status: 500,
			error: OC_NOT_INSTALLED_ERROR,
		});

		const response = await request(app.callback()).get("/api/auth/status");

		expect(response.status).toBe(500);
		expect(response.body).toEqual({
			authenticated: false,
			error: OC_NOT_INSTALLED_ERROR,
		});
	});

	it("returns a 401 response when the user is not logged in", async () => {
		checkOcAuth.mockResolvedValue({
			authenticated: false,
			status: 401,
			error: OC_NOT_LOGGED_IN_ERROR,
		});

		const response = await request(app.callback()).get("/api/auth/status");

		expect(response.status).toBe(401);
		expect(response.body).toEqual({
			authenticated: false,
			error: OC_NOT_LOGGED_IN_ERROR,
		});
	});
});
