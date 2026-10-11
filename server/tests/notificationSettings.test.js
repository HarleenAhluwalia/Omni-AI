jest.mock("../config/supabase", () => {
  const { createMockSupabase } = require("./helpers/supabaseMock");
  return createMockSupabase();
});

const request = require("supertest");
const { createApp } = require("../src/app");
const supabase = require("../config/supabase");
const { signToken } = require("../src/middleware/auth");

const app = createApp();

const USER_A = "11111111-1111-4111-8111-111111111111";
const USER_B = "22222222-2222-4222-8222-222222222222";
const URL = "/api/notification-settings";

const auth = (id) => `Bearer ${signToken({ id, email: "u@test.com" })}`;
const get = (id) => request(app).get(URL).set("Authorization", auth(id));
const put = (id, body) =>
  request(app).put(URL).set("Authorization", auth(id)).send(body);

const seedProfile = (id) =>
  supabase
    .from("profiles")
    .insert([{ id, display_name: "T", onboarding_completed: false }])
    .select()
    .single();

beforeEach(async () => {
  supabase.__reset();
  await seedProfile(USER_A);
  await seedProfile(USER_B);
});

describe("GET /api/notification-settings", () => {
  it("returns defaults for a new user with nothing saved", async () => {
    const res = await get(USER_A);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({
      enabled: true,
      reminder_lead_minutes: 1440,
      frequency: "normal",
      priority_threshold: "low",
      delivery_method: "in_app",
      onboarding_completed: false,
    });
  });

  it("returns the same values after a save", async () => {
    const body = { enabled: false, reminder_lead_minutes: 60, delivery_method: "email" };
    const saved = await put(USER_A, body);
    expect(saved.status).toBe(200);
    const res = await get(USER_A);
    expect(res.body.data).toEqual(saved.body.data);
    expect(res.body.data).toMatchObject(body);
  });

  it("rejects a request without a token", async () => {
    const res = await request(app).get(URL);
    expect(res.status).toBe(401);
  });

  it("only returns the caller's settings (user A cannot see user B's)", async () => {
    await put(USER_B, { reminder_lead_minutes: 30, frequency: "high" });
    const res = await get(USER_A);
    expect(res.status).toBe(200);
    expect(res.body.data.reminder_lead_minutes).toBe(1440);
    expect(res.body.data.frequency).toBe("normal");
  });

  it("ignores a user_id query parameter", async () => {
    await put(USER_B, { reminder_lead_minutes: 30 });
    const res = await request(app)
      .get(`${URL}?user_id=${USER_B}`)
      .set("Authorization", auth(USER_A));
    expect(res.body.data.reminder_lead_minutes).toBe(1440);
  });
});

describe("PUT /api/notification-settings", () => {
  it("saves valid settings and returns the saved values", async () => {
    const res = await put(USER_A, {
      enabled: false,
      reminder_lead_minutes: 120,
      frequency: "low",
      priority_threshold: "high",
      delivery_method: "push",
    });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toMatchObject({
      enabled: false,
      reminder_lead_minutes: 120,
      frequency: "low",
      priority_threshold: "high",
      delivery_method: "push",
    });
  });

  it("partial update changes only the supplied fields", async () => {
    await put(USER_A, { frequency: "high", delivery_method: "email" });
    const res = await put(USER_A, { reminder_lead_minutes: 15 });
    expect(res.body.data).toMatchObject({
      reminder_lead_minutes: 15,
      frequency: "high",
      delivery_method: "email",
      enabled: true,
    });
  });

  it("a second save updates the same row (no duplicate)", async () => {
    await put(USER_A, { reminder_lead_minutes: 10 });
    await put(USER_A, { reminder_lead_minutes: 20 });
    const { data } = await supabase
      .from("notification_settings")
      .select("*")
      .eq("user_id", USER_A);
    expect(data).toHaveLength(1);
    expect(data[0].reminder_lead_minutes).toBe(20);
  });

  it("saves onboarding_completed and reads it back", async () => {
    const res = await put(USER_A, { onboarding_completed: true });
    expect(res.status).toBe(200);
    expect(res.body.data.onboarding_completed).toBe(true);
    expect((await get(USER_A)).body.data.onboarding_completed).toBe(true);
  });

  it.each([
    ["invalid delivery_method", { delivery_method: "carrier_pigeon" }],
    ["invalid frequency", { frequency: "constantly" }],
    ["invalid priority_threshold", { priority_threshold: "urgent" }],
  ])("rejects %s with 400", async (_name, body) => {
    const res = await put(USER_A, body);
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it.each([
    ["negative", -5],
    ["non-integer", 1.5],
    ["string", "60"],
    ["null", null],
  ])("rejects a %s reminder_lead_minutes with 400", async (_name, value) => {
    const res = await put(USER_A, { reminder_lead_minutes: value });
    expect(res.status).toBe(400);
  });

  it.each([["string", "true"], ["number", 1]])(
    "rejects a non-boolean enabled (%s) with 400",
    async (_name, value) => {
      const res = await put(USER_A, { enabled: value });
      expect(res.status).toBe(400);
    }
  );

  it("rejects an empty update with 400", async () => {
    const res = await put(USER_A, {});
    expect(res.status).toBe(400);
  });

  it("rejects a request without a token", async () => {
    const res = await request(app).put(URL).send({ enabled: false });
    expect(res.status).toBe(401);
  });

  it("ignores a client-supplied user_id and never touches another user's row", async () => {
    await put(USER_B, { reminder_lead_minutes: 30 });
    const res = await put(USER_A, { user_id: USER_B, reminder_lead_minutes: 5 });
    expect(res.status).toBe(200);
    expect((await get(USER_B)).body.data.reminder_lead_minutes).toBe(30);
    expect((await get(USER_A)).body.data.reminder_lead_minutes).toBe(5);
  });
});
