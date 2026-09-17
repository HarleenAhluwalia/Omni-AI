# Task API contract

Base URL (local dev): `http://localhost:4000/api` — set as `VITE_API_URL` in
`client/.env`. (The backend's entry point is `server/src/index.js`, which
reads `PORT` from the environment, default `4000`. It mounts the task routes
from `server/routes/taskRoutes.js` unchanged — see `server/src/app.js`.)

Frontend code should consume this contract rather than inventing its own
field names or talking to Supabase directly. If a field needs to change,
update the database, this doc, and the controller together — see
[`database-contract.md`](./database-contract.md) for the underlying schema.

## Temporary Sprint 1 auth bridge

There's no login/session middleware wired into Express yet, so **every**
task request — including reads — must say which user it's acting as, via a
`user_id` (query string for `GET`/`PUT`/`DELETE`, request body for `POST`).

> **This is a real, load-bearing gap, not a formality.** Since the backend
> uses the Supabase service-role key (which bypasses Row Level Security),
> `user_id` scoping in the controller is the *only* thing stopping one
> client from reading, editing, or deleting another user's tasks — and
> right now the client just has to know or guess a UUID to do that. Do not
> treat this as safe for anything beyond local Sprint 1 development.
>
> **Local setup**: each developer needs their own Supabase auth user to
> test against. Create one (Supabase dashboard → Authentication → Users, or
> via the admin API), confirm a matching row appears in `profiles` (a
> signup trigger creates it automatically), then add to
> `client/.env.local` (gitignored, per-developer — **not** the committed
> `client/.env`):
> ```env
> VITE_TEST_USER_ID=<that user's uuid>
> ```
> Restart `vite` after changing it. See Section 25 of the Sprint 1 handoff
> for the real migration path off this bridge (auth middleware deriving
> `req.user.id` from a verified session).

## Endpoints

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/tasks?user_id=<uuid>` | List the given user's tasks |
| `GET` | `/tasks/:id?user_id=<uuid>` | Get one task (404 if it isn't this user's) |
| `POST` | `/tasks` | Create a task (`user_id` in the body) |
| `PUT` | `/tasks/:id?user_id=<uuid>` | Update a task (404 if it isn't this user's) |
| `DELETE` | `/tasks/:id?user_id=<uuid>` | Delete a task (404 if it isn't this user's) |

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

`id`, `created_at`, and `updated_at` are set by the database — never send
them in a request body; they're ignored if present.

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

Required: `title`, `user_id`.

```
POST /api/tasks
Content-Type: application/json

{ "title": "Read chapter 4", "user_id": "<uuid>", "priority": "medium" }
```
→ `201` with the created task.

## PUT /tasks/:id?user_id=<uuid>

Any subset of `title`, `description`, `due_date`, `point_value`,
`estimated_effort_minutes`, `priority`, `completion_status`. `user_id`
cannot be changed via this endpoint — ownership is fixed at creation.

```
PUT /api/tasks/<id>?user_id=<uuid>
Content-Type: application/json

{ "completion_status": "completed" }
```
→ `200` with the updated task, or `404` if the id doesn't exist **for that
user** (also returned if the task exists but belongs to someone else).

## DELETE /tasks/:id?user_id=<uuid>

→ `200` with the deleted task, or `404` (same ownership rule as above).

## Verification

All of the following were run against the live database through the real
HTTP API (no mocks): create, read (list + single), update, mark-complete,
delete, refresh-persistence, cross-user ownership isolation (a second
user's `PUT`/`DELETE` against the first user's task correctly returns
`404`), and every invalid-input case in the handoff doc (bad `priority`,
bad `completion_status`, negative `point_value`/`estimated_effort_minutes`,
missing `title`, missing `user_id`).
