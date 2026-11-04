# Security-event logging (SOC 2 CC7.2)

Owner: Jerry Guo — Sprint 4, control **CC7.2 Security Monitoring**.
Code: `server/src/utils/securityLogger.js`, `server/src/utils/failedAuthDetector.js`,
`server/src/middleware/requestId.js`.

## What is logged

One JSON object per line on stdout. Example:

```json
{"timestamp":"2026-11-02T20:15:00.000Z","level":"warn","event":"AUTH_TOKEN_INVALID","reason":"invalid_signature","method":"GET","route":"/api/tasks","status":401,"requestId":"3f2c9a1e-5b7d-4c0e-9d3a-0a1b2c3d4e5f"}
```

| Field | Meaning |
|---|---|
| `timestamp` | UTC, ISO 8601 with milliseconds |
| `level` | `info`, `warn` or `error` |
| `event` | Event identifier (table below) |
| `reason` | Predefined code from `REASONS`; never free text |
| `method` | HTTP method |
| `route` | Normalized path: ids → `:id`, unknown segments → `:param`, query string dropped |
| `status` | HTTP status returned to the caller |
| `requestId` | Server-generated UUID; also returned to the caller as `X-Request-Id` |
| `subject` *(optional)* | First 16 hex chars of SHA-256 of the lower-cased email (salted). Lets repeated failures for one account be correlated without writing the address |
| `errorName`, `errorCode` *(optional)* | Identifier-shaped `name`/`code` of a caught error. The message and stack are never logged |
| `failureCount` *(optional)* | Only on `AUTH_FAILURE_THRESHOLD_EXCEEDED` |

## Events

| Event | Level | Written when | Reasons |
|---|---|---|---|
| `AUTH_LOGIN_FAILED` | warn | Login or OAuth sign-in rejected (401), or account-id mismatch (409) | `password_mismatch`, `no_local_password_hash`, `supabase_invalid_credentials`, `no_user_returned`, `oauth_invalid_session`, `account_id_mismatch` |
| `AUTH_TOKEN_MISSING` | warn | Protected route called with no `Authorization` header, or `Bearer` with no token | `no_authorization_header`, `empty_token` |
| `AUTH_TOKEN_INVALID` | warn | Non-Bearer scheme, undecodable token, bad signature, unsigned token | `malformed_header`, `malformed_token`, `invalid_signature`, `invalid_token` |
| `AUTH_TOKEN_EXPIRED` | warn | Correctly signed token past `exp` | `token_expired` |
| `AUTH_ACCESS_DENIED` | warn | An authenticated user addressed a Task that exists but belongs to someone else | `task_not_owned` |
| `DATABASE_OPERATION_FAILED` | error | A Task query returned an error or threw | `task_*_failed` |
| `BACKEND_SECURITY_ERROR` | error | Auth-service outage, registration/login recovery failure, unhandled exception | `auth_service_unavailable`, `unhandled_exception`, … |
| `AUTH_FAILURE_THRESHOLD_EXCEEDED` | error | 5 failed logins for one account within a rolling 5 minutes | `repeated_login_failures` |

`AUTH_ACCESS_DENIED` does **not** change the API response. A foreign Task and a
nonexistent Task both return the same 404, so callers cannot learn whether
another user's Task exists. After a 404 the server does one extra lookup by id
only (selecting just the `id`) to tell the two cases apart for monitoring.

## What is never logged

Passwords, JWTs or any token fragment, `Authorization` / `Cookie` headers,
request bodies, query strings, raw ids from the URL, email addresses, error
messages and stack traces, Supabase keys and connection strings. This is
enforced by an allowlist in the logger (not by callers remembering to redact)
and verified by `server/tests/securityLogging.redaction.test.js`.

## Configuration

| Variable | Effect |
|---|---|
| `SECURITY_LOG_SALT` | Mixed into the `subject` hash. **Set this in production**; the built-in default is public in the repo, so unsalted subjects can be guessed from a list of emails. |
| `SECURITY_LOG_STDOUT=1` | Emit events during Jest runs. By default the logger is silent when `NODE_ENV=test`. |

## Reviewing the log (CC7.2 process)

1. Collect stdout from the server process (the hosting platform's log view or a redirected file).
2. Filter for `"level":"error"` first; every `AUTH_FAILURE_THRESHOLD_EXCEEDED` and `BACKEND_SECURITY_ERROR` warrants a look.
3. For a suspicious `subject`, filter on that value to see all of its failures and their `requestId`s.
4. Match a user report to a log line using the `X-Request-Id` value from the failing response.
5. Record anything that needs follow-up as a Jira ticket and link the `requestId`.

## Known limits

- The repeated-failure detector is in memory and per process: state is lost on restart and not shared across instances. It raises an alert event; it does not block or rate-limit anyone.
- Logs go to stdout only. Retention, shipping and alerting depend on where the server is hosted and are outside this repository.
- Only login failures feed the detector. Token failures carry no trustworthy account identity.
