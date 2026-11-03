/**
 * SOC 2 CC7.2 — Suspicious-activity detection (SOC2-S4-05 / ENG-05 / TC-06).
 *
 * Flags repeated failed authentication attempts for the same account inside a
 * rolling time window (default: 5 failures within 5 minutes).
 *
 * Design constraints from the Sprint 4 proposal:
 *   - Never stores plaintext credentials. Callers pass an opaque account key
 *     (the logger passes a truncated hash of the email), never a password.
 *   - Bounded retention. At most `threshold` timestamps are kept per key and
 *     at most `maxKeys` keys are tracked (oldest-touched key is evicted).
 *   - In-memory only. State is lost on restart and is per-process; this is a
 *     detection aid, not a rate limiter, and it never blocks a request.
 */

const DEFAULT_THRESHOLD = 5;
const DEFAULT_WINDOW_MS = 5 * 60 * 1000;
const DEFAULT_MAX_KEYS = 1000;

function createFailedAuthDetector({
  threshold = DEFAULT_THRESHOLD,
  windowMs = DEFAULT_WINDOW_MS,
  maxKeys = DEFAULT_MAX_KEYS,
  now = Date.now,
} = {}) {
  // key -> ascending array of failure timestamps (ms), length < threshold.
  // A Map iterates in insertion order, so re-inserting on every touch makes
  // the first key the least recently touched one (the eviction candidate).
  const buckets = new Map();

  /**
   * Record one failed attempt.
   * @returns {{alert: boolean, count: number}} alert is true exactly when this
   *   failure brings the in-window count to `threshold`. The key's history is
   *   then cleared, so the next alert needs `threshold` fresh failures
   *   (one alert per burst, not one per additional failure).
   */
  function record(key, at = now()) {
    if (typeof key !== "string" || key.length === 0) {
      return { alert: false, count: 0 };
    }

    // Only failures strictly newer than (at - windowMs) count; anything
    // older has rolled out of the window and must not contribute.
    const recent = (buckets.get(key) || []).filter((t) => t > at - windowMs);
    recent.push(at);

    buckets.delete(key);

    if (recent.length >= threshold) {
      return { alert: true, count: recent.length };
    }

    buckets.set(key, recent);

    while (buckets.size > maxKeys) {
      buckets.delete(buckets.keys().next().value);
    }

    return { alert: false, count: recent.length };
  }

  return {
    record,
    reset() {
      buckets.clear();
    },
    size() {
      return buckets.size;
    },
    config: Object.freeze({ threshold, windowMs, maxKeys }),
  };
}

// Process-wide instance used by securityLogger.logLoginFailed().
const failedAuthDetector = createFailedAuthDetector();

module.exports = {
  createFailedAuthDetector,
  failedAuthDetector,
  DEFAULT_THRESHOLD,
  DEFAULT_WINDOW_MS,
  DEFAULT_MAX_KEYS,
};
