-- Omni-AI UC-4: Smart Notification storage
-- Stores notification records for authenticated students.

create table if not exists public.notifications (
    id uuid primary key default gen_random_uuid(),

    user_id uuid not null
        references public.profiles (id) on delete cascade,

    task_id uuid
        references public.tasks (id) on delete set null,

    type text not null
        check (type in ('upcoming_deadline', 'overdue')),

    message text not null,

    deduplication_key text not null unique,

    is_read boolean not null default false,

    created_at timestamptz not null default now()

);

-- Speed up retrieving a student's newest notifications.
create index if not exists idx_notifications_user_created
    on public.notifications (user_id, created_at desc);

-- Enable Row Level Security for notification records.
alter table public.notifications enable row level security;

-- Allow authenticated students to read their own notifications.
create policy "Students can read their own notifications"
on public.notifications
for select
to authenticated
using (auth.uid() = user_id);