# Sprint 4 — Functional Test Execution Results

**Jira tasks:** F06 — Document Formal Test Results and Defects; F07 — Execute Calendar and To-Do List Functional Tests; F08 — Execute Summary and Database Integrity Tests; F09 — Execute Exception and Error Handling Tests
**PR batch:** PR Batch 6 — Functional Validation and Final Testing Evidence
**Branch:** `sprint4/final-functional-validation`
**Base commit:** `bb74aae` (main — PR1 `#85`, PR2 `#96`, PR3 `#97`, PR4, and PR5 all confirmed merged ancestors via `git merge-base --is-ancestor`, not asserted from memory)
**Environment:** Local development session; backend tests against mocked Supabase (`tests/helpers/supabaseMock.js`); frontend tests via `node --test` and Vitest/jsdom. No live database, no live CI, no browser automation tool was available this session.
**Execution date:** 2026-11-05

This document records what was actually executed this session and its
actual result. No test below is marked PASS without having been run in
this session; existing coverage reused from earlier PRs is marked as
such and cites the PR where it was first verified.

---

## Execution summary (this session)

| Command | Result |
|---|---|
| `cd server && npx jest --silent` | **42 suites / 624 tests passed, 0 failed** |
| `cd client && npm run test:calendar` | **13 passed** |
| `cd client && npm run test:todo` | **14 passed** |
| `cd client && npm run test:prioritized` | **4 passed** |
| `cd client && npm run test:harleen` | **17 passed** |
| `cd client && npm run test:sprint4-ui-contract` | **13 passed** |
| `cd client && npm run test:sprint4-crud` | **8 passed** |
| `cd client && npm run build` | **Success, no errors** |

**Total automated tests executed this session: 693 (624 backend + 69 frontend), 0 failures.**

---

## F07 — Calendar and To-Do List functional execution

| Test ID(s) | Area | Command | Expected | Actual | Status |
|---|---|---|---|---|---|
| CAL-AUTO-001–007b | Task creation/editing/deletion/completion display, empty states, grid generation | `npm run test:calendar` | All pass | All pass | **PASS** |
| CAL-AUTO-008/009 | UTC "today"/day-placement convention (CAL-DEFECT-001 regression guard) | same | Pass (skipped at UTC+0) | Pass | **PASS** |
| CAL-AUTO-010 | Schedule blocks stay on their LOCAL day | same | Pass | Pass | **PASS** |
| CAL-AUTO-011 | `has_due_time` Tasks placed on their LOCAL day (CAL-DEFECT-002 regression guard) | same | Pass | Pass | **PASS** |
| TODO-AUTO-001–011 | Field formatting, completion toggling, pagination (10/page), empty list, missing fields | `npm run test:todo` | All pass | All pass | **PASS** |
| TODO-AUTO-012 | UTC due-date formatting (TODO-DEFECT-001 regression guard) | same | Pass | Pass | **PASS** |
| TODO-AUTO-013 | Duplicate id lookup safety | same | Pass | Pass | **PASS** |
| TODO-AUTO-014 | `has_due_time` formatting branch | same | Pass | Pass | **PASS** |
| `prioritizedTodo.test.mjs` (4 tests) | Dashboard pagination (5/page, distinct orphaned utility) | `npm run test:prioritized` | All pass | All pass | **PASS** |
| `sprint4TaskFormContract.test.mjs`/`sprint4AuthUiContract.test.mjs` (13 tests) | Task form and auth UI source contracts | `npm run test:sprint4-ui-contract` | All pass | All pass | **PASS** |
| `sprint4TaskCrud.interactive.test.jsx` (8 tests) | Rendered Task form/list CRUD (create, edit, validation errors, delete, complete, failed-delete recovery) | `npm run test:sprint4-crud` | All pass | All pass | **PASS** |

**Manual cases:** CAL-MAN-001–011, TODO-MAN-001–012 (visual Calendar/To-Do confirmation in a live browser) — **NOT RUN**. No browser automation tool was available in this session; these remain reproducible manual procedures documented in `calendar-functional-test-cases.md`/`todo-functional-test-cases.md`. No browser success is inferred from the unit/rendered-component results above.

**Data refresh consistency:** covered at the API level only, by `crossComponentSync.test.js` SYNC-AUTO-007 (a failed update leaves every downstream view unchanged — no false partial sync). True frontend caching/staleness behavior (does the UI itself show stale data after a failed request) requires a live browser and is **NOT RUN**.

---

## F08 — Summary and database integrity execution

| Test ID(s) | Area | Command | Expected | Actual | Status |
|---|---|---|---|---|---|
| `dailySummary.test.js` (12 tests) | Due-today/overdue/upcoming classification, completed-task exclusion, ownership, DB failure | `npx jest --silent` | All pass | All pass | **PASS** |
| `weeklySummary.test.js` (13 tests) | Week inclusion/exclusion, completion counts, overdue, effort/point totals, ownership, DB failure | same | All pass | All pass | **PASS** |
| DB-AUTO-001–010 | Repeated updates, invalid identifiers, deletion/orphaning, boundary values, DB-DEFECT-001 regression (3 handlers), unaffected-response regression | `databaseIntegrity.test.js` | All pass | All pass | **PASS** |
| SYNC-AUTO-001–008 | Cross-component create/edit/complete/delete/boundary/Canvas-sync/failure/isolation | `crossComponentSync.test.js` | All pass | All pass | **PASS** |
| CANVAS4-AUTO-001–010 | Canvas import/sync/duplicate/cross-course/locked/invalid/DB-failure/downstream-availability/ownership | `canvasMockIntegration.test.js` | All pass | All pass | **PASS** |

