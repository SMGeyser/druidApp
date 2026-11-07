-- Initial Moonwild character storage. Safe to rerun; no deletes or public access.
begin;
create table if not exists public.characters (
  id uuid primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 70),
  character jsonb not null,
  revision bigint not null default 1 check (revision > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint characters_valid_payload check (
    jsonb_typeof(character) = 'object' and character->'version' = '1'::jsonb
    and jsonb_typeof(character->'name') = 'string' and character->>'name' = name
    and jsonb_typeof(character->'abilities') = 'object'
    and jsonb_typeof(character->'known') = 'array'
    and octet_length(character::text) <= 2000000
    and character ?& array['version','name','abilities','known']
  )
);
create index if not exists characters_owner_updated_idx on public.characters(owner_id, updated_at desc);
create or replace function public.moonwild_character_revision()
returns trigger language plpgsql set search_path = '' as $$
begin
  if TG_OP = 'INSERT' then
    NEW.revision := 1; NEW.created_at := now(); NEW.updated_at := now();
  else
    if NEW.owner_id is distinct from OLD.owner_id or NEW.id is distinct from OLD.id then
      raise exception 'Character identity and ownership cannot change';
    end if;
    NEW.revision := OLD.revision + 1; NEW.created_at := OLD.created_at; NEW.updated_at := now();
  end if;
  return NEW;
end;
$$;
drop trigger if exists moonwild_character_revision on public.characters;
create trigger moonwild_character_revision before insert or update on public.characters
for each row execute function public.moonwild_character_revision();
alter table public.characters enable row level security;
revoke all on public.characters from anon;
revoke all on public.characters from authenticated;
grant select, insert, update on public.characters to authenticated;
drop policy if exists moonwild_owner_select on public.characters;
create policy moonwild_owner_select on public.characters for select to authenticated using ((select auth.uid()) = owner_id);
drop policy if exists moonwild_owner_insert on public.characters;
create policy moonwild_owner_insert on public.characters for insert to authenticated with check ((select auth.uid()) = owner_id);
drop policy if exists moonwild_owner_update on public.characters;
create policy moonwild_owner_update on public.characters for update to authenticated using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
commit;
