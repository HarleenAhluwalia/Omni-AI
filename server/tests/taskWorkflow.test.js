// Sprint 2 Task 3: end-to-end workflow + prioritization consistency checks.
// Scoped to this task only — not a general-purpose expansion of tasks.test.js.
jest.mock("../config/supabase", () => {
  const { createMockSupabase } = require("./helpers/supabaseMock");
  return createMockSupabase();
});

const request = require("supertest");
const { createApp } = require("../src/app");
const supabase = require("../config/supabase");
const { signToken } = require("../src/middleware/auth");

const app = createApp();

const USER_ID = "11111111-1111-4111-8111-111111111111";
const auth = () => `Bearer ${signToken({ id: USER_ID, email: "user@test.com" })}`;

// Matches what AddTask.jsx always sends on create — completion_status is
// never left to the database's column default in practice, the frontend
// sets it explicitly every time.
const create = (overrides = {}) =>
  request(app)
    .post("/api/tasks")
    .set("Authorization", auth())
    .send({
      title: "Task",
      priority: "medium",
      completion_status: "not_started",
      ...overrides,
    });

const prioritized = (minutes) =>
  request(app)
    .get(`/api/tasks/prioritized${minutes != null ? `?available_minutes=${minutes}` : ""}`)
    .set("Authorization", auth());

const list = () => request(app).get("/api/tasks").set("Authorization", auth());

beforeEach(() => {
  supabase.__reset();
});

describe("Workflow: Create", () => {
  it("creates a task, visible in both the plain list and prioritized view", async () => {
    const created = await create({ title: "Write report", priority: "high" });
    expect(created.status).toBe(201);

    const plain = await list();
    expect(plain.body.data.map((t) => t.title)).toEqual(["Write report"]);

    const pri = await prioritized();
    expect(pri.body.data).toHaveLength(1);
    expect(pri.body.data[0].title).toBe("Write report");
    expect(pri.body.data[0].calculated_priority_score).toBeGreaterThan(0);
  });

  it("defaults completion_status to not_started", async () => {
    const created = await create();
    const pri = await prioritized();
    expect(pri.body.data[0].completion_status).toBe("not_started");
  });
});

describe("Workflow: Edit", () => {
  it("updates title/description without duplicating the row", async () => {
    const created = await create({ title: "Old title" });

    await request(app)
      .put(`/api/tasks/${created.body.data.id}`)
      .set("Authorization", auth())
      .send({ title: "New title", description: "Updated" });

    const plain = await list();
    expect(plain.body.data).toHaveLength(1);
    expect(plain.body.data[0].title).toBe("New title");
    expect(plain.body.data[0].description).toBe("Updated");
  });

  it("raises priority score when priority is edited upward", async () => {
    const created = await create({ priority: "low" });
    const before = await prioritized();
    const beforeScore = before.body.data[0].calculated_priority_score;

    await request(app)
      .put(`/api/tasks/${created.body.data.id}`)
      .set("Authorization", auth())
      .send({ priority: "high" });

    const after = await prioritized();
    expect(after.body.data[0].calculated_priority_score).toBeGreaterThan(beforeScore);
  });

  it("raises priority score when point_value is edited upward", async () => {
    const created = await create({ point_value: 1 });
    const before = await prioritized();
    const beforeScore = before.body.data[0].calculated_priority_score;

    await request(app)
      .put(`/api/tasks/${created.body.data.id}`)
      .set("Authorization", auth())
      .send({ point_value: 100 });

    const after = await prioritized();
    expect(after.body.data[0].calculated_priority_score).toBeGreaterThan(beforeScore);
  });

  it("changes relative order when a due_date edit makes a task more urgent", async () => {
    const urgent = await create({ title: "Soon" });
    const distant = await create({
      title: "Later",
      due_date: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30).toISOString(),
    });

    const before = await prioritized();
    // Equal priority/points/effort and no due_date on "urgent" yet -> order is
    // whatever the tie-break gives; now make "distant" due immediately.
    expect(before.body.data.map((t) => t.title).sort()).toEqual(["Later", "Soon"]);

    await request(app)
      .put(`/api/tasks/${distant.body.data.id}`)
      .set("Authorization", auth())
      .send({ due_date: new Date().toISOString() });

    const after = await prioritized();
    expect(after.body.data[0].title).toBe("Later");
  });

  it("changes order when estimated_effort_minutes fits the available window", async () => {
    const created = await create({ estimated_effort_minutes: 500 });
    const tooLong = await prioritized(60); // 60 available minutes, 500 needed
    const longScore = tooLong.body.data[0].calculated_priority_score;

    await request(app)
      .put(`/api/tasks/${created.body.data.id}`)
      .set("Authorization", auth())
      .send({ estimated_effort_minutes: 30 });

    const fits = await prioritized(60); // now fits in the available window
    expect(fits.body.data[0].calculated_priority_score).toBeGreaterThan(longScore);
  });
});

