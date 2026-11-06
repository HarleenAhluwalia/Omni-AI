/**
 * Root cause of the order-dependent securityLogging.auth.test.js failure
 * (full suite only, never in isolation): src/config/db.js's UserRepository
 * is a real JSON file on disk (server/data/users.json) shared by every
 * Jest worker process - a separate OS process per worker, each with its
 * own module registry but the SAME real filesystem. Its readAll/writeAll
 * are a non-atomic read-modify-write, and multiple test files calling
 * UserRepository._reset()/create() concurrently (different workers) can
 * race: one worker's register() can be wiped by another worker's reset()
 * before this file's login() reads it back, after which the login path
 * falls through past the (intentionally unmocked-implementation)
 * Supabase client and throws, surfacing as a 500 instead of 200.
 *
 * This file runs once per Jest worker (see jest.config.js's setupFiles)
 * and gives that worker its own AUTH_DB_FILE, before any test module
 * requires db.js, eliminating the cross-process race entirely. It does
 * not touch production behavior: AUTH_DB_FILE is unset outside tests, so
 * db.js's own default path is unchanged.
 */
const path = require("path");

const workerId = process.env.JEST_WORKER_ID || process.pid;

process.env.AUTH_DB_FILE = path.join(
  __dirname,
  "..",
  "..",
  "data",
  `users.worker-${workerId}.json`
);
