const { UserRepository } = require("../config/db");
const { buildUser, verifyPassword, toPublicUser } = require("../models/User");
const { validateRegistration, validateLogin } = require("../utils/validators");
const { signToken } = require("../middleware/auth");

// UC-5: User Registration
async function register(req, res) {
  const errors = validateRegistration(req.body || {});
  if (errors.length) {
    return res.status(400).json({ errors });
  }

  const { name, email, password } = req.body;

  if (UserRepository.findByEmail(email)) {
    return res.status(409).json({ errors: ["An account with this email already exists."] });
  }

  const user = await buildUser({ name, email, password });
  UserRepository.create(user);

  const token = signToken(user);
  return res.status(201).json({ token, user: toPublicUser(user) });
}

// UC-5: User Login
async function login(req, res) {
  const errors = validateLogin(req.body || {});
  if (errors.length) {
    return res.status(400).json({ errors });
  }

  const { email, password } = req.body;
  const user = UserRepository.findByEmail(email);

  if (!user) {
    return res.status(401).json({ errors: ["Invalid email or password."] });
  }

  const passwordMatches = await verifyPassword(password, user.passwordHash);
  if (!passwordMatches) {
    return res.status(401).json({ errors: ["Invalid email or password."] });
  }

  const token = signToken(user);
  return res.status(200).json({ token, user: toPublicUser(user) });
}

// Used by the frontend to verify an existing session/token on app load.
async function me(req, res) {
  const user = UserRepository.findById(req.user.id);
  if (!user) {
    return res.status(404).json({ error: "User not found." });
  }
  return res.status(200).json({ user: toPublicUser(user) });
}

module.exports = { register, login, me };
