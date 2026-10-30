# Database Integrity Test Cases

**Jira task:** Develop Database Integrity Test Cases
**PR batch:** PR 1 — Functional Test Development
**Branch:** `sprint4/functional-test-development`
**Component under test:** `server/controllers/taskController.js` and related Task persistence paths
**Date:** 2026-10-29

## Scope and approach

This document covers database integrity for Task records two ways:

- **Automated** test cases (`DB-AUTO-*`), implemented in
  `server/tests/databaseIntegrity.test.js`, run against the real Express
  app + Jest/Supertest + the existing mocked Supabase client
  (`server/tests/helpers/supabaseMock.js`) — no live database.
- **Planned live** test cases (`DB-LIVE-*`), for anything a mock cannot
  actually prove: real Postgres foreign keys, column-level type limits,
  cascade behavior, and concurrent-transaction semantics. **None of these
  were executed.** A mocked Supabase client can prove what the
  *application* does with whatever the client returns; it cannot prove
  what the *database* actually enforces.

### Existing coverage inventory (reviewed before writing anything new)

| File | What it already covers |
|---|---|
| `createTask.test.js` | Successful creation + exact-field persistence, client-supplied `user_id` ignored, full field validation (missing/blank title, invalid priority/status/due_date, non-numeric/negative point_value and estimated_effort_minutes, zero as a valid boundary), auth, `{error}`-shaped insert failure |
| `editTask.test.js` | Successful update + exact-field persistence, update targets only the specified task, ownership-scoped filtering, 404 for nonexistent task, protected-field immunity (`user_id`/`id`/`created_at`/`updated_at`), full validation, auth, `{error}`-shaped update failure |
| `deleteTask.test.js` | Successful deletion + removal confirmed in the store (not just the response), deletes only the targeted id, ownership-scoped filtering, false-success prevention for non-owned tasks, malformed (non-UUID) id rejection, 404 for nonexistent/already-deleted, auth, `{error}`-shaped delete failure |
| `taskApiContract.test.js` | Exact response-field shape, `user_id`-filtered queries on every verb, protected-field exclusion from update payloads, full **create → read → update → read → delete → read** lifecycle consistency |
| `tasks.test.js` | Cross-user isolation on GET (list and by-id), empty-list handling, status-transition coverage, end-to-end lifecycle |
| `taskAuth.test.js` | Authentication requirements, invalid JWT handling, cross-user authorization, client-supplied `user_id` rejection |
| `taskWorkflow.test.js` | Create/edit/complete/delete interacting correctly with prioritization ordering, sibling-task isolation, edge cases (empty list, single task, tie-breaking) |

This is extensive, high-quality coverage. **Nothing above was duplicated.**
Every test in `databaseIntegrity.test.js` targets a gap confirmed absent
from this inventory.

## Defect found during test development: DB-DEFECT-001 — FIXED

**Severity: higher than F01/F02's display-formatting defects.**
`createTask`, `updateTask`, `deleteTask`, `getTasks`, and `getTaskById` in
`server/controllers/taskController.js` had **no try/catch at all** — only
`getPrioritizedTasks` and `resolveSchedule` did. Every existing
failure-handling test simulated Supabase's own `{data: null, error: {...}}`
return shape, which these handlers do check and correctly turn into a
`500`. None simulated a genuinely **thrown or rejected** call (a real
connection failure, as opposed to a query-level error response).

With Express **4.19.2** (confirmed in `server/package.json`), an async
route handler's rejected promise is not automatically caught — there is no
built-in equivalent to Express 5's auto-forwarding. Confirmed directly: a
real connection failure in any of these five handlers did not produce a
`500`. **It produced no HTTP response at all.** Over a real connection,
the client would hang until its own timeout.

DB-AUTO-005 originally demonstrated this precisely and safely by calling
`createTask` directly rather than through a live HTTP request, to avoid
Jest's own unhandled-rejection detection turning this into an uncontrolled
test-runner crash rather than a clean, assertable result.

### Fix applied (follow-up ticket)

Each of the five handlers now wraps its database call in a `try/catch`,
following the exact pattern already used by `getPrioritizedTasks` and
`resolveSchedule`: on a thrown/rejected error, log the specifics via
`console.error` and return a generic `500` (`{success: false, error:
"<action-specific generic message>"}`) — never the raw `error.message` or
a stack trace, to avoid exposing internal database details to a client.
Pre-database validation (UUID checks, field validation) stays **outside**
the try block, so every pre-existing `400`/`404` response is unaffected.

