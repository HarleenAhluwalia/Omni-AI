# SCRUM-389: Test Duplicate Prevention and Locked Assignments

## Testing objective

Verify that repeated or concurrent course-aware imports never create
duplicate Tasks, that assignment identity is correctly scoped to the
composite `(user_id, course_id, assignment_id)` key rather than assignment id
alone, that locked Canvas assignments import as placeholder Tasks with no
invented data, that failures in the duplicate-handling path are reported
safely, and that the pre-existing legacy `assignment_ids` request format
still works unchanged.

## Testing methodology

- **Integration testing**: real Express app + Supertest + mocked Supabase,
  same harness as SCRUM-387/388.
- **Boundary/isolated-fixture testing**: the real mock Canvas catalog
  (`server/services/canvasService.js`) has no assignment id reused across
  two courses, so scenarios requiring that collision seed Task rows directly
  into the mock store (`seedExistingCanvasTask`) rather than relying on catalog
  data that doesn't exist. This is explicitly an isolated-fixture technique,
  not a change to the Canvas catalog or any production data.
- **Concurrency testing**: `Promise.all` fires two identical import requests
  simultaneously against the same in-process mock, relying on genuine
  interleaving through the real Express/Node HTTP stack.
- **Failure-injection testing**: `supabase.from` is temporarily wrapped to
  force a unique-violation response and then a second failure on the
  resulting re-fetch, to verify the error path without needing a real
  database race.

## A test-infrastructure defect found and fixed before writing these tests

Before adding course-aware duplicate tests, inspection of
`server/tests/helpers/supabaseMock.js` found that its duplicate-detection
check only compared `user_id` and `canvas_assignment_id` — it ignored
`canvas_course_id` entirely. This does not match
`supabase/migrations/002_canvas_assignment_sync.sql`'s real composite unique
index, `(user_id, canvas_course_id, canvas_assignment_id)`. Left unfixed, the
mock would have falsely treated two different courses' Tasks sharing the
same assignment id as a conflict, which would have made this ticket's core
scenario fail for the wrong reason (a stale test double, not a real product
defect).

This was corrected in `server/tests/helpers/supabaseMock.js` by adding
`canvas_course_id` to the conflict-matching condition. **This is a test
helper fix, not a change to `server/src/controllers/canvasController.js` or
any other production file**, consistent with this task's constraint to only
modify the controller for a confirmed production bug. No such production bug
was found in the controller itself during this work.

## Automated test scenarios

File: `server/tests/canvasImport.test.js`, describe block
`"Canvas sync — course-aware duplicate prevention and locked assignments (SCRUM-389)"`.

