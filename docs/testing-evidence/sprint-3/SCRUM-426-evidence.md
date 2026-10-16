# SCRUM-426: Integrate Weekly Summary Updates and Prepare Midterm Demo

## Objective and acceptance criteria

Verify that manual Task changes and Dummy Canvas imports are reflected
correctly in Weekly Progress Summary results. Perform integration testing
across Task Management, Calendar, To-Do, AI prioritization, and Canvas
synchronization. Resolve issues affecting Avery's features and support
preparation of a stable midterm demonstration.

## Status

**Partially addressed this session.** Two concrete, previously-missing
integration tests were written and pass (manual-edit-reflected-in-summary,
Canvas-import-reflected-in-summary). Broader "full-system integration
testing" and the midterm demo itself remain outstanding, as explicitly
noted in the pre-implementation assessment ("Full-system integration and
midterm validation remain outstanding") — this ticket cannot be marked
fully complete by automated work alone.

## Implementation details

No production code changes were required beyond what SCRUM-421/422/423/424
already made (connection-failure handling, cross-feature integration
points, the `upcoming` field). This ticket's own work is test-only,
proving those pieces work together rather than only individually.

## Testing methodology

Integration testing, exercising real sequences of HTTP calls against the
same mocked backend: create/import → mutate → re-fetch, to prove a later
read reflects an earlier write through the actual API surface, not just
through direct store inspection.

## Test scenarios and results

File: `server/tests/canvasCrossFeatureIntegration.test.js` (new).

| Test | What it verifies | Result |
|---|---|---|
| `Weekly Summary reflects a Canvas import (SCRUM-426) › a Canvas-imported Task due this week is counted by GET /api/tasks/summary/weekly` | A Task created via `POST /api/canvas/import` is counted by Weekly Summary once its due date falls in the current week. | PASS |
| `Weekly Summary reflects a manual Task edit (SCRUM-426) › marking a Task complete via PUT /api/tasks/:id is reflected in the next GET /api/tasks/summary/weekly call` | Editing a Task's `completion_status` via the ordinary Task API changes `counts.completed` and `completionPercentage` on the next summary fetch, with no caching or staleness. | PASS |

These two tests, together with the SCRUM-422 tests in the same file
(Canvas Task appears in `GET /api/tasks` and in AI prioritization's input),
constitute this session's cross-feature integration coverage.

## Expected vs. actual results

Expected: both manual Task edits and Canvas imports are visible in Weekly
Summary on the very next request, with no separate sync/refresh step
required, since both ultimately write to the same `tasks` table Weekly
Summary reads from. Actual: matches exactly.

## Exact test commands used

```
cd server && npx jest tests/canvasCrossFeatureIntegration.test.js --verbose
cd server && npx jest --silent
```

Result: 4/4 passing in the new file (2 of which map to this ticket); 317/317
across the full backend suite, 21 suites.

## Pass/fail status

**PARTIAL.** The specific automated scenarios above pass. The ticket's
broader scope — full-system integration across Task Management, Calendar,
To-Do, AI prioritization, and Canvas sync as a stable, demo-ready whole —
has not been fully verified, and the midterm demo itself has not been
rehearsed. **Not recommended for Done** without an explicit team decision
on what remains acceptable to leave unverified before the demo.

## Relevant files

- `server/tests/canvasCrossFeatureIntegration.test.js` (new)
- Every file touched under SCRUM-419 through SCRUM-425 (this ticket depends
  on all of them)

## Limitations / unverified scenarios

- **No manual UI testing was performed** anywhere in this session's work.
  Nothing here confirms the actual Calendar grid, To-Do list, Weekly
  Summary page, or Canvas Integration page render correctly together in a
  real browser session.
- **No live Supabase database was used.** Every test in this evidence set,
  across all eight tickets, runs against the in-memory Supabase mock.
  Migration 002's deployment status to any shared/production project remains
  unconfirmed from prior sessions and was not re-investigated here.
- "Resolve issues affecting Avery's features" — no specific, separately
  reported issue was given to resolve as part of this task; the one
  confirmed defect found and fixed (the lost `__store` Proxy fix in
  `supabaseMock.js`, under SCRUM-421) is the only concrete issue addressed.
- Midterm demo rehearsal/stability itself is an activity, not a piece of
  code or a test — it is **NOT TESTED** and **NOT PERFORMED** by this
  session, and should be scheduled separately with the team.
