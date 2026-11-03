/**
 * SOC 2 CC7.2 — centralized structured security-event logging
 * (SOC2-S4-02 / ENG-02).
 *
 * Every event is one JSON object on one line:
 *
 *   {"timestamp":"2026-11-02T20:15:00.000Z","level":"warn",
 *    "event":"AUTH_TOKEN_INVALID","reason":"invalid_signature",
 *    "method":"GET","route":"/api/tasks","status":401,"requestId":"..."}
 *
 * Safety rules enforced here (not left to callers):
 *   1. Allowlist, not serialization. Only the fields below are ever written.
 *      The request object, headers, body and error messages are never
 *      serialized, so passwords, JWTs, Authorization/Cookie headers and
 *      service-role keys cannot reach the log by accident.
 *   2. `reason` must be one of the predefined codes in REASONS. Free text is
 *      replaced by "unspecified".
 *   3. `route` is rebuilt from the request path with ids and unknown segments
 *      replaced by placeholders, and the query string is dropped.
 *   4. Account identity is recorded only as `subject`, a truncated SHA-256 of
 *      the lower-cased email, so repeated failures can be correlated without
 *      writing the address itself.
 *   5. Logging never throws and never changes an HTTP response.
 *
 * Environment:
 *   SECURITY_LOG_SALT    Optional. Mixed into the `subject` hash. Set it in
 *                        production so subjects are not guessable from a
 *                        list of email addresses.
 *   SECURITY_LOG_STDOUT  Set to "1" to emit events during Jest runs. By
 *                        default events are written to stdout everywhere
 *                        except NODE_ENV=test, to keep test output readable.
 */

const crypto = require("crypto");
const { failedAuthDetector } = require("./failedAuthDetector");

const EVENTS = Object.freeze({
  AUTH_LOGIN_FAILED: "AUTH_LOGIN_FAILED",
  AUTH_TOKEN_MISSING: "AUTH_TOKEN_MISSING",
  AUTH_TOKEN_INVALID: "AUTH_TOKEN_INVALID",
  AUTH_TOKEN_EXPIRED: "AUTH_TOKEN_EXPIRED",
  AUTH_ACCESS_DENIED: "AUTH_ACCESS_DENIED",
  BACKEND_SECURITY_ERROR: "BACKEND_SECURITY_ERROR",
  DATABASE_OPERATION_FAILED: "DATABASE_OPERATION_FAILED",
  // Derived alert (TC-06), not a direct request failure.
  AUTH_FAILURE_THRESHOLD_EXCEEDED: "AUTH_FAILURE_THRESHOLD_EXCEEDED",
});

const LEVELS = Object.freeze(["info", "warn", "error"]);

const EVENT_LEVEL = Object.freeze({
  AUTH_LOGIN_FAILED: "warn",
  AUTH_TOKEN_MISSING: "warn",
  AUTH_TOKEN_INVALID: "warn",
  AUTH_TOKEN_EXPIRED: "warn",
  AUTH_ACCESS_DENIED: "warn",
  BACKEND_SECURITY_ERROR: "error",
  DATABASE_OPERATION_FAILED: "error",
  AUTH_FAILURE_THRESHOLD_EXCEEDED: "error",
});

const REASONS = Object.freeze([
  // AUTH_LOGIN_FAILED
  "password_mismatch",
  "no_local_password_hash",
  "supabase_invalid_credentials",
  "no_user_returned",
  "account_id_mismatch",
  "oauth_invalid_session",
  // AUTH_TOKEN_MISSING / AUTH_TOKEN_INVALID / AUTH_TOKEN_EXPIRED
  "no_authorization_header",
  "empty_token",
  "malformed_header",
  "malformed_token",
  "invalid_signature",
  "invalid_token",
  "token_expired",
  // AUTH_ACCESS_DENIED
  "task_not_owned",
  // AUTH_FAILURE_THRESHOLD_EXCEEDED
  "repeated_login_failures",
  // BACKEND_SECURITY_ERROR
  "auth_service_unavailable",
  "auth_user_create_failed",
  "login_recovery_failed",
  "registration_setup_failed",
  "auth_user_cleanup_failed",
  "oauth_profile_setup_failed",
  "unhandled_exception",
  "schedule_resolve_failed",
  // DATABASE_OPERATION_FAILED
  "task_list_failed",
  "task_read_failed",
  "task_create_failed",
  "task_update_failed",
  "task_delete_failed",
  "task_prioritized_failed",
  "task_daily_summary_failed",
  "task_weekly_summary_failed",
  // Fallback for anything not in this list.
  "unspecified",
]);

