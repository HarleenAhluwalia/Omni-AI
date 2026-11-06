# CC6.3 — Task API Ownership and Authorization Review

**Jira task:** S02 — Review Task API Ownership Enforcement and Authorization Paths
**Originally created in:** PR Batch 4 — SOC 2 CC6.3 Access Management Security Foundation
**Updated in:** PR Batch 5 — CC6.3 Security Remediation and Authorization Verification (`sprint4/cc63-security-remediation`) — the `/api/schedules` gap below is now FIXED
**Date:** 2026-11-05

## Method

Every route file under `server/routes/` and `server/src/routes/` was
read directly, traced to its controller, and checked for: (1) whether
`requireAuth` (JWT verification middleware, `src/middleware/auth.js`)
is applied, and (2) whether the controller derives "whose data" from
`req.user.id` (trusted, set by `requireAuth` from the verified JWT) or
from a client-supplied value (`req.body.user_id`/`req.query.user_id`,
untrusted).

## Endpoint-by-endpoint findings

| Endpoint | Auth mechanism | Ownership enforcement location | Existing test coverage | Status |
|---|---|---|---|---|
| `GET/POST /api/tasks`, `GET/PUT/DELETE /api/tasks/:id` | `requireAuth` (`router.use`, `taskRoutes.js:26`) | `req.user.id` → `.eq("user_id", ...)` in every `taskController.js` handler | `taskAuth.test.js`, `taskApiContract.test.js`, `securityLogging.taskAccess.test.js` | **OK** |
| `GET /api/tasks/prioritized` | `requireAuth` | `req.user.id` in `getPrioritizedTasks` | `taskWorkflow.test.js` | **OK** |
| `GET /api/tasks/summary/daily`, `/summary/weekly` | `requireAuth` | `req.user.id` in `getDailySummary`/`getWeeklySummary` | `dailySummary.test.js:213`, `weeklySummary.test.js:367` (ownership), `crossComponentSync.test.js` SYNC-AUTO-008 | **OK** |
| `GET /api/tasks/workload` | `requireAuth` | `req.user.id` (via `workloadController.js`) | `workloadApi.test.js` | **OK** |
| `POST /api/tasks/resolve-schedule` | `requireAuth` | `req.user.id` in `resolveSchedule` | existing scheduling tests | **OK** |
| `GET/POST/PUT /api/schedules`, `POST /api/schedules/resolve-conflict` | `requireAuth` (`scheduleRoutes.js`, added PR Batch 5) | `req.user.id`, same pattern as every other route (fixed PR Batch 5) | `server/tests/cc63ScheduleAuthorizationGap.test.js` (CC63-T08–T16) | **FIXED — see below** |
| `GET/POST /api/dummy-canvas/*` | `requireAuth` (`dummyCanvasRoutes.js:18`) | `req.user.id` throughout `dummyCanvasController.js`/`dummyCanvasSyncService.js` | `dummyCanvasApi.test.js`, `dummyCanvasSync.test.js`, `canvasMockIntegration.test.js` (CANVAS4-AUTO-010 ownership) | **OK** |
| `GET /api/canvas/courses`, `POST /api/canvas/import` | `requireAuth` (`canvasRoutes.js:14`) | `req.user.id` in `canvasController.js` | `canvasCrossFeatureIntegration.test.js` | **OK** |
| `POST /api/ai/chat` | `requireAuth` (`aiRoutes.js:9`) | `req.user.id` in `aiController.js` | `ai.test.js`, `uc1Workflow.test.js`, `aiServiceSprint4.test.js` | **OK** |
| `GET/PUT /api/preferences` | `requireAuth` (`preferencesRoutes.js:11`) | `req.user.id` in `src/controllers/preferencesController.js` | existing preferences tests | **OK** |
| `GET/PUT /api/notification-settings` | `requireAuth` (`notificationSettingsRoutes.js:11`) | `req.user.id` in `notificationSettingsController.js` | `notificationSettings.test.js` | **OK** |
| `POST /api/auth/register`, `/login`, `/oauth` | None (intentional — pre-authentication) | N/A | `auth.test.js`, `securityLogging.auth.test.js`, `harleenAuthResponseSecurity.test.js` | **OK (by design)** |
| `GET /api/auth/me` | `requireAuth` (`auth.js:10`) | `req.user.id` | existing auth tests | **OK** |

