# Sprint 5 — Final Test Evidence (Jira Task 6)

**Owner:** Avery
**Jira task:** Task 6 — Close Sprint 5 Defects and Compile Final Test Evidence
**Branch this evidence was gathered on:** `sprint5/dummy-canvas-regression-tests`
**Date compiled:** 2026-11-20

This document records what was actually run and observed in this session.
No screenshot, CI run ID, defect closure, or PR check result below is
invented — anything not directly verified this session is marked
**NOT VERIFIED** or left as an explicit placeholder.

---

## 1. Completed work by Jira task

| Task | Description | Commit(s) | Status |
|---|---|---|---|
| 1 | AI prioritization integration and schedule-validation tests | `55db6a9` | Merged to `main` via PR #108 |
| 2 | Task CRUD regression and data-integrity tests | `509a99b` | Merged to `main` via PR #108 |
| 3 | Run regression tests in GitHub Actions and capture evidence | — | Reported (not independently re-verified this session, see §2) |
| 4 | Dummy Canvas course-mismatch regression test | `8560db8` | Merged to `main` via PR #117 |
| 5 | Daily/Weekly Summary timezone fix + tests | `3a5228072063b14485a758e3e1aa3d74e0110113` | Merged to `main` via PR #117 |
| 6 | This evidence report | — | In progress (this document) |

---

## 2. Merge and PR status (verified via local git, not GitHub API)

No `gh` CLI or authenticated GitHub access was available in this session
(`which gh` → not found, confirmed again this session). Everything below
is derived from local `git log` / `git merge-base`, which can confirm
*merge* state but not CI *check* state.

- `git fetch origin` confirmed `origin/main` is at `c8c324a9...`, ahead of
  this session's local `main` (`7a4d498`).
- `git merge-base --is-ancestor 8560db8 origin/main` → **true**.
- `git merge-base --is-ancestor 3a5228072063b14485a758e3e1aa3d74e0110113 origin/main` → **true**.
- The actual merge commit is visible in history:
  `c8c324a Merge pull request #117 from HarleenAhluwalia/sprint5/dummy-canvas-regression-tests`,
  with `3a52280` as its direct parent and `8560db8` as an ancestor of that
  branch. **This confirms PR #117 is merged**, not just branch-equal.
- Tasks 1/2's PR is confirmed as **#108** the same way (merge commit
  `0e041b7`, parent `509a99b`), from an earlier session in this
  conversation.

**NOT VERIFIED this session:**
- PR #117's actual GitHub Actions check results, run IDs, or run URLs.
- Task 3's claimed "workflow #173, 46 suites, 668 tests" — this was
  reported to this session by the user in an earlier turn; it is
  **not** re-derived or confirmed here, and is not treated as fact
  for this report beyond "reported."
