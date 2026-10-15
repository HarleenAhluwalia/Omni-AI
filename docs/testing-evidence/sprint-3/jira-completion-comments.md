# Draft Jira completion comments — Sprint 3 Canvas course-aware testing

These are drafts only. Nothing has been posted to Jira.

---

## SCRUM-387: Test New Assignment Synchronization

**What was tested**: New-assignment import via `POST /api/canvas/import`
using the course-aware `{assignments: [{course_id, assignment_id}]}` request
format — correct Task creation and field mapping, multi-assignment/
multi-course imports in one request, per-user ownership isolation, and
handling of invalid request bodies and unknown course/assignment references.

**Testing methodologies used**: Integration testing (real Express app +
Supertest against a mocked Supabase client) and boundary/negative testing
for invalid and unknown inputs.

**Automated test results**: 5/5 new scenarios passing, 41/41 in
`canvasImport.test.js` overall (25 pre-existing + 16 new), 299/299 across the
full backend suite. No regressions.

**Evidence file**:
`docs/testing-evidence/sprint-3/SCRUM-387-canvas-new-assignment-tests.md`

**Remaining limitations**: tested only against a mocked Supabase database, not
a live project; no manual UI testing performed; `findAssignmentByCourseAndId`
has no dedicated unit test (only indirect coverage via these integration
tests).

**Acceptance criteria**: met, for the scope testable with the current mocked
environment. Recommend confirming with the team whether live-database
verification is required before this moves to Done, given migration 002's
deployment status is still unconfirmed.

---

## SCRUM-388: Test Updated Assignment Synchronization

**What was tested**: Re-sync of an already-imported assignment via the
course-aware format — stale Canvas-owned fields get corrected, user-managed
fields (`completion_status`, `priority`, `estimated_effort_minutes`,
`description`) are never touched, unchanged assignments are skipped with no
write, and correctness holds across a sequence of repeated requests
(create → update → settle unchanged).

**Testing methodologies used**: State-transition testing (seeded stale state
→ assert the resulting transition) and integration testing via the same
Supertest harness as SCRUM-387.

**Automated test results**: 4/4 new scenarios passing, plus the 3 pre-existing
legacy-format update tests still passing unmodified. 299/299 across the full
backend suite.

**Evidence file**:
`docs/testing-evidence/sprint-3/SCRUM-388-canvas-update-tests.md`

**Remaining limitations**: mocked database only; "repeated requests over
time" is simulated by editing the mock store between calls, since the mock
Canvas catalog itself is static; `point_value` numeric-string handling
(the PostgREST quirk) is untested against a real Postgres round trip.

**Acceptance criteria**: met, for the scope testable with the current mocked
environment. Recommend live-database verification before Done, for the same
migration-status reason noted on SCRUM-387.

---

## SCRUM-389: Test Duplicate Prevention and Locked Assignments

**What was tested**: Duplicate prevention under repeated and concurrent
course-aware imports, composite `(user_id, course_id, assignment_id)`
identity (including same assignment id across two different courses, via
isolated fixtures), locked-assignment placeholder behavior, safe handling of
a failure in the duplicate-lookup path, and continued support for the legacy
`assignment_ids` request format.

**Testing methodologies used**: Integration testing, isolated-fixture
testing (for the cross-course same-id scenario the real mock catalog can't
produce), concurrency testing (`Promise.all`), and failure-injection testing
(forced unique-violation + forced re-fetch failure).

**Automated test results**: 7/7 new scenarios passing. The concurrency
scenario was additionally rerun 5 times in isolation with no flakiness.
299/299 across the full backend suite.

**Note**: a pre-existing defect in the shared Supabase test mock was found
and fixed before writing these tests — its duplicate-detection check ignored
`canvas_course_id`, which did not match the real composite unique index in
migration 002. Fixed in `server/tests/helpers/supabaseMock.js` only; no
change was made to `canvasController.js` or any other production file, since
this was a test-infrastructure gap, not a confirmed production bug.

**Evidence file**:
`docs/testing-evidence/sprint-3/SCRUM-389-canvas-duplicate-locked-tests.md`

**Remaining limitations**: mocked database only — the composite unique index
is simulated, not exercised against a real Postgres constraint; no manual UI
testing performed; the cross-course-same-id scenarios rely on fixtures, since
the real mock catalog has no actual id collision across courses.

**Acceptance criteria**: met, for the scope testable with the current mocked
environment. Flagging the test-mock fix for team awareness, since it affects
how confidently duplicate-prevention claims can be made until it's reviewed.
Recommend live-database verification before Done, for the same
migration-status reason noted above.