## FIXED (PR Batch 5): `/api/schedules` (routes/scheduleRoutes.js, controllers/scheduleController.js)

### Original finding (PR Batch 4)

**This was the one place in the entire backend where ownership was not
enforced at all.** Every other data route applied `requireAuth` and
derived ownership from `req.user.id`; `scheduleRoutes.js` did neither:

```js
// routes/scheduleRoutes.js (before) — no requireAuth anywhere in this file
router.get("/", getSchedules);
router.post("/", createSchedule);
router.put("/:id", updateSchedule);
router.post("/resolve-conflict", resolveScheduleConflict);
```

```js
// controllers/scheduleController.js (before) — getSchedules
const { user_id } = req.query;   // client-supplied, never verified
// ... .eq("user_id", user_id) ...
```

The same pattern repeated in `createSchedule` (`req.body.user_id`),
`updateSchedule` (`req.query.user_id`), and `resolveScheduleConflict`
(`req.body.user_id`). This was the exact endpoint `CalendarView.jsx`
calls for every schedule block it displays — the frontend happened to
send the logged-in user's own id, but nothing on the server required
that; any caller could substitute any UUID.

**Practical impact (before the fix):** an unauthenticated request could
read any user's schedule blocks (including joined Task title/
description/due_date/priority/effort/completion_status), create a
schedule attributed to any user, modify any existing schedule, and
invoke conflict resolution on any user's behalf — all without a valid
session.

### Root cause

`scheduleRoutes.js` was never given the `router.use(requireAuth)` every
other route file applies, and `scheduleController.js`'s four handlers
were written to accept `user_id` as an ordinary client-supplied field
rather than deriving it from the verified token — most likely an
oversight from when this route was first written, inconsistent with
the pattern already established in `taskController.js` at the time.

### Fix implemented (PR Batch 5)

```js
// routes/scheduleRoutes.js (after)
router.use(requireAuth);
```

Each of the four handlers now reads `const user_id = req.user.id;`
instead of `req.query.user_id`/`req.body.user_id`. A `user_id` field in
the request body/query is still accepted by Express (not rejected as an
error) but is simply never read or used — matching how `taskController.js`
already treats a client-supplied `user_id` on create/update.

**`updateSchedule`'s existing `.eq("id", id).eq("user_id", user_id")`
filter** means a schedule id belonging to another (now-authenticated)
user resolves to `404 "Schedule not found"` — never a `403`, which
would have confirmed the record exists under someone else's account,
and the response never contains the owner's data. The same reasoning
applies to `resolveScheduleConflict`, which only ever searches within
the authenticated user's own schedule list.

**Frontend impact: none.** `CalendarView.jsx`'s existing `fetch` calls
to `/api/schedules` and `/api/schedules/resolve-conflict` already send
`Authorization: Bearer ${token}` on every request — confirmed by
reading the frontend source before changing anything. No frontend
change was needed or made.

### Before/after security behavior

| Scenario | Before | After |
|---|---|---|
| `GET /api/schedules`, no auth header | `200`, victim's data returned | `401` |
| `POST /api/schedules`, no auth header | `201`, row created for attacker-supplied `user_id` | `401` |
| `POST /api/schedules`, authenticated, body `user_id` set to another user | row attributed to the supplied `user_id` | row attributed to the authenticated caller; supplied value ignored |
| `PUT /api/schedules/:id`, no auth header | `200`, victim's schedule modified | `401` |
| `PUT /api/schedules/:id`, authenticated as a different user than the owner | (previously N/A — no ownership concept existed) | `404`, record unchanged |

### Regression tests (converted from the original vulnerability-demonstration tests)

`server/tests/cc63ScheduleAuthorizationGap.test.js`:
- **CC63-T08/T09/T10** — the original three tests, now asserting the fixed behavior (401/ownership-scoped 404) instead of the original vulnerable behavior. The original finding is preserved in this file's own header comment and in this document, per the instruction to keep evidence of the original failure visible.
- **CC63-T11–T15** (new) — positive-path coverage: a legitimate authenticated user can still list, create, update, and resolve conflicts between their own schedules; a non-owner's `resolve-conflict` attempt against another user's schedule id returns `404`.
- **CC63-T16** (new, S07) — two authenticated users' schedule lists never mix.