| # | Test name | What it verifies |
|---|---|---|
| 1 | `does not create a duplicate Task on a repeated course-aware import` | Importing the same course-aware assignment twice creates exactly one Task; the second call reports `skipped`/`unchanged`. |
| 2 | `treats the same assignment id from two different courses as distinct Tasks (isolated fixture)` | Two isolated-fixture Tasks share `canvas_assignment_id` but have different `canvas_course_id`s. A course-aware update targeting one of them updates only that Task; the other (same assignment id, different course) is asserted byte-for-byte untouched. |
| 3 | `does not falsely reject a new course-aware import as a duplicate when a different course already used the same assignment id (isolated fixture)` | An isolated fixture simulates "assignment id 102 already imported from course 2" (a state the real catalog can't produce). A fresh course-aware import of course 1's real assignment 102 is asserted to succeed as a genuine new import — not be incorrectly skipped as a duplicate. This is the scenario the mock fix above directly addresses. |
| 4 | `imports a locked assignment as a placeholder Task using the course-aware format` | A locked assignment imports with `canvas_locked: true` and `due_date`/`point_value` both `null`, never a fabricated value, using the course-aware request shape. |
| 5 | `reports duplicate_lookup_failed (not a crash) when the race-winner re-fetch itself fails` | A forced unique-violation on insert, followed by a forced failure on the controller's race-winner re-fetch, is asserted to land in the `failed` bucket with `reason: "duplicate_lookup_failed"` — a `200` response, not a crash or an unhandled rejection. |
| 6 | `creates exactly one Task when the same course-aware assignment is imported concurrently` | Two concurrent course-aware import requests for the same assignment are fired via `Promise.all`; exactly one Task is created in total, and the losing request's `failed` array is empty (the same outcome as an ordinary duplicate, not an error). |
| 7 | `confirms the legacy assignment_ids request format still works alongside the course-aware format` | One legacy-format request and one course-aware request, in the same test, both succeed and each creates a correctly-attributed Task. |

## Expected results

- No duplicate Tasks under repeated or concurrent import, in either request
  format.
- Assignment identity is genuinely composite: the same assignment id in two
  different courses is two different Tasks, never conflated or
  cross-contaminated.
- Locked assignments never receive invented `due_date`/`point_value` data.
- A failure deep in the duplicate-handling path (the race-winner re-fetch
  itself failing) is reported per-item, not as a crash or a false success.
- The legacy format keeps working unchanged after the course-aware rework.

## Actual results (automated, mocked Supabase)

All 7 scenarios above pass. Command and output:

```
$ cd server && npx jest tests/canvasImport.test.js --verbose
...
  Canvas sync — course-aware duplicate prevention and locked assignments (SCRUM-389)
    ✓ does not create a duplicate Task on a repeated course-aware import (8 ms)
    ✓ treats the same assignment id from two different courses as distinct Tasks (isolated fixture) (5 ms)
    ✓ does not falsely reject a new course-aware import as a duplicate when a different course already used the same assignment id (isolated fixture) (4 ms)
    ✓ imports a locked assignment as a placeholder Task using the course-aware format (4 ms)
    ✓ reports duplicate_lookup_failed (not a crash) when the race-winner re-fetch itself fails (5 ms)
    ✓ creates exactly one Task when the same course-aware assignment is imported concurrently (6 ms)
    ✓ confirms the legacy assignment_ids request format still works alongside the course-aware format (8 ms)
...
Test Suites: 1 passed, 1 total
Tests:       41 passed, 41 total
```

The pre-existing legacy-format concurrency test
(`"creates exactly one Task when the same new assignment is imported
concurrently"`, in `"Canvas sync — concurrent duplicate-import attempts"`)
also continues to pass unmodified.

Full backend regression (all suites): 299/299 passing.

```
$ cd server && npx jest --silent
...
Test Suites: 19 passed, 19 total
Tests:       299 passed, 299 total
```

Repeat-run check: scenario #6 was additionally rerun 5 times in isolation to
rule out flakiness:

```
$ for i in 1 2 3 4 5; do
    npx jest tests/canvasImport.test.js \
      -t "creates exactly one Task when the same course-aware assignment is imported concurrently" \
      --silent
  done
...
Tests: 1 passed, 1 total   (x5, no failures across any run)
```

## Pass/Fail status

**PASS** — all 7 SCRUM-389 scenarios pass against the mocked Supabase
client, with the pre-existing mock defect found and fixed before testing
began (see above).

## Test commands used

```
cd server && npx jest tests/canvasImport.test.js --verbose
cd server && npx jest --silent
git diff --check
```

## Relevant files

- `server/tests/canvasImport.test.js` (test file, extended)
- `server/tests/helpers/supabaseMock.js` (test helper, fixed — see above)
- `server/src/controllers/canvasController.js` (`isUniqueViolation`, the race-winner re-fetch, `buildCanvasOwnedFields`'s locked-field passthrough — not modified by this task)
- `supabase/migrations/002_canvas_assignment_sync.sql` (reference only, confirms the real composite unique index; not modified)

## Limitations / unverified scenarios

- **Mocked database only** — no live Supabase project was used or verified.
  The composite unique-index behavior is simulated by the (now-corrected)
  mock, not exercised against a real Postgres unique index.
- **No manual UI testing was performed.**
- Scenarios 2 and 3 above use isolated fixtures specifically because the real
  mock Canvas catalog has no assignment id reused across two courses. They
  prove the server's identity logic and the mock's constraint simulation are
  correct for that shape of data; they do not prove the real Canvas catalog
  (mock or eventual live integration) will ever actually produce that shape.
- Whether Supabase migration 002 has been applied to any shared or
  production project remains unconfirmed — not re-verified by this task.
