/**
 * Minimal in-memory stand-in for the Supabase JS client, scoped to the
 * query-builder calls this codebase actually makes:
 *
 *   .from(table).select().eq().order()                (list)
 *   .from(table).select().eq().eq().maybeSingle()      (read one)
 *   .from(table).insert([row]).select().single()       (create)
 *   .from(table).update(fields).eq().eq().select().maybeSingle() (update)
 *   .from(table).delete().eq().eq().select().maybeSingle()       (delete)
 *   .from(table).upsert(row, { onConflict })           (awaited directly)
 *   .auth.admin.createUser(...) / .auth.admin.deleteUser(...)
 *
 * It is intentionally not a general Supabase mock — just enough surface
 * area for authController.js and taskController.js so unit tests can run
 * without a live Supabase project or network access.
 */
 
function createMockSupabase() {
  const store = {};
  let idCounter = 1;
  // taskController.js rejects any id that isn't UUID-shaped, so the mock
  // must hand out real-looking UUIDs instead of "mock-id-N" strings.
  const nextId = () => {
    const n = String(idCounter++).padStart(12, "0");
    return `00000000-0000-4000-8000-${n}`;
  };
 
  const matchFilters = (row, filters) =>
    Object.entries(filters).every(([key, value]) => row[key] === value);
 
  function makeQueryBuilder(table) {
    if (!store[table]) store[table] = [];
 
    let mode = null;
    let filters = {};
    let insertRows = null;
    let updateFields = null;
    let upsertRow = null;
    let upsertOptions = null;
 
    const builder = {
      select() {
        if (!mode) mode = "select";
        return builder;
      },
      eq(column, value) {
        filters[column] = value;
        return builder;
      },
      insert(rows) {
        mode = "insert";
        insertRows = rows;
        return builder;
      },
      update(fields) {
        mode = "update";
        updateFields = fields;
        return builder;
      },
      delete() {
        mode = "delete";
        return builder;
      },
      upsert(row, options) {
        mode = "upsert";
        upsertRow = row;
        upsertOptions = options;
        return builder;
      },
      order(column, opts = {}) {
        const rows = store[table]
          .filter((row) => matchFilters(row, filters))
          .slice()
          .sort((a, b) => {
            const dir = opts.ascending === false ? -1 : 1;
            if (a[column] > b[column]) return dir;
            if (a[column] < b[column]) return -dir;
            return 0;
          });
        return Promise.resolve({ data: rows, error: null });
      },
      single() {
        if (mode === "insert") {
          const newRow = insertRows[0];

          // Generic simulation of the tasks_user_canvas_assignment_unique
          // constraint (see supabase/migrations/002_canvas_assignment_sync.sql).
          // Only engages when the inserted row actually sets
          // canvas_assignment_id, so every other insert (every existing
          // test, every non-Canvas Task) is completely unaffected.
          if (newRow.canvas_assignment_id != null) {
            const conflict = store[table].find(
              (row) =>
                row.user_id === newRow.user_id &&
                row.canvas_assignment_id === newRow.canvas_assignment_id
            );

            if (conflict) {
              return Promise.resolve({
                data: null,
                error: {
                  code: "23505",
                  message:
                    'duplicate key value violates unique constraint "tasks_user_canvas_assignment_unique"',
                },
              });
            }
          }

          const row = {
            id: nextId(),
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            ...newRow,
          };
          store[table].push(row);
          return Promise.resolve({ data: row, error: null });
        }
        return Promise.resolve({
          data: null,
          error: { message: "mock supabase: unsupported single() call" },
        });
      },
      maybeSingle() {
        if (mode === "select") {
          const row =
            store[table].find((row) => matchFilters(row, filters)) || null;
          return Promise.resolve({ data: row, error: null });
        }
        if (mode === "update") {
          const idx = store[table].findIndex((row) =>
            matchFilters(row, filters)
          );
          if (idx === -1) return Promise.resolve({ data: null, error: null });
          store[table][idx] = {
            ...store[table][idx],
            ...updateFields,
            updated_at: new Date().toISOString(),
          };
          return Promise.resolve({ data: store[table][idx], error: null });
        }
        if (mode === "delete") {
          const idx = store[table].findIndex((row) =>
            matchFilters(row, filters)
          );
          if (idx === -1) return Promise.resolve({ data: null, error: null });
          const [removed] = store[table].splice(idx, 1);
          return Promise.resolve({ data: removed, error: null });
        }
        return Promise.resolve({ data: null, error: null });
      },
      // Makes the builder awaitable on its own, which is how the codebase
      // uses upsert() (no .select()/.single() afterwards).
      then(resolve, reject) {

        if (mode === "select") {
          const rows = store[table].filter((row) =>
          matchFilters(row, filters)
          );

          return Promise.resolve({
            data: rows,
            error: null,
         }).then(resolve, reject);
        }
        
        if (mode === "upsert") {
          const key = upsertOptions?.onConflict || "id";
          const idx = store[table].findIndex(
            (row) => row[key] === upsertRow[key]
          );
          if (idx === -1) {
            store[table].push({ ...upsertRow });
          } else {
            store[table][idx] = { ...store[table][idx], ...upsertRow };
          }
          return Promise.resolve({ data: [upsertRow], error: null }).then(
            resolve,
            reject
          );
        }
        return Promise.resolve({ data: null, error: null }).then(
          resolve,
          reject
        );
      },
    };
 
    return builder;
  }
 
  // store[table] is otherwise only created lazily inside makeQueryBuilder(),
  // on a table's first .from() call. A test that seeds __store directly
  // (e.g. pushing a fixture row before ever calling .from() on that table)
  // would hit that table before anything lazily creates it - this proxy
  // auto-vivifies the same way .from() does, so direct __store access is
  // safe regardless of what has or hasn't run yet.
  const storeAccessor = new Proxy(store, {
    get(target, key) {
      if (typeof key === "string" && !(key in target)) {
        target[key] = [];
      }
      return target[key];
    },
  });

  const client = {
    auth: {
      admin: {
        createUser: jest.fn(async ({ email }) => ({
          data: { user: { id: nextId(), email } },
          error: null,
        })),
        deleteUser: jest.fn(async () => ({ error: null })),
      },
    },
    from(table) {
      return makeQueryBuilder(table);
    },
    __store: storeAccessor,
    __reset() {
      Object.keys(store).forEach((key) => {
        store[key] = [];
      });
      idCounter = 1;
      client.auth.admin.createUser.mockClear();
      client.auth.admin.deleteUser.mockClear();
    },
  };
 
  return client;
}
 
module.exports = { createMockSupabase };
 