**Test-infrastructure note:** `resolveScheduleConflict`'s persistence step calls `.update(...).select().single()`, a pattern the mocked Supabase helper (`tests/helpers/supabaseMock.js`) didn't support before this batch (only `insert` mode was implemented for `.single()`). This endpoint had zero test coverage before PR Batch 5, so the gap was never exercised. Extended the mock (test infrastructure only, no production code) to support `.single()` after `.update()`, matching the existing `.maybeSingle()` behavior but erroring on zero matching rows as real Supabase's `.single()` does.

### `task_id` ownership — investigated and FIXED in the same PR

The post-fix review above flagged a residual question: could
`createSchedule`/`updateSchedule`'s optional `task_id` field be used to
link a schedule to a Task the caller doesn't own? Investigated before
writing any more code, per the instruction to confirm before fixing:

1. **How `task_id` was accepted:** both handlers validated only that
   `task_id` is UUID-*shaped* (`isValidUuid`) — never that it refers to
   a Task the authenticated user actually owns.
2. **Could a schedule reference another user's Task?** Yes, confirmed
   by code reading: nothing stopped it.
3. **Database relationship:** `schedules.task_id references public.tasks(id)`
   (migration `001_initial_schema.sql`) — a plain nullable foreign key,
   no `user_id` consistency constraint at the database level either.
4. **Why this mattered:** `getSchedules` (and `resolveScheduleConflict`'s
   own schedule fetch) use Supabase's embedded-resource select,
   `tasks (id, title, description, due_date, priority, point_value,
   estimated_effort_minutes, completion_status)` — PostgREST follows
   the foreign key and joins that Task's fields into the response
   regardless of who owns it. An unvalidated `task_id` would have let a
   caller read another user's Task details through their own schedule
   list — the exact kind of cross-user exposure CC6.3 exists to
   prevent, and notably one RLS would not help with either (service-role
   bypasses it regardless, per `cc63-supabase-access-audit.md`).

**Fix:** both `createSchedule` and `updateSchedule` now look up
`task_id` scoped to the authenticated user
(`.eq("id", task_id).eq("user_id", user_id)`) before using it. If no
such task exists for this user — whether it doesn't exist at all or
belongs to someone else, deliberately never distinguished — the
request is rejected with `400 "task_id must reference a task you own"`
and nothing is written.

**Regression tests:** `server/tests/cc63ScheduleAuthorizationGap.test.js`
CC63-T17 (create rejects another user's `task_id`), CC63-T18 (update
rejects re-pointing at another user's `task_id`, record unchanged),
CC63-T19 (a `task_id` the caller actually owns still works).

**Limitation, honestly stated:** the mocked Supabase test helper
(`tests/helpers/supabaseMock.js`) does not implement PostgREST's
embedded-resource join syntax at all (`select()` ignores its argument
entirely — confirmed by reading it). This means the *full* leak —
actually seeing another user's Task fields appear in a
`GET /api/schedules` response — cannot be reproduced end-to-end against
the mock. What is confirmed and fixed is the underlying data-model gap
that made the join dangerous: a schedule can no longer be linked to a
`task_id` the caller doesn't own, at all, which closes the leak at its
source regardless of how the join itself behaves live.
**Recommended follow-up:** once a dedicated live Supabase test
environment is available (see S08 in `cc63-supabase-access-audit.md`),
confirm directly that `GET /api/schedules`'s embedded Task fields never
include another user's data — this fix should make that structurally
impossible, but it has not been observed live.

## Summary

Every Task, Canvas, AI, preferences, and notification-settings endpoint
correctly derives ownership from the authenticated JWT identity.
`/api/schedules` — the one confirmed exception — now does too, fixed in
PR Batch 5 with the smallest change that closes the gap: requiring
authentication and deriving identity from `req.user.id`, exactly the
pattern already used everywhere else in this codebase.