const REASON_SET = new Set(REASONS);
const EVENT_SET = new Set(Object.values(EVENTS));

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NUMERIC_RE = /^\d+$/;
// Literal route words: letters, hyphen, underscore only (e.g. "prioritized",
// "resolve-schedule", "dummy-canvas"). Anything else becomes a placeholder.
const LITERAL_SEGMENT_RE = /^[A-Za-z][A-Za-z_-]{0,31}$/;
const SAFE_TOKEN_RE = /^[A-Za-z0-9_.-]{1,64}$/;

// ---------------------------------------------------------------------------
// Output sink
// ---------------------------------------------------------------------------

function defaultSink(line) {
  if (
    process.env.NODE_ENV === "test" &&
    process.env.SECURITY_LOG_STDOUT !== "1"
  ) {
    return;
  }
  process.stdout.write(`${line}\n`);
}

let sink = defaultSink;

/** Replace the output sink. Tests use this to capture serialized lines. */
function setSink(fn) {
  sink = typeof fn === "function" ? fn : defaultSink;
}

function resetSink() {
  sink = defaultSink;
}

// ---------------------------------------------------------------------------
// Field builders
// ---------------------------------------------------------------------------

/**
 * Rebuild a safe route pattern from the request URL.
 * "/api/tasks/9f1c...-uuid?token=abc" -> "/api/tasks/:id"
 */
function normalizeRoute(req) {
  const raw =
    (req && (req.originalUrl || req.url || req.path)) || "/";

  const pathOnly = String(raw).split("?")[0].split("#")[0];

  const segments = pathOnly
    .split("/")
    .filter((segment) => segment.length > 0)
    .map((segment) => {
      if (UUID_RE.test(segment) || NUMERIC_RE.test(segment)) return ":id";
      if (LITERAL_SEGMENT_RE.test(segment)) return segment;
      return ":param";
    });

  return `/${segments.join("/")}`.slice(0, 200);
}

/**
 * Opaque, stable identifier for an account, safe to log.
 * Returns undefined when no usable email is given.
 */
function subjectFor(email) {
  if (typeof email !== "string") return undefined;

  const normalized = email.trim().toLowerCase();
  if (!normalized) return undefined;

  const salt = process.env.SECURITY_LOG_SALT || "omni-ai-security-log";

  return crypto
    .createHash("sha256")
    .update(`${salt}:${normalized}`)
    .digest("hex")
    .slice(0, 16);
}

/** Only short identifier-shaped strings may be copied from an Error. */
function safeToken(value) {
  if (typeof value === "number") value = String(value);
  return typeof value === "string" && SAFE_TOKEN_RE.test(value)
    ? value
    : undefined;
}

// ---------------------------------------------------------------------------
// Core API
// ---------------------------------------------------------------------------

/**
 * Write one security event. Never throws.
 *
 * @param {object}  p
 * @param {string}  p.event    One of EVENTS.
 * @param {string}  p.reason   One of REASONS (otherwise "unspecified").
 * @param {object}  [p.req]    Express request; only method, URL and the
 *                             server-assigned requestId are read from it.
 * @param {number}  [p.status] HTTP status being returned.
 * @param {string}  [p.subject]      Output of subjectFor().
 * @param {*}       [p.error]  Optional Error; only name/code are recorded.
 * @param {number}  [p.failureCount] For threshold alerts.
 * @returns {object|null} the record written, or null if nothing was written.
 */
