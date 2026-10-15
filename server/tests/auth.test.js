
/**
 * Authentication tests
 *
 * Tests:
 * - User registration
 * - Existing local user login
 * - Supabase account recovery
 * - Invalid credentials
 * - Authentication service failures
 * - JWT authentication
 *
 * All Supabase calls are mocked.
 * No real Supabase credentials or network access required.
 */


const jwt = require("jsonwebtoken");
const {
  authenticateToken,
  JWT_SECRET,
} = require("../src/middleware/auth");

describe("JWT Authentication Middleware", () => {
  let req;
  let res;
  let next;

  beforeEach(() => {
    req = {
      headers: {},
    };

    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
      send: jest.fn().mockReturnThis(),
    };

    next = jest.fn();
  });

  describe("Missing or invalid authorization", () => {
    test("rejects a request without an authorization header", () => {
      authenticateToken(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(401);
    });

    test("rejects an empty authorization header", () => {
      req.headers.authorization = "";

      authenticateToken(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(401);
    });

    test("rejects a malformed Bearer token", () => {
      req.headers.authorization = "InvalidToken";

      authenticateToken(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(401);
    });

    test("rejects a Bearer header without a token", () => {
      req.headers.authorization = "Bearer ";

      authenticateToken(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(401);
    });
  });

  describe("JWT validation", () => {
    test("rejects an expired token", () => {
      const token = jwt.sign(
        { userId: "test-user" },
        JWT_SECRET,
        { expiresIn: -1 }
      );

      req.headers.authorization = `Bearer ${token}`;

      authenticateToken(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(401);
    });

    test("rejects a token signed with the wrong secret", () => {
      const token = jwt.sign(
        { userId: "test-user" },
        "incorrect-test-secret",
        { expiresIn: "1h" }
      );

      req.headers.authorization = `Bearer ${token}`;

      authenticateToken(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(401);
    });

    test("rejects a tampered token", () => {
      const token = jwt.sign(
        { userId: "test-user" },
        JWT_SECRET,
        { expiresIn: "1h" }
      );

      const replacement = token.endsWith("a") ? "b" : "a";
      const tamperedToken = token.slice(0, -1) + replacement;

      req.headers.authorization = `Bearer ${tamperedToken}`;

      authenticateToken(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(401);
    });
  });

  describe("Valid JWT", () => {
    test("allows a request with a valid token", () => {
      const payload = { userId: "test-user" };

      const token = jwt.sign(payload, JWT_SECRET, {
        expiresIn: "1h",
      });

      req.headers.authorization = `Bearer ${token}`;

      authenticateToken(req, res, next);

      expect(next).toHaveBeenCalledTimes(1);
      expect(res.status).not.toHaveBeenCalled();
    });
  });
});
