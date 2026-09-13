# Task API contract

Base URL (local dev): `http://localhost:3000/api`

Frontend code should consume this contract rather than inventing its own
field names or talking to Supabase directly. If a field needs to change,
update the database, this doc, and the controller together — see
[`database-contract.md`](./database-contract.md) for the underlying schema.

## Endpoints

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/tasks` | List all tasks |
| `GET` | `/tasks/:id` | Get one task |
| `POST` | `/tasks` | Create a task |
| `PUT` | `/tasks/:id` | Update a task |
| `DELETE` | `/tasks/:id` | Delete a task |

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

## POST /tasks

Required: `title`, `user_id`.

> **Known gap:** `user_id` is currently taken from the request body because
> there's no auth/session middleware yet. Once login is wired up, this
> should be derived from the authenticated session (`req.user.id`) instead
> — as written today, any client can create a task for any user by passing
> an arbitrary `user_id`.

```
POST /api/tasks
Content-Type: application/json

{ "title": "Read chapter 4", "user_id": "<profile uuid>", "priority": "medium" }
```
→ `201` with the created task.

## PUT /tasks/:id

Any subset of `title`, `description`, `due_date`, `point_value`,
`estimated_effort_minutes`, `priority`, `completion_status`. `user_id`
cannot be changed via this endpoint.

```
PUT /api/tasks/<id>
Content-Type: application/json

{ "completion_status": "completed" }
```
→ `200` with the updated task, or `404` if the id doesn't exist.

## DELETE /tasks/:id

→ `200` with the deleted task, or `404` if the id doesn't exist.

## Verification

All five operations above were run against the live database (not mocks) on
2026-09-11 — full request/response evidence is in the verification report:
https://claude.ai/code/artifact/b0049f3f-8ee0-4f90-8d6b-67ff4be2cde0
