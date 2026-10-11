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

## Canvas synchronization endpoints

Implemented in PR 2 (Canvas Assignment Synchronization Engine), built on
PR 1's database columns and mock catalog service
(`server/services/canvasService.js`). Routes live in
`server/src/routes/canvasRoutes.js` / `server/src/controllers/canvasController.js`
and are mounted at `/api/canvas` in `server/src/app.js`, separate from the
read-only `/api/dummy-canvas` catalog browser.

Base path: `/api/canvas`, protected by the same `requireAuth` middleware as
every `/api/tasks` route (ownership from `req.user.id`, never a
client-supplied `user_id`).

### `GET /api/canvas/courses`

Returns the mock catalog from `canvasService.js`, enriched per-user with
whether each assignment has already been imported (cross-referencing the
requesting user's existing `tasks.canvas_assignment_id` values), so the
frontend never has to track import state itself.

```
GET /api/canvas/courses
Authorization: Bearer <jwt>
```
→ `200`:
```json
{
  "success": true,
  "data": {
    "courses": [
      {
        "id": 1,
        "name": "CPSC 491 - Computer Science",
        "assignments": [
          {
            "id": 101,
            "title": "Sprint 3 Report",
            "due_date": "2026-10-12",
            "points": 100,
            "locked": false,
            "imported": false,
            "task_id": null
          }
        ]
      }
    ]
  }
}
```

### `POST /api/canvas/import`

Imports and/or synchronizes one or more Canvas assignments into real Tasks.
Each requested id is processed independently and lands in exactly one of
four outcome buckets — a partial import is a normal outcome, not a server
error. Duplicate ids within the request body are de-duplicated before
processing.

```
POST /api/canvas/import
Authorization: Bearer <jwt>
Content-Type: application/json

{ "assignment_ids": [101, 102, 301, 999] }
```
→ `200`:
```json
{
  "success": true,
  "data": {
    "imported": [
      { "assignment_id": 101, "task": { "...": "a full, newly-created Task object" } }
    ],
    "updated": [
      { "assignment_id": 102, "task": { "...": "the Task object after Canvas-owned fields were refreshed" } }
    ],
    "skipped": [
      { "assignment_id": 301, "reason": "unchanged", "task_id": "uuid" },
      { "assignment_id": 301, "reason": "already_imported", "task_id": "uuid" }
    ],
    "failed": [
      { "assignment_id": 999, "reason": "assignment_not_found" },
      { "assignment_id": 999, "reason": "import_failed", "detail": "..." },
      { "assignment_id": 999, "reason": "update_failed", "detail": "..." }
    ]
  }
}
```

Outcome semantics:
- `imported` — no existing Task had this `canvas_assignment_id` for this
  user, so a new Task was created. New rows are seeded with
  `completion_status: "not_started"`; every other user-managed field
  (`priority`, `estimated_effort_minutes`, `description`) is left unset for
  the user to fill in.
- `updated` — an existing Task for this assignment had at least one
  stale Canvas-owned field (`title`, `due_date`, `point_value`,
  `canvas_course_id`, `canvas_locked`); only those fields were written.
  User-managed fields on the existing Task are never read or modified.
- `skipped` — nothing was written. `reason: "unchanged"` means an existing
  Task already matches the Canvas data exactly; `reason: "already_imported"`
  means a concurrent request imported this assignment first (detected via
  the `tasks_user_canvas_assignment_unique` constraint) and this request
  deferred to that one rather than creating a duplicate or erroring.
- `failed` — nothing was written for this id. `reason: "assignment_not_found"`
  means the id doesn't exist in the mock catalog; `reason: "import_failed"` /
  `"update_failed"` mean the insert/update itself was rejected by the
  database (with `detail` carrying the underlying error message), and no
  other Task in the batch is affected.

Locked assignments (`canvasService.isLocked`) import/update the same way as
any other assignment — `canvas_locked: true` is simply one more
Canvas-owned field — except their `due_date`/`point_value` are `null`
because `canvasService.js` represents missing details on a locked
assignment as `null` rather than inventing a value, and the controller
passes that straight through.

Status codes: `400` for a malformed body (missing/empty/non-array
`assignment_ids`, non-integer or non-positive entries); `401` for
missing/invalid auth; `500` only for a request-wide database failure that
prevented any per-id processing from starting at all (e.g. the initial
lookup of the user's existing Tasks failed) — once per-id processing
begins, failures are reported per-id in the `failed` bucket instead.

## Notification settings

Base path: `/api/notification-settings`, protected by `requireAuth` (owner is
always `req.user.id`; a `user_id` in the query or body is ignored).

### `GET /api/notification-settings`

Returns the caller's settings, or the defaults if nothing is saved yet.

```json
{
  "success": true,
  "data": {
    "enabled": true,
    "reminder_lead_minutes": 1440,
    "frequency": "normal",
    "priority_threshold": "low",
    "delivery_method": "in_app",
    "onboarding_completed": false
  }
}
```

### `PUT /api/notification-settings`

Partial update; send only the fields to change. Returns the full settings
object (same shape as GET).

| Field | Rule |
|---|---|
| `enabled` | boolean |
| `reminder_lead_minutes` | integer >= 0 |
| `frequency` | `low`, `normal`, `high` |
| `priority_threshold` | `low`, `medium`, `high` |
| `delivery_method` | `in_app`, `email`, `push` |
| `onboarding_completed` | boolean (stored on `profiles`) |

Errors: `400` validation (or no updatable fields), `401` missing/invalid
token, `404` profile not found, `500` database error.

> The non-default allowed values are proposed and need confirming with the
> notification owner. Run `supabase/migrations/003_notification_settings_constraints.sql`
> so a user can only have one settings row.
