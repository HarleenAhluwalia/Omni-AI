# CC7.2 Security Monitoring — Test Evidence & Traceability

**Control:** SOC 2 CC7.2 · **Assessor:** Jerry Guo · **Sprint:** 4 (Oct 29 – Nov 5, 2026)
**Related:** `cc7.2-logging-review.md` (ENG-01), `docs/security-logging.md` (event catalogue)

> **Assessment rule (from the proposal):** a criterion is **PASS** only after its
> tests execute successfully *and* the required evidence is captured; otherwise
> FAIL, BLOCKED or NOT TESTED.
>
> **Open items before this record is final:** (1) push the branch and fill in the
> commit SHA and CI build ID below — until a CI run exists, AC-08 is
> **NOT TESTED**; (2) create the Jira ticket for SOC2-DEF-01.

## Run details

| Field | Value |
|---|---|
| Execution date | 2026-11-02 (local run); CI run: *pending* |
| Base commit | `9f5b9a6` |
| Commit SHA under assessment | *fill in after commit* |
| CI build ID | *fill in — format `omni-ai-build-<run>-<sha7>`; printed by the "Generate CC7.2 build ID" step* |
| Environment | Node 22.23.4, Jest 29.7, Supertest 7, mocked Supabase (no network, no real credentials) |
| Command | `cd server && npm run test:security` |
| Local result | 6 suites, **139 / 139 tests passed** (`failedAuthDetector` 15, `securityLogger` 61, `securityLogging.auth` 22, `securityLogging.taskAccess` 14, `securityLogging.errors` 22, `securityLogging.redaction` 5) |
| Regression | Full backend suite: 37 suites, **557 / 557 passed** (418 existing + 139 new) — no existing test was modified |
| Sanity check | Each safeguard was temporarily broken to confirm the tests catch it: disabling every security-event call in `auth.js` → 14 tests failed; removing the ownership lookup → 6 failed; making the logger write error messages → 24 failed. All restored; 139 pass. |

## Acceptance criteria

| ID | Criterion | Status | Actual result | Test file |
|---|---|---|---|---|
| AC-01 | Authentication failure logging | **PASS** (local) | All 5 defined failure scenarios (wrong password; no stored hash; Supabase invalid credentials; Supabase returns no user; invalid OAuth session) emit exactly one `AUTH_LOGIN_FAILED` with the right reason, a valid schema and a `requestId` equal to the response's `X-Request-Id`. Successful login and 400 validation errors emit none. | `securityLogging.auth.test.js` |
| AC-02 | JWT rejection logging | **PASS** (local) | All 8 rejection inputs (no header, `Bearer` only, non-Bearer scheme, two malformed tokens, wrong-key signature, unsigned `alg:none`, expired) emit the matching `AUTH_TOKEN_*` event with the intended reason; a valid token emits none; responses unchanged. | `securityLogging.auth.test.js` |
| AC-03 | Unauthorized Task access monitoring | **PASS** (local) | GET, PUT and DELETE of another user's Task each return 404 and emit one `AUTH_ACCESS_DENIED` (3/3). Task unchanged afterwards. A nonexistent id emits none, and the foreign-task and missing-task responses are byte-identical. | `securityLogging.taskAccess.test.js` |
| AC-04 | Log schema consistency | **PASS** (local) | `validateEvent()` is applied to every event captured in every CC7.2 test (zero problems), and negative tests prove it rejects bad timestamps, levels, events, reasons, statuses, missing and extra fields. | `securityLogger.test.js` + all others |
| AC-05 | Credential protection | **PASS** (local) | 11 dummy secrets (passwords, cookie, API key, service-role key, DB password, query/path/body secrets, OAuth token, JWT claim) plus every segment of 3 JWTs were pushed through 12 request scenarios producing ≥ 9 events. Zero exact matches. No email address, `Bearer`, `Cookie` or `postgres://` text either. | `securityLogging.redaction.test.js` |
| AC-06 | Backend error monitoring | **PASS** (logging and response side; SOC2-DEF-01 fixed) | 8 Task operations × (error result and thrown error where guarded) each emit `DATABASE_OPERATION_FAILED` with the right reason; auth-service outage, login-recovery failure, registration failures, schedule-resolution failure and an unhandled exception emit `BACKEND_SECURITY_ERROR`. No injected message, password or key appears in any log line. Task endpoints and `register` now return fixed messages, so no database error text reaches the response either. | `securityLogging.errors.test.js` |
| AC-07 | Suspicious activity detection | **PASS** (local) | Unit: 4 failures → no alert, 5th → alert; failures older than 5 minutes (including exactly 5:00) do not count; accounts counted independently; memory bounded. Integration: 5 failed logins to `/api/auth/login` for one account raise exactly one `AUTH_FAILURE_THRESHOLD_EXCEEDED`; 8 failures across 8 accounts raise none. Proposed enhancement, now implemented. | `failedAuthDetector.test.js` |
| AC-08 | Automated CI verification | **NOT TESTED** | Job `jerry-cc72-security-monitoring` runs the same command as the local run and uploads the JSON results as an artifact. Becomes PASS once a GitHub Actions run on the pushed commit is green; add the run URL and build ID above. | `.github/workflows/ci.yml` |

