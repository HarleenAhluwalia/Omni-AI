# CC6.3 Access Management — Formal Security Test Plan

**Jira task:** S01 — Develop Formal CC6.3 Access Management Security Test Cases
**Originally created in:** PR Batch 4 — SOC 2 CC6.3 Access Management Security Foundation
**Updated in:** PR Batch 5 — CC6.3 Security Remediation and Authorization Verification (`sprint4/cc63-security-remediation`), after the Schedules API fix
**Control:** SOC 2 Trust Services Criterion CC6.3 — Access Management
**Objective:** Authenticated students can access and modify only their own Task records and related academic information.
**Date:** 2026-11-05 (PR Batch 4); updated same date (PR Batch 5)

## Scope and approach

This plan maps the eight acceptance criteria (AC-01–AC-08) to concrete,
reproducible test cases. Most of the required coverage already exists
in prior Sprint 3/4 work (`taskAuth.test.js`,
`securityLogging.taskAccess.test.js`, `canvasMockIntegration.test.js`,
`crossComponentSync.test.js`) — this plan **reuses and cites that
coverage rather than duplicating it** (per rule 12), and adds new test
IDs only where the review (see `cc63-authorization-review.md`) found a
genuine gap.

Every test here runs against the mocked Supabase client
(`tests/helpers/supabaseMock.js`). **No test in this plan proves live
Supabase/RLS behavior** — that distinction is maintained explicitly
throughout, per rule 11.

---

## Test cases

### CC63-T01: Cross-user Task retrieval is denied
- **Objective:** A user cannot read another user's Task via `GET /api/tasks/:id` or see it in `GET /api/tasks`.
- **Prerequisites:** Two authenticated users (User A, User B), mocked Supabase.
- **Test accounts/fixtures:** `USER_A`/`USER_B` in `taskAuth.test.js`.
- **Procedure:** User A creates a Task. User B requests it by id and via the list endpoint.
- **Expected Result:** `404`/absence from the list for User B; no cross-user data in the response body.
- **Actual Result:** Matches expected — existing test "User A cannot read User B's task" (`tests/taskAuth.test.js:122`).
- **Status:** **PASS** (existing coverage, reused)
- **AC mapping:** AC-01, AC-05
- **Evidence:** `server/tests/taskAuth.test.js`

### CC63-T02: Unauthorized Task updates/deletions are denied without modifying records
- **Objective:** A non-owner's update/delete attempt fails and leaves the record unchanged.
- **Procedure:** User A creates a Task. User B attempts `PUT`/`DELETE` on it. Re-fetch as User A.
- **Expected Result:** `404` for User B; the Task is byte-for-byte unchanged when re-fetched by User A.
- **Actual Result:** Matches expected — `tests/taskAuth.test.js:141` ("User A cannot update..."), `:162` ("...cannot delete..."); `tests/securityLogging.taskAccess.test.js:109` explicitly re-fetches and asserts the record is unchanged after three unauthorized attempts.
- **Status:** **PASS** (existing coverage, reused)
- **AC mapping:** AC-02

### CC63-T03: Client-supplied `user_id` cannot override authenticated ownership
- **Objective:** A request body's `user_id` is ignored in favor of the authenticated identity.
- **Procedure:** Authenticated User A sends `POST /api/tasks` and `PUT /api/tasks/:id` with a `user_id` field set to User B's id.
- **Expected Result:** The Task is created/remains owned by User A, never User B.
- **Actual Result:** Matches expected — `tests/taskAuth.test.js:183` ("Cannot create a task for another user"), `:192` ("Cannot change task ownership").
- **Status:** **PASS** (existing coverage, reused)
- **AC mapping:** AC-03

### CC63-T04: Cross-account Canvas imports and updates maintain correct ownership
- **Objective:** Two users importing the same Canvas assignment get independent Task rows; one user cannot sync another's imported Task.
- **Procedure:** User A and User B each import assignment 101. User B completes their copy. A third, unrelated user attempts to sync the same assignment.
- **Expected Result:** Independent task ids; User A's row unaffected by User B's completion; the third user's sync returns 404 (nothing of their own to update).
- **Actual Result:** Matches expected — `server/tests/canvasMockIntegration.test.js` CANVAS4-AUTO-010.
- **Status:** **PASS** (existing coverage, reused)
- **AC mapping:** AC-04

### CC63-T05: Calendar, To-Do, and Summary data isolation
- **Objective:** One user's Task lifecycle (create/complete/delete) never changes another user's list, prioritized view, or Summary counts.
- **Procedure:** User B has a baseline Task. User A creates, completes, and deletes their own Task. Re-check User B's `GET /api/tasks`, `GET /api/tasks/prioritized`, and `GET /api/tasks/summary/weekly`.
- **Expected Result:** User B's list and weekly summary are byte-for-byte unchanged; their prioritized view contains only their own Task.
- **Actual Result:** Matches expected — `server/tests/crossComponentSync.test.js` SYNC-AUTO-008; ownership also unit-tested per-endpoint in `dailySummary.test.js:213` and `weeklySummary.test.js:367`.
- **Status:** **PASS** (existing coverage, reused)
- **AC mapping:** AC-05
- **Confirmed gap found during this review (NOT covered by the above):** `GET /api/schedules`, the endpoint `CalendarView.jsx` actually calls for schedule blocks, has no isolation guarantee at all — see CC63-T08 below.

