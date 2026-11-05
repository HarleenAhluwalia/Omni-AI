const jwt = require("jsonwebtoken");
const { EVENTS, logSecurityEvent } = require("../utils/securityLogger");

const JWT_SECRET = process.env.JWT_SECRET || "dev_only_secret_change_me";
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "1h";

function signToken(user) {
  return jwt.sign({ sub: user.id, email: user.email }, JWT_SECRET, {
    expiresIn: JWT_EXPIRES_IN,
  });
}

/**
 * Express middleware — verifies the Bearer token and attaches
 * `req.user = { id, email }` for downstream route handlers.
 * This is the session-handling mechanism UC-5 relies on: no server-side
 * session store needed, the token itself carries identity + expiry.
 */
function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const [scheme, token] = header.split(" ");

  if (scheme !== "Bearer" || !token) {
    // CC7.2: record why the header was rejected. Only a predefined reason
    // code is logged — never the header value itself.
    let event = EVENTS.AUTH_TOKEN_INVALID;
    let reason = "malformed_header";

    if (!header) {
      event = EVENTS.AUTH_TOKEN_MISSING;
      reason = "no_authorization_header";
    } else if (scheme === "Bearer") {
      event = EVENTS.AUTH_TOKEN_MISSING;
      reason = "empty_token";
    }

    logSecurityEvent({ event, reason, req, status: 401 });

    return res.status(401).json({ error: "Missing or malformed Authorization header." });
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = { id: payload.sub, email: payload.email };
    return next();
  } catch (err) {
    if (err.name === "TokenExpiredError") {
      logSecurityEvent({
        event: EVENTS.AUTH_TOKEN_EXPIRED,
        reason: "token_expired",
        req,
        status: 401,
      });
      return res.status(401).json({ error: "Session expired. Please log in again." });
    }

    logSecurityEvent({
      event: EVENTS.AUTH_TOKEN_INVALID,
      reason: classifyJwtFailure(err),
      req,
      status: 401,
    });
    return res.status(401).json({ error: "Invalid token." });
  }
}

/**
 * Map a jsonwebtoken verification error to a predefined log reason.
 * The library's message text is inspected here but never logged.
 */
function classifyJwtFailure(err) {
  const message = String((err && err.message) || "");

  if (message === "invalid signature") return "invalid_signature";
  if (message === "jwt malformed" || message === "invalid token") {
    return "malformed_token";
  }
  return "invalid_token";
}

module.exports = { signToken, requireAuth, JWT_SECRET };
