# CC6.3 Access Management — Interim Compliance Assessment Summary

**Prepared for:** Avery Miclea's individual Sprint 4 interim SOC 2 assessment
**Originally created in:** PR Batch 4 — SOC 2 CC6.3 Access Management Security Foundation
**Updated in:** PR Batch 5 — CC6.3 Security Remediation and Authorization Verification
**Date:** 2026-11-05
**Base commit reviewed:** `513a761` (main, PR Batch 5 start)

## 1. Selected control and objective

**SOC 2 Trust Services Criterion CC6.3 — Access Management.**
Objective: authenticated students can access and modify only their own
Task records and related academic information.

## 2. Acceptance criteria

AC-01 through AC-08, unchanged from PR Batch 4 (cross-user Task
retrieval, unauthorized updates/deletions, client-supplied user_id
override, Canvas ownership, Calendar/To-Do/Summary isolation, Supabase
RLS/privileged access, CI regression coverage, access revocation).

## 3. Procedures completed (this batch, in addition to PR Batch 4's)

- Re-confirmed the PR Batch 4 Schedules finding directly in current code before changing anything (`routes/scheduleRoutes.js`, `controllers/scheduleController.js`).
- Implemented the smallest fix that closes it: `requireAuth` on the route, `req.user.id` instead of client-supplied values in all four handlers.
- Confirmed the frontend (`CalendarView.jsx`) already sent `Authorization` headers on every affected call — no frontend change needed.
- Converted the three original vulnerability-demonstration tests into regression tests asserting the fixed behavior, preserving the original finding in both the test file's header comment and `cc63-authorization-review.md`.
- Added positive-path tests (legitimate authenticated schedule management) and a cross-user isolation test.
- Extended the mocked Supabase test helper (not production code) to support a query shape (`resolveScheduleConflict`'s update) that had never been exercised by any test before.
- Checked whether a dedicated, non-production Supabase test environment exists for S08 — none found; no `.env` file was read, no live connection attempted.
- Re-checked the codebase for an access-revocation feature (S09) — still none.
- Reviewed CI workflows to confirm the new/updated security tests run automatically without a new job.
- Ran the full backend suite, relevant frontend suites, and the production build this session.

## 4. Actual verified results

- **The confirmed Schedules API gap from PR Batch 4 is fixed and regression-tested.** `GET`/`POST`/`PUT /api/schedules` and `POST /api/schedules/resolve-conflict` now require authentication and derive ownership from `req.user.id`, never a client-supplied value. Unauthenticated requests return `401`; a non-owner's authenticated attempt on another user's schedule returns `404` with the record verified unchanged.
- **Legitimate schedule management still works** — list, create, update, and resolve-conflict all verified for the authenticated owner.
- **Two authenticated users' schedule lists are verified to never mix.**
- **A residual gap found during final review — a schedule's `task_id` was never checked against the authenticated user's own Tasks — is now fixed.** Since `GET /api/schedules` embeds (joins) the linked Task's fields into its response, this closes a cross-user data-exposure path at its source. The full join-leak itself could not be reproduced against the mock (it doesn't implement PostgREST's embedded-resource joins), so live confirmation remains a recommended follow-up.
- **Task, Canvas, AI, preferences, and notification-settings endpoints remain correctly protected**, unaffected by this batch's changes (full suite re-run this session).
- **Live Supabase RLS content is still unknown** — no dedicated test environment was found; AC-06/S08 remain BLOCKED, not guessed.
- **No live GitHub Actions run has occurred** for this branch — AC-07's CI configuration was re-confirmed to already cover the new tests (no new job needed), but execution itself is NOT RUN.
- **No access-revocation feature exists** — re-confirmed, not invented.

## 5. Evidence references

- `docs/security/sprint-4/cc63-security-test-plan.md` (updated)
- `docs/security/sprint-4/cc63-authorization-review.md` (updated — fix details, before/after table)
- `docs/security/sprint-4/cc63-supabase-access-audit.md` (updated — S08 check)
- `docs/security/sprint-4/cc63-evidence-matrix.md` (updated)
- `server/tests/cc63ScheduleAuthorizationGap.test.js` (updated — regression + positive-path tests)
- `server/routes/scheduleRoutes.js`, `server/controllers/scheduleController.js` (the fix itself)
- `server/tests/helpers/supabaseMock.js` (test-infrastructure extension)

## 6. Criteria still untested or blocked

- **AC-06** (live RLS policy content): still BLOCKED — no dedicated, non-production Supabase test environment was available this session.
- **AC-07** (live CI execution): still NOT RUN — this branch has not been pushed or opened as a PR.
- **AC-08** (access revocation): still NOT APPLICABLE — no such feature exists to test.

## 7. Confirmed findings versus potential gaps

**Confirmed (reproducible, passing-today automated tests):**
- The Schedules API fix closes the previously confirmed gap — regression tests (CC63-T08–T10) now assert `401`/ownership-scoped `404`, and positive-path tests (CC63-T11–T16) confirm no legitimate functionality broke.

**Potential, not confirmed (would require live access to resolve):**
- Whether the live Supabase project has any RLS policies at all, and whether they'd independently backstop the application layer if the service-role key were ever not used for a given path. Today it always is, so this is moot in practice but relevant to defense-in-depth.

## 8. Remaining engineering work

1. Obtain a dedicated, non-production Supabase test environment (explicitly authorized, with a non-service-role key) to resolve AC-06/S08.
2. Push this branch and open a PR to obtain an actual GitHub Actions run for AC-07.
3. If access revocation is a real product requirement, design and implement it before AC-08 can be assessed at all.
4. **Done this update:** `createSchedule`/`updateSchedule`'s `task_id` ownership gap, found during final review, is now fixed and regression-tested. The one remaining piece is live confirmation that the embedded Task join in `GET /api/schedules` never surfaces another user's data — structurally should be impossible now, but not observed live; recommended once S08's live test environment exists.

## 9. Provisional control classification

### **PARTIALLY VERIFIED**

**Rationale:** The confirmed, severe gap that justified PR Batch 4's
**FAILED VERIFICATION** classification — the completely unauthenticated
`/api/schedules` endpoint — is now fixed and regression-tested
end-to-end against the mocked environment, with positive-path and
cross-user isolation coverage added. Every acceptance criterion that
can be evaluated against the application layer alone (AC-01 through
AC-05) now has a passing, reproducible automated result, and no
confirmed failure remains anywhere in the codebase reviewed this
session.

The control is **not VERIFIED**, because two required pieces of
evidence are still missing, not merely assumed fine: AC-06 (live
Supabase/RLS behavior) remains BLOCKED with no dedicated test
environment available, and AC-07 (an actual passing GitHub Actions
run) has never been observed for this work — only its configuration
was reviewed. Per the explicit instruction not to classify VERIFIED
merely because the Schedules defect is fixed, this report does not do
so. AC-08 remains NOT APPLICABLE pending a feature that doesn't exist.
PARTIALLY VERIFIED reflects that the previously failing criteria now
pass, while the still-open criteria are honestly reported as
unresolved rather than assumed.
