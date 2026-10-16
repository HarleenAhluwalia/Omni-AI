# SCRUM-421: Implement Locked Assignment and Synchronization Error Handling

## Objective and acceptance criteria

Handle locked Canvas assignments by creating placeholder Tasks containing
available information. Implement error handling for failed synchronization
requests, unavailable assignments, and connection failures, without
corrupting existing Task data.

## Status

**Mostly already implemented and merged**: locked-assignment placeholders
and database-level error handling (`{error}`-shaped Supabase failures) were
already covered. **New work completed this session**: simulated connection
failures (a thrown/rejected error, as opposed to Supabase's own
`{data: null, error: {...}}` return convention) had not been verified —
this was a genuine, confirmed test-coverage gap, now closed.

## Implementation details

No production code changes were required. `canvasController.js`'s
`getCourses` and `importAssignments` already wrap their entire bodies in a
top-level `try { ... } catch (error) { ...; return res.status(500)... }`
(lines ~135-196 and ~287-503), which catches a thrown or rejected error from
the Supabase client the same way it catches an explicit `{error}` return.
This was previously unverified by a test using that specific failure shape
— inspection confirmed the handling already existed; only tests were added.

Locked-assignment handling (`buildCanvasOwnedFields`'s null-passthrough for
`due_date`/`point_value`, pre-existing) was already covered.

## Testing methodology

Failure-injection testing: `supabase.from` is temporarily wrapped to throw
synchronously, and separately to return a rejected Promise, simulating a
genuine connection failure rather than a query-level error response.

## Test scenarios and results

File: `server/tests/canvasImport.test.js`, new describe block
`"Canvas sync — simulated connection failures (SCRUM-421)"`.

| Test | What it verifies | Result |
|---|---|---|
| `returns 500 and does not report success when GET /api/canvas/courses' database call throws` | A synchronously thrown error from the Supabase client is caught by the controller's try/catch, returns `500`/`success:false`. | PASS |
| `returns 500 and does not report success when POST /api/canvas/import's initial lookup rejects (not just returns an error object)` | A rejected Promise (not an `{error}` object) from the initial Task lookup is caught the same way. | PASS |
| `does not corrupt an existing Task when a connection failure happens mid-import` | A pre-existing, unrelated Task is asserted byte-for-byte unchanged after a connection failure during an unrelated import attempt. | PASS |

Pre-existing locked-assignment and database-failure tests (`{error}`-shaped
responses, 2 tests; locked placeholders, 2 tests) continue to pass
unmodified.

## A test-infrastructure regression found and fixed

While adding the "does not corrupt an existing Task" test (which seeds a
Task directly into the mock store before any other call), running it in
isolation reproduced a defect that was found and fixed once already in an
earlier Canvas PR: the shared mock's `__store` was a plain object reference,
so a table's backing array only existed once `.from(table)` had been called
for real at least once. That earlier fix (making `__store` a
self-vivifying `Proxy`) is **absent from the current `main`** — its commit
never actually reached `main`, despite being reported as merged in an
earlier session. It has been reapplied in
`server/tests/helpers/supabaseMock.js` as part of this ticket's work, since
it directly blocked this ticket's new test from running correctly in
isolation. This is a test-infrastructure fix, not a change to
`canvasController.js` or any other production file.

## Expected vs. actual results

Expected: a connection failure (thrown or rejected, not just an `{error}`
return) is caught, reported as `500`, and never corrupts unrelated existing
Task data. Actual: matches exactly, confirmed via a direct before/after
equality check on an unrelated seeded Task.

## Exact test commands used

```
cd server && npx jest tests/canvasImport.test.js -t "connection failure" --verbose
cd server && npx jest tests/canvasImport.test.js --verbose
cd server && npx jest --silent
```

Result: 3/3 new scenarios passing; 44/44 in `canvasImport.test.js`; 317/317
across the full backend suite.

## Pass/fail status

**PASS** — the previously-unverified connection-failure scenario is now
covered and passing; all pre-existing SCRUM-421-relevant tests continue to
pass.

## Relevant files

- `server/src/controllers/canvasController.js` (reviewed, not modified)
- `server/tests/canvasImport.test.js` (extended)
- `server/tests/helpers/supabaseMock.js` (regression fix reapplied)

## Limitations / unverified scenarios

- Mocked Supabase database only — no live project used or verified; a real
  network-level failure against an actual Supabase project was not
  reproduced, only simulated via a thrown/rejected mock call.
- No manual UI testing performed for this ticket (how the frontend surfaces
  a failed sync is covered under SCRUM-422/425's existing error-state UI).
