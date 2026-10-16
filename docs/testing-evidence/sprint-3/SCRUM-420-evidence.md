# SCRUM-420: Implement Assignment Updates and Duplicate Prevention

## Objective and acceptance criteria

Identify previously imported Canvas assignments and update their
information when changes occur. Prevent duplicate Task creation during
repeated imports while preserving user-managed fields (completion status,
priority, estimated effort).

## Status

**Already implemented and merged** (same PRs as SCRUM-419: `ff47c23`,
`6e9a8f1`, `f2712ab`). No new implementation was needed or made for this
ticket.

## Implementation details

`server/src/controllers/canvasController.js`:
- `diffCanvasOwnedFields` / `valuesEqual` compute only the Canvas-owned
  fields that actually changed (`title`, `due_date`, `point_value`,
  `canvas_course_id`, `canvas_locked`); the update write contains only
  those keys, so `completion_status`, `priority`, `estimated_effort_minutes`,
  and `description` are never read or written by a sync.
- Duplicate prevention is enforced at two levels: an application-level
  lookup keyed by `(user_id, canvas_course_id, canvas_assignment_id)`
  before any write, and the database's own
  `tasks_user_canvas_assignment_unique` composite index as a safety net
  for genuine concurrent-import races (`isUniqueViolation` +
  race-winner re-fetch).

## Testing methodology

Integration testing and state-transition testing (seeded "stale" Task state
→ assert the resulting transition), plus concurrency testing for the
duplicate-prevention race path.

## Test scenarios and results

File: `server/tests/canvasImport.test.js`.

| Test | Result |
|---|---|
| `Canvas sync — duplicate prevention › does not create a duplicate Task on a repeated import` | PASS |
| `Canvas sync — duplicate prevention › scopes duplicate detection by user_id, not globally` | PASS |
| `Canvas sync — updates to changed Canvas-owned fields › updates stale Canvas-owned fields and reports the result as updated` | PASS |
| `Canvas sync — updates to changed Canvas-owned fields › preserves user-managed fields while updating Canvas-owned fields` | PASS |
| `Canvas sync — updates to changed Canvas-owned fields › skips an assignment whose Canvas-owned fields already match` | PASS |
| `Canvas sync — concurrent duplicate-import attempts › creates exactly one Task when the same new assignment is imported concurrently` | PASS |
| `Canvas sync — course-aware updates to changed fields (SCRUM-388)` (4 tests) | PASS |
| `Canvas sync — course-aware duplicate prevention and locked assignments (SCRUM-389)` (duplicate-specific tests) | PASS |

(Full detail, including the composite-identity isolated-fixture tests, is in
`docs/testing-evidence/sprint-3/SCRUM-388-canvas-update-tests.md` and
`docs/testing-evidence/sprint-3/SCRUM-389-canvas-duplicate-locked-tests.md`.)

## Expected vs. actual results

Expected: re-syncing an already-imported assignment corrects only stale
Canvas-owned fields, never touches user-managed fields, and never creates a
second Task — including under a genuine concurrent-import race. Actual:
matches exactly; confirmed the concurrency scenario is non-flaky across 5
repeated runs (recorded in the SCRUM-389 evidence file).

## Exact test commands used

```
cd server && npx jest tests/canvasImport.test.js --verbose
cd server && npx jest --silent
```

Result: 44/44 passing in `canvasImport.test.js`; 317/317 passing across the
full backend suite.

## Pass/fail status

**PASS** — implemented, tested, and merged prior to this session; reverified
as part of this session's full regression run.

## Relevant files

- `server/src/controllers/canvasController.js`
- `server/tests/canvasImport.test.js`
- `server/tests/helpers/supabaseMock.js`
- `docs/testing-evidence/sprint-3/SCRUM-388-canvas-update-tests.md`
- `docs/testing-evidence/sprint-3/SCRUM-389-canvas-duplicate-locked-tests.md`

## Limitations / unverified scenarios

- Mocked Supabase database only — the composite unique index's real
  Postgres enforcement is simulated, not exercised against a live
  constraint.
- No manual UI testing performed for this ticket specifically.
