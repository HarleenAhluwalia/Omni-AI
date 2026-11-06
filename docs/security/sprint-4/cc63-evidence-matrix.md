# CC6.3 — Evidence Collection and Traceability Matrix

**Jira task:** S04 — Prepare CC6.3 Evidence Collection and Traceability Matrix
**PR batch:** PR Batch 4 — SOC 2 CC6.3 Access Management Security Foundation
**Branch:** `sprint4/cc63-security-foundation`
**Base commit:** `766617d` (main, as of this batch's start — PR1 `#85`, PR2 `#96`, and PR3 `#97` are confirmed merged ancestors, verified via `git merge-base --is-ancestor`, not asserted from memory)
**Environment:** Local development session, mocked Supabase (`tests/helpers/supabaseMock.js`) for every automated result below — no live Supabase/CI execution occurred in this session
**Execution date:** 2026-11-05

This matrix cites only commits, PR numbers, and test results this
session actually observed via `git log`/`git merge-base` or an actual
test run. No PR URL, Jira issue key, date, or outcome below is invented
— where something is genuinely unknown, it says so.

---

## AC-01: Cross-user Task retrieval attempts are denied

| Field | Value |
|---|---|
| Security test IDs | CC63-T01 (Task), CC63-T08 (schedules) |
| Test file(s) | `server/tests/taskAuth.test.js` (existing, Sprint 4 PR1); `server/tests/cc63ScheduleAuthorizationGap.test.js` (new, this batch) |
| Mocked vs. live | Mocked only |
| Result (Task endpoints) | **PASS** — observed this session, `npx jest --silent` |
| Result (`/api/schedules`) | **FAIL** — observed this session; unauthenticated `GET` returns another user's data |
| Evidence | Local test run output, this session; files above |
| Retest status | Not retested after a fix — no fix applied in this batch |

## AC-02: Unauthorized Task updates and deletions are denied without modifying records

| Field | Value |
|---|---|
| Security test IDs | CC63-T02 (Task), CC63-T09/T10 (schedules) |
| Test file(s) | `taskAuth.test.js`, `securityLogging.taskAccess.test.js` (existing); `cc63ScheduleAuthorizationGap.test.js` (new) |
| Mocked vs. live | Mocked only |
| Result (Task endpoints) | **PASS** |
| Result (`/api/schedules`) | **FAIL** — unauthenticated `POST`/`PUT` succeed |
| Evidence | Local test run output, this session |
| Retest status | Not retested — no fix applied |

## AC-03: Client-supplied user IDs cannot override authenticated ownership

| Field | Value |
|---|---|
| Security test IDs | CC63-T03 (Task), CC63-T09 (schedules) |
| Test file(s) | `taskAuth.test.js` (existing); `cc63ScheduleAuthorizationGap.test.js` (new) |
| Mocked vs. live | Mocked only |
| Result (Task endpoints) | **PASS** |
| Result (`/api/schedules`) | **FAIL** — the endpoint has no concept of authenticated ownership to override; the client-supplied id is the *only* id used |
| Evidence | Local test run output, this session |
| Retest status | Not retested — no fix applied |

## AC-04: Canvas imports and updates maintain correct user ownership

| Field | Value |
|---|---|
| Security test IDs | CC63-T04 |
| Test file(s) | `server/tests/canvasMockIntegration.test.js` (existing, Sprint 4 PR2, CANVAS4-AUTO-010) |
| Mocked vs. live | Mocked only |
| Result | **PASS** |
| Evidence | PR2 (`#96`, confirmed merged); local test run output, this session |
| Retest status | Retested this session as part of the full suite run — still passing |

## AC-05: Calendar, To-Do, and Summary features do not expose cross-user information

| Field | Value |
|---|---|
| Security test IDs | CC63-T05 (Task-derived views), CC63-T08 (schedule blocks) |
| Test file(s) | `server/tests/crossComponentSync.test.js` (existing, PR1, SYNC-AUTO-008); `dailySummary.test.js`/`weeklySummary.test.js` (existing, Sprint 2); `cc63ScheduleAuthorizationGap.test.js` (new) |
| Mocked vs. live | Mocked only |
| Result | **PASS** for Task list/prioritized/Summary data; **FAIL** for the schedule blocks Calendar also renders (the same `/api/schedules` gap as AC-01) |
| Evidence | PR1 (`#85`, confirmed merged); local test run output, this session |
| Retest status | Task-side retested this session, still passing; schedule-side gap not retested after a fix (none applied) |

## AC-06: Tested Supabase access paths prevent unauthorized reads and modifications

| Field | Value |
|---|---|
| Security test IDs | CC63-T06 |
| Test file(s) | N/A — repository audit, not an automated test |
| Mocked vs. live | Neither — static code/SQL review |
| Result | **PARTIALLY VERIFIED**: confirmed (repository evidence) that the service-role key is the only credential ever used against user data tables, and that it bypasses RLS by design — so the application's own `.eq("user_id", ...)` filtering is the real boundary, not RLS. Whether any live RLS policies exist at all is **BLOCKED** (no live Supabase access this session). |
| Evidence | `docs/security/sprint-4/cc63-supabase-access-audit.md`; `server/config/supabase.js`; all four `supabase/migrations/*.sql` files |
| Retest status | N/A until live access is available |

## AC-07: Required CC6.3 regression tests pass through CI

| Field | Value |
|---|---|
| Security test IDs | CC63-T07 |
| Test file(s) | N/A — CI configuration review |
| Mocked vs. live | N/A |
| Result | **CONFIGURATION VERIFIED, EXECUTION NOT OBSERVED**: `.github/workflows/ci.yml`'s `backend-tests` job runs the full `npm test` (which includes every CC6.3-relevant test file above) on every push/PR to `main`. No GitHub Actions run for this branch has actually occurred this session — this branch has not been pushed or opened as a PR yet. |
| Evidence | `.github/workflows/ci.yml` (read this session); no CI run URL exists to cite |
| Retest status | **NOT RUN** (live CI) |

## AC-08: Supported access-revocation behavior follows the documented policy

| Field | Value |
|---|---|
| Security test IDs | None assigned |
| Test file(s) | N/A |
| Mocked vs. live | N/A |
| Result | **NOT APPLICABLE** — a repository-wide search found no access-revocation, deactivation, or suspension feature anywhere in the codebase. There is no documented policy and no implementation to test against one. |
| Evidence | Repository search, this session (`grep -rl "revoke\|deactivate\|disable.*account\|suspend"` — zero matches) |
| Retest status | N/A |

---

## Distinguishing evidence provenance

- **Existing Sprint 1–3 evidence (reused, not re-derived):** `taskAuth.test.js`, `dailySummary.test.js`, `weeklySummary.test.js`.
- **Existing Sprint 4 evidence (PR1/PR2, confirmed merged):** `securityLogging.taskAccess.test.js`, `crossComponentSync.test.js`, `canvasMockIntegration.test.js`.
- **New Sprint 4 evidence (this batch, uncommitted as of this report):** `server/tests/cc63ScheduleAuthorizationGap.test.js`, and the four `docs/security/sprint-4/cc63-*.md` documents.
- **Mocked database tests:** every automated test cited above, with no exception.
- **Live database tests:** none performed; all marked BLOCKED or NOT RUN where applicable.
- **Manual browser tests:** none performed this batch.
- **Configuration reviews (not tests):** AC-06 (Supabase client/migration review), AC-07 (CI workflow review).

## Remaining verification gaps

1. `/api/schedules` has no fix yet — AC-01/AC-02/AC-03/AC-05 remain genuinely FAILED for that endpoint until a separately-scoped fix lands.
2. Live Supabase RLS content is unknown (AC-06) — requires dashboard/SQL access this session doesn't have.
3. No GitHub Actions run has confirmed AC-07 for this branch — only the workflow file's configuration was reviewed.
4. AC-08 has nothing to verify until an access-revocation feature exists.
