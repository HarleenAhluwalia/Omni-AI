# SCRUM-388: Test Updated Assignment Synchronization

## Testing objective

Verify that re-syncing an already-imported Canvas assignment, using the
course-aware request format, updates only the Canvas-owned fields on the
existing Task (`title`, `due_date`, `point_value`, `canvas_course_id`,
`canvas_locked`), never touches user-managed fields (`completion_status`,
`priority`, `estimated_effort_minutes`, `description`), and correctly skips
writing anything when nothing has changed — including across repeated
requests over time.

## Testing methodology

- **State-transition testing**: seed a Task in a known "stale" state, apply
  the sync operation, assert the resulting state transition (stale →
  updated, or unchanged → skipped).
- **Integration testing**: real Express app + Supertest + mocked Supabase,
  same harness as SCRUM-387.
- **Regression-style repetition**: one scenario runs the same course-aware
  request three times in sequence (create → update → settle unchanged) to
  confirm correctness holds across repeated synchronization, not just a
  single call.

## Automated test scenarios

File: `server/tests/canvasImport.test.js`, describe block
`"Canvas sync — course-aware updates to changed fields (SCRUM-388)"`.

| # | Test name | What it verifies |
|---|---|---|
| 1 | `updates stale Canvas-owned fields via a course-aware re-sync` | A Task seeded with a stale `title`/`due_date`/`point_value` is corrected by a course-aware re-sync and reported in the `updated` bucket; no duplicate row is created. |
| 2 | `preserves user-managed fields during a course-aware update` | The same update also seeds `completion_status: "completed"`, `priority: "high"`, `estimated_effort_minutes: 45`, and a custom `description`; all four are asserted unchanged on the returned Task after the sync. |
| 3 | `skips a course-aware re-sync when Canvas-owned fields already match` | A Task already matching the Canvas data exactly produces an empty `updated` list and a `skipped`/`unchanged` entry; the mock store is asserted to still contain exactly one row (no write occurred). |
| 4 | `stays correct across repeated course-aware requests: create, then update, then settle unchanged` | The same course-aware request is sent three times: (1) creates the Task, (2) after simulating a stale `point_value`, corrects it and reports `updated`, (3) reports `skipped`/`unchanged` once nothing differs. Task count stays at 1 throughout. |

## Expected results

- Only Canvas-owned fields are ever written by a sync operation.
- User-managed fields on an existing Task are never read or modified by the
  sync path, confirmed by direct assertion on the returned Task object.
- A Task that already matches performs **no write at all** (not just "no
  visible change") — verified via the row count staying constant.
- Correctness holds whether the request is the first sync, a correcting
  re-sync, or a no-op re-sync.

## Actual results (automated, mocked Supabase)

All 4 scenarios above pass. Command and output:

```
$ cd server && npx jest tests/canvasImport.test.js --verbose
...
  Canvas sync — course-aware updates to changed fields (SCRUM-388)
    ✓ updates stale Canvas-owned fields via a course-aware re-sync (4 ms)
    ✓ preserves user-managed fields during a course-aware update (3 ms)
    ✓ skips a course-aware re-sync when Canvas-owned fields already match (4 ms)
    ✓ stays correct across repeated course-aware requests: create, then update, then settle unchanged (11 ms)
...
Test Suites: 1 passed, 1 total
Tests:       41 passed, 41 total
```

Full backend regression (all suites): 299/299 passing.

```
$ cd server && npx jest --silent
...
Test Suites: 19 passed, 19 total
Tests:       299 passed, 299 total
```

The pre-existing legacy-format equivalents of scenarios 1–3
(`"Canvas sync — updates to changed Canvas-owned fields"`, 3 tests) also
continue to pass unmodified, confirming no regression in the format this
ticket's new tests extend.

## Pass/Fail status

**PASS** — all 4 SCRUM-388 scenarios pass against the mocked Supabase
client, alongside the pre-existing legacy-format update tests.

## Test commands used

```
cd server && npx jest tests/canvasImport.test.js --verbose
cd server && npx jest --silent
git diff --check
```

## Relevant files

- `server/tests/canvasImport.test.js` (test file, extended)
- `server/src/controllers/canvasController.js` (`diffCanvasOwnedFields`, `valuesEqual`, the update branch of `importAssignments` — not modified by this task)

## Limitations / unverified scenarios

- **Mocked database only** — no live Supabase project was used or verified.
- **No manual UI testing was performed.**
- "Repeated requests" coverage (scenario 4) is simulated by directly editing
  the mock store between calls to represent a changed Canvas value, since
  the mock Canvas catalog itself (`canvasService.js`) is static and cannot
  change between calls within a test run. This is a reasonable proxy for "the
  Canvas assignment changed since the last sync," but it is **not** the same
  as observing two real, different catalog snapshots over time.
- `point_value` numeric-string comparison (`valuesEqual`'s handling of
  PostgREST's numeric-as-string quirk) is exercised only with plain JS
  numbers here, matching the mock's behavior; this has never been verified
  against a real Postgres/PostgREST round trip. **NOT TESTED** against a live
  database.
- Whether Supabase migration 002 has been applied to any shared or
  production project remains unconfirmed — not re-verified by this task.
