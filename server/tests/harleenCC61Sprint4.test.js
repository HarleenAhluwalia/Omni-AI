
/**
 * Sprint 4 - Harleen Ahluwalia
 * SOC 2 CC6.1 - Logical Access Security
 *
 * Jira: SCRUM-473, SCRUM-475
 *
 * Security regression tests for authentication input
 * validation and rejection of malformed credentials.
 */

const {
  validateRegistration,
  validateLogin,
} = require("../src/utils/validators");

describe("Sprint 4 - CC6.1 Authentication Security", () => {
  describe("Registration validation", () => {
    const validUser = {
      name: "Test Student",
      email: "student@example.com",
      password: "Password123!",
    };

    test("rejects missing email", () => {
      const errors = validateRegistration({
        ...validUser,
        email: undefined,
      });

      expect(errors.length).toBeGreaterThan(0);
    });

    test.each([
      123,
      [],
      {},
      null,
      true,
    ])("rejects malformed registration email: %p", (email) => {
      const errors = validateRegistration({
        ...validUser,
        email,
      });

      expect(errors.length).toBeGreaterThan(0);
    });

    test("rejects missing password", () => {
      const errors = validateRegistration({
        ...validUser,
        password: undefined,
      });

      expect(errors.length).toBeGreaterThan(0);
    });

    test("accepts valid registration information", () => {
      expect(validateRegistration(validUser)).toEqual([]);
    });
  });

  describe("Login validation", () => {
    const validLogin = {
      email: "student@example.com",
      password: "Password123!",
    };

    test.each([
      123,
      [],
      {},
      null,
      true,
    ])("rejects malformed login email: %p", (email) => {
      const errors = validateLogin({
        ...validLogin,
        email,
      });

      expect(errors.length).toBeGreaterThan(0);
    });

    test.each([
      [],
      {},
      123,
      null,
      true,
    ])("rejects malformed login password: %p", (password) => {
      const errors = validateLogin({
        ...validLogin,
        password,
      });

      expect(errors.length).toBeGreaterThan(0);
    });

    test("rejects missing password", () => {
      const errors = validateLogin({
        ...validLogin,
        password: "",
      });

      expect(errors.length).toBeGreaterThan(0);
    });

    test("accepts valid login information", () => {
      expect(validateLogin(validLogin)).toEqual([]);
    });
  });
});
