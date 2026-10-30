
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validEmail(email) {
  return typeof email === "string" && EMAIL_RE.test(email.trim());
}

function validateRegistration({ name, email, password }) {
  const errors = [];

  if (typeof name !== "string" || !name.trim()) {
    errors.push("Name is required.");
  }

  if (!validEmail(email)) {
    errors.push("A valid email is required.");
  }

  if (typeof password !== "string" || password.length < 8) {
    errors.push("Password must be at least 8 characters.");
  }

  return errors;
}

function validateLogin({ email, password }) {
  const errors = [];

  if (!validEmail(email)) {
    errors.push("A valid email is required.");
  }

  if (typeof password !== "string" || !password) {
    errors.push("Password is required.");
  }

  return errors;
}

module.exports = { validateRegistration, validateLogin };