### Summary `has_due_time` classification gap (from PR3's investigation)

**Status: confirmed still unresolved this session.** Re-checked
`controllers/taskController.js`'s `getDailySummary`/`getWeeklySummary` —
neither references `has_due_time` anywhere; only field *validation*
does. The classification logic (`toUtcDateOnly`) still treats every
Task as a UTC-anchored, date-only deadline regardless of `has_due_time`.

- **Remains unresolved:** yes, confirmed by code reading this session, not assumed from the prior document.
- **Existing test coverage:** none. No test in `dailySummary.test.js`/`weeklySummary.test.js`/`crossComponentSync.test.js` exercises a `has_due_time: true` Task's Summary classification.
- **Needs a separate Jira Bug:** yes — this was already `functional-defect-investigation.md`'s own recommendation (PR Batch 3) and remains accurate; fixing it requires a client→server timezone-context contract change, explicitly out of scope for this documentation-focused batch (rule 8 of this batch, and PR3's own scope boundary).
- **Does it affect Summary accuracy claims:** yes, for the specific case of a Task with a genuine due *time* (not an all-day deadline) near a day/week boundary relative to the viewer's timezone — Daily/Weekly Summary may classify it as due on the wrong day, while Calendar and To-Do (fixed in CAL-DEFECT-002/already-correct) would not. This inconsistency is accurately described, not newly discovered, in `functional-defect-investigation.md`.

### Unverified database constraints (documented, not tested this session)

Per `database-integrity-test-cases.md`'s own `DB-LIVE-*` plan, still **NOT RUN** (no live database access this session):
- **Foreign keys:** `schedules.task_id → tasks.id` real cascade/`NO ACTION` behavior on delete (DB-LIVE-001).
- **Cascade behavior:** same as above — the mock orphans the row; real Postgres behavior is unconfirmed.
- **Integer boundaries:** `estimated_effort_minutes` beyond Postgres `integer` max (DB-LIVE-002).
- **Concurrent updates:** two simultaneous `PUT` requests on the same Task — the mock is single-threaded and cannot demonstrate a genuine race (DB-LIVE-004).
- **Restart persistence:** the mock's in-memory store doesn't survive a restart by design; real Postgres persistence is unconfirmed by this session (DB-LIVE-005).
- **Canvas composite identifiers:** the real `tasks_user_canvas_assignment_unique` partial index's live enforcement (DB-LIVE-006).

None of these are marked PASS. They are listed here, as in the original F03 documentation, as a standing, unexecuted live-verification plan.

---

## F09 — Exception and error-handling execution

| Scenario | Test file(s) | Status |
|---|---|---|
| Invalid Task inputs (missing/blank title, invalid priority/status/due_date, non-numeric point values) | `createTask.test.js`, `editTask.test.js` | **PASS** (existing, reused) |
| Malformed Task identifiers | `taskApiContract.test.js`, `databaseIntegrity.test.js` DB-AUTO-002/003 | **PASS** (existing, reused) |
| Database failures on create/update/delete/list/read-one | `databaseIntegrity.test.js` DB-AUTO-005/008/009/010 | **PASS** (existing, reused — DB-DEFECT-001 regression) |
| Failed Canvas synchronization (locked, invalid reference, DB failure, partial sync) | `canvasMockIntegration.test.js` CANVAS4-AUTO-006/007/008/008b | **PASS** (existing, reused) |
| Failed cross-component sync (no false partial success) | `crossComponentSync.test.js` SYNC-AUTO-007 | **PASS** (existing, reused) |
| Unauthorized API requests (Task, Canvas, Schedules) | `taskAuth.test.js`, `securityLogging.taskAccess.test.js`, `cc63ScheduleAuthorizationGap.test.js` | **PASS** (existing + PR5 regression) |
| Summary database failure | `dailySummary.test.js`, `weeklySummary.test.js` (DB-failure cases) | **PASS** (existing, reused) |
| Missing/stale frontend data | API-level only (SYNC-AUTO-007); true UI staleness | **NOT RUN** (requires a live browser) |

**No meaningful gap was found that would block F09's acceptance criteria.** No new tests were added this batch — every scenario above already has reproducible, passing coverage from PR1–PR5, reused rather than duplicated.

---

## Defect inventory

| Defect | Status | Supporting evidence |
|---|---|---|
| CAL-DEFECT-001 (Calendar UTC/local day mismatch) | **FIXED** | Commit `30a6c19` (PR1); regression: CAL-AUTO-008/009 |
| TODO-DEFECT-001 (To-Do due-date UTC/local mismatch) | **FIXED** | Commit `81e72ce` (PR1); regression: TODO-AUTO-012 |
| DB-DEFECT-001 (unhandled Supabase rejections in Task controllers) | **FIXED** | Commit `663e57d` (PR1); regression: DB-AUTO-005/008/009/010 |
| CAL-DEFECT-002 (Calendar ignored `has_due_time`) | **FIXED** | PR3 (`#97`); regression: CAL-AUTO-011 |
| Schedules API authentication/ownership gap | **FIXED** | PR4 (found) → PR5 (fixed); regression: CC63-T08–T19 |
| Schedules `task_id` cross-user ownership gap | **FIXED** | Found and fixed in PR5; regression: CC63-T17–T19 |
| Summary `has_due_time` classification gap | **OPEN / DEFERRED** | Found in PR3's `functional-defect-investigation.md`; confirmed still unresolved this session; no existing test; recommended as a separate Jira Bug, not fixed here per this batch's scope |
| Newly discovered this session | **None** | Full suite (693 tests) passed cleanly; no new defect surfaced during this execution pass |

No Jira issue keys are invented for any defect above; where a key is
not known to this session, none is cited.
