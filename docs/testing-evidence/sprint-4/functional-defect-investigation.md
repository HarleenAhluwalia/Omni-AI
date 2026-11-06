# Cross-Component Synchronization Defect Investigation

**Jira tasks:** F10 — Investigate Cross-Component Synchronization Defects; F11 — Fix and Retest Calendar, To-Do, and Data Integrity Defects
**PR batch:** PR Batch 3 — Cross-Component Synchronization Defect Resolution
**Branch:** `sprint4/functional-defect-resolution`
**Date:** 2026-11-05

## Context

The prior repository audit flagged a suspected regression: Alan's
`has_due_time` feature (optional Task start/due times) correctly updated
`PrioritizedTodo.jsx` to branch between UTC-day and local-time formatting,
but `CalendarView.jsx` was never updated to make the same distinction —
not yet confirmed by a failing test at the time. This investigation
traces the full data flow (Frontend → API → Backend → Database →
Calendar/To-Do/Summary) to confirm, reproduce, and fix any genuine
defects in that flow, and to rule out anything that turns out not to be
one.

## Intended semantics (established before changing anything)

| Field | Semantics | Correct getters |
|---|---|---|
| `due_date` when `has_due_time` is false/absent | Date-only deadline, always written end-of-day UTC by the backend (`AddTask.jsx`: `` `${dueDate}T23:59:59` `` when `allDay`) | **UTC** — the UTC calendar day *is* the intended due date |
| `due_date` when `has_due_time` is true | A genuine timestamp the user picked for a specific time (`AddTask.jsx`: `` `${dueDate}T${dueTime}:00` ``, then `.toISOString()`) | **Local** — the same semantics as a schedule's `start_time` |
| `schedule.start_time`/`end_time` | Always a genuine timestamp (`aiController.js`'s schedule-row creation, `resolveSchedule`) | **Local** (unchanged, not part of this investigation) |

This mirrors exactly what CAL-DEFECT-001/TODO-DEFECT-001 already
established for the date-only case, extended to cover the new
`has_due_time` case the same way a schedule's timestamp already works.

---

## CAL-DEFECT-002 — CONFIRMED, FIXED

**Component:** `client/src/pages/CalendarView.jsx` (`getTasksForDay`)
**Severity:** Same class as CAL-DEFECT-001 — a Task can be placed on the wrong Calendar day for any viewer whose timezone offset straddles a day boundary relative to a specific due time.

### Reproduction
1. Added `CAL-AUTO-011` to `client/tests/calendarLogic.test.mjs`, mirroring `getTasksForDay`'s *current* logic.
2. Built a Task with `has_due_time: true` and a `due_date` at a UTC-boundary-straddling instant (the same deterministic boundary-probe construction CAL-AUTO-008/009 use, guarded by `test.skip` at UTC+0, where local and UTC days always agree).
3. Ran the test against the unmodified `getTasksForDay` mirror.

**Result before fix:** FAIL. `getTasksForDay` found the Task on its UTC day (not its local day) and also failed the "must not appear on the UTC day" assertion — confirming it ignored `has_due_time` entirely.

### Root cause
`getTasksForDay` always used UTC getters (`taskDate.getUTCFullYear()`, etc.) regardless of `task.has_due_time`, treating every Task as a date-only deadline. This was correct before `has_due_time` existed, and was never updated when that field was added — `isToday` was also audited but needs no change, since it answers "is this grid cell today" for the grid itself, which stays UTC-day-based by design for date-only Tasks; it takes no per-Task input and isn't part of this defect.

### Fix
`getTasksForDay` (in both `CalendarView.jsx` and its test mirror) now branches: if `task.has_due_time` is true, compare using **local** getters (`getFullYear`/`getMonth`/`getDate`), matching `getSchedulesForDay`'s existing pattern; otherwise (false or absent — including every Task created before this field existed), behavior is unchanged (UTC getters).

### Regression test
`CAL-AUTO-011` (`client/tests/calendarLogic.test.mjs`) — asserts a `has_due_time` Task is found on its local day and NOT on its UTC day. **PASS** after the fix.

### Files changed
- `client/src/pages/CalendarView.jsx` — `getTasksForDay`, plus an updated comment above `isToday`
- `client/tests/calendarLogic.test.mjs` — mirror update + `CAL-AUTO-011`
- `docs/testing-evidence/sprint-4/calendar-functional-test-cases.md` — updated with CAL-AUTO-011

---

## Related gap found, NOT fixed in this batch: Daily/Weekly Summary also ignores `has_due_time`

**Component:** `server/controllers/taskController.js` (`toUtcDateOnly`, used by both `getDailySummary` and `getWeeklySummary`)

### Investigation
Per this task's explicit instruction to check "whether Daily/Weekly Summary classification intentionally uses different date semantics" — it does not. `toUtcDateOnly` converts every Task's `due_date` to a UTC-only calendar day for classification against "today"/the current week, with no branch on `has_due_time`, exactly the same gap `getTasksForDay` had.

### Why this is confirmed but NOT fixed here
Calendar and To-Do's "local" semantics come from the **viewer's own browser** evaluating `Date` getters client-side — the browser inherently knows its own timezone. The backend has no equivalent: the current API contract never sends the client's timezone/offset to the server, so `getDailySummary`/`getWeeklySummary` have no way to know what "local" means for a given request. Correctly fixing this would require extending the Task API contract (e.g., accepting a timezone offset per request) — a cross-cutting change to the client-server contract, not a "smallest safe production change" within a single controller function, and explicitly out of scope per this batch's rules ("do not expand into unrelated feature work," "do not rewrite ... Summary components unnecessarily").

**Recommendation:** a separate, scoped follow-up ticket (parallel to how DB-DEFECT-001 and CAL-DEFECT-001 were each handled as their own ticket) to design the client→server timezone-context contract change before touching Summary's classification logic. Documented here, not fabricated as fixed, and not silently left undocumented.

---

## Suspected issues investigated and ruled out

| Area checked | Finding |
|---|---|
| `isToday` (CalendarView.jsx) | No change needed — answers "is this grid cell today," not Task-specific, stays UTC-day-based by design for the date-only grid convention. |
| `PrioritizedTodo.jsx` (`formatTaskDue`/`formatTaskDateTime`) | Already correctly branches on `has_due_time` (verified by reading the code and confirmed via new regression test `TODO-AUTO-014`, since no prior test exercised this). No fix needed. |
| 10-Task pagination (`PrioritizedTodo.jsx`) | Not touched by any change in this batch; unaffected by the date-handling fix. |
| Canvas synchronization ownership/duplicate-prevention | Not touched; Dummy Canvas-imported Tasks never set `has_due_time` (always date-only assignment deadlines), so this defect class doesn't apply to them. |
| `goToToday` / month navigation | Uses `today.getUTCFullYear()`/`getUTCMonth()` for the initial/"today" month, consistent with the existing UTC-grid convention established by CAL-DEFECT-001's fix — not a new issue, not in scope here (would be a reconsideration of CAL-DEFECT-001's own design, not a regression from `has_due_time`). |
| Database schema/migrations | No change required or made — `has_due_time` already exists as a column; this was purely an application-logic gap. |
| Authentication / SOC 2 controls | Not touched, per this batch's explicit scope boundary. |

---

## Test execution

```
cd client && npm run test:calendar
  13 passed (was 12; CAL-AUTO-011 added)

cd client && npm run test:todo
  14 passed (was 13; TODO-AUTO-014 added)
```

Full verification (backend suite, remaining frontend scripts, build) is
recorded in the PR Batch 3 final report.

## Manual / live verification NOT performed

No live browser session was used to visually confirm Calendar's fixed
Task placement, and no live database was used for any part of this
investigation — both are explicitly out of scope for this batch's
automated-only verification and are not claimed as done.
