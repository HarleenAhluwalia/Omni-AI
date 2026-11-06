# CC6.3 — Task API Ownership and Authorization Review

**Jira task:** S02 — Review Task API Ownership Enforcement and Authorization Paths
**PR batch:** PR Batch 4 — SOC 2 CC6.3 Access Management Security Foundation
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
| `GET/POST/PUT /api/schedules`, `POST /api/schedules/resolve-conflict` | **NONE** — `scheduleRoutes.js` applies no middleware | **`req.query.user_id` (GET/PUT) or `req.body.user_id` (POST/resolve-conflict)** — fully client-supplied, never checked against any authenticated identity | **None** (no existing test exercises this route file with or without auth) | **CONFIRMED GAP — see below** |
| `GET/POST /api/dummy-canvas/*` | `requireAuth` (`dummyCanvasRoutes.js:18`) | `req.user.id` throughout `dummyCanvasController.js`/`dummyCanvasSyncService.js` | `dummyCanvasApi.test.js`, `dummyCanvasSync.test.js`, `canvasMockIntegration.test.js` (CANVAS4-AUTO-010 ownership) | **OK** |
| `GET /api/canvas/courses`, `POST /api/canvas/import` | `requireAuth` (`canvasRoutes.js:14`) | `req.user.id` in `canvasController.js` | `canvasCrossFeatureIntegration.test.js` | **OK** |
| `POST /api/ai/chat` | `requireAuth` (`aiRoutes.js:9`) | `req.user.id` in `aiController.js` | `ai.test.js`, `uc1Workflow.test.js`, `aiServiceSprint4.test.js` | **OK** |
| `GET/PUT /api/preferences` | `requireAuth` (`preferencesRoutes.js:11`) | `req.user.id` in `src/controllers/preferencesController.js` | existing preferences tests | **OK** |
| `GET/PUT /api/notification-settings` | `requireAuth` (`notificationSettingsRoutes.js:11`) | `req.user.id` in `notificationSettingsController.js` | `notificationSettings.test.js` | **OK** |
| `POST /api/auth/register`, `/login`, `/oauth` | None (intentional — pre-authentication) | N/A | `auth.test.js`, `securityLogging.auth.test.js`, `harleenAuthResponseSecurity.test.js` | **OK (by design)** |
| `GET /api/auth/me` | `requireAuth` (`auth.js:10`) | `req.user.id` | existing auth tests | **OK** |

## CONFIRMED GAP: `/api/schedules` (routes/scheduleRoutes.js, controllers/scheduleController.js)

**This is the one place in the entire backend where ownership is not
enforced at all.** Every other data route in this table applies
`requireAuth` and derives ownership from `req.user.id`; `scheduleRoutes.js`
does neither:

```js
// routes/scheduleRoutes.js — no requireAuth anywhere in this file
router.get("/", getSchedules);
router.post("/", createSchedule);
router.put("/:id", updateSchedule);
router.post("/resolve-conflict", resolveScheduleConflict);
```

```js
// controllers/scheduleController.js — getSchedules
const { user_id } = req.query;   // client-supplied, never verified
// ... .eq("user_id", user_id) ...
```

The same pattern repeats in `createSchedule` (`req.body.user_id`),
`updateSchedule` (`req.query.user_id`), and `resolveScheduleConflict`
(`req.body.user_id`). This is the exact endpoint `CalendarView.jsx`
calls for every schedule block it displays
(`fetch(`${VITE_API_URL}/schedules?user_id=${user.id}`)`) — the
frontend happens to send the logged-in user's own id, but **nothing on
the server requires that**; any caller can substitute any UUID.

**Practical impact:** an unauthenticated request can read any user's
schedule blocks (including joined Task title/description/due_date/
priority/effort/completion_status), create a schedule attributed to
any user, modify any existing schedule, and invoke conflict resolution
on any user's behalf — all without a valid session.

**Reproduced with automated tests:** `server/tests/cc63ScheduleAuthorizationGap.test.js` (CC63-T08/T09/T10), all currently passing against the *current, insecure* behavior — i.e., the tests prove the gap is real, not that anything is protected.

### Recommended remediation (not implemented in this batch)

1. Apply `router.use(requireAuth)` to `scheduleRoutes.js`, matching every other route file.
2. Change `getSchedules`/`createSchedule`/`updateSchedule`/`resolveScheduleConflict` to derive `user_id` from `req.user.id`, not from `req.query`/`req.body` — the same change `taskController.js` already uses throughout.
3. Add regression tests asserting `401` for each of the three CC63-T08/T09/T10 scenarios once fixed, and that a valid user cannot act on another user's `schedule_id` even when authenticated (an ownership check analogous to `taskController.js`'s `.eq("user_id", user_id)` on update/delete).

This is a **confirmed defect**, not a hypothetical — per rule 7
("do not modify production authentication or authorization code without
first confirming a defect"), the defect is now confirmed and documented;
per this batch's scope (S01–S04 are test-plan/audit/evidence work), the
fix itself is deliberately **not implemented here** and is recommended
as an urgent, separately-scoped follow-up (parallel to how
DB-DEFECT-001 and CAL-DEFECT-002 were each handled as their own ticket
after being found during a different ticket's investigation).

## Summary

Every Task, Canvas, AI, preferences, and notification-settings endpoint
correctly derives ownership from the authenticated JWT identity, with
existing test coverage. The one exception — `/api/schedules` — has no
authentication or ownership enforcement whatsoever, confirmed by direct
code inspection and reproduced with new automated tests.
