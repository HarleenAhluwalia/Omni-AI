
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  DEFAULT_PREFERENCES,
  validatePreferences,
  normalizePreferences,
  preferenceRequest,
} from "../src/api/preferencesApi.js";

test("valid defaults", () => {
  assert.equal(
    validatePreferences(DEFAULT_PREFERENCES),
    ""
  );
});

test("invalid study duration", () => {
  assert.match(
    validatePreferences({
      ...DEFAULT_PREFERENCES,
      studySessionMinutes: -1,
    }),
    /studySessionMinutes/
  );
});

test("weights must total 100", () => {
  assert.match(
    validatePreferences({
      ...DEFAULT_PREFERENCES,
      deadlineWeight: 10,
    }),
    /total 100/
  );
});

test("normalizes numeric input", () => {
  const result = normalizePreferences({
    ...DEFAULT_PREFERENCES,
    studySessionMinutes: "60",
  });

  assert.equal(result.studySessionMinutes, 60);
});

test("authenticated GET request", async () => {
  let req;

  await preferenceRequest(
    "http://localhost:4000/api",
    "abc",
    "GET",
    undefined,
    async (url, opts) => {
      req = { url, opts };

      return {
        ok: true,
        json: async () => ({
          success: true,
          data: DEFAULT_PREFERENCES,
        }),
      };
    }
  );

  assert.equal(
    req.url,
    "http://localhost:4000/api/preferences"
  );

  assert.equal(
    req.opts.headers.Authorization,
    "Bearer abc"
  );
});

test("authenticated PUT request", async () => {
  let req;

  await preferenceRequest(
    "http://localhost:4000/api",
    "abc",
    "PUT",
    DEFAULT_PREFERENCES,
    async (url, opts) => {
      req = opts;

      return {
        ok: true,
        json: async () => ({
          success: true,
          data: DEFAULT_PREFERENCES,
        }),
      };
    }
  );

  assert.equal(req.method, "PUT");
  assert.equal(
    JSON.parse(req.body).deadlineWeight,
    40
  );
});

test("backend error surfaces", async () => {
  await assert.rejects(
    preferenceRequest(
      "http://localhost:4000/api",
      "abc",
      "GET",
      undefined,
      async () => ({
        ok: false,
        status: 500,
        json: async () => ({
          error: "Database unavailable",
        }),
      })
    ),
    /Database unavailable/
  );
});
