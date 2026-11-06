/**
 * Minimal persistence layer for Sprint 1.
 *
 * This is intentionally a thin repository wrapping a JSON file on disk so the
 * team can stand up auth immediately without provisioning a real database.
 * Swap `readAll`/`writeAll` for real queries (Postgres/Mongo/etc.) later —
 * nothing in controllers/routes needs to change since they only call the
 * exported methods below.
 */
const fs = require("fs");
const path = require("path");

// AUTH_DB_FILE lets the test suite point each Jest worker at its own file
// (see tests/helpers/isolateAuthDbFile.js) instead of every worker process
// racing non-atomic reads/writes against the same path. Unset in
// production, so production behavior is unchanged.
const DB_FILE =
  process.env.AUTH_DB_FILE ||
  path.join(__dirname, "..", "..", "data", "users.json");

function ensureStore() {
  const dir = path.dirname(DB_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(DB_FILE)) fs.writeFileSync(DB_FILE, "[]", "utf-8");
}

function readAll() {
  ensureStore();
  const raw = fs.readFileSync(DB_FILE, "utf-8");
  try {
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

function writeAll(users) {
  ensureStore();
  fs.writeFileSync(DB_FILE, JSON.stringify(users, null, 2), "utf-8");
}

const UserRepository = {
  findByEmail(email) {
    return readAll().find((u) => u.email.toLowerCase() === email.toLowerCase()) || null;
  },

  findById(id) {
    return readAll().find((u) => u.id === id) || null;
  },

  create(user) {
    const users = readAll();
    users.push(user);
    writeAll(users);
    return user;
  },

  // Test/dev helper — not used in production routes.
  _reset() {
    writeAll([]);
  },
};

module.exports = { UserRepository };