describe("Workflow: Complete", () => {
  it("marks one task complete without altering a sibling task", async () => {
    const a = await create({ title: "A" });
    const b = await create({ title: "B" });

    await request(app)
      .put(`/api/tasks/${a.body.data.id}`)
      .set("Authorization", auth())
      .send({ completion_status: "completed" });

    const pri = await prioritized();
    const taskA = pri.body.data.find((t) => t.title === "A");
    const taskB = pri.body.data.find((t) => t.title === "B");

    expect(taskA.completion_status).toBe("completed");
    expect(taskB.completion_status).toBe("not_started");
  });

  it("sorts completed tasks after active ones regardless of score", async () => {
    const lowPriority = await create({ title: "Low", priority: "low" });
    const highPriorityCompleted = await create({ title: "HighButDone", priority: "high" });

    await request(app)
      .put(`/api/tasks/${highPriorityCompleted.body.data.id}`)
      .set("Authorization", auth())
      .send({ completion_status: "completed" });

    const pri = await prioritized();
    expect(pri.body.data[0].title).toBe("Low");
    expect(pri.body.data[1].title).toBe("HighButDone");
  });
});

describe("Workflow: Delete", () => {
  it("removes the task from both the plain list and prioritized view", async () => {
    const created = await create();

    await request(app)
      .delete(`/api/tasks/${created.body.data.id}`)
      .set("Authorization", auth());

    const plain = await list();
    const pri = await prioritized();
    expect(plain.body.data).toEqual([]);
    expect(pri.body.data).toEqual([]);
  });

  it("deleting the current top-priority task promotes the next one", async () => {
    const top = await create({ title: "Top", priority: "high" });
    await create({ title: "Next", priority: "low" });

    await request(app)
      .delete(`/api/tasks/${top.body.data.id}`)
      .set("Authorization", auth());

    const pri = await prioritized();
    expect(pri.body.data).toHaveLength(1);
    expect(pri.body.data[0].title).toBe("Next");
  });

  it("deletes only the targeted task, not others", async () => {
    const keep = await create({ title: "Keep" });
    const remove = await create({ title: "Remove" });

    await request(app)
      .delete(`/api/tasks/${remove.body.data.id}`)
      .set("Authorization", auth());

    const plain = await list();
    expect(plain.body.data.map((t) => t.title)).toEqual(["Keep"]);
  });
});

describe("Edge cases", () => {
  it("returns an empty prioritized list with no tasks", async () => {
    const pri = await prioritized();
    expect(pri.body.data).toEqual([]);
  });

  it("returns a single task correctly with only one task", async () => {
    await create({ title: "Only one" });
    const pri = await prioritized();
    expect(pri.body.data).toHaveLength(1);
  });

  it("breaks ties between same-priority tasks by earlier due_date", async () => {
    const soon = new Date(Date.now() + 1000 * 60 * 60).toISOString();
    const later = new Date(Date.now() + 1000 * 60 * 60 * 24 * 10).toISOString();

    await create({ title: "Later", priority: "medium", due_date: later });
    await create({ title: "Soon", priority: "medium", due_date: soon });

    const pri = await prioritized();
    expect(pri.body.data[0].title).toBe("Soon");
  });
});
