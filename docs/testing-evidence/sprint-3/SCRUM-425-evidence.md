# SCRUM-425: Build and Integrate Weekly Progress Summary Frontend

## Objective and acceptance criteria

Build the Weekly Progress Summary frontend and connect it to the backend
summary calculations. Display completion metrics, overdue Tasks, upcoming
workload, and relevant progress information. Include appropriate loading,
empty-data, and error states.

## Status

**Mostly already implemented and merged** (Sprint 2):
`client/src/pages/WeeklySummary.jsx` already fetches
`GET /api/tasks/summary/weekly`, and already has loading, error, and
empty-data states (`"No tasks due this week."`, `"No overdue tasks."`).
**New work completed this session**: an explicit "Upcoming" section and
stat tile, to surface the `upcoming` field added to the backend under
SCRUM-423 — before this, the frontend had no way to display upcoming Tasks
at all, since the backend didn't provide them.

## Implementation details

`client/src/pages/WeeklySummary.jsx`:
- Added an "Upcoming" stat tile to the existing stats row
  (Total/Completed/Remaining/Overdue/**Upcoming**), reading
  `counts.upcoming`.
- Added an "Upcoming" section below the existing "Overdue" section,
  rendering `summary.upcoming` with the same `renderTaskRow` used by
  "This Week" and "Overdue", and the same empty-state pattern
  (`"No upcoming tasks this week."` when the array is empty) already
  established for the other sections in this file.

No new components, dependencies, or CSS classes were introduced — the
addition reuses the file's existing `daily-summary-*` class names and
`renderTaskRow` helper exactly as the pre-existing sections do.

## Testing methodology

No component-render test harness exists in this repo (no jsdom/React
Testing Library configured for the `node --test` runner used here), so
frontend verification for this ticket is limited to: (a) a production
build, to catch syntax/import errors, and (b) code review against the
backend's actual response shape (confirmed via the SCRUM-423/424 backend
tests) to ensure the new UI reads fields that genuinely exist.

## Test scenarios and results

| Check | Result |
|---|---|
| `npm run build` (production build, client/) | PASS — 82 modules transformed, no errors |
| `npm run test:harleen` (canvasApi + preferences unit tests, unaffected by this change) | PASS — 17/17 |
| `npm run test:prioritized` (prioritized To-Do tests, unaffected) | PASS — 4/4 |

## Expected vs. actual results

Expected: the page renders without build errors and the new section reads
`summary.upcoming`/`counts.upcoming`, which the backend now actually
returns (confirmed in SCRUM-423's evidence). Actual: build succeeds; the
field names match exactly what `getWeeklySummary` returns.

## Exact test commands used

```
cd client && npm run build
cd client && npm run test:harleen
cd client && npm run test:prioritized
```

## Pass/fail status

**PASS** for build correctness and field-shape consistency.
**NOT TESTED** for actual rendered appearance or interaction (see
limitations) — loading/error/empty states for the pre-existing sections
were reviewed by reading the code, not by rendering it.

## Relevant files

- `client/src/pages/WeeklySummary.jsx` (modified)
- `server/controllers/taskController.js` (`getWeeklySummary`, the data source this depends on)

## Limitations / unverified scenarios

- **No manual UI testing was performed.** Whether the new "Upcoming" stat
  tile and section actually render correctly, look right in both the
  populated and empty states, and don't break the existing layout, has not
  been visually confirmed in a browser. This is explicitly recommended
  before the midterm demo.
- Loading and error states for the summary as a whole are pre-existing code,
  reviewed but not re-exercised by any test in this session (there was no
  component harness to do so with before this session either).
