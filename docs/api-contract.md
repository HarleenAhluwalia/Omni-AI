# Task API contract

Base URL (local dev): `http://localhost:4000/api` — set as `VITE_API_URL` in
`client/.env`. (The backend's entry point is `server/src/index.js`, which
reads `PORT` from the environment, default `4000`. It mounts the task routes
from `server/routes/taskRoutes.js` unchanged — see `server/src/app.js`.)

Frontend code should consume this contract rather than inventing its own
field names or talking to Supabase directly. If a field needs to change,
update the database, this doc, and the controller together — see
[`database-contract.md`](./database-contract.md) for the underlying schema.

## Authentication

Every task route is protected by `requireAuth` (`server/src/middleware/auth.js`).
Requests must carry:

```
Authorization: Bearer <jwt>
```

where `<jwt>` is the token issued by `POST /auth/register` or `POST /auth/login`
(see the auth routes). `requireAuth` verifies the token and attaches
`req.user = { id, email }`; the controller uses `req.user.id` as the owning
user for every operation. There is no other way to identify the user —
**`user_id` is never read from the request body or query string**. A
`user_id` field sent in a `POST`/`PUT` body is silently ignored (it isn't in
the controller's writable-fields list), so a client cannot create or
reassign a task to another user.

Missing or invalid tokens get `401`:
- No `Authorization` header, or not `Bearer <token>` → `401`
- Expired token → `401` (`"Session expired. Please log in again."`)
- Token that doesn't verify → `401` (`"Invalid token."`)

> **Known gap**: the Google/Microsoft OAuth buttons in `Login.jsx` sign the
> user into Supabase directly and never obtain one of these backend JWTs.
> A user who only ever authenticates that way will get `401`s from every
> task request until that integration also mints (or exchanges for) this
> token. Email/password login is unaffected.

## Endpoints

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/tasks` | List the authenticated user's tasks |
| `GET` | `/tasks/:id` | Get one task (404 if it isn't this user's) |
| `POST` | `/tasks` | Create a task, owned by the authenticated user |
| `PUT` | `/tasks/:id` | Update a task (404 if it isn't this user's) |
| `DELETE` | `/tasks/:id` | Delete a task (404 if it isn't this user's) |

All responses are JSON, shaped as either:

```json
{ "success": true, "data": ... }
```
```json
{ "success": false, "error": "human-readable message" }
```

## Task object

```json
{
  "id": "uuid",
  "user_id": "uuid",
  "title": "text",
  "description": "text | null",
  "due_date": "timestamp | null",
  "point_value": "number | null",
  "estimated_effort_minutes": "integer | null",
  "priority": "low | medium | high | null",
  "completion_status": "not_started | in_progress | completed",
  "created_at": "timestamp",
  "updated_at": "timestamp"
}
```

`id`, `user_id`, `created_at`, and `updated_at` are never accepted from a
request body — `id`/`created_at`/`updated_at` are set by the database, and
`user_id` is set by the backend from the authenticated session. All four are
ignored if present in the body.

## Validation

Enforced by the controller before any database write:

- `priority`, when present, must be `low`, `medium`, or `high`.
- `completion_status`, when present, must be `not_started`, `in_progress`,
  or `completed`.
- `point_value` and `estimated_effort_minutes`, when present and non-null,
  must be `>= 0`.
- `title` is required on create and, if included on update, can't be blank.

A failed validation returns `400` with an `error` string naming what's wrong
— nothing is written to the database.

## POST /tasks

Required: `title`, plus a valid `Authorization: Bearer <jwt>` header.

```
POST /api/tasks
Authorization: Bearer <jwt>
Content-Type: application/json

{ "title": "Read chapter 4", "priority": "medium" }
```
→ `201` with the created task, owned by the token's user.

## PUT /tasks/:id

Any subset of `title`, `description`, `due_date`, `point_value`,
`estimated_effort_minutes`, `priority`, `completion_status`. `user_id`
cannot be changed via this endpoint — ownership is fixed at creation.

```
PUT /api/tasks/<id>
Authorization: Bearer <jwt>
Content-Type: application/json

{ "completion_status": "completed" }
```
→ `200` with the updated task, or `404` if the id doesn't exist **for that
user** (also returned if the task exists but belongs to someone else).

## DELETE /tasks/:id

```
DELETE /api/tasks/<id>
Authorization: Bearer <jwt>
```
→ `200` with the deleted task, or `404` (same ownership rule as above).

## Verification

`server/tests/tasks.test.js` runs every case below against the in-memory
Supabase mock through the real Express app (no network): create, read
(list + single), update, mark-complete, delete, cross-user ownership
isolation (a second user's `GET`/`PUT`/`DELETE` against the first user's
task correctly returns `404`), rejection of a client-supplied `user_id`
(create and update both keep the authenticated user as owner regardless of
what's in the body), every invalid-input case (bad `priority`, bad
`completion_status`, negative `point_value`/`estimated_effort_minutes`,
missing `title`), and authentication failures (missing or malformed
`Authorization` header → `401`).
