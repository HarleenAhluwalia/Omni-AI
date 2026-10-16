
/**
 * SCRUM-379
 * Task API Authentication and Ownership Tests
 *
 * Tests:
 * - Missing authentication
 * - Invalid and expired JWTs
 * - Cross-user task access
 * - Client-supplied user_id protection
 * - Authorized task operations
 *
 * IMPORTANT:
 * Adapt the app import, JWT secret, and test fixtures
 * to the existing Omni-AI backend before running.
 */

const request = require("supertest");
const jwt = require("jsonwebtoken");

// Adjust this import to match your Express app.
// The app should be exported without calling listen().
const app = require("../app");

const TEST_SECRET =
  process.env.JWT_SECRET || "test-only-jwt-secret";

const USER_A = {
  id: "11111111-1111-4111-8111-111111111111",
  email: "usera@example.com",
};

const USER_B = {
  id: "22222222-2222-4222-8222-222222222222",
  email: "userb@example.com",
};

const TASK_A_ID =
  "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

const TASK_B_ID =
  "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

function createToken(user, options = {}) {
  return jwt.sign(
    {
      id: user.id,
      userId: user.id,
      sub: user.id,
      email: user.email,
    },
    TEST_SECRET,
    {
      expiresIn: "1h",
      ...options,
    }
  );
}

function authHeader(user) {
  return `Bearer ${createToken(user)}`;
}

describe("SCRUM-379: Task API Security", () => {
  describe("Authentication required", () => {
    test("GET /api/tasks rejects missing token", async () => {
      const res = await request(app)
        .get("/api/tasks");

      expect(res.status).toBe(401);
    });

    test("GET /api/tasks/prioritized rejects missing token", async () => {
      const res = await request(app)
        .get("/api/tasks/prioritized");

      expect(res.status).toBe(401);
    });

    test("GET /api/tasks/:id rejects missing token", async () => {
      const res = await request(app)
        .get(`/api/tasks/${TASK_A_ID}`);

      expect(res.status).toBe(401);
    });

    test("POST /api/tasks rejects missing token", async () => {
      const res = await request(app)
        .post("/api/tasks")
        .send({
          title: "Unauthorized Task",
          user_id: USER_A.id,
        });

      expect(res.status).toBe(401);
    });

    test("PUT /api/tasks/:id rejects missing token", async () => {
      const res = await request(app)
        .put(`/api/tasks/${TASK_A_ID}`)
        .send({
          title: "Unauthorized Update",
        });

      expect(res.status).toBe(401);
    });

    test("DELETE /api/tasks/:id rejects missing token", async () => {
      const res = await request(app)
        .delete(`/api/tasks/${TASK_A_ID}`);

      expect(res.status).toBe(401);
    });
  });

  describe("Invalid JWT handling", () => {
    test("Rejects malformed JWT", async () => {
      const res = await request(app)
        .get("/api/tasks")
        .set(
          "Authorization",
          "Bearer invalid.jwt.token"
        );

      expect(res.status).toBe(401);
    });

    test("Rejects expired JWT", async () => {
      const expiredToken = jwt.sign(
        {
          id: USER_A.id,
          userId: USER_A.id,
          sub: USER_A.id,
        },
        TEST_SECRET,
        { expiresIn: -10 }
      );

      const res = await request(app)
        .get("/api/tasks")
        .set(
          "Authorization",
          `Bearer ${expiredToken}`
        );

      expect(res.status).toBe(401);
    });
  });

  describe("Task ownership", () => {
    test("User A cannot retrieve User B's task", async () => {
      const res = await request(app)
        .get(`/api/tasks/${TASK_B_ID}`)
        .set(
          "Authorization",
          authHeader(USER_A)
        );

      expect([403, 404]).toContain(res.status);
    });

    test("User A cannot update User B's task", async () => {
      const res = await request(app)
        .put(`/api/tasks/${TASK_B_ID}`)
        .set(
          "Authorization",
          authHeader(USER_A)
        )
        .send({
          title: "Unauthorized Modification",
        });

      expect([403, 404]).toContain(res.status);
    });

    test("User A cannot delete User B's task", async () => {
      const res = await request(app)
        .delete(`/api/tasks/${TASK_B_ID}`)
        .set(
          "Authorization",
          authHeader(USER_A)
        );

      expect([403, 404]).toContain(res.status);
    });
  });

  describe("Client-supplied user_id", () => {
    test("Cannot create a task for another user", async () => {
      const res = await request(app)
        .post("/api/tasks")
        .set(
          "Authorization",
          authHeader(USER_A)
        )
        .send({
          title: "Ownership Test",
          user_id: USER_B.id,
        });

      if (res.status === 201) {
        expect(res.body.user_id).toBe(USER_A.id);
      } else {
        expect([400, 403]).toContain(res.status);
      }
    });

    test("Cannot override task owner during update", async () => {
      const res = await request(app)
        .put(`/api/tasks/${TASK_A_ID}`)
        .set(
          "Authorization",
          authHeader(USER_A)
        )
        .send({
          user_id: USER_B.id,
        });

      if (res.status === 200) {
        expect(res.body.user_id).toBe(USER_A.id);
      } else {
        expect([400, 403]).toContain(res.status);
      }
    });
  });

  describe("Authorized access", () => {
    test("Authenticated user can retrieve their tasks", async () => {
      const res = await request(app)
        .get("/api/tasks")
        .set(
          "Authorization",
          authHeader(USER_A)
        );

      expect(res.status).toBe(200);
    });
  });
});
