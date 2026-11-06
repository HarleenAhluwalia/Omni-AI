# CC6.3 — Supabase RLS and Privileged Access Audit

**Jira task:** S03 — Audit Supabase RLS Policies and Privileged Database Access; updated to cover S08 — Validate Supabase Authorization Against a Test Database
**Originally created in:** PR Batch 4 — SOC 2 CC6.3 Access Management Security Foundation
**Updated in:** PR Batch 5 — CC6.3 Security Remediation and Authorization Verification
**Date:** 2026-11-05

**This audit is repository-based only.** This session has no live
Supabase project credentials and made no connection to any Supabase
instance. Every finding below is either (a) directly verified from
repository source/SQL, or (b) explicitly marked unverifiable without
live access. **Nothing here claims RLS is enabled, disabled, secure,
or insecure** — only what the repository does and does not define, and
what that implies.

---

## 1. Which tables store user-specific information

From `supabase/migrations/001_initial_schema.sql` and `002_canvas_assignment_sync.sql`:

| Table | User-scoping column | Notes |
|---|---|---|
| `profiles` | `id` (= `auth.users.id`) | One row per authenticated user |
| `tasks` | `user_id` | Also carries `canvas_assignment_id`/`canvas_course_id`/`canvas_locked`/`has_due_time` (Canvas/datetime columns added later) |
| `schedules` | `user_id` | Optionally references a `task_id` |
| `preferences` | `user_id` | One row per user (unique constraint) |
| `notification_settings` | `user_id` | One row per user (unique constraint) |

All five tables store information specific to one student and are
exactly the data CC6.3 requires isolating.

## 2. Which access paths use privileged credentials

**All of them.** `server/config/supabase.js` constructs its client
with:
```js
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
```
Every controller/service that queries `tasks`, `schedules`,
`preferences`, or `notification_settings` imports this exact module:
`taskController.js`, `scheduleController.js`, `workloadController.js`,
`notificationSettingsController.js`, `dummyCanvasSyncService.js`,
`aiController.js`, `canvasController.js`, `preferencesController.js`
(confirmed by grepping every `require(".../config/supabase")` in the
codebase). No credential value is reproduced here, per rule 10 — only
the environment variable name.

The **only** lower-privileged client in the codebase is constructed
separately inside `src/controllers/authController.js`, using
`SUPABASE_ANON_KEY`/`SUPABASE_PUBLISHABLE_KEY`, and is used exclusively
for Supabase Auth operations (`signInWithPassword`, etc.) — it never
queries `tasks`/`schedules`/`preferences`/`notification_settings`
directly.

## 3. Which access restrictions are enforced by the backend

Every restriction that actually protects this application's user data
is enforced in **application code**, not the database: `requireAuth`
(JWT verification) on every data route except `/api/schedules` (see
`cc63-authorization-review.md`), followed by `.eq("user_id", req.user.id)`
in each controller's Supabase query. This is confirmed by direct code
reading across every controller.

## 4. Whether repository SQL defines RLS policies

**No.** A case-insensitive search of all four migration files
(`001_initial_schema.sql` through `004_study_preferences.sql`) for
`CREATE POLICY`, `ENABLE ROW LEVEL SECURITY`, and `RLS` found zero
policy-defining statements. The only match is `001_initial_schema.sql`'s
own provenance comment:

> Row Level Security: PostgREST's schema endpoint doesn't expose
> policies, and this session only had the service-role key, which
> bypasses RLS. Any policies protecting these tables are NOT captured
> here — export them separately (Database > Policies) if the team
> wants them versioned.

This confirms the repository has never versioned RLS policy
definitions, by design limitation of how that migration was originally
reverse-engineered (service-role access cannot see policies through
PostgREST).

## 5. Which RLS policies cannot be verified without live Supabase access

**All of them.** Since the repository defines none and the service-role
key (the only credential ever used against these tables) bypasses RLS
regardless of what's configured, there is no way to determine from this
repository whether the live Supabase project has:
- No RLS policies at all on `tasks`/`schedules`/`preferences`/`notification_settings`/`profiles`
- RLS enabled with policies that happen to mirror the application's own `user_id` filtering
- RLS enabled with policies that are stricter, looser, or simply different from the application's assumptions

Direct dashboard access (Database > Policies) or a `pg_policies` query
against the live project, run by someone with appropriate
non-service-role credentials, is required to know. **Marked BLOCKED —
not PASS, not FAIL.**

## 6. Whether service-role access bypasses RLS

