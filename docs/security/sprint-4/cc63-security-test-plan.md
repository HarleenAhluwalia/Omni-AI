# CC6.3 Access Management — Formal Security Test Plan

**Jira task:** S01 — Develop Formal CC6.3 Access Management Security Test Cases
**PR batch:** PR Batch 4 — SOC 2 CC6.3 Access Management Security Foundation
**Branch:** `sprint4/cc63-security-foundation`
**Control:** SOC 2 Trust Services Criterion CC6.3 — Access Management
**Objective:** Authenticated students can access and modify only their own Task records and related academic information.
**Date:** 2026-11-05

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

### CC63-T08: `GET /api/schedules?user_id=<uuid>` has no authentication — CONFIRMED GAP
- **Objective:** Confirm whether the Calendar's schedule-fetching endpoint enforces any identity check.
- **Procedure:** Seed a schedule for a "victim" user id. Send `GET /api/schedules?user_id=<victim>` with **no `Authorization` header at all**.
- **Expected Result (per AC-01/AC-05):** `401 Unauthorized`.
- **Actual Result:** `200`, with the victim's full schedule data (including joined Task title/description/due_date/priority/effort/completion_status) returned to the unauthenticated caller.
- **Status:** **FAIL** (confirmed security gap — see `cc63-authorization-review.md`)
- **AC mapping:** AC-01, AC-05 (both violated for this endpoint)
- **Evidence:** `server/tests/cc63ScheduleAuthorizationGap.test.js`

### CC63-T09: `POST /api/schedules` accepts an arbitrary client-supplied `user_id` with no authentication — CONFIRMED GAP
- **Objective:** Confirm whether a caller can write a schedule row attributed to any user.
- **Procedure:** `POST /api/schedules` with a `user_id` field and no `Authorization` header.
- **Expected Result (per AC-02/AC-03):** `401 Unauthorized`.
- **Actual Result:** `201 Created`, with a new schedule row persisted under the attacker-supplied `user_id`.
- **Status:** **FAIL** (confirmed security gap)
- **AC mapping:** AC-02, AC-03
- **Evidence:** `server/tests/cc63ScheduleAuthorizationGap.test.js`

### CC63-T10: `PUT /api/schedules/:id?user_id=<uuid>` modifies another user's schedule with no authentication — CONFIRMED GAP
- **Objective:** Confirm whether a caller can modify an existing schedule belonging to any user.
- **Procedure:** Seed a victim's schedule. `PUT /api/schedules/:id?user_id=<victim>` with no `Authorization` header.
- **Expected Result (per AC-02):** `401 Unauthorized`.
- **Actual Result:** `200`, the victim's schedule modified.
- **Status:** **FAIL** (confirmed security gap)
- **AC mapping:** AC-02
- **Evidence:** `server/tests/cc63ScheduleAuthorizationGap.test.js`

### Access revocation (AC-08) — no test case assigned
- **Finding:** A repository-wide search (`revoke`, `deactivate`, `disable.*account`, `suspend`) found **no access-revocation, deactivation, or suspension feature anywhere in the codebase**. There is nothing to test.
- **Status:** **NOT APPLICABLE** — not BLOCKED (BLOCKED would imply a test exists but can't execute; this is a case where the feature itself doesn't exist to test).
- **AC mapping:** AC-08
- **Recommendation:** If account access revocation is a real product requirement, it needs to be designed and implemented before it can be tested; out of scope for this batch (S01–S04 are test-plan/audit/evidence work, not feature implementation).

---

## Summary by acceptance criterion

| AC | Status | Test IDs |
|---|---|---|
| AC-01 | PASS for Task endpoints; **FAIL** for `/api/schedules` | CC63-T01, CC63-T08 |
| AC-02 | PASS for Task endpoints; **FAIL** for `/api/schedules` | CC63-T02, CC63-T09, CC63-T10 |
| AC-03 | PASS for Task endpoints; **FAIL** for `/api/schedules` | CC63-T03, CC63-T09 |
| AC-04 | PASS | CC63-T04 |
| AC-05 | PASS for Calendar/To-Do/Summary data itself; **FAIL** for the schedule blocks Calendar also displays | CC63-T05, CC63-T08 |
| AC-06 | PASS (service-role/RLS relationship confirmed); BLOCKED (live policy content) | CC63-T06 |
| AC-07 | PASS (configuration); NOT RUN (live CI) | CC63-T07 |
| AC-08 | NOT APPLICABLE (feature doesn't exist) | — |

See `cc63-evidence-matrix.md` for the full traceability table and
`cc63-interim-summary.md` for the provisional control classification.