- Any screenshot evidence for Task 3 or for Jerry's Sprint 5
  preferences verification (`docs/testing-evidence/sprint-5/jerry-preferences-uc9-uc16-verification.md`,
  merged separately via PR #116) — that document's own screenshot
  and demo-step tables are still template placeholders (`_<path>_`,
  `_<date>_`) as of `origin/main`, not filled in.

**Manual verification needed** (exact steps, since no automated access exists):
1. Open `https://github.com/HarleenAhluwalia/Omni-AI/pull/117` → Checks tab.
2. Or: `https://github.com/HarleenAhluwalia/Omni-AI/commit/c8c324a9` → check ✓/✗ status.
3. Or, once `gh` is available: `gh pr checks 117` / `gh run list --commit c8c324a9`.

---

## 3. Test commands and results (run this session)

All commands were run once, on the first attempt, with no retries.

### 3.1 Targeted backend regression (Tasks 1–5 scope)

```
cd server && npx jest aiPrioritizationSprint5 ai.test.js priorityService schedulingService \
  databaseIntegrity createTask.test editTask.test deleteTask.test tasks.test taskApiContract \
  taskWorkflow taskAuth canvasMockIntegration dummyCanvasSync dummyCanvasApi dummyCanvasImport \
  dummyCanvas.test dummyCanvasEmptyCourse dailySummary weeklySummary crossComponentSync --silent
```
**Result: 24 suites passed, 307 tests passed, 0 failed.**

### 3.2 Frontend (Calendar / To-Do / Prioritized)

```
cd client && npm run test:calendar   # 13 passed, 0 failed
cd client && npm run test:todo       # 14 passed, 0 failed
cd client && npm run test:prioritized # 4 passed, 0 failed
```
**Result: 31 tests passed, 0 failed.**

### 3.3 Full backend Jest suite

```
cd server && npx jest
```
**Result:**
- **Test Suites: 53 passed, 2 skipped, 55 total**
- **Tests: 721 passed, 7 skipped, 728 total, 0 failed**

The 2 skipped suites and 7 skipped tests are **pre-existing and
environment-gated**, confirmed by direct inspection of their source,
not by assumption:
- `server/tests/dbIntegrity.test.js` — gated by
  `const run = URL && KEY ? describe : describe.skip;`, requiring
  `TEST_SUPABASE_URL`/`TEST_SUPABASE_SERVICE_KEY`, which are not set in
  this environment. Contains 6 tests, all skipped as a unit.
- `server/tests/sprint5ApiPerformance.test.js` — gated by
  `process.env.RUN_SPRINT5_PERF === "1" ? test : test.skip`, an
  explicit opt-in performance benchmark not run by default. Contains 1
  test, skipped.
- 6 + 1 = **7**, reconciling exactly with the reported skip count.

These are **not treated as passing** — they are reported as skipped,
for the reasons stated, and nothing about their outcome is claimed.

**Note on scope:** this branch (`sprint5/dummy-canvas-regression-tests`)
contains Sprint 5 Tasks 1–5 but does **not** include the separately
merged `Jerry-sprint-5-preference-test` PR (#116, merged to `origin/main`
in parallel as `f22ca8b`), so `server/tests/preferences.test.js` (25
tests per that PR's own evidence doc) is not part of the 728 total
above. The two branches were merged independently into `origin/main`;
this report covers what Tasks 1–5 actually changed and verified, not
`origin/main`'s current full state.

---

## 4. Defect review — resolved vs. open, with evidence

### 4.1 Resolved this Sprint, with code + tests (verified)

| Defect | Resolution | Evidence |
|---|---|---|
| AI prioritization/scheduling input wiring untested | Added `aiPrioritizationSprint5.test.js` proving the real `calculateTaskPriority` output reaches `askAI` unmodified | Task 1, `55db6a9` |
| DB-DEFECT-001 regression incomplete for `updateTask`/`getTaskById` | Added `DB-AUTO-011`/`DB-AUTO-012` genuinely-rejected-promise tests | Task 2, `509a99b` |
| `has_due_time` untested at the Task CRUD API layer | Added create/update tests for persistence and the due-date-required validation rule | Task 2, `509a99b` |
| Dummy Canvas course-mismatch guard untested | Added `CANVAS4-AUTO-011` | Task 4, `8560db8` |
| **Daily/Weekly Summary ignored `has_due_time`, inconsistent with Calendar/To-Do** | Classification now uses `getDayInTimeZone` (same viewer IANA zone) for `has_due_time: true` Tasks; date-only Tasks unchanged | Task 5, `3a5228072063b14485a758e3e1aa3d74e0110113` — verified fresh this session by re-reading the current code and confirming `getDayInTimeZone`/`time_zone` handling exists in `getDailySummary`/`getWeeklySummary` on this branch |

### 4.2 Confirmed still OPEN (verified fresh this session, not assumed)

**Unused user-configurable priority weights** — **STILL OPEN.**
Re-checked directly against `origin/main` (`c8c324a`, the current merged
tip) this session:
```
git show origin/main:server/services/priorityService.js | grep "priority_weight\|deadline_weight\|effort_weight"   → no matches
git show origin/main:server/controllers/taskController.js | grep "priority_weight\|deadline_weight\|effort_weight" → no matches
git show origin/main:server/src/controllers/aiController.js | grep "priority_weight\|deadline_weight\|effort_weight" → no matches
```
`preferences.deadline_weight`/`priority_weight`/`effort_weight` are
stored and settable (validated to sum to 100) via
`preferencesController.js`, and Jerry's Sprint 5 preferences work
(`preferences.test.js`, PR #116) **verifies persistence and validation
of these values but does not verify, and does not add any test for,
whether they affect prioritization** — confirmed by reading that test
file's `describe` blocks (auth, read/save, validation, isolation,
DB-failure only) and by that PR's own `jerry-preferences-uc9-uc16-verification.md`,
whose "Defects found" table is an empty, unfilled template. Changing
these weights in the UI still has **no effect** on `calculateTaskPriority`,
`getPrioritizedTasks`, or the AI chat/schedule endpoint. This was first
reported in Sprint 5 Task 1 and remains unresolved.

**CC6.3 (Access Management) — still PARTIALLY VERIFIED**, carried over
from Sprint 4, unchanged by any Sprint 5 work inspected this session:
- AC-06 (live Supabase/RLS verification): still BLOCKED — no dedicated
  non-production test environment has existed in any session.
- AC-07 (live CI verification): still NOT VERIFIED from this session's
  own access (see §2) — Task 3's own claim is unconfirmed here.
- AC-08 (access revocation): still NOT APPLICABLE — no such feature
  exists in the application.

### 4.3 Explicitly not re-litigated

This report does not re-open or re-test defects already closed with
passing regression coverage in Sprints 1–4 (CAL-DEFECT-001/002,
TODO-DEFECT-001, DB-DEFECT-001's original 3 handlers, the Schedules
authorization/`task_id` ownership gaps) — their existing regression
tests (`CAL-AUTO-*`, `TODO-AUTO-*`, `DB-AUTO-005/008/009`,
`CC63-T08-T19`) ran clean in §3.1/§3.3 above, which is the evidence
that they remain closed, not an assumption.

---

## 5. Known limitations

- No live Supabase/RLS verification environment has existed in any
  Sprint 4 or Sprint 5 session (AC-06, DB-LIVE-* cases).
- No browser-automation tool has existed in any session — all manual
  UI test cases (Calendar, To-Do, Canvas, Preferences demo steps)
  remain NOT RUN with documented procedures only.
- No `gh` CLI or authenticated GitHub API access existed in this
  session — PR #117's actual CI conclusions are unverified here (see §2).
- The priority-weights defect (§4.2) remains open; no fix was made or
  attempted in this task, per its "inspection/evidence-only" scope.
- This branch does not include the independently-merged Jerry
  preferences-test PR (#116); its 25 tests are not reflected in the
  full-suite total in §3.3 (see the note at the end of that section).

---

## 6. Screenshot evidence

No screenshots were captured or are claimed in this session — no
browser-automation or screenshot tool was available. Placeholders only:

| ID | Description | File |
|---|---|---|
| SS-S5-01 | PR #117 Checks tab (all jobs) | *\<path — not yet captured\>* |
| SS-S5-02 | Local full backend suite run (53/55 suites, 721/728 tests) | *\<path — not yet captured\>* |
| SS-S5-03 | Local frontend suite run (31/31 tests) | *\<path — not yet captured\>* |

---

## 7. Final release-readiness assessment

**Verified this session (high confidence):**
- All Sprint 5 Task 1–5 code changes are present and merged into
  `main`'s current tip (confirmed via `git merge-base`, not assumed).
- 721 of 728 local backend tests pass; 31 of 31 frontend tests pass;
  0 failures anywhere. The 7 skipped tests are pre-existing,
  environment-gated, and accounted for exactly.
- The Daily/Weekly Summary `has_due_time` defect is fixed and
  regression-tested; date-only Task behavior is unchanged (every
  pre-existing test in the affected files still passes).
- The Dummy Canvas course-mismatch guard is now regression-tested; no
  defect was found in it.

**Pending / not verified (blocks a confident "ready to ship" call):**
- PR #117's actual GitHub Actions results are unknown from this
  session. Local green does not by itself confirm CI green (different
  Node version pins, secrets availability, and `jerry-sprint5-reliability`'s
  live-DB step could behave differently in CI than locally).
- The priority-weights defect is a real, open, user-facing
  inconsistency (a documented preference that silently does nothing)
  and has not been fixed or ticketed with a known Jira key.
- No live Supabase/RLS or manual UI verification exists for anything
  in this report.

**Overall:** Sprint 5 Tasks 1–5's own changes are **conditionally
ready** — fully verified at the local test level, with zero regressions
introduced, but **not yet confirmed at the CI level**, and with one
known, unresolved, non-blocking (cosmetic-only) defect (`priority_weight`/
`deadline_weight`/`effort_weight` having no effect). Recommend
confirming PR #117's actual Actions result (manually, or via `gh` once
available) before treating Sprint 5 as fully closed.
