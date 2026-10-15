
/**
 * Authentication tests
 *
 * Tests:
 * - User registration
 * - Existing local user login
 * - Supabase account recovery
 * - Invalid credentials
 * - Authentication service failures
 * - JWT authentication middleware
 *
 * All Supabase calls are mocked.
 * No real Supabase credentials or network access required.
 */

// Mock the existing server-side Supabase client.
jest.mock("../config/supabase", () => {
  const { createMockSupabase } = require("./helpers/supabaseMock");
  return createMockSupabase();
});

// Mock the separate Supabase client used for password login.
jest.mock("@supabase/supabase-js", () => ({
  createClient: jest.fn(),
}));

const request = require("supertest");
const jwt = require("jsonwebtoken");
const { createClient } = require("@supabase/supabase-js");
const { createApp } = require("../src/app");
const { UserRepository } = require("../src/config/db");
const supabase = require("../config/supabase");
const {
  requireAuth,
  JWT_SECRET,
} = require("../src/middleware/auth");

const app = createApp();

const validUser = {
  name: "Jane Doe",
  email: "jane@example.com",
  password: "correcthorse123",
};

const recoveredUser = {
  id: "11111111-1111-4111-8111-111111111111",
  email: "recovered@example.com",
  password: "recoveredPassword123",
  user_metadata: {
    name: "Recovered User",
  },
};

const originalSupabaseUrl = process.env.SUPABASE_URL;
const originalAnonKey = process.env.SUPABASE_ANON_KEY;
const originalPublishableKey =
  process.env.SUPABASE_PUBLISHABLE_KEY;

let mockSignInWithPassword;

beforeEach(() => {
  // Reset the local JSON repository.
  UserRepository._reset();

  // Reset the mocked Supabase database.
  supabase.__reset();

  // Keep CI independent from real Supabase credentials.
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_ANON_KEY = "test-public-key";

  // Default behavior: unknown users are rejected.
  mockSignInWithPassword = jest.fn().mockResolvedValue({
    data: {
      user: null,
      session: null,
    },
    error: {
      status: 400,
      code: "invalid_credentials",
      message: "Invalid login credentials",
    },
  });

  createClient.mockReset();

  createClient.mockImplementation(() => ({
    auth: {
      signInWithPassword: mockSignInWithPassword,
    },
  }));
});

afterAll(() => {
  // Restore environment variables.
  if (originalSupabaseUrl === undefined) {
    delete process.env.SUPABASE_URL;
  } else {
    process.env.SUPABASE_URL = originalSupabaseUrl;
  }

  if (originalAnonKey === undefined) {
    delete process.env.SUPABASE_ANON_KEY;
  } else {
    process.env.SUPABASE_ANON_KEY = originalAnonKey;
  }

  if (originalPublishableKey === undefined) {
    delete process.env.SUPABASE_PUBLISHABLE_KEY;
  } else {
    process.env.SUPABASE_PUBLISHABLE_KEY =
      originalPublishableKey;
  }
});

// =========================================================
// REGISTRATION TESTS
// =========================================================

describe("POST /api/auth/register", () => {
  it("creates a new user and returns a token", async () => {
    const res = await request(app)
      .post("/api/auth/register")
      .send(validUser);

    expect(res.status).toBe(201);
    expect(res.body.token).toBeDefined();
    expect(res.body.user.email).toBe(validUser.email);
    expect(res.body.user.passwordHash).toBeUndefined();
  });

  it("rejects registration with an invalid email", async () => {
    const res = await request(app)
      .post("/api/auth/register")
      .send({
        ...validUser,
        email: "not-an-email",
      });

    expect(res.status).toBe(400);
    expect(res.body.errors.length).toBeGreaterThan(0);
  });

  it("rejects registration with a short password", async () => {
    const res = await request(app)
      .post("/api/auth/register")
      .send({
        ...validUser,
        password: "short",
      });

    expect(res.status).toBe(400);
  });

  it("rejects duplicate email registration", async () => {
    await request(app)
      .post("/api/auth/register")
      .send(validUser);

    const res = await request(app)
      .post("/api/auth/register")
      .send(validUser);

    expect(res.status).toBe(409);
  });
});

// =========================================================
// EXISTING LOCAL USER LOGIN TESTS
// =========================================================

