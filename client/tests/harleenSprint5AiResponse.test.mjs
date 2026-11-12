
/**
 * Sprint 5 — Harleen
 *
 * SCRUM-139: Examine frontend AI response handling
 * SCRUM-140: Identify response-handling problems
 *
 * Source-contract checks for the frontend AI integration.
 *
 * These tests inspect implementation patterns.
 * They do not simulate browser interactions.
 */

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const dashboardPath = path.resolve(
  "src/pages/Dashboard.jsx"
);

const dashboard = fs.readFileSync(
  dashboardPath,
  "utf8"
);

test("SCRUM-139: frontend contains AI request handling", () => {
  assert.match(
    dashboard,
    /fetch\s*\(|axios|apiRequest/
  );
});

test("SCRUM-139: frontend includes AI loading state", () => {
  assert.match(
    dashboard,
    /loading|isLoading|setLoading/i
  );
});

test("SCRUM-139: frontend includes AI error handling", () => {
  assert.match(
    dashboard,
    /catch\s*\(|error|setError/i
  );
});

test("SCRUM-139: frontend supports displaying AI responses", () => {
  assert.match(
    dashboard,
    /response|message|chat/i
  );
});

test("SCRUM-140: frontend checks response success", () => {
  assert.match(
    dashboard,
    /response\.ok|res\.ok|status/i
  );
});

test("SCRUM-140: frontend includes user feedback", () => {
  assert.match(
    dashboard,
    /error|loading|retry|failed/i
  );
});
