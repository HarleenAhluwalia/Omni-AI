# Mock Canvas Data Integration Test Cases

**Jira task:** F05 — Develop Mock Canvas Data Integration Tests
**PR batch:** PR 2 — Canvas Integration Testing and CI Regression Coverage
**Branch:** `sprint4/canvas-integration-ci`
**Component under test:** `controllers/dummyCanvasController.js`, `services/dummyCanvasSyncService.js`, `services/dummyCanvasImportService.js`, `services/dummyCanvasService.js`
**Date:** 2026-11-05

## Scope and approach

The Dummy Canvas system simulates a Canvas LMS connection entirely in
memory (`services/dummyCanvasService.js`'s static course/assignment
catalog) — no real Canvas API exists in this project.

- **Automated** cases (`CANVAS4-AUTO-*`), in `server/tests/canvasMockIntegration.test.js`,
  drive the real Express app through Supertest against the real mocked
  Supabase store (`helpers/supabaseMock.js`) — the same pattern as
  `crossComponentSync.test.js`.
- **Manual** cases (`CANVAS4-MAN-*`) cover the Canvas import UI, which
  cannot be automated without a live browser.

### Existing coverage reviewed before writing anything new

| File | What it already covers |
|---|---|
| `dummyCanvasImport.test.js` | Pure conversion/validation functions (`convertCanvasAssignmentToTask`/`...ToUpdates`) — missing titles, invalid points, update-without-resetting-progress, all at the function level, no I/O |
| `dummyCanvasSync.test.js` | `findImportedTask`/`updateImportedTask`/`importCanvasAssignment` against a **hand-rolled** `supabase.from` mock that only asserts call arguments (e.g. `.eq` called with the right values) — never against a real in-memory store |
| `dummyCanvasApi.test.js` | Controller HTTP wiring (`/api/dummy-canvas/*`) with the **service itself mocked out** (`importCanvasAssignment`/`updateImportedTask` are `jest.fn()`s) — proves the controller forwards requests/errors correctly, never exercises the real service+store together |
| `canvasCrossFeatureIntegration.test.js` | The *other* Canvas controller (`/api/canvas/import`, `src/controllers/canvasController.js`) — a different code path, not Dummy Canvas |
| `crossComponentSync.test.js` (SYNC-AUTO-006) | One real end-to-end Dummy Canvas scenario: import → sync → confirms propagation to the Task list and weekly summary. Proves the concept once, not the other 9 required scenarios |

**Confirmed gap**: nothing exercises the Dummy Canvas controller+service
together against the real mocked store, through real HTTP, across the
range of scenarios F05 actually asks for (duplicates, cross-course id
reuse, locked/missing/invalid references, database failures, ownership).
That gap is what `canvasMockIntegration.test.js` fills — every test below
is additive, not a repeat of the files above.

---

## Automated test cases

| ID | Requirement | Summary |
|---|---|---|
| CANVAS4-AUTO-001 | 1. New import | A real import creates a fully-fielded Task, visible via `GET /api/tasks` |
| CANVAS4-AUTO-002 | 2. Update propagation | A sync updates the same Task row in place, no duplicate |
| CANVAS4-AUTO-003 | 3. Preserve user fields | A sync never resets a Task's completion status or priority |
| CANVAS4-AUTO-004 | 4. Duplicate prevention | Repeated imports return the existing Task, never a second row |
| CANVAS4-AUTO-005 | 5. Cross-course ids | Two Tasks sharing an assignment id across different courses stay isolated |
| CANVAS4-AUTO-006 | 6. Locked assignments | Importing a locked assignment is rejected, nothing persisted |
| CANVAS4-AUTO-007 | 7. Invalid references | Import and sync of a nonexistent/never-imported assignment both 404 |
| CANVAS4-AUTO-008 / 008b | 8. Database failures | A rejected database call during import/sync returns a clean 500, no partial row |
| CANVAS4-AUTO-009 | 9. Downstream availability | An imported Task is visible to the prioritized view and weekly summary |
| CANVAS4-AUTO-010 | 10. Ownership | Two users importing the same assignment get independent rows; a stranger can't sync either |

### CANVAS4-AUTO-001
- **Procedure:** `POST /api/dummy-canvas/import-assignment` for assignment 101 ("Sprint 3 Report"). Check the response fields, then `GET /api/tasks`.
- **Expected:** `201`, `created: true`, correct title/course/assignment id/points/due_date (`2026-10-12T23:59:59.999Z`)/defaults (`priority: "medium"`, `completion_status: "not_started"`); appears exactly once in the list.
- **Actual:** Matches. **Status: PASS**

### CANVAS4-AUTO-002
- **Procedure:** Import assignment 101, then `PUT /api/dummy-canvas/sync-assignment` with a new title/due date/points.
- **Expected:** `200`, same task id, fields updated; exactly one stored row for that `(course, assignment)` pair.
- **Actual:** Matches. **Status: PASS**