describe("POST /api/auth/login - existing users", () => {
  beforeEach(async () => {
    await request(app)
      .post("/api/auth/register")
      .send(validUser);
  });

  it("logs in with correct credentials", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({
        email: validUser.email,
        password: validUser.password,
      });

    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();
    expect(res.body.user.email).toBe(validUser.email);
    expect(res.body.user.passwordHash).toBeUndefined();

    expect(createClient).not.toHaveBeenCalled();
  });

  it("rejects an incorrect password", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({
        email: validUser.email,
        password: "wrongpassword",
      });

    expect(res.status).toBe(401);
    expect(createClient).not.toHaveBeenCalled();
  });

  it("rejects login for a non-existent account", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({
        email: "nobody@example.com",
        password: "whatever123",
      });

    expect(res.status).toBe(401);
    expect(res.body.errors).toContain(
      "Invalid email or password."
    );

    expect(mockSignInWithPassword).toHaveBeenCalledWith({
      email: "nobody@example.com",
      password: "whatever123",
    });

    expect(
      UserRepository.findByEmail("nobody@example.com")
    ).toBeNull();
  });
});

// =========================================================
// SUPABASE ACCOUNT RECOVERY TESTS
// =========================================================

describe("POST /api/auth/login - Supabase recovery", () => {
  it("restores an existing Supabase user missing from local storage", async () => {
    mockSignInWithPassword.mockResolvedValueOnce({
      data: {
        user: {
          id: recoveredUser.id,
          email: recoveredUser.email,
          user_metadata: recoveredUser.user_metadata,
        },
        session: {
          access_token: "mock-supabase-access-token",
        },
      },
      error: null,
    });

    expect(
      UserRepository.findByEmail(recoveredUser.email)
    ).toBeNull();

    const res = await request(app)
      .post("/api/auth/login")
      .send({
        email: recoveredUser.email,
        password: recoveredUser.password,
      });

    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();
    expect(res.body.user.email).toBe(recoveredUser.email);
    expect(res.body.user.id).toBe(recoveredUser.id);
    expect(res.body.user.passwordHash).toBeUndefined();

    const localUser = UserRepository.findByEmail(
      recoveredUser.email
    );

    expect(localUser).not.toBeNull();
    expect(localUser.id).toBe(recoveredUser.id);
    expect(localUser.passwordHash).toBeDefined();

    // The application's JWT should work.
    const meRes = await request(app)
      .get("/api/auth/me")
      .set("Authorization", `Bearer ${res.body.token}`);

    expect(meRes.status).toBe(200);
    expect(meRes.body.user.id).toBe(recoveredUser.id);
  });

  it("does not create a user when Supabase rejects credentials", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({
        email: recoveredUser.email,
        password: "incorrectPassword",
      });

    expect(res.status).toBe(401);
    expect(
      UserRepository.findByEmail(recoveredUser.email)
    ).toBeNull();
  });

  it("uses the public Supabase key for password authentication", async () => {
    await request(app)
      .post("/api/auth/login")
      .send({
        email: "unknown@example.com",
        password: "whatever123",
      });

    expect(createClient).toHaveBeenCalledWith(
      "https://example.supabase.co",
      "test-public-key",
      expect.objectContaining({
        auth: expect.objectContaining({
          persistSession: false,
          autoRefreshToken: false,
        }),
      })
    );
  });

  it("returns 503 if the Supabase authentication service is unavailable", async () => {
    mockSignInWithPassword.mockResolvedValueOnce({
      data: null,
      error: {
        status: 503,
        message: "Authentication service unavailable",
      },
    });

    const res = await request(app)
      .post("/api/auth/login")
      .send({
        email: recoveredUser.email,
        password: recoveredUser.password,
      });

    expect(res.status).toBe(503);
    expect(
      UserRepository.findByEmail(recoveredUser.email)
    ).toBeNull();
  });

  it("returns 500 if the public Supabase configuration is missing", async () => {
    delete process.env.SUPABASE_ANON_KEY;
    delete process.env.SUPABASE_PUBLISHABLE_KEY;

    const res = await request(app)
      .post("/api/auth/login")
      .send({
        email: recoveredUser.email,
        password: recoveredUser.password,
      });

    expect(res.status).toBe(500);
    expect(
      UserRepository.findByEmail(recoveredUser.email)
    ).toBeNull();
  });
});

