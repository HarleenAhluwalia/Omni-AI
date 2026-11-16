
/** Sprint 5 regression: authentication and task payload validation. */

jest.mock("../config/supabase", () => {
  const { createMockSupabase } = require("./helpers/supabaseMock");
  return createMockSupabase();
});

const request = require("supertest");
const jwt = require("jsonwebtoken");
const { createApp } = require("../src/app");
const { signToken, JWT_SECRET } = require("../src/middleware/auth");

const app = createApp();

const user = {
  id: "11111111-1111-4111-8111-111111111111",
  email: "sprint5@example.com"
};

const token = () => signToken(user);

test("rejects extra Authorization header tokens", async () => {
  const response = await request(app)
    .get("/api/tasks")
    .set("Authorization", `Bearer ${token()} unexpected`);

  expect(response.status).toBe(401);
});

test("rejects signed JWT missing required identity claims", async () => {
  const malformed = jwt.sign(
    { email: user.email },
    JWT_SECRET
  );

  const response = await request(app)
    .get("/api/tasks")
    .set("Authorization", `Bearer ${malformed}`);

  expect(response.status).toBe(401);
});

test("create task with missing payload returns validation error, not 500", async () => {
  const response = await request(app)
    .post("/api/tasks")
    .set("Authorization", `Bearer ${token()}`)
    .set("Content-Type", "application/json")
    .send("");

  expect(response.status).toBe(400);
});

test("update task with missing payload returns validation error, not 500", async () => {
  const response = await request(app)
    .put("/api/tasks/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa")
    .set("Authorization", `Bearer ${token()}`)
    .set("Content-Type", "application/json")
    .send("");

  expect(response.status).toBe(400);
});
