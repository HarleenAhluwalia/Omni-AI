
/**
 * Sprint 4 — Harleen Ahluwalia
 * SOC 2 CC6.1 — Logical Access Security
 * Jira: SCRUM-475
 *
 * Authentication Response Security Regression Tests
 *
 * Purpose:
 * Verify that authentication error responses reject
 * invalid requests without exposing sensitive data.
 *
 * All Supabase calls are mocked.
 * No real Supabase credentials are required.
 */

// Mock the existing server-side Supabase client.
jest.mock("../config/supabase", () => {
  const { createMockSupabase } = require("./helpers/supabaseMock");
  return createMockSupabase();
});

// Mock the separate Supabase authentication client.
jest.mock("@supabase/supabase-js", () => ({
  createClient: jest.fn(),
}));

const request = require("supertest");
const { createApp } = require("../src/app");

// Create the Express application for Supertest.
const app = createApp();

describe("Sprint 4 — Authentication Response Security", () => {
  // Dummy sensitive values used only for testing.
  const sensitiveValues = [
    "SuperSecretPassword123!",
    "fake-private-token-12345",
    "fake-service-role-key-67890",
  ];

  /**
   * Check that authentication responses do not
   * contain sensitive values supplied during testing.
   */
  const expectNoSensitiveValues = (response) => {
    const responseText = JSON.stringify({
      body: response.body,
      text: response.text,
    });

    for (const secret of sensitiveValues) {
      expect(responseText).not.toContain(secret);
    }
  };

  /**
   * TEST 1
   * Missing login credentials
   */
  test("rejects missing login credentials without exposing secrets", async () => {
    const response = await request(app)
      .post("/api/auth/login")
      .send({});

    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(response.status).toBeLessThan(500);

    expectNoSensitiveValues(response);
  });

  /**
   * TEST 2
   * Malformed login credentials
   */
  test("rejects malformed login credentials without exposing secrets", async () => {
    const response = await request(app)
      .post("/api/auth/login")
      .send({
        email: [],
        password: {},
      });

    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(response.status).toBeLessThan(500);

    expectNoSensitiveValues(response);
  });

  /**
   * TEST 3
   * Malformed registration credentials
   */
  test("rejects malformed registration credentials without exposing secrets", async () => {
    const response = await request(app)
      .post("/api/auth/register")
      .send({
        name: "Test Student",
        email: {},
        password: [],
      });

    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(response.status).toBeLessThan(500);

    expectNoSensitiveValues(response);
  });

  /**
   * TEST 4
   * Invalid authentication token
   */
  test("rejects an invalid token without exposing its value", async () => {
    const invalidToken = sensitiveValues[1];

    const response = await request(app)
      .get("/api/auth/me")
      .set("Authorization", `Bearer ${invalidToken}`);

    expect(response.status).toBe(401);

    expectNoSensitiveValues(response);
  });

  /**
   * TEST 5
   * Password exposure prevention
   */
  test("does not echo a supplied password in a failed login response", async () => {
    const password = sensitiveValues[0];

    const response = await request(app)
      .post("/api/auth/login")
      .send({
        email: "invalid-email",
        password,
      });

    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(response.status).toBeLessThan(500);

    expectNoSensitiveValues(response);
  });
});
