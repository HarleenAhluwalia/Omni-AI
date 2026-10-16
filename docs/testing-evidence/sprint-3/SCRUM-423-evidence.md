# SCRUM-423: Implement Weekly Progress Summary Backend Calculations

## Objective and acceptance criteria

Implement backend calculations for the Weekly Progress Summary feature.
Determine completed, overdue, and **upcoming** Tasks within the selected
week, using existing Task information, due dates, and completion statuses.

## Status

**Partially already implemented, one genuine gap found and closed this
session.** `completed` and `overdue` classification already existed
(Sprint 2). **`upcoming` classification did not exist** — the endpoint had
no concept of "upcoming" at all, unlike Daily Summary
(`getDailySummary`), which already splits into `dueToday`/`overdue`/
`upcoming`. This is a genuinely missing requirement per SCRUM-423's literal
acceptance criteria, not just a missing test, and has been implemented.

## Implementation details

`server/controllers/taskController.js`, `getWeeklySummary`: added an
`upcoming` classification, mirroring Daily Summary's existing pattern —
an incomplete Task due later this week (due date on or after today, within
the selected week) is "upcoming"; an incomplete Task due earlier this week
is "overdue" (pre-existing, unchanged); the two are mutually exclusive, the
same way Daily Summary's three buckets are. This is purely additive: the
existing `tasks` and `overdue` fields and their established semantics
(including `overdue` covering *any* past week, not just the current one —
a deliberate pre-existing design choice, left unchanged) are untouched.

New response fields: `counts.upcoming` (number) and top-level `upcoming`
(array of Task summaries, same shape as `tasks`/`overdue`).

This is an additive API response-shape change. It does not remove or rename
any existing field, so existing consumers (none currently read this
endpoint besides `WeeklySummary.jsx`, which was updated in the same change
— see SCRUM-425) are not broken by it.

## Testing methodology

State-transition testing (seeded Task states → assert classification) and
regression testing (existing completed/overdue tests re-run unmodified to
confirm no behavior change to the pre-existing fields).

## Test scenarios and results

File: `server/tests/weeklySummary.test.js`, new describe block
`"Weekly Summary — upcoming tasks"`.

| Test | Result |
|---|---|
| `classifies an incomplete task due later this week as upcoming, not overdue` | PASS |
| `does not count a completed task due later this week as upcoming` | PASS |
| `does not count an overdue task (due earlier this week) as upcoming` | PASS |

The existing empty-state test was updated to assert `counts.upcoming: 0`
and `upcoming: []` (an additive assertion, since the response shape grew a
field); all other pre-existing Weekly Summary tests (inclusion/exclusion by
week, completion/overdue classification, ownership, failure handling)
continue to pass unmodified.

## Expected vs. actual results

Expected: `upcoming` contains exactly the incomplete, not-yet-overdue Tasks
due later in the selected week, mutually exclusive with `overdue`. Actual:
matches exactly.

## Exact test commands used

```
cd server && npx jest tests/weeklySummary.test.js --verbose
cd server && npx jest --silent
```

Result: 17/17 passing in `weeklySummary.test.js` (13 pre-existing + 4 new/
updated); 317/317 across the full backend suite.

## Pass/fail status

**PASS** — the missing `upcoming` classification has been implemented and
tested; all pre-existing behavior is unchanged and reverified.

## Relevant files

- `server/controllers/taskController.js` (`getWeeklySummary`, modified)
- `server/tests/weeklySummary.test.js` (extended)

## Limitations / unverified scenarios

- Mocked Supabase database only — no live project used or verified.
- Two of the three new tests are guarded (`it.skip`'d) on the single
  calendar day where "later this week" or "earlier this week" doesn't exist
  relative to today (mirroring the pre-existing guard pattern already used
  for the symmetric `overdue` test) — on that one day of the week, those
  specific scenarios are **NOT TESTED** by that day's CI run, though the
  underlying classification logic is identical to the always-tested
  `overdue` side.
- Whether `upcoming`'s week-scoped definition (vs. Daily Summary's
  unscoped, global "any day after today") is exactly what the product
  intends, versus some other interpretation, was not independently
  confirmed with the team — flagged for awareness, not a blocker.
