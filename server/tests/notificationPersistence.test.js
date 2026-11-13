
// Test notification persistence without accessing the live Supabase database.
jest.mock("../config/supabase", () => {
  const { createMockSupabase } = require("./helpers/supabaseMock");
  return createMockSupabase();
});

const supabase = require("../config/supabase");
const {
  listNotificationsForUser,
  evaluateAndStoreNotificationsForUser,
} = require("../services/notificationPersistenceService");

const USER_A = "11111111-1111-4111-8111-111111111111";
const USER_B = "22222222-2222-4222-8222-222222222222";
const TASK_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const TASK_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const NOW = new Date("2026-11-15T12:00:00Z");

function makeTask(overrides = {}) {
  return {
    id: TASK_A,
    user_id: USER_A,
    title: "Math homework",
    due_date: "2026-11-16T00:00:00Z", // 12 hours from NOW
    priority: "high",
    completion_status: "not_started",
    point_value: 100,
    ...overrides,
  };
}

beforeEach(() => {
  supabase.__reset();
  supabase.__store.notification_settings.push({
    user_id: USER_A,
    enabled: true,
    reminder_lead_minutes: 1440,
    priority_threshold: "medium",
  });
});

describe("Smart Notification persistence", () => {
  test("inserts an eligible deadline reminder with correct fields", async () => {
    supabase.__store.tasks.push(makeTask());

    const result = await evaluateAndStoreNotificationsForUser(USER_A, NOW);

    expect(result).toEqual({ created: 1, already_existing: 0, ineligible: 0 });
    expect(supabase.__store.notifications).toHaveLength(1);
    expect(supabase.__store.notifications[0]).toMatchObject({
      user_id: USER_A,
      task_id: TASK_A,
      type: "upcoming_deadline",
      message: 'Your task "Math homework" has an upcoming deadline.',
      deduplication_key:
        `${USER_A}:${TASK_A}:upcoming_deadline:2026-11-16T00:00:00.000Z`,
    });
  });

  test("recognizes a repeated notification instead of saving a duplicate", async () => {
    supabase.__store.tasks.push(makeTask());

    const first = await evaluateAndStoreNotificationsForUser(USER_A, NOW);
    const second = await evaluateAndStoreNotificationsForUser(USER_A, NOW);

    expect(first.created).toBe(1);
    expect(second).toEqual({ created: 0, already_existing: 1, ineligible: 0 });
    expect(supabase.__store.notifications).toHaveLength(1);
  });

  test("stores overdue notifications with the overdue message", async () => {
    supabase.__store.tasks.push(makeTask({ due_date: "2026-11-14T12:00:00Z" }));

    const result = await evaluateAndStoreNotificationsForUser(USER_A, NOW);

    expect(result.created).toBe(1);
    expect(supabase.__store.notifications[0]).toMatchObject({
      type: "overdue",
      message: 'Your task "Math homework" is overdue.',
    });
  });

  test("skips completed and distant-deadline tasks", async () => {
    supabase.__store.tasks.push(
      makeTask({ completion_status: "completed" }),
      makeTask({ id: TASK_B, due_date: "2026-12-01T00:00:00Z" })
    );

    const result = await evaluateAndStoreNotificationsForUser(USER_A, NOW);

    expect(result).toEqual({ created: 0, already_existing: 0, ineligible: 2 });
    expect(supabase.__store.notifications).toHaveLength(0);
  });

  test("respects disabled notification settings", async () => {
    supabase.__store.tasks.push(makeTask());
    supabase.__store.notification_settings[0].enabled = false;

    const result = await evaluateAndStoreNotificationsForUser(USER_A, NOW);

    expect(result.ineligible).toBe(1);
    expect(supabase.__store.notifications).toHaveLength(0);
  });

  test("does not evaluate or save another student's tasks", async () => {
    supabase.__store.tasks.push(
      makeTask(),
      makeTask({ id: TASK_B, user_id: USER_B, title: "Other student's assignment" })
    );

    const result = await evaluateAndStoreNotificationsForUser(USER_A, NOW);

    expect(result.created).toBe(1);
    expect(supabase.__store.notifications).toHaveLength(1);
    expect(supabase.__store.notifications[0].user_id).toBe(USER_A);
    expect(supabase.__store.notifications[0].task_id).toBe(TASK_A);
  });

  test("returns the student's notifications newest first", async () => {
    supabase.__store.notifications.push(
      { id: "older", user_id: USER_A, created_at: "2026-11-10T12:00:00Z" },
      { id: "other", user_id: USER_B, created_at: "2026-11-16T12:00:00Z" },
      { id: "newer", user_id: USER_A, created_at: "2026-11-15T12:00:00Z" }
    );

    const notifications = await listNotificationsForUser(USER_A);

    expect(notifications.map((notification) => notification.id)).toEqual(["newer", "older"]);
  });

  test("returns zero counts when the student has no tasks", async () => {
    const result = await evaluateAndStoreNotificationsForUser(USER_A, NOW);
    expect(result).toEqual({ created: 0, already_existing: 0, ineligible: 0 });
  });

  test("propagates unexpected database insertion failures", async () => {
    supabase.__store.tasks.push(makeTask());
    const originalFrom = supabase.from;
    const fromSpy = jest.spyOn(supabase, "from").mockImplementation((table) => {
      if (table === "notifications") {
        return {
          insert: () => Promise.resolve({ error: { code: "23503", message: "foreign key violation" } }),
        };
      }
      return originalFrom(table);
    });

    try {
      await expect(evaluateAndStoreNotificationsForUser(USER_A, NOW))
        .rejects.toThrow("Could not store notification");
    } finally {
      fromSpy.mockRestore();
    }
  });
});
