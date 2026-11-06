# CC6.3 — Evidence Collection and Traceability Matrix

**Jira task:** S04 — Prepare CC6.3 Evidence Collection and Traceability Matrix
**Originally created in:** PR Batch 4 — SOC 2 CC6.3 Access Management Security Foundation
**Updated in:** PR Batch 5 — CC6.3 Security Remediation and Authorization Verification
**Branch:** `sprint4/cc63-security-remediation`
**Base commit (PR Batch 5 start):** `513a761` (main — PR1 `#85`, PR2 `#96`, PR3 `#97`, and PR4 are confirmed merged ancestors, verified via `git merge-base --is-ancestor`, not asserted from memory)
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
| Security test IDs | CC63-T01 (Task), CC63-T08, CC63-T11, CC63-T16, CC63-T17/T18 (schedules/task_id) |
| Test file(s) | `server/tests/taskAuth.test.js` (existing, PR1); `server/tests/cc63ScheduleAuthorizationGap.test.js` (updated, PR Batch 4→5) |
| Mocked vs. live | Mocked only |
| Result | **PASS** — Task endpoints (unchanged from PR Batch 4) and `/api/schedules` (fixed PR Batch 5: unauthenticated `GET` now returns `401`, not another user's data) |
| Evidence | Local test run output, this session (`npx jest --silent`, full suite) |
| Retest status | Retested this session after the fix — now passing |

## AC-02: Unauthorized Task updates and deletions are denied without modifying records

| Field | Value |
|---|---|
| Security test IDs | CC63-T02 (Task), CC63-T09/T10/T13/T15 (schedules), CC63-T18 (task_id) |
| Test file(s) | `taskAuth.test.js`, `securityLogging.taskAccess.test.js` (existing); `cc63ScheduleAuthorizationGap.test.js` (updated) |
| Mocked vs. live | Mocked only |
| Result | **PASS** — unauthenticated `POST`/`PUT` on `/api/schedules` now return `401`; an authenticated non-owner's `PUT`/`resolve-conflict` attempt returns `404` with the record verified unchanged |
| Evidence | Local test run output, this session |
| Retest status | Retested this session after the fix — now passing |

## AC-03: Client-supplied user IDs cannot override authenticated ownership

| Field | Value |
|---|---|
| Security test IDs | CC63-T03 (Task), CC63-T09, CC63-T12 (schedules), CC63-T17/T19 (task_id) |
| Test file(s) | `taskAuth.test.js` (existing); `cc63ScheduleAuthorizationGap.test.js` (updated) |
| Mocked vs. live | Mocked only |
| Result | **PASS** — a `user_id` field in a `POST /api/schedules` request body is now accepted but ignored; the created row is always attributed to `req.user.id` |
| Evidence | Local test run output, this session |
| Retest status | Retested this session after the fix — now passing |

## AC-04: Canvas imports and updates maintain correct user ownership

| Field | Value |
|---|---|
| Security test IDs | CC63-T04 |
| Test file(s) | `server/tests/canvasMockIntegration.test.js` (existing, PR2, CANVAS4-AUTO-010) |
| Mocked vs. live | Mocked only |
| Result | **PASS** (unchanged — Canvas was never affected by the Schedules gap; confirmed by reading `dummyCanvasController.js`/`canvasController.js`, neither ever reads a client-supplied `user_id`) |
| Evidence | PR2 (`#96`, confirmed merged); local test run output, this session |
| Retest status | Retested this session as part of the full suite run — still passing |

## AC-05: Calendar, To-Do, and Summary features do not expose cross-user information

| Field | Value |
|---|---|
| Security test IDs | CC63-T05 (Task-derived views), CC63-T08, CC63-T16, CC63-T17/T18 (schedule blocks, incl. the embedded-Task-join gap) |
| Test file(s) | `server/tests/crossComponentSync.test.js` (existing, PR1, SYNC-AUTO-008); `dailySummary.test.js`/`weeklySummary.test.js` (existing); `cc63ScheduleAuthorizationGap.test.js` (updated) |
| Mocked vs. live | Mocked only |
| Result | **PASS** — Task list/prioritized/Summary data (unchanged from PR Batch 4) and the schedule blocks Calendar also renders (fixed PR Batch 5: CC63-T16 confirms two authenticated users' schedule lists never mix) |
| Evidence | PR1 (`#85`, confirmed merged); local test run output, this session |
| Retest status | Retested this session after the fix — now passing |

## AC-06: Tested Supabase access paths prevent unauthorized reads and modifications

| Field | Value |
|---|---|
| Security test IDs | CC63-T06 |
| Test file(s) | N/A — repository audit, not an automated test |
| Mocked vs. live | Neither — static code/SQL review |
| Result | **UNCHANGED from PR Batch 4.** **PARTIALLY VERIFIED**: service-role key confirmed to bypass RLS for every data-table access path, including the now-fixed `/api/schedules` (it still uses the same service-role client — the fix is entirely application-layer). Live RLS policy content remains **BLOCKED** — checked this batch whether a dedicated non-production test Supabase environment exists (S08); none was found, and no `.env` file contents were read (rule 6). |
| Evidence | `docs/security/sprint-4/cc63-supabase-access-audit.md` (updated with the S08 check this batch) |
| Retest status | N/A until a dedicated live test environment is made available |

## AC-07: Required CC6.3 regression tests pass through CI

| Field | Value |
|---|---|
| Security test IDs | CC63-T07 |
| Test file(s) | N/A — CI configuration review |
| Mocked vs. live | N/A |
| Result | **CONFIGURATION VERIFIED, EXECUTION NOT OBSERVED.** `.github/workflows/ci.yml`'s `backend-tests` job and `harleen-sprint4-regression.yml`'s final step both run the full `npm test`, which already includes `cc63ScheduleAuthorizationGap.test.js` with no CI changes needed (confirmed by reading both workflow files this session; no new job was added, avoiding duplication per rule 10/S09's instruction). **No GitHub Actions run for this branch has occurred** — this branch has not been pushed or opened as a PR. |
| Evidence | `.github/workflows/ci.yml`, `.github/workflows/harleen-sprint4-regression.yml` (read this session); no CI run URL exists to cite |
| Retest status | **NOT RUN** (live CI) |

## AC-08: Supported access-revocation behavior follows the documented policy

| Field | Value |
|---|---|
| Security test IDs | None assigned |
| Test file(s) | N/A |
| Mocked vs. live | N/A |
| Result | **UNCHANGED from PR Batch 4. NOT APPLICABLE** — re-checked this batch (S09); still no access-revocation, deactivation, or suspension feature anywhere in the codebase. No such feature was invented. |
| Evidence | Repository search, this session (`grep -rl "revoke\|deactivate\|disable.*account\|suspend"` — zero matches, confirmed again this batch) |
| Retest status | N/A |

---

## Distinguishing evidence provenance

- **Existing Sprint 1–3 evidence (reused, not re-derived):** `taskAuth.test.js`, `dailySummary.test.js`, `weeklySummary.test.js`.
- **Existing Sprint 4 evidence (PR1/PR2, confirmed merged):** `securityLogging.taskAccess.test.js`, `crossComponentSync.test.js`, `canvasMockIntegration.test.js`.
- **PR Batch 4 evidence (confirmed merged into main):** the original `cc63ScheduleAuthorizationGap.test.js` (vulnerability-demonstration version) and the four `cc63-*.md` documents.
- **New PR Batch 5 evidence (this batch, uncommitted as of this report):** the fix to `routes/scheduleRoutes.js`/`controllers/scheduleController.js`, the regression version of `cc63ScheduleAuthorizationGap.test.js` (CC63-T08–T16), the `supabaseMock.js` test-infrastructure extension, and updates to all five `cc63-*.md` documents.
- **Mocked database tests:** every automated test cited above, with no exception.
- **Live database tests:** none performed; AC-06/S08 marked BLOCKED, not guessed.
- **Manual browser tests:** none performed this batch.
- **Configuration reviews (not tests):** AC-06 (Supabase client/migration review), AC-07 (CI workflow review).

## Remaining verification gaps

1. Live Supabase RLS content is unknown (AC-06/S08) — no dedicated non-production test environment was found or used this session; requires one to be provisioned and explicitly authorized.
2. No GitHub Actions run has confirmed AC-07 for this branch — only the workflow files' configuration was reviewed; this branch has not been pushed.
3. AC-08 has nothing to verify until an access-revocation feature exists — not invented here.
4. The `task_id` ownership gap (found during final review of this batch) is fixed and regression-tested (CC63-T17–T19) at the data-model level, but the *downstream* embedded-join leak it would have enabled was never reproduced end-to-end — the mocked Supabase client doesn't implement PostgREST's embedded-resource joins. Recommended live follow-up once a dedicated test environment exists (S08).