This closes the "client hangs forever" failure mode: a genuine connection
failure now returns a clean `500` instead of no response at all.

DB-AUTO-005 was updated to assert the corrected behavior (a real HTTP
request through Supertest now resolves to a controlled `500`, since the
fix removes the unhandled-rejection risk that previously made a live HTTP
request unsafe to assert on). Two further regression tests, DB-AUTO-008
and DB-AUTO-009, were added to cover `getTasks` and `deleteTask` the same
way, and DB-AUTO-010 confirms the fix changed nothing about existing
`400`/`404`/success responses.

---

## Automated test cases

| ID | Scenario area | Summary |
|---|---|---|
| DB-AUTO-001 | B. Task Updates | Three sequential updates leave exactly the last-written state, no drift |
| DB-AUTO-002 | E. Invalid identifiers | `GET /api/tasks/:id` rejects a malformed (non-UUID) id |
| DB-AUTO-003 | E. Invalid identifiers | `PUT /api/tasks/:id` rejects a malformed (non-UUID) id |
| DB-AUTO-004 | C. Deletion relationships | Deleting a Task does not cascade to an associated schedule (mock-documented) |
| DB-AUTO-005 | F. Failure handling | **DB-DEFECT-001 (fixed)**: `createTask` now returns a controlled `500` on a rejected call, instead of no response at all |
| DB-AUTO-006 | F. Failure handling | An update failure on one Task leaves an unrelated, pre-existing Task untouched |
| DB-AUTO-007 | E. Boundary values | Very large (JS-safe) `point_value`/`estimated_effort_minutes` accepted — no app-level upper bound |
| DB-AUTO-008 | F. Failure handling | **DB-DEFECT-001 (fixed)**: `getTasks` now returns a controlled `500` on a rejected call |
| DB-AUTO-009 | F. Failure handling | **DB-DEFECT-001 (fixed)**: `deleteTask` now returns a controlled `500` on a rejected call, and does not remove the task |
| DB-AUTO-010 | F. Failure handling | The fix leaves existing `400`/`404`/success responses unaffected |

### DB-AUTO-001: Repeated updates do not corrupt data
- **Prerequisites:** none (mocked Supabase)
- **Procedure:** Create a task. Apply three separate `PUT` updates in sequence, each changing a different field (title, then priority, then completion_status). Re-fetch via `GET`.
- **Expected Result:** The task reflects all three changes cumulatively, with no field reverting or drifting; the re-fetched state exactly matches the last update's response.
- **Actual Result:** Matches expected.
- **Status:** **PASS**

### DB-AUTO-002/003: Invalid Task identifiers on GET and PUT
- **Prerequisites:** none
- **Procedure:** Request `GET /api/tasks/not-a-real-uuid` and `PUT /api/tasks/not-a-real-uuid` with a valid auth token.
- **Expected Result:** Both return `400`, matching `deleteTask.test.js`'s existing coverage of the identical check on `DELETE`.
- **Actual Result:** Matches expected.
- **Status:** **PASS**
- **Note:** this closes a real gap — `isValidUuid()` is called identically in `getTaskById`, `updateTask`, and `deleteTask`, but only `deleteTask`'s copy had a dedicated test before this.

