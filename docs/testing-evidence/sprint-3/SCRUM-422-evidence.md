# SCRUM-422: Integrate Canvas Synchronization with Omni AI Features

## Objective and acceptance criteria

Integrate Canvas synchronization with the existing Omni AI application.
Imported Tasks must appear correctly in Calendar, To-Do, and AI
reprioritization workflows. Support synchronization status reporting
(successful imports, updates, skipped assignments, errors).

## Status

**Frontend status reporting was already implemented**
(`CanvasIntegration.jsx`, merged). **New work completed this session**:
explicit integration tests proving a Canvas-imported Task flows into the
Task list (Calendar/To-Do's shared data source) and into AI
reprioritization — this cross-feature verification was previously missing,
as flagged in the pre-implementation assessment ("Frontend integration
implemented; full-system verification remains").

## Implementation details

No production code changes were required or made. Inspection confirmed:

- A Canvas-imported Task is an ordinary row in the `tasks` table (tagged
  with `canvas_assignment_id`/`canvas_course_id`/`canvas_locked`); neither
  `server/controllers/taskController.js`'s `getTasks`, nor
  `client/src/pages/CalendarView.jsx`, nor
  `client/src/pages/PrioritizedTodo.jsx` contain any filter that excludes or
  special-cases Canvas-tagged rows (confirmed by grep — zero matches for
  `canvas` in any of these three files).
- `server/src/controllers/aiController.js`'s `chat` handler fetches
  `supabase.from("tasks").select(...).eq("user_id", userId)` with no
  additional filter, so a Canvas-imported Task is included in
  `calculateTaskPriority` scoring like any other Task.
- Synchronization status reporting already exists end-to-end:
  `CanvasIntegration.jsx` displays a 4-stat row (imported/updated/
  skipped/failed) and a per-item "Failed Assignments" list with reasons,
  sourced directly from `POST /api/canvas/import`'s response.

## Testing methodology

Integration testing: a real Canvas import via `POST /api/canvas/import`,
followed by a call to the actual endpoint each downstream feature uses
(`GET /api/tasks` for Calendar/To-Do's data source;
`POST /api/ai/chat` for AI reprioritization), asserting the imported Task is
present and correctly attributed in each.

## Test scenarios and results

File: `server/tests/canvasCrossFeatureIntegration.test.js` (new).

| Test | Result |
|---|---|
| `Canvas integration — appears in the Task list (Calendar / To-Do source) (SCRUM-422) › a Canvas-imported Task appears in GET /api/tasks, the same endpoint Calendar and the To-Do list read from` | PASS |
| `Canvas integration — included in AI reprioritization (SCRUM-422) › a Canvas-imported Task is included in the task list sent to AI prioritization via POST /api/ai/chat` | PASS |

## Expected vs. actual results

Expected: a Canvas-imported Task appears in `GET /api/tasks` with its
Canvas identifiers intact, and is included in the task array passed to
`calculateTaskPriority`/`askAI`. Actual: matches exactly — confirmed via
direct assertion on the `GET /api/tasks` response body and on the exact
arguments `askAI` was called with (mocked, per existing `ai.test.js`
convention).

## Exact test commands used

```
cd server && npx jest tests/canvasCrossFeatureIntegration.test.js --verbose
cd server && npx jest --silent
```

Result: 4/4 passing in the new file; 317/317 across the full backend suite.

## Pass/fail status

**PASS** for the backend/API-level integration verified here.
**UNVERIFIED** for the literal rendered Calendar and To-Do UI components
(see limitations).

## Relevant files

- `server/tests/canvasCrossFeatureIntegration.test.js` (new)
- `server/src/controllers/aiController.js` (reviewed, not modified)
- `server/controllers/taskController.js` (reviewed, not modified for this ticket)
- `client/src/pages/CalendarView.jsx`, `client/src/pages/PrioritizedTodo.jsx` (reviewed, not modified)
- `client/src/pages/CanvasIntegration.jsx` (reviewed, not modified — status reporting pre-existing)

## Limitations / unverified scenarios

- Mocked Supabase database only — no live project used or verified.
- **No manual UI testing was performed.** This evidence proves the Canvas
  Task reaches the same API endpoints `CalendarView.jsx` and
  `PrioritizedTodo.jsx` call, and reaches the AI endpoint's scoring input —
  it does not prove the rendered calendar grid or To-Do list visually
  displays it correctly, since this repo has no component-render test
  harness (no jsdom/React Testing Library configured). A manual click-through
  is recommended before the midterm demo.
- The AI test asserts the Canvas Task is present in the array passed to
  `askAI`; it does not verify the AI's actual prioritization *decision*
  changes appropriately (that is `priorityService.js`'s own concern, already
  covered by `priorityService.test.js` and `priorityServiceEdgeCases.test.js`
  independently of Canvas).