### CC63-T06: Supabase database authorization and RLS
- **Objective:** Determine what actually enforces access control at the database layer.
- **Procedure:** Repository audit of `config/supabase.js`, every controller's Supabase client import, and all four `supabase/migrations/*.sql` files.
- **Expected Result:** Either RLS policies enforce isolation, or the backend's own application-layer filtering does, with the distinction clearly identified.
- **Actual Result:** **Confirmed (repository evidence, not live access):** `config/supabase.js` is constructed with `SUPABASE_SERVICE_ROLE_KEY`, and every controller/service that touches the `tasks`/`schedules`/`preferences`/`notification_settings` tables imports that same client — Supabase's service-role key bypasses RLS by design, so RLS (whatever it is on the live project) is not this application's actual security boundary; the boundary is each controller's own `.eq("user_id", ...)` filtering. No `CREATE POLICY`/`ENABLE ROW LEVEL SECURITY` statement exists anywhere in the repository's migrations. Whether the *live* Supabase project has any RLS policies configured outside of SQL (e.g., via the dashboard) is **unverifiable from this repository** per `001_initial_schema.sql`'s own provenance notes.
- **Status:** **PASS** (repository-level finding, confirmed) for "service-role bypasses RLS"; **BLOCKED** for "what live RLS policies, if any, actually exist."
- **AC mapping:** AC-06
- **Evidence:** `docs/security/sprint-4/cc63-supabase-access-audit.md` (full writeup)