// =========================================================
// AUTHENTICATED USER API TESTS
// =========================================================

describe("GET /api/auth/me", () => {
  it("returns the current user when given a valid token", async () => {
    const registerRes = await request(app)
      .post("/api/auth/register")
      .send(validUser);

    const { token } = registerRes.body;

    const res = await request(app)
      .get("/api/auth/me")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe(validUser.email);
  });

  it("rejects requests with no token", async () => {
    const res = await request(app)
      .get("/api/auth/me");

    expect(res.status).toBe(401);
  });

  it("rejects requests with a malformed token", async () => {
    const res = await request(app)
      .get("/api/auth/me")
      .set("Authorization", "Bearer not.a.real.token");

    expect(res.status).toBe(401);
  });
});

// =========================================================
// JWT AUTHENTICATION MIDDLEWARE TESTS
// =========================================================

describe("JWT Authentication Middleware", () => {
  let req;
  let res;
  let next;

  beforeEach(() => {
    req = { headers: {} };

    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };

    next = jest.fn();
  });

  describe("Authorization header validation", () => {
    it("rejects a request without an authorization header", () => {
      requireAuth(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        error: "Missing or malformed Authorization header.",
      });
    });

    it("rejects an empty authorization header", () => {
      req.headers.authorization = "";

      requireAuth(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        error: "Missing or malformed Authorization header.",
      });
    });

    it("rejects a non-Bearer authorization header", () => {
      req.headers.authorization = "Basic sometoken";

      requireAuth(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        error: "Missing or malformed Authorization header.",
      });
    });

    it("rejects a Bearer header without a token", () => {
      req.headers.authorization = "Bearer ";

      requireAuth(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        error: "Missing or malformed Authorization header.",
      });
    });
  });

  describe("JWT validation", () => {
    it("rejects a malformed token", () => {
      req.headers.authorization = "Bearer invalid.token.value";

      requireAuth(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        error: "Invalid token.",
      });
    });

    it("rejects an expired token", () => {
      const token = jwt.sign(
        {
          sub: "user-123",
          email: "jerry@example.com",
        },
        JWT_SECRET,
        { expiresIn: -1 }
      );

      req.headers.authorization = `Bearer ${token}`;

      requireAuth(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        error: "Session expired. Please log in again.",
      });
    });

    it("rejects a token signed with the wrong secret", () => {
      const token = jwt.sign(
        {
          sub: "user-123",
          email: "jerry@example.com",
        },
        "incorrect-test-secret",
        { expiresIn: "1h" }
      );

      req.headers.authorization = `Bearer ${token}`;

      requireAuth(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        error: "Invalid token.",
      });
    });

    it("rejects a token with a tampered signature", () => {
      const token = jwt.sign(
        {
          sub: "user-123",
          email: "jerry@example.com",
        },
        JWT_SECRET,
        { expiresIn: "1h" }
      );

      const parts = token.split(".");
      const firstChar = parts[2][0];

      parts[2] =
        (firstChar === "a" ? "b" : "a") +
        parts[2].slice(1);

      req.headers.authorization = `Bearer ${parts.join(".")}`;

      requireAuth(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        error: "Invalid token.",
      });
    });
  });

  describe("Valid JWT", () => {
    it("allows a request with a valid token", () => {
      const token = jwt.sign(
        {
          sub: "user-123",
          email: "jerry@example.com",
        },
        JWT_SECRET,
        { expiresIn: "1h" }
      );

      req.headers.authorization = `Bearer ${token}`;

      requireAuth(req, res, next);

      expect(next).toHaveBeenCalledTimes(1);
      expect(res.status).not.toHaveBeenCalled();
    });

    it("attaches the authenticated user's identity to req.user", () => {
      const token = jwt.sign(
        {
          sub: "user-123",
          email: "jerry@example.com",
        },
        JWT_SECRET,
        { expiresIn: "1h" }
      );

      req.headers.authorization = `Bearer ${token}`;

      requireAuth(req, res, next);

      expect(req.user).toEqual({
        id: "user-123",
        email: "jerry@example.com",
      });

      expect(next).toHaveBeenCalledTimes(1);
    });
  });
});