## Test cases

| Test | Control | Status | Evidence |
|---|---|---|---|
| TC-01 Failed login event logging | CC7.2 | PASS (local) | `securityLogging.auth.test.js` › TC-01 (8 tests); sample event below |
| TC-02 Missing / invalid / expired JWTs | CC7.2 | PASS (local) | `securityLogging.auth.test.js` › TC-02 (14 tests) |
| TC-03 Cross-user Task authorization monitoring | CC7.2 | PASS (local) | `securityLogging.taskAccess.test.js` (14 tests) |
| TC-04 Backend and database error logging | CC7.2 | PASS (SOC2-DEF-01 found, then fixed) | `securityLogging.errors.test.js` (22 tests; the former `test.failing` guard is now a normal passing test) |
| TC-05 Sensitive information redaction | CC7.2 | PASS (local) | `securityLogging.redaction.test.js` (5 tests) + allowlist tests in `securityLogger.test.js` |
| TC-06 Repeated failed login detection | CC7.2 | PASS (local) | `failedAuthDetector.test.js` (15 tests) |

## Defects

| Ref | Description | Severity | Status |
|---|---|---|---|
| SOC2-DEF-01 | Database/Supabase error text was returned in API response bodies (8 Task endpoints, plus `register`). Fixed: fixed messages returned, detail logged only through the sanitized logger; 5 earlier tests updated. Details in `cc7.2-logging-review.md`. | Medium | **Fixed** — Jira ticket *add link* |

## Sanitized log samples

Produced by the test run (values from the test fixtures, not production data).

```json
{"timestamp":"2026-11-03T01:41:18.735Z","level":"warn","event":"AUTH_TOKEN_INVALID","reason":"invalid_signature","method":"GET","route":"/api/tasks","status":401,"requestId":"49e01bf6-5e5e-4fc8-ad24-06d0f60f5be5"}
{"timestamp":"2026-11-03T01:43:37.338Z","level":"warn","event":"AUTH_ACCESS_DENIED","reason":"task_not_owned","method":"PUT","route":"/api/tasks/:id","status":404,"requestId":"4292579f-16af-4a91-a1a3-8079410ddf5c"}
{"timestamp":"2026-11-03T01:43:37.325Z","level":"warn","event":"AUTH_LOGIN_FAILED","reason":"password_mismatch","method":"POST","route":"/api/auth/login","status":401,"requestId":"9bbec3ef-2438-45fb-b83f-3482e880b17d","subject":"661f46e8184e363a"}
```

## Where the evidence lives

GitHub pull request(s) and commits for this branch · GitHub Actions run and its
`cc72-security-monitoring-results-<build-id>` artifact (full per-test JSON) ·
this file and `cc7.2-logging-review.md` · Jira SOC2-S4-01 … SOC2-S4-06.
