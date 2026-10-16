# SCRUM-419: Implement New Assignment Import and Task Creation

## Objective and acceptance criteria

Implement synchronization logic that converts new mock Canvas assignments
into Omni-AI Tasks. Assignment information — title, due date, points, and
Canvas identifiers — must be mapped correctly and persisted through the
existing Task API and Supabase database.

## Status

**Already implemented and merged** (Sprint 3 PR 2 — Canvas Assignment
Synchronization Engine, commit `ff47c23`; extended with the course-aware
request format in commit `6e9a8f1` and tested further in commit `f2712ab`).
No new implementation was needed or made for this ticket — this document
verifies the existing behavior against SCRUM-419's stated criteria rather
than rewriting it, per this task's instruction not to duplicate completed
work.

## Implementation details

`server/src/controllers/canvasController.js`, `importAssignments`: when no
existing Task has the requested assignment's `(user_id, canvas_course_id,
canvas_assignment_id)` identity, a new Task is inserted via the same
`tasks` table and `completion_status` convention the rest of the Task API
uses (`buildCanvasOwnedFields`, lines ~33-41). Field mapping:

| Canvas field | Task column |
|---|---|
| `assignment.title` | `title` |
| `assignment.dueDate` (converted to end-of-day UTC) | `due_date` |
| `assignment.points` | `point_value` |
| `assignment.id` | `canvas_assignment_id` |
| `course.id` | `canvas_course_id` |
| `assignment.locked` | `canvas_locked` |

Both the legacy `{assignment_ids: [...]}` and course-aware
`{assignments: [{course_id, assignment_id}]}` request formats are supported
and tested.

## Testing methodology

Integration testing: real Express app + Supertest against a mocked
Supabase client (no live database).

## Test scenarios and results

File: `server/tests/canvasImport.test.js`.

| Test | Result |
|---|---|
| `Canvas sync — new assignment import › creates a real Task and reports it as imported` | PASS |
| `Canvas sync — new assignment import › maps Canvas fields onto the correct Task columns` | PASS |
| `Canvas sync — new assignment import › supports importing multiple assignments in one request` | PASS |
| `Canvas sync — course-aware new assignment import (SCRUM-387) › imports a new assignment using the course-aware request format` | PASS |
| `Canvas sync — course-aware new assignment import (SCRUM-387) › supports importing multiple course-aware assignments from different courses in one request` | PASS |
| `Canvas sync — course-aware new assignment import (SCRUM-387) › scopes course-aware imports to the authenticated user, same as the legacy format` | PASS |

(Full detail on the course-aware scenarios, including invalid-body and
unknown-reference handling, is in
`docs/testing-evidence/sprint-3/SCRUM-387-canvas-new-assignment-tests.md`,
which documents the same underlying implementation under its original
ticket number.)

## Expected vs. actual results

Expected: a new Canvas assignment creates a persisted Task with every field
mapped correctly, under the authenticated user's ownership. Actual: matches
exactly, confirmed via direct assertions against the mock store (not just
the response body).

## Exact test commands used

```
cd server && npx jest tests/canvasImport.test.js --verbose
cd server && npx jest --silent
```

Result: 44/44 passing in `canvasImport.test.js`; 317/317 passing across the
full backend suite (21 suites), confirmed in this session.

## Pass/fail status

**PASS** — implemented, tested, and merged prior to this session; reverified
as part of this session's full regression run.

## Relevant files

- `server/src/controllers/canvasController.js`
- `server/services/canvasService.js`
- `server/tests/canvasImport.test.js`
- `docs/testing-evidence/sprint-3/SCRUM-387-canvas-new-assignment-tests.md` (prior evidence for the same implementation)

## Limitations / unverified scenarios

- Mocked Supabase database only — no live project used or verified.
- No manual UI testing performed for this ticket specifically (frontend
  Canvas import UI is covered under SCRUM-422).
