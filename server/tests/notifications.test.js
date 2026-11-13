
// SCRUM-482: Verify notification routes and controllers through the real Express app.
// Supabase is mocked to avoid modifying the team's database.
jest.mock("../config/supabase", () => {
  const { createMockSupabase } = require("./helpers/supabaseMock");
  return createMockSupabase();
});

// The persistence service has its own unit tests. Here, check HTTP wiring,
// authentication, user ownership, and responses, not database rules again.
jest.mock("../services/notificationPersistenceService", () => ({
  listNotificationsForUser: jest.fn(),
  evaluateAndStoreNotificationsForUser: jest.fn(),
}));

const request = require("supertest");
const { createApp } = require("../src/app");
const { signToken } = require("../src/middleware/auth");
const {
  listNotificationsForUser,
  evaluateAndStoreNotificationsForUser,
} = require("../services/notificationPersistenceService");

const app = createApp();
const USER_A = "11111111-1111-4111-8111-111111111111";
const USER_B = "22222222-2222-4222-8222-222222222222";
const authHeader = (userId) =>
  `Bearer ${signToken({ id: userId, email: "test@example.com" })}`;

beforeEach(() => {
  listNotificationsForUser.mockReset();
  evaluateAndStoreNotificationsForUser.mockReset();
});

describe("Smart Notification API", () => {
  test("GET rejects requests without authentication", async () => {
    const response = await request(app).get("/api/notifications");

    expect(response.status).toBe(401);
    expect(listNotificationsForUser).not.toHaveBeenCalled();
  });

  test("POST evaluation rejects requests without authentication", async () => {
    const response = await request(app).post("/api/notifications/evaluate");

    expect(response.status).toBe(401);
    expect(evaluateAndStoreNotificationsForUser).not.toHaveBeenCalled();
  });

  test("GET returns notifications for the authenticated student", async () => {
    const notifications = [
      { id: "notification-1", type: "upcoming_deadline", message: "Math homework is due soon." },
    ];
    listNotificationsForUser.mockResolvedValue(notifications);

    const response = await request(app)
      .get("/api/notifications")
      .set("Authorization", authHeader(USER_A));

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ success: true, data: notifications });
    expect(listNotificationsForUser).toHaveBeenCalledWith(USER_A);
  });

  test("POST returns notification evaluation counts", async () => {
    const counts = { created: 1, already_existing: 0, ineligible: 2 };
    evaluateAndStoreNotificationsForUser.mockResolvedValue(counts);

    const response = await request(app)
      .post("/api/notifications/evaluate")
      .set("Authorization", authHeader(USER_A));

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ success: true, data: counts });
    expect(evaluateAndStoreNotificationsForUser).toHaveBeenCalledWith(USER_A);
  });

  test("both endpoints ignore a different client-supplied user ID", async () => {
    listNotificationsForUser.mockResolvedValue([]);
    evaluateAndStoreNotificationsForUser.mockResolvedValue({
      created: 0, already_existing: 0, ineligible: 0,
    });

    const getResponse = await request(app)
      .get("/api/notifications")
      .query({ user_id: USER_B })
      .set("Authorization", authHeader(USER_A));

    const postResponse = await request(app)
      .post("/api/notifications/evaluate")
      .set("Authorization", authHeader(USER_A))
      .send({ user_id: USER_B });

    expect(getResponse.status).toBe(200);
    expect(postResponse.status).toBe(200);
    expect(listNotificationsForUser).toHaveBeenCalledWith(USER_A);
    expect(evaluateAndStoreNotificationsForUser).toHaveBeenCalledWith(USER_A);
    expect(listNotificationsForUser).not.toHaveBeenCalledWith(USER_B);
    expect(evaluateAndStoreNotificationsForUser).not.toHaveBeenCalledWith(USER_B);
  });

  test("GET responds with 500 without revealing an internal service error", async () => {
    listNotificationsForUser.mockRejectedValue(new Error("private database details"));

    const response = await request(app)
      .get("/api/notifications")
      .set("Authorization", authHeader(USER_A));

    expect(response.status).toBe(500);
    expect(response.body.success).toBe(false);
    expect(response.body.error).toEqual(expect.any(String));
    expect(JSON.stringify(response.body)).not.toContain("private database details");
  });

  test("POST responds with 500 without revealing an internal service error", async () => {
    evaluateAndStoreNotificationsForUser.mockRejectedValue(
      new Error("private database details")
    );

    const response = await request(app)
      .post("/api/notifications/evaluate")
      .set("Authorization", authHeader(USER_A));

    expect(response.status).toBe(500);
    expect(response.body.success).toBe(false);
    expect(response.body.error).toEqual(expect.any(String));
    expect(JSON.stringify(response.body)).not.toContain("private database details");
  });
});
