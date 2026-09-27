// Task routes talk to Supabase directly, so mock it before app.js (and
// everything it requires) loads. This keeps these tests fast, offline, and
// independent of any real project.
jest.mock("../config/supabase", () => {
  const { createMockSupabase } = require("./helpers/supabaseMock");
  return createMockSupabase();
});
 
const request = require("supertest");
const { createApp } = require("../src/app");
const supabase = require("../config/supabase");
 
const app = createApp();
 
// taskController.js validates user_id as a real UUID before touching
// Supabase, so these fixtures must be UUID-shaped, not plain strings.
const USER_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_USER_ID = "22222222-2222-4222-8222-222222222222";
 
const baseTask = {
  title: "Write Sprint 1 report",
  description: "Summarize velocity and blockers",
  due_date: "2026-09-19T00:00:00.000Z",
  point_value: 3,
  estimated_effort_minutes: 90,
  priority: "high",
};
 
const createTaskFor = async (userId, overrides = {}) =>
  request(app)
    .post("/api/tasks")
    .send({ ...baseTask, ...overrides, user_id: userId });
 
beforeEach(() => {
  supabase.__reset();
});
 
describe("POST /api/tasks", () => {
  it("creates a task with default not_started status", async () => {
    const res = await createTaskFor(USER_ID);
 
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.title).toBe(baseTask.title);
    expect(res.body.data.user_id).toBe(USER_ID);
    expect(res.body.data.id).toBeDefined();
  });
 
  it("rejects a task with no title", async () => {
    const res = await request(app)
      .post("/api/tasks")
      .send({ ...baseTask, title: "  ", user_id: USER_ID });
 
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });
 
  it("rejects a task with no user_id", async () => {
    const res = await request(app).post("/api/tasks").send(baseTask);
 
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/user_id/i);
  });
 
  it("rejects an invalid priority", async () => {
    const res = await createTaskFor(USER_ID, { priority: "urgent" });
 
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/priority/i);
  });
 
  it("rejects a negative point_value", async () => {
    const res = await createTaskFor(USER_ID, { point_value: -1 });
 
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/point_value/i);
  });
 
  it("trims whitespace from the title", async () => {
    const res = await createTaskFor(USER_ID, { title: "  Padded title  " });
 
    expect(res.status).toBe(201);
    expect(res.body.data.title).toBe("Padded title");
  });
});
 
describe("GET /api/tasks", () => {
  it("requires a user_id", async () => {
    const res = await request(app).get("/api/tasks");
 
    expect(res.status).toBe(400);
  });
 
  it("only returns tasks belonging to the requesting user", async () => {
    await createTaskFor(USER_ID, { title: "Mine" });
    await createTaskFor(OTHER_USER_ID, { title: "Not mine" });
 
    const res = await request(app).get(`/api/tasks?user_id=${USER_ID}`);
 
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].title).toBe("Mine");
  });
 
  it("returns an empty list for a user with no tasks", async () => {
    const res = await request(app).get(`/api/tasks?user_id=${USER_ID}`);
 
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });
});
 
describe("GET /api/tasks/:id", () => {
  it("returns a single task owned by the user", async () => {
    const created = await createTaskFor(USER_ID);
 
    const res = await request(app).get(
      `/api/tasks/${created.body.data.id}?user_id=${USER_ID}`
    );
 
    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(created.body.data.id);
  });
 
  it("returns 404 for a task owned by a different user", async () => {
    const created = await createTaskFor(OTHER_USER_ID);
 
    const res = await request(app).get(
      `/api/tasks/${created.body.data.id}?user_id=${USER_ID}`
    );
 
    expect(res.status).toBe(404);
  });
 
  it("returns 404 for a nonexistent task", async () => {
    const res = await request(app).get(
      `/api/tasks/99999999-9999-4999-8999-999999999999?user_id=${USER_ID}`
    );
 
    expect(res.status).toBe(404);
  });
});
 
