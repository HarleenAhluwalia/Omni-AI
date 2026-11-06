# CC7.2 Security Logging Review (SOC2-S4-01 / ENG-01)

**Control:** SOC 2 CC7.2 — Security Monitoring
**Assessor:** Jerry Guo · **Date:** 2026-11-02
**Revision reviewed:** `9f5b9a6` (main, "Merge pull request #86 …")
**Method:** Code inspection of the authentication routes, JWT middleware, Task controller, global error handler and CI workflow, followed by running the existing 31 suites (418 tests, all passing) as a baseline.

## 1. State before Sprint 4 changes

| # | Finding | Location | Risk (proposal) |
|---|---|---|---|
| F-1 | There is no logger. 27 scattered `console.error/log` calls; none structured, none carry a request identifier. | `server/**` | R-04 |
| F-2 | `requireAuth` rejects with 401 and logs nothing. "No header" and "malformed header" share one branch and one message; expired and invalid tokens differ only in the response text. | `server/src/middleware/auth.js` | R-02 |
| F-3 | `login` has four silent 401 paths (no password hash, wrong password, Supabase `invalid_credentials`, no user returned) plus a silent 409 on account-id mismatch. OAuth sign-in 401 is also silent. | `server/src/controllers/authController.js` | R-01 |
| F-4 | Task reads/updates/deletes are scoped with `.eq("user_id", …)`, so another user's Task and a nonexistent Task are both "no row" → 404. The application cannot currently tell a cross-user attempt from a typo. | `server/controllers/taskController.js` | R-03 |
| F-5 | Task and auth errors are written with `console.error(error)` (full error object, may include driver/connection text) and some are not logged at all (`if (error)` branches only return a 500). | `taskController.js`, `authController.js`, `app.js` | R-04, R-05 |
| F-6 | The global Express error handler does `console.error(err)` on the whole error object. | `server/src/app.js` | R-05 |
| F-7 | No repeated-failure detection of any kind. | — | R-06 |
| F-8 | CI's `backend-tests` job already runs `npm test` (all of `server/tests/`), so new test files run in CI automatically; there was no job that isolates CC7.2 results as evidence. | `.github/workflows/ci.yml` | — |

**TC-01 dependency (is login failure observable in Express?)** Yes. The backend
verifies local users with bcrypt itself and calls `signInWithPassword` for
accounts missing locally, so every failure passes through `authController.login`.
Supabase audit logs are not required.

## 2. Observations outside CC7.2 (not changed)

- `JWT_SECRET` falls back to the literal `"dev_only_secret_change_me"` when the environment variable is missing, so a misconfigured deployment would sign tokens with a public key.
- CORS defaults to `origin: "*"` when `CLIENT_ORIGIN` is unset.
- Local users are stored in a JSON file (`server/data/users.json`).

## 3. Defect found while testing

### SOC2-DEF-01 — database error text is returned to API clients (FIXED)

Task endpoints return Supabase's error message in the response body on a failed
query (`taskController.js`: list, read, create, update, delete, prioritized,
daily summary and weekly summary), and `register` returns
`authError.message`. A real database error can contain connection details,
constraint names or driver text.

- **Resolution:** after the review, the 8 Task endpoints and `register` were changed to return fixed messages (the same wording the `catch` blocks already used), with the detail going only to `logDatabaseFailure`. The five affected tests (`createTask`, `editTask`, `deleteTask`, `dailySummary`, `weeklySummary`) now assert the fixed message and that the simulated error text is absent, and the `test.failing` guard became a normal test.
- **Why it was not fixed in the first change:** the Sprint 2/3 tests `createTask`,
  `editTask`, `deleteTask` and `dailySummary` assert the leaked text
  (`expect(res.body.error).toMatch(/simulated … failure/i)`). Fixing it means
  changing the response contract and those teammates' tests, which should be a
  deliberate, reviewed change.
- **Regression guard:** `securityLogging.errors.test.js` contains a
  `test.failing` case. It passes while the leak exists and will start failing
  once the leak is fixed — at that point switch it to a normal `test()`.
- **Suggested fix:** return a fixed message (e.g. `"Could not load tasks."`, which the `catch` blocks already use) and log the detail through `logDatabaseFailure`; update the four existing tests.
- **Jira:** to be created — link the ticket here.

## 4. What Sprint 4 changed

See `docs/security-logging.md` for the event catalogue and policy.

| Change | Closes |
|---|---|
| `securityLogger.js`: allowlist-based structured JSON events, route normalization, hashed account subject | F-1, F-5, F-6 |
| `requestId.js`: server-generated id, returned as `X-Request-Id` | F-1 |
| `auth.js`: logs missing / invalid / expired tokens with distinct reason codes; responses unchanged | F-2 |
| `authController.js`: logs every login failure and auth-service error; raw `console.error` calls removed | F-3, F-5 |
| `taskController.js`: after a 404, one id-only lookup logs `AUTH_ACCESS_DENIED` when the Task exists; DB failures logged; raw `console.error` removed. Responses unchanged. | F-4, F-5 |
| `app.js`: request id first in the chain; global handler logs a sanitized event | F-6 |
| `failedAuthDetector.js`: 5 failures / 5 min rolling window, bounded memory | F-7 |
| `ci.yml`: `jerry-cc72-security-monitoring` job; JSON results uploaded as an artifact | F-8 |

**Behavior change to be aware of:** raw `console.error(error)` output was
removed in favor of sanitized events, so stack traces and error messages no
longer appear in the server console. Only `errorName` and `errorCode` are kept.
This is deliberate (R-05) but means debugging a new failure may need a
temporary local `console.error`.