### DB-AUTO-004: Deletion and related schedule records
- **Prerequisites:** none
- **Procedure:** Create a task, seed a `schedules` row referencing its id directly into the mock store (mirroring `aiController.js`'s real row shape), delete the task, inspect the schedule row afterward.
- **Expected Result:** Documents actual mock behavior — the schedule row is **not** removed or modified; it becomes orphaned (still references the now-deleted `task_id`).
- **Actual Result:** Matches — the mock has no foreign-key or cascade awareness at all.
- **Status:** **PASS** (as a documentation test — see DB-LIVE-001 for what real Postgres would actually do)

### DB-AUTO-005: DB-DEFECT-001 (fixed) — createTask error handling
- **Prerequisites:** none
- **Procedure:** Send a real `POST /api/tasks` request through Supertest with a mocked Supabase client whose insert call rejects. Assert the response status, body, and that the raw error message never reaches the client.
- **Expected Result:** A `500` with `{success: false, error: "Could not create task."}` — never the underlying error text.
- **Actual Result:** Matches expected. The try/catch added to `createTask` catches the rejection and returns the generic response.
- **Status:** **PASS**

### DB-AUTO-008: DB-DEFECT-001 (fixed) — getTasks error handling
- **Prerequisites:** none
- **Procedure:** Send a real `GET /api/tasks` request through Supertest with a mocked Supabase client whose select call rejects.
- **Expected Result:** A `500` with `{success: false, error: "Could not load tasks."}`.
- **Actual Result:** Matches expected.
- **Status:** **PASS**

### DB-AUTO-009: DB-DEFECT-001 (fixed) — deleteTask error handling
- **Prerequisites:** none
- **Procedure:** Create a task, then send a real `DELETE /api/tasks/:id` request through Supertest with a mocked Supabase client whose delete call rejects. Confirm the task is still present afterward.
- **Expected Result:** A `500` with `{success: false, error: "Could not delete task."}`, and the task remains in the store (no partial deletion).
- **Actual Result:** Matches expected.
- **Status:** **PASS**

### DB-AUTO-010: Fix does not change existing 400/404/success responses
- **Prerequisites:** none
- **Procedure:** Exercise an empty-title `400`, a well-formed-but-nonexistent-id `404`, and a normal successful create — none involving a simulated database failure.
- **Expected Result:** All three behave exactly as before the fix (validation still short-circuits before the try block; a normal resolved query still returns its usual status).
- **Actual Result:** Matches expected.
- **Status:** **PASS**

### DB-AUTO-006: Unrelated data survives a failure
- **Prerequisites:** none
- **Procedure:** Create two tasks. Force an `{error}`-shaped update failure targeting only the second. Confirm the first is untouched in the store afterward.
- **Expected Result:** The first task's stored row is byte-for-byte identical before and after the failed operation on the second.
- **Actual Result:** Matches expected.
- **Status:** **PASS**

### DB-AUTO-007: Boundary values — no application-level upper bound
- **Prerequisites:** none
- **Procedure:** Create a task with `point_value` and `estimated_effort_minutes` both set to 999,999,999.
- **Expected Result:** Accepted (only a nonnegative lower bound is enforced by `validateFields()`).
- **Actual Result:** Matches expected.
- **Status:** **PASS**
- **Note:** `estimated_effort_minutes` is a Postgres `integer` column (max 2,147,483,647 per `supabase/migrations/001_initial_schema.sql`). A value beyond that range would only be rejected by a live database — see DB-LIVE-002.

---

## Planned live database test cases

**None of these were executed.** They require a real Supabase/Postgres
connection, which this session does not have credentials to safely use
against (see prior sprint findings on migration/credential status). Listed
here as a concrete follow-up plan, not claimed as passed.

### DB-LIVE-001: Real cascade/FK behavior on Task deletion
- **Prerequisites:** Live Supabase project with the real schema applied.
- **Procedure:** Create a Task with an associated `schedules` row (`task_id` foreign key). Delete the Task. Inspect the `schedules` table.
- **What needs verification:** `supabase/migrations/001_initial_schema.sql`'s own provenance notes state cascade behavior for `schedules.task_id → tasks.id` was **never observed** and defaults to `NO ACTION` per Postgres's default — meaning a Task delete could currently fail outright (FK violation) rather than silently orphaning the schedule, which is the opposite of what DB-AUTO-004 shows the *mock* doing. This is a real, unresolved discrepancy between mock behavior and actual (unconfirmed) database behavior.
- **Status:** **NOT RUN**

### DB-LIVE-002: Postgres integer column overflow
- **Prerequisites:** Live Supabase project.
- **Procedure:** Attempt to create a Task with `estimated_effort_minutes` beyond 2,147,483,647 (Postgres `integer` max).
- **What needs verification:** Whether the live database rejects this with a clean error (surfaced as a `500` via the existing `{error}` handling path) or something less graceful.
- **Status:** **NOT RUN**

### DB-LIVE-003: `tasks.user_id` foreign key integrity
- **Prerequisites:** Live Supabase project.
- **Procedure:** Attempt an insert with a `user_id` that has no corresponding `profiles` row (not reachable through the normal API, since `user_id` always comes from the authenticated JWT — would require direct database access to test).
- **What needs verification:** That the real foreign key (`tasks.user_id references profiles(id)`) is actually present and enforced, since the mock has no FK awareness and application code never attempts this path under normal use.
- **Status:** **NOT RUN**

### DB-LIVE-004: Concurrent update race conditions
- **Prerequisites:** Live Supabase project.
- **Procedure:** Fire two simultaneous `PUT` requests updating different fields on the same Task. Verify both changes persist (no lost update) or document the actual last-write-wins behavior.
- **What needs verification:** The mock is single-threaded and synchronous between awaits, so it cannot demonstrate genuine database-level race conditions the way `canvasImport.test.js`'s concurrent-duplicate-import tests do for a true application-level race (insert-conflict handling) — this would need a real database under concurrent load.
- **Status:** **NOT RUN**

### DB-LIVE-005: Refresh/restart persistence
- **Prerequisites:** Live Supabase project, ability to restart the backend process.
- **Procedure:** Create a Task, restart the backend server, fetch the Task again.
- **What needs verification:** That Task data genuinely persists in Postgres across process restarts, as opposed to the mock's in-memory store, which deliberately does not (and isn't supposed to) survive a restart.
- **Status:** **NOT RUN**

