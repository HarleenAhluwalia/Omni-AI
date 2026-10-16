
/**
 * SCRUM-379
 * Task API Authentication and Ownership Security Tests
 *
 * Uses the existing Omni-AI Express app, JWT helper,
 * Jest, Supertest, and mocked Supabase client.
 */

jest.mock("../config/supabase", () => {
  const { createMockSupabase } = require("./helpers/supabaseMock");
  return createMockSupabase();
});

const request = require("supertest");
const jwt = require("jsonwebtoken");
const { createApp } = require("../src/app");
const supabase = require("../config/supabase");
const { signToken } = require("../src/middleware/auth");

const app = createApp();

const USER_A = {
  id: "11111111-1111-4111-8111-111111111111",
  email: "usera@example.com",
};

const USER_B = {
  id: "22222222-2222-4222-8222-222222222222",
  email: "userb@example.com",
};

const baseTask = {
  title: "Security Test Task",
  description: "SCRUM-379 authorization testing",
  due_date: "2026-10-20T00:00:00.000Z",
  point_value: 3,
  estimated_effort_minutes: 60,
  priority: "high",
};

const authHeader = (user) =>
  `Bearer ${signToken({
    id: user.id,
    email: user.email,
  })}`;

const createTaskFor = (user, overrides = {}) =>
  request(app)
    .post("/api/tasks")
    .set("Authorization", authHeader(user))
    .send({ ...baseTask, ...overrides });

beforeEach(() => {
  supabase.__reset();
});

describe("SCRUM-379: Authentication Required", () => {
  const routes = [
    ["GET", "/api/tasks"],
    ["GET", "/api/tasks/prioritized"],
    ["GET", "/api/tasks/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"],
    ["POST", "/api/tasks"],
    ["PUT", "/api/tasks/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"],
    ["DELETE", "/api/tasks/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"],
  ];

  test.each(routes)(
    "%s %s rejects requests without authentication",
    async (method, path) => {
      const response = await request(app)[method.toLowerCase()](path);

      expect(response.status).toBe(401);
    }
  );
});

describe("SCRUM-379: Invalid JWT", () => {
  test("Rejects malformed token", async () => {
    const response = await request(app)
      .get("/api/tasks")
      .set("Authorization", "Bearer invalid.jwt.token");

    expect(response.status).toBe(401);
  });

  test("Rejects expired token", async () => {
    // Start with a valid project-issued token, then
    // create an expired token using the same signature.
    const validToken = signToken({
      id: USER_A.id,
      email: USER_A.email,
    });

    const parts = validToken.split(".");
    const payload = jwt.decode(validToken);

    expect(parts).toHaveLength(3);
    expect(payload).toBeTruthy();

    // Expired tokens must be rejected. This uses a
    // deliberately expired JWT and the project's
    // configured test secret.
    const secret = process.env.JWT_SECRET;

    if (!secret) {
      throw new Error(
        "JWT_SECRET must be configured for the expired-token test"
      );
    }

    const expiredToken = jwt.sign(
      {
        sub: payload.sub,
        email: payload.email,
        exp: Math.floor(Date.now() / 1000) - 60,
      },
      secret
    );

    const response = await request(app)
      .get("/api/tasks")
      .set("Authorization", `Bearer ${expiredToken}`);

    expect(response.status).toBe(401);
  });
});

describe("SCRUM-379: Cross-User Authorization", () => {
  test("User A cannot read User B's task", async () => {
    const created = await createTaskFor(USER_B);
    expect(created.status).toBe(201);

    const taskId = created.body.data.id;

    const response = await request(app)
      .get(`/api/tasks/${taskId}`)
      .set("Authorization", authHeader(USER_A));

    expect(response.status).toBe(404);

    const ownerView = await request(app)
      .get(`/api/tasks/${taskId}`)
      .set("Authorization", authHeader(USER_B));

    expect(ownerView.status).toBe(200);
  });

  test("User A cannot update User B's task", async () => {
    const created = await createTaskFor(USER_B);
    expect(created.status).toBe(201);

    const taskId = created.body.data.id;

    const response = await request(app)
      .put(`/api/tasks/${taskId}`)
      .set("Authorization", authHeader(USER_A))
      .send({ title: "Unauthorized Change" });

    expect(response.status).toBe(404);

    const ownerView = await request(app)
      .get(`/api/tasks/${taskId}`)
      .set("Authorization", authHeader(USER_B));

    expect(ownerView.status).toBe(200);
    expect(ownerView.body.data.title).toBe(baseTask.title);
  });

  test("User A cannot delete User B's task", async () => {
    const created = await createTaskFor(USER_B);
    expect(created.status).toBe(201);

    const taskId = created.body.data.id;

    const response = await request(app)
      .delete(`/api/tasks/${taskId}`)
      .set("Authorization", authHeader(USER_A));

    expect(response.status).toBe(404);

    const ownerView = await request(app)
      .get(`/api/tasks/${taskId}`)
      .set("Authorization", authHeader(USER_B));

    expect(ownerView.status).toBe(200);
  });
});

describe("SCRUM-379: Client-Supplied user_id", () => {
  test("Cannot create a task for another user", async () => {
    const response = await createTaskFor(USER_A, {
      user_id: USER_B.id,
    });

    expect(response.status).toBe(201);
    expect(response.body.data.user_id).toBe(USER_A.id);
  });

  test("Cannot change task ownership", async () => {
    const created = await createTaskFor(USER_A);
    expect(created.status).toBe(201);

    const taskId = created.body.data.id;

    const response = await request(app)
      .put(`/api/tasks/${taskId}`)
      .set("Authorization", authHeader(USER_A))
      .send({
        title: "Updated Security Task",
        user_id: USER_B.id,
      });

    expect(response.status).toBe(200);
    expect(response.body.data.user_id).toBe(USER_A.id);

    const otherUserView = await request(app)
      .get(`/api/tasks/${taskId}`)
      .set("Authorization", authHeader(USER_B));

    expect(otherUserView.status).toBe(404);
  });
});

describe("SCRUM-379: Authorized Access", () => {
  test("Authenticated user can retrieve their own task", async () => {
    const created = await createTaskFor(USER_A);
    expect(created.status).toBe(201);

    const taskId = created.body.data.id;

    const response = await request(app)
      .get(`/api/tasks/${taskId}`)
      .set("Authorization", authHeader(USER_A));

    expect(response.status).toBe(200);
    expect(response.body.data.id).toBe(taskId);
    expect(response.body.data.user_id).toBe(USER_A.id);
  });
});
