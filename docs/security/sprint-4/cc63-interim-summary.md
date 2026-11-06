# CC6.3 Access Management — Interim Compliance Assessment Summary

**Prepared for:** Avery Miclea's individual Sprint 4 interim SOC 2 assessment
**PR batch:** PR Batch 4 — SOC 2 CC6.3 Access Management Security Foundation
**Date:** 2026-11-05
**Base commit reviewed:** `766617d` (main)

## 1. Selected control and objective

**SOC 2 Trust Services Criterion CC6.3 — Access Management.**
Objective: authenticated students can access and modify only their own
Task records and related academic information.

## 2. Acceptance criteria

AC-01 through AC-08, as defined in the PR Batch 4 task brief (cross-user
Task retrieval, unauthorized updates/deletions, client-supplied user_id
override, Canvas ownership, Calendar/To-Do/Summary isolation, Supabase
RLS/privileged access, CI regression coverage, access revocation).

## 3. Procedures completed

- Read every backend route file and traced each to its controller, checking authentication middleware and the source of "whose data" (`req.user.id` vs. client-supplied values).
- Read `server/config/supabase.js` and every controller/service's Supabase client import to identify which credential (service-role vs. anon) is used where.
- Searched all four Supabase migration files for RLS policy definitions.
- Reused and verified (by running) existing ownership tests: `taskAuth.test.js`, `securityLogging.taskAccess.test.js`, `canvasMockIntegration.test.js`, `crossComponentSync.test.js`.
- Wrote and ran new automated tests (`cc63ScheduleAuthorizationGap.test.js`) for a scenario no existing test covered.
- Searched the codebase for any access-revocation/deactivation feature.

## 4. Actual verified results

- **Task, Canvas, AI, preferences, and notification-settings endpoints** all correctly require authentication and derive ownership from the verified JWT (`req.user.id`), with existing automated coverage confirmed passing this session.
- **`/api/schedules` (GET/POST/PUT/resolve-conflict) has no authentication middleware and no ownership enforcement at all** — confirmed by direct code reading and by three new automated tests (CC63-T08/T09/T10) that currently pass *because the vulnerability is real*: an unauthenticated caller can read, create, and modify any user's schedule data (including joined Task details).
- **Every data-table access path uses the Supabase service-role key**, which bypasses RLS by design — confirmed from `config/supabase.js` and every controller's import. This means the application's own `user_id` filtering is the *entire* access-control boundary; RLS (whatever exists live) currently has no effect on this application's behavior.
- **The repository defines no RLS policies anywhere** (zero `CREATE POLICY`/`ENABLE ROW LEVEL SECURITY` statements across all four migrations).
- **No access-revocation feature exists in the codebase.**

## 5. Evidence references

- `docs/security/sprint-4/cc63-security-test-plan.md`
- `docs/security/sprint-4/cc63-authorization-review.md`
- `docs/security/sprint-4/cc63-supabase-access-audit.md`
- `docs/security/sprint-4/cc63-evidence-matrix.md`
- `server/tests/cc63ScheduleAuthorizationGap.test.js`
- Existing: `server/tests/taskAuth.test.js`, `server/tests/securityLogging.taskAccess.test.js`, `server/tests/canvasMockIntegration.test.js`, `server/tests/crossComponentSync.test.js`

## 6. Criteria still untested or blocked

- **AC-06** (live RLS policy content): BLOCKED — no live Supabase credentials this session.
- **AC-07** (live CI execution): NOT RUN — this branch has not been pushed or opened as a PR; only the workflow configuration was reviewed.
- **AC-08** (access revocation): NOT APPLICABLE — no such feature exists to test.

## 7. Confirmed findings versus potential gaps

**Confirmed (reproducible, passing-today automated tests):**
- `/api/schedules` is completely unauthenticated and trusts a client-supplied `user_id` for read, create, and update operations.

**Potential, not confirmed (would require live access to resolve):**
- Whether the live Supabase project has any RLS policies at all, and if so, whether they would independently backstop the `/api/schedules` gap if the service-role key were ever not used for that path. (Today it is always used, so this is moot in practice, but worth knowing for defense-in-depth.)

## 8. Remaining engineering work

1. Fix `/api/schedules`: apply `requireAuth` and derive `user_id` from `req.user.id`, matching every other route in the codebase (proposed in `cc63-authorization-review.md`, not implemented in this batch).
2. Add regression tests asserting `401`/ownership enforcement once fixed.
3. Obtain live Supabase access (dashboard or a non-service-role key) to resolve AC-06.
4. Push this branch and open a PR to obtain an actual GitHub Actions run for AC-07.
5. If access revocation is a real product requirement, design and implement it before AC-08 can be assessed at all.

## 9. Provisional control classification

### **FAILED VERIFICATION**

**Rationale:** The control's objective — that authenticated students can
access and modify only their own Task records and related academic
information — is **confirmed violated** for schedule data (AC-01, AC-02,
AC-03, and AC-05 all have a reproducible, passing-today test
demonstrating unauthenticated cross-user read and write access). This is
not a blocked or untested criterion; it is an affirmative, evidenced
failure for one entire data type the Calendar feature depends on. Task,
Canvas, AI, preferences, and notification-settings endpoints are
independently well-covered and pass. The control cannot be classified
VERIFIED or PARTIALLY VERIFIED while a confirmed, exploitable gap of
this severity remains unremediated; it is not NOT YET TESTED, since
substantial, concrete testing occurred and produced a definite result.