---

## Section G: Canvas-related database relationships

Per the instruction to avoid duplicating the full Canvas synchronization
suite (handled in F04/F05 and SOC2 tasks), this section summarizes
existing coverage rather than adding new tests.

**Existing coverage**: `server/tests/canvasImport.test.js` (44 tests),
`canvasService.test.js` (14 tests), and
`canvasCrossFeatureIntegration.test.js` (4 tests) already cover: new
assignment creation, duplicate prevention (including a genuine concurrent
race), locked-assignment placeholders, composite `(user_id,
canvas_course_id, canvas_assignment_id)` uniqueness (both the
application-level check and a simulated Postgres `23505` unique-violation
response), and cross-feature integration with the Task list, AI
prioritization, and Weekly Summary.

### DB-LIVE-006: Canvas composite identifier — live verification
- **Prerequisites:** Live Supabase project with migration 002 applied.
- **Procedure:** Attempt to insert two Tasks with the same `(user_id, canvas_course_id, canvas_assignment_id)` directly (bypassing the application's own pre-check) to confirm the real partial unique index (`tasks_user_canvas_assignment_unique`) actually rejects the second.
- **What needs verification:** Whether migration 002 has actually been applied to any shared/production Supabase project remains unconfirmed from prior sprints (documented previously in `docs/database-contract.md`) — not re-investigated here, since it's outside this ticket's scope. The mock's simulation of this constraint (in `supabaseMock.js`) is a best-effort approximation, not proof of the live index's real behavior.
- **Status:** **NOT RUN**

---

## Traceability to required scenarios

| Required scenario | Covered by |
|---|---|
| A. Task persistence | Existing: `createTask.test.js`, `taskApiContract.test.js` (full lifecycle) |
| A. Refresh/restart persistence | DB-LIVE-005 |
| B. Task updates (fields, unrelated-field preservation, completion persistence) | Existing: `editTask.test.js`, `tasks.test.js` |
| B. Repeated updates don't corrupt | DB-AUTO-001 |
| C. Deletion (removal, unrelated tasks, nonexistent records) | Existing: `deleteTask.test.js` |
| C. Relationship/cascade behavior | DB-AUTO-004 (mock), DB-LIVE-001 (live, unresolved discrepancy found) |
| D. User ownership and relationships | Existing: `taskAuth.test.js`, `taskApiContract.test.js` |
| D. Foreign-key/uniqueness live verification | DB-LIVE-003, DB-LIVE-004 |
| E. Invalid/missing fields | Existing: `createTask.test.js`, `editTask.test.js` |
| E. Invalid Task identifiers (GET/PUT) | DB-AUTO-002, DB-AUTO-003 |
| E. Boundary values | DB-AUTO-007, DB-LIVE-002 |
| F. `{error}`-shaped database failures | Existing: all three CRUD failure-handling tests |
| F. Genuine connection failures (thrown/rejected) | DB-AUTO-005, DB-AUTO-008, DB-AUTO-009 (**DB-DEFECT-001, fixed**) |
| F. Fix does not alter existing 400/404/success responses | DB-AUTO-010 |
| F. Unrelated data survives a failure | DB-AUTO-006 |
| G. Canvas relationships | Existing: `canvasImport.test.js`, `canvasService.test.js` (summarized, not duplicated) |
| G. Composite identifier live verification | DB-LIVE-006 |
