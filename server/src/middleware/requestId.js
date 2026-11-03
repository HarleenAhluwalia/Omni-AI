const crypto = require("crypto");

/**
 * SOC 2 CC7.2 — request correlation.
 *
 * Assigns every request a server-generated identifier, exposes it as
 * `req.requestId`, and returns it to the caller in the `X-Request-Id`
 * response header so a user-reported failure can be matched to a log line.
 *
 * A client-supplied X-Request-Id is deliberately ignored: accepting it would
 * let a caller forge or collide identifiers and inject text into the logs.
 */
function requestId(req, res, next) {
  const id = crypto.randomUUID();
  req.requestId = id;
  res.setHeader("X-Request-Id", id);
  next();
}

module.exports = { requestId };
