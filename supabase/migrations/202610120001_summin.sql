-- Apply with `supabase db push` or the Supabase SQL editor.
-- The browser never queries these tables. ONLY the service role may use them.
create table public.summin_rooms (
  code text primary key check (code ~ '^[A-HJ-NP-Z2-9]{6}$'),
  id uuid not null unique,
  version bigint not null default 0,
  state jsonb not null,
  updated_at timestamptz not null default now(),
  check ((state->>'version')::bigint = version)
);
create table public.summin_room_signals (
  id uuid primary key references public.summin_rooms(id) on delete cascade,
  revision bigint not null default 0
);
create table public.summin_rate_limits (
  key text primary key,
  count integer not null,
  expires_at timestamptz not null
);
create index summin_rooms_updated_at_idx on public.summin_rooms(updated_at);
alter table public.summin_rooms enable row level security;
alter table public.summin_room_signals enable row level security;
alter table public.summin_rate_limits enable row level security;
-- Intentionally no anon/authenticated policies. Service role bypasses RLS.
revoke all on public.summin_rooms, public.summin_room_signals, public.summin_rate_limits from public, anon, authenticated;
grant all on public.summin_rooms, public.summin_room_signals, public.summin_rate_limits to service_role;

create or replace function public.summin_create_room(p_code text, p_id uuid, p_state jsonb)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  insert into public.summin_rooms(code, id, version, state) values (p_code, p_id, 0, p_state)
  on conflict (code) do nothing;
  if not found then return false; end if;
  insert into public.summin_room_signals(id, revision) values (p_id, 0);
  return true;
end;
$$;
create or replace function public.summin_commit_room(p_code text, p_expected_version bigint, p_state jsonb)
returns boolean language plpgsql security definer set search_path = '' as $$
declare room_id uuid;
begin
  update public.summin_rooms set state = p_state, version = p_expected_version + 1, updated_at = now()
    where code = p_code and version = p_expected_version returning id into room_id;
  if not found then return false; end if;
  update public.summin_room_signals set revision = p_expected_version + 1 where id = room_id;
  return true;
end;
$$;
create or replace function public.summin_rate_limit(p_key text, p_max integer, p_seconds integer)
returns boolean language plpgsql security definer set search_path = '' as $$
declare current_count integer;
begin
  insert into public.summin_rate_limits(key, count, expires_at) values (p_key, 1, now() + make_interval(secs => p_seconds))
  on conflict (key) do update set
    count = case when public.summin_rate_limits.expires_at <= now() then 1 else public.summin_rate_limits.count + 1 end,
    expires_at = case when public.summin_rate_limits.expires_at <= now() then now() + make_interval(secs => p_seconds) else public.summin_rate_limits.expires_at end
  returning count into current_count;
  return current_count <= p_max;
end;
$$;
create or replace function public.summin_cleanup()
returns void language sql security definer set search_path = '' as $$
  delete from public.summin_rooms where updated_at < now() - interval '24 hours';
  delete from public.summin_rate_limits where expires_at < now() - interval '1 hour';
$$;
revoke all on function public.summin_create_room(text, uuid, jsonb) from public, anon, authenticated;
revoke all on function public.summin_commit_room(text, bigint, jsonb) from public, anon, authenticated;
revoke all on function public.summin_rate_limit(text, integer, integer) from public, anon, authenticated;
revoke all on function public.summin_cleanup() from public, anon, authenticated;
grant execute on function public.summin_create_room(text, uuid, jsonb) to service_role;
grant execute on function public.summin_commit_room(text, bigint, jsonb) to service_role;
grant execute on function public.summin_rate_limit(text, integer, integer) to service_role;
grant execute on function public.summin_cleanup() to service_role;

-- Publish ONLY the UUID/revision table. Never add summin_rooms to Realtime.
do $$ begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'summin_room_signals' and schemaname = 'public') then
    alter publication supabase_realtime add table public.summin_room_signals;
  end if;
end $$;