**Yes — confirmed, not an assumption.** This is standard, documented
Supabase/PostgREST behavior: the service-role key is explicitly designed
to bypass Row Level Security for trusted server-side use. Since every
data-table access path in this backend (§2 above) uses that key, **RLS
policies — whatever they are — have no effect on this application's
actual behavior today.** The real (and only) access boundary for Task/
schedule/preference/notification data is the application-layer
`user_id` filtering audited in `cc63-authorization-review.md` — which is
exactly why that review's finding (the `/api/schedules` gap) is a *full*
security gap, not one RLS happens to backstop.

## 7. Which authorization tests require a dedicated test database

Every test in this Sprint's suite (`taskAuth.test.js`,
`securityLogging.taskAccess.test.js`, `canvasMockIntegration.test.js`,
`crossComponentSync.test.js`, `cc63ScheduleAuthorizationGap.test.js`)
runs against the mocked Supabase client (`helpers/supabaseMock.js`),
which has no concept of RLS at all — it is a plain in-memory store with
no policy engine. None of them prove anything about live RLS.

**Tests that would need a real (non-production, dedicated) Supabase
project with the real schema and whatever real RLS policies exist:**
- Confirming RLS actually rejects a cross-user row read/write when
  attempted with a *non-service-role* (e.g., anon or a per-user) key —
  the mock cannot simulate a policy engine.
- Confirming the composite Canvas uniqueness index
  (`tasks_user_canvas_assignment_unique`, migration 002) behaves
  identically live as it does in the mock's simulation of it.
- Confirming the foreign-key cascade behavior on `schedules.task_id` →
  `tasks.id` deletion (flagged as an open discrepancy in prior Sprint 4
  database-integrity work — the mock orphans the row; real Postgres's
  default `NO ACTION` might instead reject the delete).

---

## Potential risks (repository-evidenced, not live-confirmed)

1. **`/api/schedules` has no authentication at all** (§2/§3 combined with the authorization review) — since RLS cannot be relied on either (service-role bypasses it), there is currently **no layer at all** protecting schedule data from an unauthenticated, cross-user read or write. This is the most severe finding of this audit.
2. If the live Supabase project has no RLS configured (unconfirmed), then the moment any code path ever used a lower-privileged key against these tables, there would be zero protection at the database layer — the application's own filtering is doing 100% of the work today, with no defense-in-depth.

## Recommended tests (once live access is available)

- A live (non-production) Supabase project, queried with an anon/per-user key rather than the service-role key, attempting the exact cross-user scenarios `taskAuth.test.js` already covers against the mock — to confirm whether RLS independently enforces the same isolation, as a defense-in-depth check.
- `DB-LIVE-001` through `006` from the Sprint 4 database-integrity test documentation (`database-integrity-test-cases.md`) — already identified, not yet executed, directly relevant here too.

## S08 update (PR Batch 5): live Supabase authorization — still BLOCKED

This session checked whether a **dedicated, non-production Supabase
test environment** is available before attempting any live
verification. `server/.env` and `client/.env`/`client/.env.local`
exist locally, but nothing in this repository distinguishes them as a
separate, disposable test project rather than the same shared project
referenced throughout prior sprints' migration provenance notes
(`001_initial_schema.sql`'s own comments: "Do not reapply blindly to
the shared database"). Per rule 6 ("do not access production user data
or use production database credentials") and the explicit instruction
to mark S08 BLOCKED when no dedicated test environment is available,
**this session did not read the contents of any `.env` file or attempt
any live connection.**

**Status: BLOCKED.** No claim of live verification is made. The
Schedules API fix in this batch (see `cc63-authorization-review.md`)
is verified entirely against the mocked Supabase client, the same as
every other test in this repository.

**Required to unblock S08:**
- A Supabase project explicitly designated and provisioned as a
  disposable test environment (not the shared project), with its own
  URL and an anon (non-service-role) key.
- Explicit authorization to run write operations against it, scoped to
  isolated test fixtures only.
- Someone with access to confirm, before any test runs, that the
  project is not the one real students' data lives in.

## Required access/environment dependencies

- A live Supabase project URL + a **non-service-role** key (anon key is sufficient to test RLS; never the service-role key, which would bypass exactly what's being tested).
- Dashboard or SQL access to list existing policies (`pg_policies` system view, or Database > Policies in the Supabase dashboard).

## Remediation proposals

No RLS policy changes are proposed here — per rule 8, this batch does
not modify Supabase schemas or policies, and doing so responsibly
requires first seeing what (if anything) currently exists live. The
one proposal from this audit is procedural: **whoever has dashboard
access should export the live policies** (if any) so they can be
versioned in this repository, closing the exact gap `001_initial_schema.sql`'s
own provenance notes already flagged from Sprint 2.
