-- Phase 3 account foundation: private schema helpers, profiles, preferences.
-- Waitlist remains isolated; this migration does not touch waitlist_entries.

-- ---------------------------------------------------------------------------
-- Private schema and safe timestamp helper
-- ---------------------------------------------------------------------------

create schema private;

comment on schema private is
  'Implementation-only helpers. Not exposed through the Supabase Data API.';

revoke all on schema private from public, anon, authenticated;
grant usage on schema private to authenticated, service_role;

create or replace function private.set_updated_at()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
begin
  new.updated_at := timezone('utc', now());
  return new;
end;
$$;

revoke all on function private.set_updated_at() from public, anon, authenticated;
grant execute on function private.set_updated_at() to postgres, service_role;

comment on function private.set_updated_at() is
  'BEFORE UPDATE helper that stamps updated_at in UTC without dynamic SQL.';

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text null,
  locale text not null default 'en',
  time_zone text not null default 'UTC',
  onboarding_completed_at timestamptz null,
  deletion_requested_at timestamptz null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint profiles_display_name_len_chk
    check (
      display_name is null
      or (
        char_length(btrim(display_name)) > 0
        and octet_length(display_name) <= 120
      )
    ),
  constraint profiles_locale_len_chk
    check (
      char_length(btrim(locale)) > 0
      and octet_length(locale) <= 255
    ),
  constraint profiles_time_zone_len_chk
    check (
      char_length(btrim(time_zone)) > 0
      and octet_length(time_zone) <= 255
    )
);

comment on table public.profiles is
  'User identity extension. id is always auth.users(id); never authorize from user metadata.';

create trigger profiles_set_updated_at
before update on public.profiles
for each row
execute function private.set_updated_at();

alter table public.profiles enable row level security;

revoke all on table public.profiles from public, anon, authenticated;

grant select, insert, update on table public.profiles to authenticated;
grant all on table public.profiles to service_role;

create policy profiles_select_own
  on public.profiles
  for select
  to authenticated
  using (auth.uid() is not null and id = auth.uid());

create policy profiles_insert_own
  on public.profiles
  for insert
  to authenticated
  with check (auth.uid() is not null and id = auth.uid());

create policy profiles_update_own
  on public.profiles
  for update
  to authenticated
  using (auth.uid() is not null and id = auth.uid())
  with check (auth.uid() is not null and id = auth.uid());

-- ---------------------------------------------------------------------------
-- preferences
-- ---------------------------------------------------------------------------

create table public.preferences (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null unique references public.profiles (id) on delete cascade,
  skill_level text not null,
  preferred_stack_behavior text not null,
  preferred_stack jsonb not null default '{}'::jsonb,
  coding_style jsonb not null default '{}'::jsonb,
  deployment_preference text null,
  locale_override text null,
  time_zone_override text null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint preferences_skill_level_chk
    check (skill_level in ('beginner', 'intermediate', 'advanced')),
  constraint preferences_preferred_stack_behavior_chk
    check (preferred_stack_behavior in ('recommend', 'prefer_saved', 'ask')),
  constraint preferences_preferred_stack_object_chk
    check (jsonb_typeof(preferred_stack) = 'object'),
  constraint preferences_preferred_stack_size_chk
    check (octet_length(preferred_stack::text) <= 16384),
  constraint preferences_coding_style_object_chk
    check (jsonb_typeof(coding_style) = 'object'),
  constraint preferences_coding_style_size_chk
    check (octet_length(coding_style::text) <= 16384),
  constraint preferences_deployment_preference_len_chk
    check (
      deployment_preference is null
      or (
        char_length(btrim(deployment_preference)) > 0
        and octet_length(deployment_preference) <= 255
      )
    ),
  constraint preferences_locale_override_len_chk
    check (
      locale_override is null
      or (
        char_length(btrim(locale_override)) > 0
        and octet_length(locale_override) <= 255
      )
    ),
  constraint preferences_time_zone_override_len_chk
    check (
      time_zone_override is null
      or (
        char_length(btrim(time_zone_override)) > 0
        and octet_length(time_zone_override) <= 255
      )
    )
);

comment on table public.preferences is
  'Per-owner product preferences. Preference content is never authorization input.';

create index preferences_owner_id_idx on public.preferences (owner_id);

create trigger preferences_set_updated_at
before update on public.preferences
for each row
execute function private.set_updated_at();

alter table public.preferences enable row level security;

revoke all on table public.preferences from public, anon, authenticated;

grant select, insert, update on table public.preferences to authenticated;
grant all on table public.preferences to service_role;

create policy preferences_select_own
  on public.preferences
  for select
  to authenticated
  using (auth.uid() is not null and owner_id = auth.uid());

create policy preferences_insert_own
  on public.preferences
  for insert
  to authenticated
  with check (auth.uid() is not null and owner_id = auth.uid());

create policy preferences_update_own
  on public.preferences
  for update
  to authenticated
  using (auth.uid() is not null and owner_id = auth.uid())
  with check (auth.uid() is not null and owner_id = auth.uid());