describe("PUT /api/tasks/:id — status updates", () => {
  it("defaults to not_started until explicitly changed", async () => {
    const created = await createTaskFor(USER_ID);
    expect(created.body.data.completion_status).toBeUndefined();
  });
 
  it("moves a task to in_progress", async () => {
    const created = await createTaskFor(USER_ID);
 
    const res = await request(app)
      .put(`/api/tasks/${created.body.data.id}?user_id=${USER_ID}`)
      .send({ completion_status: "in_progress" });
 
    expect(res.status).toBe(200);
    expect(res.body.data.completion_status).toBe("in_progress");
  });
 
  it("marks a task completed", async () => {
    const created = await createTaskFor(USER_ID);
 
    const res = await request(app)
      .put(`/api/tasks/${created.body.data.id}?user_id=${USER_ID}`)
      .send({ completion_status: "completed" });
 
    expect(res.status).toBe(200);
    expect(res.body.data.completion_status).toBe("completed");
  });
 
  it("rejects an invalid completion_status", async () => {
    const created = await createTaskFor(USER_ID);
 
    const res = await request(app)
      .put(`/api/tasks/${created.body.data.id}?user_id=${USER_ID}`)
      .send({ completion_status: "done" });
 
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/completion_status/i);
  });
 
  it("rejects an update with no fields", async () => {
    const created = await createTaskFor(USER_ID);
 
    const res = await request(app)
      .put(`/api/tasks/${created.body.data.id}?user_id=${USER_ID}`)
      .send({});
 
    expect(res.status).toBe(400);
  });
 
  it("returns 404 when updating another user's task", async () => {
    const created = await createTaskFor(OTHER_USER_ID);
 
    const res = await request(app)
      .put(`/api/tasks/${created.body.data.id}?user_id=${USER_ID}`)
      .send({ completion_status: "completed" });
 
    expect(res.status).toBe(404);
  });
 
  it("rejects clearing the title to blank", async () => {
    const created = await createTaskFor(USER_ID);
 
    const res = await request(app)
      .put(`/api/tasks/${created.body.data.id}?user_id=${USER_ID}`)
      .send({ title: "   " });
 
    expect(res.status).toBe(400);
  });
});
 
describe("DELETE /api/tasks/:id", () => {
  it("deletes a task owned by the user", async () => {
    const created = await createTaskFor(USER_ID);
 
    const res = await request(app).delete(
      `/api/tasks/${created.body.data.id}?user_id=${USER_ID}`
    );
 
    expect(res.status).toBe(200);
 
    const followUp = await request(app).get(
      `/api/tasks/${created.body.data.id}?user_id=${USER_ID}`
    );
    expect(followUp.status).toBe(404);
  });
 
  it("returns 404 when deleting another user's task", async () => {
    const created = await createTaskFor(OTHER_USER_ID);
 
    const res = await request(app).delete(
      `/api/tasks/${created.body.data.id}?user_id=${USER_ID}`
    );
 
    expect(res.status).toBe(404);
  });
});
 
describe("End-to-end: create, update, complete, delete", () => {
  it("walks a task through its full lifecycle", async () => {
    const created = await createTaskFor(USER_ID, {
      title: "Ship Sprint 1 demo",
    });
    const taskId = created.body.data.id;
 
    const inProgress = await request(app)
      .put(`/api/tasks/${taskId}?user_id=${USER_ID}`)
      .send({ completion_status: "in_progress" });
    expect(inProgress.body.data.completion_status).toBe("in_progress");
 
    const completed = await request(app)
      .put(`/api/tasks/${taskId}?user_id=${USER_ID}`)
      .send({ completion_status: "completed" });
    expect(completed.body.data.completion_status).toBe("completed");
 
    const deleted = await request(app).delete(
      `/api/tasks/${taskId}?user_id=${USER_ID}`
    );
    expect(deleted.status).toBe(200);
  });
});
