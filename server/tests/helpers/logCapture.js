/**
 * Captures what the CC7.2 security logger writes so tests can assert on the
 * exact serialized output (the same JSON lines an operator would see).
 */
const {
  setSink,
  resetSink,
  validateEvent,
} = require("../../src/utils/securityLogger");

function startLogCapture() {
  const lines = [];

  setSink((line) => lines.push(line));

  return {
    /** Raw serialized lines, exactly as written. */
    lines,

    /** Parsed records. Throws if any line is not valid JSON (AC-04). */
    events() {
      return lines.map((line) => JSON.parse(line));
    },

    /** Parsed records for one event type. */
    byEvent(name) {
      return this.events().filter((e) => e.event === name);
    },

    /** Every captured line joined, for "secret must not appear" searches. */
    text() {
      return lines.join("\n");
    },

    clear() {
      lines.length = 0;
    },

    stop() {
      resetSink();
    },
  };
}

/** Schema problems across all captured events, prefixed by event index. */
function schemaProblems(events) {
  return events.flatMap((record, i) =>
    validateEvent(record).map((problem) => `event[${i}] ${problem}`)
  );
}

module.exports = { startLogCapture, schemaProblems };
