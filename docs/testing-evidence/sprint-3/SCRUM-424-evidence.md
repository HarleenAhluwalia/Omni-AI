# SCRUM-424: Implement Weekly Completion Rate and Workload Metrics

## Objective and acceptance criteria

Calculate weekly completion percentages, outstanding workload, estimated
effort, and relevant progress indicators. Calculations must handle weeks
with no Tasks, no completed work, and incomplete Task information.

## Status

**Already implemented and merged** (Sprint 2): `completionPercentage` and
the full `workload` object (`totalEffortMinutes`, `completedEffortMinutes`,
`remainingEffortMinutes`, `totalPoints`, `completedPoints`,
`remainingPoints`) already existed in `getWeeklySummary`. **One genuine
test gap closed this session**: a week with Tasks but zero completions had
no dedicated test, as flagged in the pre-implementation assessment. No
calculation logic needed to change — the existing math
(`completed / total`, defaulting to `0` when `total === 0`) was already
correct for this case by inspection; it just hadn't been verified by a
test.

## Implementation details

No production code changes were made for this ticket specifically (the
`upcoming` field added under SCRUM-423 lives in the same function but is a
separate concern). `completionPercentage` is `Math.round((completed /
total) * 100)`, guarded to `0` when `total === 0` — this naturally also
produces `0` when `total > 0` but `completed === 0`, which is the scenario
this ticket's new test makes explicit.

## Testing methodology

Boundary testing: a week with Tasks but no completions (distinct from the
already-tested "zero Tasks at all" empty-week case).

## Test scenarios and results

File: `server/tests/weeklySummary.test.js`, new describe block
`"Weekly Summary — no completed work"`.

| Test | Result |
|---|---|
| `reports 0% completion when the week has tasks but none are completed` | PASS |

Pre-existing, directly relevant tests re-confirmed in this session:

| Test | Scenario covered | Result |
|---|---|---|
| `Weekly Summary — empty state › returns a valid, zeroed-out summary for a user with no tasks` | No Tasks at all | PASS |
| `Weekly Summary — workload totals › calculates total, completed, and remaining effort/points correctly` | Normal workload math | PASS |
| `Weekly Summary — workload totals › treats missing effort/points as zero without erroring` | Incomplete Task information (`null` effort/points) | PASS |

## Expected vs. actual results

Expected: a week with 2 incomplete Tasks and 0 completions reports
`completionPercentage: 0`, `counts.completed: 0`,
`workload.completedEffortMinutes: 0`, `workload.completedPoints: 0` — not a
divide-by-zero error or an incorrect nonzero value. Actual: matches exactly.

## Exact test commands used

```
cd server && npx jest tests/weeklySummary.test.js --verbose
cd server && npx jest --silent
```

Result: 17/17 passing in `weeklySummary.test.js`; 317/317 across the full
backend suite.

## Pass/fail status

**PASS** — all three required boundary conditions (no Tasks, no completed
work, incomplete Task information) are now covered by passing tests.

## Relevant files

- `server/controllers/taskController.js` (`getWeeklySummary` — reviewed, no calculation logic changed for this ticket)
- `server/tests/weeklySummary.test.js` (extended)

## Limitations / unverified scenarios

- Mocked Supabase database only — no live project used or verified.
- `point_value`'s PostgREST numeric-string quirk (documented elsewhere in
  this codebase, relevant to Canvas sync) was not specifically re-tested
  against the workload sum here; the mock always returns plain JS numbers.
