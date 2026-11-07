// Test-only fake SDK: all state is in memory; no network requests or real accounts.
export function createClient() {
  const listeners = new Set(), rows = [];
  const user = { id: '00000000-0000-4000-8000-000000000001', email: 'returning@example.test' };
  let session = null;
  const emit = event => { for (const callback of listeners) callback(event, session); };
  const delay = () => new Promise(resolve => setTimeout(resolve, 700));
  const auth = {
    onAuthStateChange(callback) {
      listeners.add(callback);
      queueMicrotask(() => {
        if (!listeners.has(callback)) return;
        callback('INITIAL_SESSION', session);
        if (new URLSearchParams(location.search).has('test-recovery')) {
          session = { user }; callback('PASSWORD_RECOVERY', session);
        }
      });
      return { data: { subscription: { unsubscribe: () => listeners.delete(callback) } } };
    },
    async getSession() { return { data: { session }, error: null }; },
    async signInWithPassword({ email }) {
      await delay();
      if (email !== 'returning@example.test') return { data: { user: null, session: null }, error: { message: 'Invalid login credentials', code: 'invalid_credentials' } };
      session = { user }; emit('SIGNED_IN'); return { data: { user, session }, error: null };
    },
    async signUp() { await delay(); return { data: { session: null, user: {} }, error: null }; },
    async resetPasswordForEmail() { await delay(); return { data: {}, error: null }; },
    async updateUser() { return { data: { user }, error: null }; },
    async signOut() { session = null; emit('SIGNED_OUT'); return { error: null }; },
  };
  function from() {
    let operation = 'select', values, filters = [], one = false;
    const builder = {
      select() { return this; }, eq(key, value) { filters.push([key, value]); return this; },
      order() { return this; }, insert(value) { operation = 'insert'; values = value; return this; },
      update(value) { operation = 'update'; values = value; return this; },
      single() { one = true; return this; }, maybeSingle() { one = true; return this; },
      then(resolve, reject) {
        try {
          let result;
          if (operation === 'insert') {
            result = { ...values, revision: 1, updated_at: new Date().toISOString() }; rows.push(result);
            result = [result];
          } else {
            result = rows.filter(row => filters.every(([key, value]) => row[key] === value));
            if (operation === 'update') result.forEach(row => Object.assign(row, values, { revision: row.revision + 1, updated_at: new Date().toISOString() }));
          }
          return Promise.resolve({ data: one ? result[0] || null : result, error: null }).then(resolve, reject);
        } catch (error) { return Promise.reject(error).then(resolve, reject); }
      },
    };
    return builder;
  }
  return { auth, from };
}
