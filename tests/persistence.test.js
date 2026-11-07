import test from 'node:test';
import assert from 'node:assert/strict';
import { CharacterStore, GUEST_KEY, accountKey } from '../persistence.js';

const clone = value => JSON.parse(JSON.stringify(value));
const defaults = () => ({ version: 1, name: 'New druid', level: 1, notes: '', abilities: { wisdom: 16 }, known: [] });
const character = (name, notes = '') => ({ ...defaults(), name, notes });
const normalize = value => value?.version === 1 ? clone(value) : defaults();
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const user = id => ({ id, email: `${id}@example.test` });
const row = (id, uid, name, revision = 1) => ({ id, owner_id: uid, name, character: character(name), revision, updated_at: '2026-11-07T00:00:00Z' });

function setup(t, rows = []) {
  const values = new Map(), records = new Map(rows.map(r => [r.id, clone(r)]));
  const storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
  const backend = {
    async list(uid) { return clone([...records.values()].filter(r => r.owner_id === uid)); },
    async get(uid, id) { const r = records.get(id); return r?.owner_id === uid ? clone(r) : null; },
    async insert(uid, id, value) {
      if (records.has(id)) throw Error('duplicate ID');
      const r = { ...row(id, uid, value.name), character: clone(value) }; records.set(id, r); return clone(r);
    },
    async update(uid, id, revision, value) {
      const r = records.get(id);
      if (r?.owner_id !== uid || r.revision !== revision) return null;
      Object.assign(r, { name: value.name, character: clone(value), revision: revision + 1 }); return clone(r);
    },
  };
  let next = 0;
  const store = new CharacterStore({ storage, backend, normalize, defaults, delay: 1000000, uuid: () => `new-${++next}` });
  t.after(() => clearTimeout(store.timer));
  return { store, storage, values, backend, records };
}

test('sign-in, account edits, and sign-out preserve the guest value byte for byte', async t => {
  const { store, storage, values, records } = setup(t, [row('a1', 'a', 'Account druid')]);
  const guest = JSON.stringify(character('Guest Elowen', 'guest notes'), null, 2);
  storage.setItem(GUEST_KEY, guest);
  await store.setUser(user('a'));
  assert.equal(store.character.name, 'Account druid');
  store.edit(character('Account druid', 'private account edit'));
  await store.flush();
  assert.equal(values.get(GUEST_KEY), guest);
  assert.equal(records.get('a1').character.notes, 'private account edit');
  await store.setUser(null);
  assert.equal(store.character.name, 'Guest Elowen');
  assert.equal(store.character.notes, 'guest notes');
  assert.deepEqual(store.snapshot().records, []);
});

test('new accounts start independently and only explicit guest copy uploads guest data', async t => {
  const { store, storage, records } = setup(t);
  storage.setItem(GUEST_KEY, JSON.stringify(character('Guest', 'guest secret')));
  await store.setUser(user('a'));
  assert.equal(store.character.name, 'New druid');
  assert.equal(records.size, 0);
  await store.create(store.readGuest());
  assert.equal(records.size, 1);
  assert.equal([...records.values()][0].character.notes, 'guest secret');
  assert.equal(JSON.parse(storage.getItem(GUEST_KEY)).name, 'Guest');
});

test('offline drafts remain isolated per account and survive reload', async t => {
  const { store, backend, storage } = setup(t, [row('a1', 'a', 'A'), row('b1', 'b', 'B')]);
  await store.setUser(user('a'));
  const update = backend.update;
  backend.update = async () => { throw Error('offline'); };
  store.edit(character('A', 'only account A'));
  assert.equal(await store.flush(), false);
  await store.setUser(user('b'));
  assert.equal(store.character.name, 'B');
  assert.equal(store.character.notes, '');
  assert.equal(JSON.parse(storage.getItem(accountKey('a'))).records.a1.character.notes, 'only account A');
  await store.setUser(null);
  assert.equal(store.character.notes, '');
  const reloaded = new CharacterStore({ storage, backend, normalize, defaults, delay: 1000000 });
  t.after(() => clearTimeout(reloaded.timer));
  await reloaded.setUser(user('a'));
  assert.equal(reloaded.character.notes, 'only account A');
  backend.update = update;
  assert.equal(await reloaded.flush(), true);
  assert.equal(reloaded.snapshot().status, 'saved');
});

test('typing during an in-flight save is serialized and saved at the next revision', async t => {
  const { store, backend, records } = setup(t, [row('a1', 'a', 'A')]);
  await store.setUser(user('a'));
  const gate = deferred(), update = backend.update, seen = [];
  backend.update = async (...args) => { seen.push([args[2], args[3].notes]); if (seen.length === 1) await gate.promise; return update(...args); };
  store.edit(character('A', 'first'));
  const saving = store.flush();
  store.edit(character('A', 'second'));
  gate.resolve();
  assert.equal(await saving, true);
  assert.deepEqual(seen, [[1, 'first'], [2, 'second']]);
  assert.equal(records.get('a1').character.notes, 'second');
  assert.equal(store.snapshot().records[0].dirty, false);
});