### CANVAS4-AUTO-003
- **Procedure:** Import, mark the Task `completed` with `priority: "high"` via `PUT /api/tasks/:id`, then sync a due-date change.
- **Expected:** Title/due_date update; `completion_status`/`priority` stay exactly as the user set them (neither field is in `updateImportedTask`'s updates object).
- **Actual:** Matches. **Status: PASS**

### CANVAS4-AUTO-004
- **Procedure:** Import assignment 101 twice in a row.
- **Expected:** First `201`/`created:true`; second `200`/`created:false`, same task id; only one row ever stored.
- **Actual:** Matches. **Status: PASS**

### CANVAS4-AUTO-005
- **Procedure:** The real Dummy Canvas catalog's assignment ids happen to be globally unique, so this is exercised directly: seed two Task rows for the same user with the same `canvas_assignment_id` (999) but different `canvas_course_id` (1 and 2); call `findImportedTask` for each course; then insert a third row reusing assignment id 999 under a third course.
- **Expected:** Each `findImportedTask(user, course, 999)` returns only its own course's row; the third insert succeeds (no `23505` conflict), since the composite uniqueness simulation in `supabaseMock.js` is keyed on `(user_id, canvas_course_id, canvas_assignment_id)` together.
- **Actual:** Matches. **Status: PASS**
- **Note:** The cross-course non-collision behavior of `supabaseMock.js`'s duplicate-detection was previously only asserted in a code comment (helpers/supabaseMock.js:86-90) — this is the first test to actually exercise it.

### CANVAS4-AUTO-006
- **Procedure:** Import assignment 301 ("Art Homework", `locked: true`).
- **Expected:** `403`, `"This Canvas assignment is locked"`, zero rows stored for that assignment.
- **Actual:** Matches. **Status: PASS**
- **Note:** Missing/invalid assignment fields (title, due date, points) are already thoroughly covered at the pure-function level in `dummyCanvasImport.test.js` — not repeated here to avoid duplicating adequately-tested coverage.

### CANVAS4-AUTO-007
- **Procedure:** Import a nonexistent assignment id (999); sync the same nonexistent id; sync a real, unlocked assignment (102) that this user never imported.
- **Expected:** Import → `404 "Canvas assignment not found"`. Sync of the nonexistent catalog id → same 404/message. Sync of a real-but-never-imported assignment → `404 "Imported assignment not found"` (a different reason — no matching Task row, not a catalog miss).
- **Actual:** Matches. **Status: PASS**

### CANVAS4-AUTO-008 / 008b
- **Procedure:** Force the mocked Supabase `select().eq().eq().eq().maybeSingle()` chain to reject with a generic error, once for import and once for sync (after a prior successful import).
- **Expected:** Import → `500`, generic message, zero rows stored. Sync → `500`, generic message, the existing Task's row completely unchanged from its pre-failure snapshot.
- **Actual:** Matches both. **Status: PASS**
- **Note:** Unlike `taskController.js` before the DB-DEFECT-001 fix, `dummyCanvasController.js`'s `importAssignment`/`syncImportedAssignment` already had try/catch with a generic 500 fallback from Sprint 3 — no defect found here.

### CANVAS4-AUTO-009
- **Procedure:** Import assignment 101, check `GET /api/tasks/prioritized`, then move its due date into the current UTC week and check `GET /api/tasks/summary/weekly`.
- **Expected:** Present in the prioritized list immediately after import; counted by the weekly summary once its due date falls in the current week.
- **Actual:** Matches. **Status: PASS**

### CANVAS4-AUTO-010
- **Procedure:** Two different users import the same assignment (101); User B completes their copy; a third, unrelated user attempts to sync the same assignment.
- **Expected:** Each user gets their own task id (not shared/conflicting); User A's row stays `not_started` regardless of User B's completion; the third user's sync returns `404 "Imported assignment not found"` since they never imported it themselves.
- **Actual:** Matches. **Status: PASS**

---

## Manual test cases (not executable with current tooling)

### CANVAS4-MAN-001: Canvas import UI shows a success state and the new Task appears in Calendar/To-Do without a refresh
- **Status:** NOT RUN — requires a live browser session.

### CANVAS4-MAN-002: Attempting to import a locked assignment shows a clear, non-technical error in the UI
- **Status:** NOT RUN.

### CANVAS4-MAN-003: Re-importing an already-imported assignment does not create a visible duplicate in the UI
- **Status:** NOT RUN.

---

## Mocked versus live limitations

Every `CANVAS4-AUTO-*` test proves that the Dummy Canvas controller and
service behave correctly against Omni-AI's own mocked Supabase store —
it does not prove real Postgres enforcement of the
`tasks_user_canvas_assignment_unique` index, and there is no live Canvas
LMS connection anywhere in this project to verify against. CANVAS4-AUTO-005's
cross-course scenario in particular is a simulation of a realistic Canvas
numbering collision, not something the current catalog data can produce
on its own.

## Test execution

```
cd server && npx jest --silent canvasMockIntegration.test.js
  Test Suites: 1 passed, 1 total
  Tests:       11 passed, 11 total
```

No defects were found in the Dummy Canvas import/sync code during this
work.
