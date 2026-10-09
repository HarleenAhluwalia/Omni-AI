-- Sprint 3 (Jerry): make notification_settings enforce "one row per user".
-- Safe to re-run.

-- 1. Keep only the newest row per user so the unique constraint can be added.
delete from public.notification_settings a
using public.notification_settings b
where a.user_id = b.user_id
  and (a.created_at, a.id) < (b.created_at, b.id);

-- 2. One settings row per user.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'notification_settings_user_id_key'
  ) then
    alter table public.notification_settings
      add constraint notification_settings_user_id_key unique (user_id);
  end if;
end $$;

-- 3. Deleting a profile removes its settings.
alter table public.notification_settings
  drop constraint if exists notification_settings_user_id_fkey;
alter table public.notification_settings
  add constraint notification_settings_user_id_fkey
  foreign key (user_id) references public.profiles (id) on delete cascade;

-- 4. updated_at changes on every update.
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists notification_settings_set_updated_at
  on public.notification_settings;
create trigger notification_settings_set_updated_at
  before update on public.notification_settings
  for each row execute function public.set_updated_at();