function logSecurityEvent({
  event,
  reason,
  req,
  status,
  subject,
  error,
  failureCount,
} = {}) {
  try {
    if (!EVENT_SET.has(event)) return null;

    const record = {
      timestamp: new Date().toISOString(),
      level: EVENT_LEVEL[event],
      event,
      reason: REASON_SET.has(reason) ? reason : "unspecified",
      method: String((req && req.method) || "UNKNOWN")
        .toUpperCase()
        .slice(0, 10),
      route: normalizeRoute(req),
      status: Number.isInteger(status) ? status : 0,
      requestId: String((req && req.requestId) || "unknown").slice(0, 64),
    };

    if (typeof subject === "string" && /^[0-9a-f]{16}$/.test(subject)) {
      record.subject = subject;
    }

    if (error) {
      const errorName = safeToken(error.name);
      const errorCode = safeToken(error.code);
      if (errorName) record.errorName = errorName;
      if (errorCode) record.errorCode = errorCode;
    }

    if (Number.isInteger(failureCount) && failureCount > 0) {
      record.failureCount = failureCount;
    }

    sink(JSON.stringify(record), record);
    return record;
  } catch {
    // Monitoring must never break request handling.
    return null;
  }
}

// ---------------------------------------------------------------------------
// Convenience wrappers
// ---------------------------------------------------------------------------

/**
 * Record a failed login and feed the repeated-failure detector.
 * Emits AUTH_LOGIN_FAILED and, on the failure that reaches the threshold,
 * AUTH_FAILURE_THRESHOLD_EXCEEDED.
 */
function logLoginFailed(req, reason, email, status = 401) {
  try {
    const subject = subjectFor(email);

    logSecurityEvent({
      event: EVENTS.AUTH_LOGIN_FAILED,
      reason,
      req,
      status,
      subject,
    });

    if (subject) {
      const { alert, count } = failedAuthDetector.record(subject);

      if (alert) {
        logSecurityEvent({
          event: EVENTS.AUTH_FAILURE_THRESHOLD_EXCEEDED,
          reason: "repeated_login_failures",
          req,
          status,
          subject,
          failureCount: count,
        });
      }
    }
  } catch {
    // never throw from monitoring
  }
}

/** A database call returned an error or threw. */
function logDatabaseFailure(req, reason, error, status = 500) {
  return logSecurityEvent({
    event: EVENTS.DATABASE_OPERATION_FAILED,
    reason,
    req,
    status,
    error,
  });
}

/** Any other security-relevant backend failure. */
function logBackendError(req, reason, error, status = 500) {
  return logSecurityEvent({
    event: EVENTS.BACKEND_SECURITY_ERROR,
    reason,
    req,
    status,
    error,
  });
}

// ---------------------------------------------------------------------------
// Schema check (AC-04)
// ---------------------------------------------------------------------------

/**
 * Validate a parsed log record against the Sprint 4 schema.
 * @returns {string[]} problems; empty when the record is valid.
 */
function validateEvent(record) {
  const problems = [];

  if (!record || typeof record !== "object") return ["record is not an object"];

  const isIsoUtc =
    typeof record.timestamp === "string" &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(record.timestamp) &&
    !Number.isNaN(Date.parse(record.timestamp));

  if (!isIsoUtc) problems.push("timestamp must be ISO 8601 UTC");
  if (!LEVELS.includes(record.level)) problems.push("level invalid");
  if (!EVENT_SET.has(record.event)) problems.push("event invalid");
  if (!REASON_SET.has(record.reason)) problems.push("reason invalid");
  if (typeof record.method !== "string" || !record.method)
    problems.push("method must be a non-empty string");
  if (typeof record.route !== "string" || !record.route.startsWith("/"))
    problems.push("route must be a string starting with /");
  if (
    !Number.isInteger(record.status) ||
    record.status < 100 ||
    record.status > 599
  )
    problems.push("status must be an HTTP status code");
  if (typeof record.requestId !== "string" || !record.requestId)
    problems.push("requestId must be a non-empty string");

  const allowed = new Set([
    "timestamp",
    "level",
    "event",
    "reason",
    "method",
    "route",
    "status",
    "requestId",
    "subject",
    "errorName",
    "errorCode",
    "failureCount",
  ]);

  for (const key of Object.keys(record)) {
    if (!allowed.has(key)) problems.push(`unexpected field: ${key}`);
  }

  return problems;
}

module.exports = {
  EVENTS,
  LEVELS,
  REASONS,
  logSecurityEvent,
  logLoginFailed,
  logDatabaseFailure,
  logBackendError,
  subjectFor,
  normalizeRoute,
  validateEvent,
  setSink,
  resetSink,
};
