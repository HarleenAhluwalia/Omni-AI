
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  canvasImportPayload,
  canvasResultCounts,
  canvasRequest,
} from "../src/api/canvasApi.js";

test("course-aware import deduplicates", () => {
  const result = canvasImportPayload([
    { course_id: 1, assignment_id: 101 },
    { course_id: 1, assignment_id: 101 },
    { course_id: 2, assignment_id: 101 },
  ]);

  assert.equal(result.assignments.length, 2);
});

test("rejects empty imports", () => {
  assert.throws(
    () => canvasImportPayload([]),
    /No assignments/
  );
});

test("four result buckets", () => {
  assert.deepEqual(
    canvasResultCounts({
      imported: [{}],
      skipped: [{}, {}],
      failed: [],
    }),
    {
      imported: 1,
      updated: 0,
      skipped: 2,
      failed: 0,
    }
  );
});

test("request uses auth and correct endpoint", async () => {
  let req;

  await canvasRequest(
    "http://localhost:4000/api",
    "jwt",
    "/canvas/import",
    {
      method: "POST",
      body: JSON.stringify({
        assignment_ids: [101],
      }),
    },
    async (url, opts) => {
      req = { url, opts };

      return {
        ok: true,
        json: async () => ({
          success: true,
          data: {
            imported: [{}],
          },
        }),
      };
    }
  );

  assert.equal(
    req.url,
    "http://localhost:4000/api/canvas/import"
  );

  assert.equal(
    req.opts.headers.Authorization,
    "Bearer jwt"
  );
});

test("failed request propagates error", async () => {
  await assert.rejects(
    canvasRequest(
      "http://localhost:4000/api",
      "jwt",
      "/canvas/import",
      {},
      async () => ({
        ok: false,
        status: 503,
        json: async () => ({
          error: "offline",
        }),
      })
    ),
    /offline/
  );
});
