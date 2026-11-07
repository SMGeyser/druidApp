// Guest storage and account drafts deliberately use separate keys. No guest data
// is uploaded by signing in; importing it is an explicit library action.
export const GUEST_KEY = 'moonwild.character.v1';
export const accountKey = id => `moonwild.account.v1.${id}`;
const copy = value => JSON.parse(JSON.stringify(value));
const message = error => error?.message || 'Connection unavailable. Your draft is on this device.';
const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object'
  ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
const equal = (a, b) => JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));

export class CharacterStore {
  constructor({ storage, normalize, defaults, backend, changed = () => {}, delay = 700, uuid = () => crypto.randomUUID() }) {
    Object.assign(this, { storage, normalize, defaults, backend, changed, delay, uuid });
    this.user = null; this.epoch = 0; this.records = {}; this.current = null;
    this.status = 'guest'; this.error = ''; this.timer = null; this.runner = null;
    this.storageError = false; this.refreshGeneration = 0;
    this.character = this.readGuest();
  }
  read(key, fallback) { try { return JSON.parse(this.storage.getItem(key)) ?? fallback; } catch { return fallback; } }
  write(key, value) {
    try { this.storage.setItem(key, JSON.stringify(value)); this.storageError = false; return true; }
    catch { this.storageError = true; this.error = 'Browser storage is unavailable. Export this character before leaving.'; return false; }
  }
  readGuest() { return this.normalize(this.read(GUEST_KEY, null)); }
  emit(replace = false) { this.changed(this.snapshot(), replace); }
  snapshot() {
    const record = this.records[this.current];
    return { user: this.user, character: this.character, current: this.current, status: this.status,
      error: this.error, storageError: this.storageError, conflict: record?.conflict || null,
      records: Object.values(this.records).map(r => ({ id: r.id, name: r.character.name, level: r.character.level,
        dirty: r.dirty, isNew: r.isNew, conflict: !!r.conflict, updatedAt: r.updatedAt })) };
  }
  persist() {
    if (!this.user) return this.write(GUEST_KEY, this.character);
    return this.write(accountKey(this.user.id), { selected: this.current, records: this.records });
  }
  edit(character) {
    this.character = copy(character);
    if (!this.user) { this.status = 'guest'; this.persist(); this.emit(); return; }
    if (!this.current) {
      this.current = this.uuid();
      this.records[this.current] = { id: this.current, character: this.character, revision: null, isNew: true, seq: 0 };
    }
    const record = this.records[this.current];
    record.character = this.character; record.seq++; record.dirty = true;
    this.status = record.conflict ? 'conflict' : 'pending'; this.error = '';
    this.persist(); this.emit(); this.schedule();
  }
  schedule() { clearTimeout(this.timer); this.timer = setTimeout(() => { this.flush(); }, this.delay); }
  async setUser(user) {
    if (this.user?.id === user?.id) { this.user = user; this.emit(); return; }
    clearTimeout(this.timer); this.epoch++; this.user = user; this.error = ''; this.storageError = false;
    this.records = {}; this.current = null;
    if (!user) { this.character = this.readGuest(); this.status = 'guest'; this.emit(true); return; }
    const cached = this.read(accountKey(user.id), {});
    for (const [id, r] of Object.entries(cached.records || {})) {
      if (r?.id !== id || !r.character || !Number.isInteger(r.seq)) continue;
      this.records[id] = { ...r, character: this.normalize(r.character) };
    }
    this.current = this.records[cached.selected] ? cached.selected : null;
    this.character = this.current ? copy(this.records[this.current].character) : this.defaults();
    this.status = 'loading'; this.emit(true);
    await this.refreshLibrary();
  }
  async refreshLibrary() {
    if (!this.user) return;
    const epoch = this.epoch, uid = this.user.id, generation = ++this.refreshGeneration;
    if (this.runner?.epoch === epoch) await this.runner.promise;
    if (epoch !== this.epoch || generation !== this.refreshGeneration) return;
    this.status = 'loading'; this.error = ''; this.emit();
    try {
      const rows = await this.backend.list(uid);
      if (epoch !== this.epoch || generation !== this.refreshGeneration) return;
      for (const row of rows) {
        const local = this.records[row.id];
        // A list response may have taken its snapshot before a concurrent save.
        if (local && !local.isNew && row.revision < local.revision) continue;
        if (local?.dirty) {
          if (local.isNew || row.revision > local.revision) local.conflict = row;
        } else this.records[row.id] = this.fromRow(row);
      }
      if (!this.current) this.current = rows[0]?.id || Object.keys(this.records)[0] || null;
      this.character = this.current ? copy(this.records[this.current].character) : this.defaults();
      this.status = this.records[this.current]?.conflict ? 'conflict' : Object.values(this.records).some(r => r.dirty) ? 'pending' : 'saved';
      this.persist(); this.emit(true);
      if (this.status === 'pending') this.schedule();
    } catch (error) {
      if (epoch !== this.epoch || generation !== this.refreshGeneration) return;
      this.status = 'offline'; this.error = message(error); this.emit();
    }
  }
  fromRow(row) { return { id: row.id, character: this.normalize(row.character), revision: row.revision,
    updatedAt: row.updated_at, seq: 0, dirty: false, isNew: false, conflict: null }; }
  async flush() {
    clearTimeout(this.timer);
    if (!this.user) return !this.storageError;
    const epoch = this.epoch, uid = this.user.id;
    if (this.runner?.epoch === epoch) return this.runner.promise;
    const work = async () => {
      while (epoch === this.epoch) {
        const record = Object.values(this.records).find(r => r.dirty && !r.conflict);
        if (!record) {
          this.status = Object.values(this.records).some(r => r.conflict) ? 'conflict' : 'saved';
          this.emit(); return this.status === 'saved' && !this.storageError;
        }
        const seq = record.seq, payload = copy(record.character), revision = record.revision;
        this.status = 'saving'; this.error = ''; this.emit();
        try {
          const row = record.isNew ? await this.backend.insert(uid, record.id, payload)
            : await this.backend.update(uid, record.id, revision, payload);
          if (epoch !== this.epoch) return false;
          if (!row) {
            record.conflict = await this.backend.get(uid, record.id) || { missing: true };
            if (epoch !== this.epoch) return false;
            this.status = 'conflict'; this.error = 'Another session saved a newer version. Choose how to keep your changes.';
            this.persist(); this.emit(); return false;
          }
          record.revision = row.revision; record.updatedAt = row.updated_at; record.isNew = false;
          record.dirty = seq !== record.seq; record.conflict = null;
          this.persist(); this.emit();
        } catch (error) {
          if (epoch !== this.epoch) return false;
          // A timed-out insert can have committed. Read the same UUID before
          // retrying so a retry neither duplicates nor silently overwrites it.
          if (record.isNew) {
            try {
              const row = await this.backend.get(uid, record.id);
              if (epoch !== this.epoch) return false;
              if (row && equal(row.character, payload)) {
                record.revision = row.revision; record.updatedAt = row.updated_at;
                record.isNew = false; record.dirty = seq !== record.seq; this.persist(); continue;
              }
              if (row) { record.conflict = row; this.status = 'conflict'; this.persist(); this.emit(); return false; }
            } catch { /* retain the exact draft and retry explicitly */ }
          }
          if (epoch !== this.epoch) return false;
          this.status = 'offline'; this.error = message(error); this.persist(); this.emit(); return false;
        }
      }
      return false;
    };
    const promise = work(); this.runner = { epoch, promise };
    try { return await promise; } finally { if (this.runner?.promise === promise) this.runner = null; }
  }
  async select(id) {
    const epoch = this.epoch;
    await this.flush();
    if (epoch !== this.epoch || !this.records[id]) return false;
    this.current = id; this.character = copy(this.records[id].character);
    this.status = this.records[id].conflict ? 'conflict' : this.records[id].dirty ? 'pending' : 'saved';
    this.persist(); this.emit(true); return true;
  }
  async create(character) {
    if (!this.user) return false;
    const epoch = this.epoch;
    await this.flush();
    if (epoch !== this.epoch) return false;
    this.current = null; this.edit(this.normalize(copy(character))); this.emit(true);
    return this.flush();
  }
  async keepBoth() {
    const record = this.records[this.current];
    if (!record?.conflict || !this.user) return false;
    const local = copy(record.character), remote = record.conflict;
    if (remote.missing) delete this.records[record.id]; else this.records[record.id] = this.fromRow(remote);
    local.name = `${local.name.slice(0,55)} (my copy)`;
    this.current = null; this.edit(local); this.emit(true); return this.flush();
  }
  useServer() {
    const record = this.records[this.current];
    if (!record?.conflict || record.conflict.missing) return;
    this.records[record.id] = this.fromRow(record.conflict);
    this.character = copy(this.records[record.id].character); this.status = 'saved'; this.error = '';
    this.persist(); this.emit(true);
  }
}
