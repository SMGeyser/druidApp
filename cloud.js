// This is a public browser key, never a service-role key. Authorization is RLS.
export const SUPABASE_URL = 'https://doenexbduxopppqhbtci.supabase.co';
export const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_wx_zkPvooKFA_jgYZlYz5A_7VGEYhTU';
export const authRedirect = () => new URL('./', location.href).href;
async function timedFetch(input, options = {}) {
  const controller = new AbortController(), abort = () => controller.abort(options.signal?.reason);
  if (options.signal?.aborted) abort(); else options.signal?.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(() => controller.abort(new Error('Connection timed out. Retry your saved draft.')), 12000);
  try { return await fetch(input, { ...options, signal: controller.signal }); }
  finally { clearTimeout(timer); options.signal?.removeEventListener('abort', abort); }
}

export async function connectCloud() {
  // A failed SDK load must not prevent opening the guest character.
  const { createClient } = await import('./vendor/supabase.js');
  return createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, { global: { fetch: timedFetch }, auth: {
    flowType: 'pkce', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true,
  } });
}
export function characterBackend(client) {
  const fields = 'id,name,character,revision,updated_at';
  const checked = result => { if (result.error) throw result.error; return result.data; };
  return {
    async list(uid) { return checked(await client.from('characters').select(fields).eq('owner_id', uid).order('updated_at', { ascending: false })); },
    async get(uid, id) { return checked(await client.from('characters').select(fields).eq('owner_id', uid).eq('id', id).maybeSingle()); },
    async insert(uid, id, character) { return checked(await client.from('characters').insert({ id, owner_id: uid, name: character.name, character }).select(fields).single()); },
    async update(uid, id, revision, character) {
      return checked(await client.from('characters').update({ name: character.name, character }).eq('owner_id', uid).eq('id', id).eq('revision', revision).select(fields).maybeSingle());
    },
  };
}
