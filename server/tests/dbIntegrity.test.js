// Sprint 5 - database integrity tests against a REAL Supabase test project (Jerry)
//
// The mocked client cannot enforce foreign keys or unique constraints, so these
// run against a dedicated Supabase TEST project (SCRUM-377). They are skipped
// automatically when the credentials are absent, so a normal `npm test` and the
// existing CI jobs stay green.
//
// Required environment (use a throwaway project, never production):
//   TEST_SUPABASE_URL
//   TEST_SUPABASE_SERVICE_KEY
//
// ASSUMPTIONS - verify table and column names against the migrations
// (see migration 003_notification_settings_constraints.sql):
//   profiles(id uuid pk, ...)               notification_settings(user_id uuid, ...)
//   tasks(id uuid pk, user_id uuid -> profiles.id, title text, ...)
//   the profile row can be inserted directly (adjust if it must exist in auth.users first)

const { createClient } = require('@supabase/supabase-js');

const URL = process.env.TEST_SUPABASE_URL;
const KEY = process.env.TEST_SUPABASE_SERVICE_KEY;
const run = URL && KEY ? describe : describe.skip;

run('database integrity (real Supabase test project)', () => {
  let db;
  const created = { profiles: [] };
  const uuid = () => require('crypto').randomUUID();

  const makeProfile = async () => {
    const id = uuid();
    const { error } = await db.from('profiles').insert({ id, email: `${id}@integrity.test` }); // ADJUST columns
    if (error) throw error;
    created.profiles.push(id);
    return id;
  };

  beforeAll(() => {
    db = createClient(URL, KEY, { auth: { persistSession: false } });
  });

  afterAll(async () => {
    if (db && created.profiles.length) {
      await db.from('profiles').delete().in('id', created.profiles); // cascades clean the rest
    }
  });

  test('notification_settings: only one row per user', async () => {
    const userId = await makeProfile();
    const first = await db.from('notification_settings').insert({ user_id: userId });
    expect(first.error).toBeNull();
    const dup = await db.from('notification_settings').insert({ user_id: userId });
    expect(dup.error).not.toBeNull(); // unique violation (Postgres code 23505)
    expect(dup.error.code).toBe('23505');
  });

  test('notification_settings: deleting the profile cascades', async () => {
    const userId = await makeProfile();
    await db.from('notification_settings').insert({ user_id: userId });
    await db.from('profiles').delete().eq('id', userId);
    const { data } = await db.from('notification_settings').select('*').eq('user_id', userId);
    expect(data).toEqual([]);
  });

  test('notification_settings: updated_at refreshes on update', async () => {
    const userId = await makeProfile();
    const ins = await db.from('notification_settings').insert({ user_id: userId }).select().single();
    await new Promise((r) => setTimeout(r, 1100));
    const upd = await db.from('notification_settings').update({ enabled: false }).eq('user_id', userId).select().single();
    expect(new Date(upd.data.updated_at).getTime()).toBeGreaterThan(new Date(ins.data.updated_at).getTime());
  });

  test('tasks: a task cannot reference a user that does not exist', async () => {
    const { error } = await db.from('tasks').insert({ user_id: uuid(), title: 'orphan' }); // ADJUST columns
    expect(error).not.toBeNull();
    expect(error.code).toBe('23503'); // foreign_key_violation
  });

  test('tasks: required fields are enforced', async () => {
    const userId = await makeProfile();
    const { error } = await db.from('tasks').insert({ user_id: userId }); // no title
    expect(error).not.toBeNull();
    expect(error.code).toBe('23502'); // not_null_violation
  });

  test('tasks: deleting the profile removes its tasks', async () => {
    const userId = await makeProfile();
    await db.from('tasks').insert({ user_id: userId, title: 'cascade me' });
    await db.from('profiles').delete().eq('id', userId);
    const { data } = await db.from('tasks').select('id').eq('user_id', userId);
    expect(data).toEqual([]);
  });
});
