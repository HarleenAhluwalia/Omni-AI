const crypto = require("crypto");
const bcrypt = require("bcryptjs");

const SALT_ROUNDS = 10;

/**
 * Builds a new user record with a hashed password.
 * Never store or return the plaintext password.
 */
async function buildUser({ name, email, password }) {
  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
  return {
    id: crypto.randomUUID(),
    name,
    email: email.toLowerCase(),
    passwordHash,
    createdAt: new Date().toISOString(),
  };
}

async function verifyPassword(plainPassword, passwordHash) {
  return bcrypt.compare(plainPassword, passwordHash);
}

/** Strips sensitive fields before sending a user back to the client. */
function toPublicUser(user) {
  const { passwordHash, ...publicFields } = user;
  return publicFields;
}

module.exports = { buildUser, verifyPassword, toPublicUser };
