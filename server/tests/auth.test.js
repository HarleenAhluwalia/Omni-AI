
/**
 * Authentication tests
 *
 * Tests:
 * - Missing or malformed authorization headers
 * - Expired JWTs
 * - Invalid JWT signatures
 * - Tampered JWTs
 * - Valid JWT authentication
 * - User identity attached to the request
 *
 * No real Supabase credentials or network access required.
 */

const jwt = require("jsonwebtoken");
const {
  requireAuth,
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

  describe("Missing or malformed authorization", () => {
    test("rejects a request without an authorization header", () => {
      requireAuth(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        error: "Missing or malformed Authorization header.",
      });
    });

    test("rejects an empty authorization header", () => {
      req.headers.authorization = "";

      requireAuth(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(401);
    });

    test("rejects an authorization header without the Bearer scheme", () => {
      req.headers.authorization = "Basic sometoken";

      requireAuth(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(401);
    });

    test("rejects a Bearer header without a token", () => {
      req.headers.authorization = "Bearer ";

      requireAuth(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(401);
    });

    test("rejects a malformed JWT", () => {
      req.headers.authorization = "Bearer invalid.token.value";

      requireAuth(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        error: "Invalid token.",
      });
    });
  });

  describe("JWT validation", () => {
    test("rejects an expired token", () => {
      const token = jwt.sign(
        { sub: "test-user", email: "test@example.com" },
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

    test("rejects a token signed with the wrong secret", () => {
      const token = jwt.sign(
        { sub: "test-user", email: "test@example.com" },
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

    test("rejects a tampered token", () => {
      const token = jwt.sign(
        { sub: "test-user", email: "test@example.com" },
        JWT_SECRET,
        { expiresIn: "1h" }
      );

      const parts = token.split(".");
      parts[2] = `${parts[2].slice(0, -1)}${
        parts[2].endsWith("a") ? "b" : "a"
      }`;

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
    test("allows a request with a valid token", () => {
      const token = jwt.sign(
        { sub: "test-user", email: "test@example.com" },
        JWT_SECRET,
        { expiresIn: "1h" }
      );

      req.headers.authorization = `Bearer ${token}`;

      requireAuth(req, res, next);

      expect(next).toHaveBeenCalledTimes(1);
      expect(res.status).not.toHaveBeenCalled();
    });

    test("attaches the authenticated user identity to the request", () => {
      const user = {
        sub: "user-123",
        email: "jerry@example.com",
      };

      const token = jwt.sign(user, JWT_SECRET, {
        expiresIn: "1h",
      });

      req.headers.authorization = `Bearer ${token}`;

      requireAuth(req, res, next);

      expect(req.user).toEqual({
        id: "user-123",
        email: "jerry@example.com",
      });
      expect(next).toHaveBeenCalledTimes(1);
    });

    test("does not trust user identity supplied outside the token", () => {
      const token = jwt.sign(
        { sub: "authenticated-user", email: "valid@example.com" },
        JWT_SECRET,
        { expiresIn: "1h" }
      );

      req.headers.authorization = `Bearer ${token}`;
      req.user = {
        id: "forged-user",
        email: "forged@example.com",
      };

      requireAuth(req, res, next);

      expect(req.user).toEqual({
        id: "authenticated-user",
        email: "valid@example.com",
      });
      expect(next).toHaveBeenCalledTimes(1);
    });
  });
});