test('loading another character flushes edits before switching', async t => {
  const { store, records } = setup(t, [row('a1', 'a', 'First'), row('a2', 'a', 'Second')]);
  await store.setUser(user('a'));
  store.edit(character('First', 'save before switch'));
  await store.select('a2');
  assert.equal(records.get('a1').character.notes, 'save before switch');
  assert.equal(store.character.name, 'Second');
});

test('revision conflict preserves local edits and keep-both retains the remote original', async t => {
  const { store, records } = setup(t, [row('a1', 'a', 'A')]);
  await store.setUser(user('a'));
  store.edit(character('A', 'my edits'));
  records.get('a1').character.notes = 'another device'; records.get('a1').revision++;
  assert.equal(await store.flush(), false);
  assert.equal(store.snapshot().status, 'conflict');
  assert.equal(store.character.notes, 'my edits');
  assert.equal(records.get('a1').character.notes, 'another device');
  assert.equal(await store.keepBoth(), true);
  assert.equal(records.get('a1').character.notes, 'another device');
  assert.equal(records.get('new-1').character.notes, 'my edits');
  assert.equal(store.character.name, 'A (my copy)');
});

test('loading the cloud version resolves a selected conflict explicitly', async t => {
  const { store, records } = setup(t, [row('a1', 'a', 'A')]);
  await store.setUser(user('a'));
  store.edit(character('A', 'my edits'));
  records.get('a1').character.notes = 'remote'; records.get('a1').revision++;
  await store.flush(); store.useServer();
  assert.equal(store.character.notes, 'remote');
  assert.equal(store.snapshot().conflict, null);
});

test('late save and list responses cannot display another account after switching', async t => {
  const { store, backend } = setup(t, [row('a1', 'a', 'A'), row('b1', 'b', 'B')]);
  await store.setUser(user('a'));
  const gate = deferred(), update = backend.update;
  backend.update = async (...args) => { await gate.promise; return update(...args); };
  store.edit(character('A', 'private')); const saving = store.flush();
  await store.setUser(user('b')); gate.resolve(); await saving;
  assert.equal(store.character.name, 'B');
  assert.deepEqual(store.snapshot().records.map(r => r.name), ['B']);
  const listGate = deferred(), list = backend.list;
  backend.list = async uid => { if (uid === 'a') await listGate.promise; return list(uid); };
  const signingIn = store.setUser(user('a'));
  await store.setUser(null); listGate.resolve(); await signingIn;
  assert.equal(store.user, null);
  assert.deepEqual(store.snapshot().records, []);
});

test('a committed insert with a lost response is reconciled despite JSONB key reordering', async t => {
  const { store, backend, records } = setup(t);
  await store.setUser(user('a'));
  const insert = backend.insert, get = backend.get;
  backend.insert = async (...args) => { await insert(...args); throw Error('response lost'); };
  backend.get = async (...args) => {
    const r = await get(...args);
    if (r) r.character = Object.fromEntries(Object.entries(r.character).reverse());
    return r;
  };
  assert.equal(await store.create(character('A', 'safe insert')), true);
  assert.equal(records.size, 1);
  assert.equal(store.snapshot().status, 'saved');
  assert.equal(store.snapshot().records[0].dirty, false);
});

test('a rejected insert reconciliation after sign-out cannot write into guest storage', async t => {
  const { store, backend, storage } = setup(t);
  const original = JSON.stringify(character('Guest', 'untouched'));
  storage.setItem(GUEST_KEY, original);
  await store.setUser(user('a'));
  const gate = deferred();
  backend.insert = async () => { throw Error('offline insert'); };
  backend.get = async () => gate.promise;
  const creating = store.create(character('A', 'private'));
  // create first flushes the old workspace, then inserts and begins reconciliation.
  await new Promise(resolve => setImmediate(resolve));
  await store.setUser(null);
  gate.reject(Error('still offline')); await creating;
  assert.equal(storage.getItem(GUEST_KEY), original);
  assert.equal(store.snapshot().status, 'guest');
  assert.equal(store.character.name, 'Guest');
});

test('a stale list snapshot cannot replace a just-saved newer revision', async t => {
  const { store, backend, records } = setup(t, [row('a1', 'a', 'A')]);
  await store.setUser(user('a'));
  const stale = clone(records.get('a1')), gate = deferred();
  backend.list = async () => { await gate.promise; return [stale]; };
  const refreshing = store.refreshLibrary();
  store.edit(character('A', 'newer edit')); await store.flush();
  gate.resolve(); await refreshing;
  assert.equal(store.character.notes, 'newer edit');
  assert.equal(store.records.a1.revision, 2);
  assert.equal(store.snapshot().conflict, null);
});

test('failed local storage is surfaced, while account edits can still save remotely', async t => {
  const { store, storage, records } = setup(t, [row('a1', 'a', 'A')]);
  await store.setUser(user('a'));
  storage.setItem = () => { throw Error('quota'); };
  store.edit(character('A', 'save remotely'));
  assert.equal(store.snapshot().storageError, true);
  assert.equal(await store.flush(), false);
  assert.equal(records.get('a1').character.notes, 'save remotely');
  assert.match(store.snapshot().error, /Export/);
});
