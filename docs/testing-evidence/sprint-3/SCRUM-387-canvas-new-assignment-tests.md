# SCRUM-387: Test New Assignment Synchronization

## Testing objective

Verify that `POST /api/canvas/import` correctly creates a new Omni-AI Task from
a Canvas assignment that has not been imported before, using the course-aware
`{assignments: [{course_id, assignment_id}]}` request format, with correct
field mapping, correct ownership, and correct handling of invalid/unknown
references. This extends existing legacy-format coverage; it does not
replace it.

## Testing methodology

- **Integration testing**: real Express app (`createApp()`) + Supertest HTTP
  requests against the actual route/controller, with a mocked Supabase client
  (`server/tests/helpers/supabaseMock.js`) standing in for the database. No
  network calls, no live Supabase project.
- **Boundary/negative testing**: invalid request bodies, unknown course ids,
  unknown assignment ids.

## Automated test scenarios

File: `server/tests/canvasImport.test.js`, describe block
`"Canvas sync — course-aware new assignment import (SCRUM-387)"`.

| # | Test name | What it verifies |
|---|---|---|
| 1 | `imports a new assignment using the course-aware request format` | A fresh course-aware import creates one Task, with `title`, `due_date`, `point_value`, `canvas_assignment_id`, `canvas_course_id`, `canvas_locked`, `user_id`, and `completion_status` all mapped correctly; persistence confirmed against the mock store, not just the response body. |
| 2 | `supports importing multiple course-aware assignments from different courses in one request` | Two assignments from two different courses in one request both import successfully, each tagged with its own `canvas_course_id`. |
| 3 | `scopes course-aware imports to the authenticated user, same as the legacy format` | The same assignment imported by two different users produces two separate Tasks, each owned by the correct `user_id`. |
| 4 | `rejects an invalid course-aware request body` | Missing `assignment_id`, non-integer `course_id`, empty `assignments` array, and a non-array `assignments` value all return `400`, with nothing persisted. |
| 5 | `reports an unknown course/assignment reference as failed, not a crash` | An unknown `course_id` and a known `course_id` with an unknown `assignment_id` both return `200` with the item in the `failed` bucket (`reason: "assignment_not_found"`), never a crash or false success. |

## Expected results

- New assignments create real, persisted Tasks with accurate Canvas-owned
  field mapping.
- Ownership is enforced from the authenticated session (`req.user.id`), never
  client-supplied.
- Invalid bodies are rejected with `400`; unknown references fail gracefully
  per-item with `200` and a `failed` entry, never a 500 or a crash.

## Actual results (automated, mocked Supabase)

All 5 scenarios above pass. Command and output:

```
$ cd server && npx jest tests/canvasImport.test.js --verbose
...
  Canvas sync — course-aware new assignment import (SCRUM-387)
    ✓ imports a new assignment using the course-aware request format (4 ms)
    ✓ supports importing multiple course-aware assignments from different courses in one request (4 ms)
    ✓ scopes course-aware imports to the authenticated user, same as the legacy format (7 ms)
    ✓ rejects an invalid course-aware request body (13 ms)
    ✓ reports an unknown course/assignment reference as failed, not a crash (7 ms)
...
Test Suites: 1 passed, 1 total
Tests:       41 passed, 41 total
```

Full-file result: 41/41 passing (25 pre-existing legacy-format tests + 16 new
course-aware tests across SCRUM-387/388/389, none of which regressed).

Full backend regression (all suites): 299/299 passing.

```
$ cd server && npx jest --silent
...
Test Suites: 19 passed, 19 total
Tests:       299 passed, 299 total
```

## Pass/Fail status

**PASS** — all 5 SCRUM-387 scenarios pass against the mocked Supabase client.
No test failures, no regressions in the existing 25 legacy-format Canvas
tests or the other 18 backend test suites.

## Test commands used

```
cd server && npx jest tests/canvasImport.test.js --verbose
cd server && npx jest --silent
git diff --check
```

## Relevant files

- `server/tests/canvasImport.test.js` (test file, extended)
- `server/tests/helpers/supabaseMock.js` (shared mock, see "Limitations" below for the one fix made here)
- `server/src/controllers/canvasController.js` (`getCourses`, `importAssignments` — not modified by this task)
- `server/services/canvasService.js` (`findAssignmentByCourseAndId` — not modified by this task)

## Limitations / unverified scenarios

- **Mocked database only.** Every result above is against an in-memory
  Supabase mock (`server/tests/helpers/supabaseMock.js`), not a live Supabase
  project. **Live database integration was NOT executed or verified.**
- **No manual UI testing was performed** for this ticket. Frontend
  course-aware integration (`CanvasIntegration.jsx`) was covered separately,
  in its own PR, with its own test evidence.
- **Test-infrastructure fix made in this task**: the shared Supabase mock's
  duplicate-detection check only compared `user_id` + `canvas_assignment_id`,
  ignoring `canvas_course_id` — inconsistent with migration 002's real
  composite unique index `(user_id, canvas_course_id, canvas_assignment_id)`.
  This was corrected in `server/tests/helpers/supabaseMock.js` so the mock's
  uniqueness behavior matches the documented schema. This is a test-helper
  fix, not a change to `canvasController.js` or any production code.
- **`canvasService.findAssignmentByCourseAndId` has no dedicated unit test**
  in `server/tests/canvasService.test.js` (only `findAssignmentById`,
  `isLocked`, and catalog-structure tests exist there). It is exercised
  indirectly through every course-aware integration test above, but a direct
  unit test for that function specifically is **NOT TESTED**.
- The mock catalog (`server/services/canvasService.js`) has no two courses
  sharing the same assignment id, so true cross-course id collisions from the
  *real* catalog could not be exercised end-to-end; those scenarios use
  isolated fixtures instead (see SCRUM-389's evidence file for detail).
- Whether Supabase migration 002 has actually been applied to any shared or
  production project remains **unconfirmed** — out of scope for this
  testing task, and not re-verified here.