### CC63-T07: Authorization regression checks run through CI
- **Objective:** The ownership tests above actually execute in GitHub Actions, not just locally.
- **Procedure:** Inspect `.github/workflows/ci.yml` and `harleen-sprint4-regression.yml`.
- **Expected Result:** A job runs the full backend Jest suite (which includes `taskAuth.test.js`, `securityLogging.taskAccess.test.js`, and this batch's new `cc63ScheduleAuthorizationGap.test.js`) on every push/PR to `main`.
- **Actual Result:** Confirmed by reading the workflow file — `ci.yml`'s `backend-tests` job runs `npm test` (the full suite) on every push/PR to `main`; `harleen-sprint4-regression.yml` additionally runs `taskAuth.test.js`/`tasks.test.js`/`taskWorkflow.test.js` explicitly. **Not verified by an actual GitHub Actions run this session** — no PR has been opened for this branch yet.
- **Status:** **PASS** (configuration reviewed) — **NOT RUN** (no live CI execution observed)
- **AC mapping:** AC-07

### CC63-T08: `GET /api/schedules` requires authentication — FIXED (PR Batch 5)
- **Objective:** Confirm whether the Calendar's schedule-fetching endpoint enforces any identity check.
- **Original finding (PR Batch 4):** `GET /api/schedules?user_id=<victim>` with no `Authorization` header returned `200` with the victim's full schedule data (including joined Task title/description/due_date/priority/effort/completion_status).
- **Root cause:** `routes/scheduleRoutes.js` applied no authentication middleware; `scheduleController.js` read `user_id` from `req.query` instead of the verified token.
- **Fix:** `router.use(requireAuth)` added to `scheduleRoutes.js`; `getSchedules` now derives `user_id` from `req.user.id`, ignoring any query parameter entirely.
- **Retest procedure:** Same request, no `Authorization` header.
- **Actual Result (after fix):** `401`, response body does not contain the victim's user id or any schedule data.
- **Status:** **PASS** (regression-tested — see `server/tests/cc63ScheduleAuthorizationGap.test.js`)
- **AC mapping:** AC-01, AC-05

### CC63-T09: `POST /api/schedules` cannot be attributed to another user via client-supplied `user_id` — FIXED (PR Batch 5)
- **Original finding:** `POST /api/schedules` with a `user_id` field and no `Authorization` header returned `201`, persisting a row under the attacker-supplied `user_id`.
- **Root cause:** Same pattern — `createSchedule` read `user_id` from `req.body`.
- **Fix:** `user_id` now comes exclusively from `req.user.id`; a `user_id` in the request body is accepted but silently ignored (never used).
- **Retest procedure:** Unauthenticated request → expect `401`. Authenticated request with a `user_id` field set to a different user → expect the row to be attributed to the authenticated caller, not the supplied value.
- **Actual Result (after fix):** Both confirmed — `401` unauthenticated; the authenticated request's stored row's `user_id` always matches the caller, never the supplied override.
- **Status:** **PASS**
- **AC mapping:** AC-02, AC-03

### CC63-T10: `PUT /api/schedules/:id` cannot modify another user's schedule — FIXED (PR Batch 5)
- **Original finding:** `PUT /api/schedules/:id?user_id=<victim>` with no `Authorization` header returned `200`, modifying the victim's schedule.
- **Root cause:** Same pattern — `updateSchedule` read `user_id` from `req.query`.
- **Fix:** `user_id` now comes from `req.user.id`; the existing `.eq("id", id).eq("user_id", user_id)` filter means a schedule id belonging to another user now resolves to `404` ("Schedule not found") — never a `403` that would confirm the record exists under someone else's account, and the response never contains the owner's data.
- **Retest procedure:** Unauthenticated request → expect `401`. Authenticated as a *different* user than the schedule's owner → expect `404`, record unchanged.
- **Actual Result (after fix):** Both confirmed; the record's `user_id` and fields are verified unchanged in the store after the rejected attempt.
- **Status:** **PASS**
- **AC mapping:** AC-02

### CC63-T11–T15 (new, PR Batch 5): legitimate authenticated schedule management still works
- **Objective:** Confirm the fix didn't break legitimate workflows.
- **Procedure:** As the authenticated owner: list (T11), create (T12), update (T13), and resolve a conflict between two of their own schedules (T14). As a non-owner: attempt `resolve-conflict` referencing another user's schedule id (T15, expect `404`).
- **Actual Result:** All pass.
- **Status:** **PASS**
- **AC mapping:** AC-01, AC-02, AC-03

### CC63-T16 (new, PR Batch 5, S07): cross-user schedule list isolation
- **Objective:** Confirm two authenticated users' schedule lists never mix — the isolation Calendar/To-Do actually depend on.
- **Procedure:** Seed one schedule per user. Each requests `GET /api/schedules` with their own token.
- **Actual Result:** Each user's list contains only their own row.
- **Status:** **PASS**
- **AC mapping:** AC-05

### CC63-T17–T19 (new, this update): schedule `task_id` must be owned by the authenticated user
- **Objective:** Confirm a schedule can no longer be linked to a Task the caller doesn't own (found during the task_id ownership investigation requested as a final review step on this batch).
- **Procedure:** T17 — `POST /api/schedules` with `task_id` set to another user's Task. T18 — `PUT /api/schedules/:id` re-pointing `task_id` at another user's Task. T19 — the same operations with a `task_id` the caller actually owns.
- **Expected Result:** T17/T18 → `400 "task_id must reference a task you own"`, nothing written/changed. T19 → succeeds normally.
- **Actual Result:** Matches expected.
- **Status:** **PASS**
- **AC mapping:** AC-01, AC-02, AC-03, AC-05
- **Limitation:** the mocked Supabase client doesn't implement PostgREST's embedded-resource join, so the *downstream* leak (another user's Task fields appearing in a schedule response) could not be reproduced end-to-end — only the data-model gap that enabled it. See `cc63-authorization-review.md` for the full reasoning and the recommended live follow-up.

### Access revocation (AC-08) — no test case assigned
- **Finding:** A repository-wide search (`revoke`, `deactivate`, `disable.*account`, `suspend`) found **no access-revocation, deactivation, or suspension feature anywhere in the codebase**. There is nothing to test.
- **Status:** **NOT APPLICABLE** — not BLOCKED (BLOCKED would imply a test exists but can't execute; this is a case where the feature itself doesn't exist to test).
- **AC mapping:** AC-08
- **Recommendation:** If account access revocation is a real product requirement, it needs to be designed and implemented before it can be tested; out of scope for this batch (S01–S04 are test-plan/audit/evidence work, not feature implementation).

---

## Summary by acceptance criterion

| AC | Status (as of PR Batch 5) | Test IDs |
|---|---|---|
| AC-01 | **PASS** (fixed) | CC63-T01, CC63-T08, CC63-T11 |
| AC-02 | **PASS** (fixed) | CC63-T02, CC63-T09, CC63-T10, CC63-T13, CC63-T15 |
| AC-03 | **PASS** (fixed) | CC63-T03, CC63-T09, CC63-T12 |
| AC-04 | PASS | CC63-T04 |
| AC-05 | **PASS** (fixed) | CC63-T05, CC63-T08, CC63-T16 |
| AC-06 | PASS (service-role/RLS relationship confirmed); BLOCKED (live policy content — still blocked, no dedicated test environment found this session) | CC63-T06 |
| AC-07 | PASS (configuration — the fix's own tests run via the existing `npm test` CI step, no new job needed); NOT RUN (live CI — this branch has not been pushed) | CC63-T07 |
| AC-08 | NOT APPLICABLE (feature doesn't exist) | — |

**All three originally-failing criteria (AC-01, AC-02, AC-03) plus AC-05
are now PASS**, confirmed by converting the original
vulnerability-demonstration tests into regression tests (CC63-T08–T10)
and adding positive-path and cross-user isolation coverage
(CC63-T11–T16). AC-06 and AC-08 are unchanged from PR Batch 4 — neither
depended on the Schedules fix.

See `cc63-evidence-matrix.md` for the full traceability table and
`cc63-interim-summary.md` for the provisional control classification.
