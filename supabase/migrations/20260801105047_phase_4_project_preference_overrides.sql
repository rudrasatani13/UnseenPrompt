-- Phase 4: per-project preference overrides. These never modify global preferences.

create table public.project_preference_overrides (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null unique references public.projects (id) on delete cascade,
  skill_level text null,
  preferred_stack_behavior text null,
  preferred_stack jsonb null,
  coding_style jsonb null,
  deployment_preference text null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint project_preference_overrides_project_id_id_key unique (project_id, id),
  constraint project_preference_overrides_skill_level_chk
    check (skill_level is null or skill_level in ('beginner', 'intermediate', 'advanced')),
  constraint project_preference_overrides_preferred_stack_behavior_chk
    check (
      preferred_stack_behavior is null
      or preferred_stack_behavior in ('recommend', 'prefer_saved', 'ask')
    ),
  constraint project_preference_overrides_preferred_stack_object_chk
    check (preferred_stack is null or jsonb_typeof(preferred_stack) = 'object'),
  constraint project_preference_overrides_preferred_stack_size_chk
    check (preferred_stack is null or octet_length(preferred_stack::text) <= 16384),
  constraint project_preference_overrides_coding_style_object_chk
    check (coding_style is null or jsonb_typeof(coding_style) = 'object'),
  constraint project_preference_overrides_coding_style_size_chk
    check (coding_style is null or octet_length(coding_style::text) <= 16384),
  constraint project_preference_overrides_deployment_preference_len_chk
    check (
      deployment_preference is null
      or (
        char_length(btrim(deployment_preference)) > 0
        and octet_length(deployment_preference) <= 255
      )
    )
);

comment on table public.project_preference_overrides is
  'Nullable per-project preference fields. A null field falls back to the owner global preference.';

create trigger project_preference_overrides_set_updated_at
before update on public.project_preference_overrides
for each row
execute function private.set_updated_at();

-- RLS confirms the caller owns the target project, but does not itself prevent an owner from
-- moving a row between two of their projects. An override remains permanently tied to its project.
create or replace function private.prevent_project_preference_override_project_reassignment()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
begin
  if new.project_id is distinct from old.project_id then
    raise exception 'project_preference_override_project_immutable'
      using errcode = 'P0001';
  end if;
  if new.id is distinct from old.id then
    raise exception 'project_preference_override_id_immutable'
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

revoke all on function private.prevent_project_preference_override_project_reassignment()
  from public, anon, authenticated;

create trigger project_preference_overrides_prevent_project_reassignment
before update on public.project_preference_overrides
for each row
execute function private.prevent_project_preference_override_project_reassignment();

alter table public.project_preference_overrides enable row level security;

revoke all on table public.project_preference_overrides from public, anon, authenticated;

grant select, insert, update on table public.project_preference_overrides to authenticated;
grant all on table public.project_preference_overrides to service_role;

create policy project_preference_overrides_select_owned
  on public.project_preference_overrides
  for select
  to authenticated
  using (auth.uid() is not null and (select private.owns_project(project_id)));

create policy project_preference_overrides_insert_owned
  on public.project_preference_overrides
  for insert
  to authenticated
  with check (auth.uid() is not null and (select private.owns_project(project_id)));

create policy project_preference_overrides_update_owned
  on public.project_preference_overrides
  for update
  to authenticated
  using (auth.uid() is not null and (select private.owns_project(project_id)))
  with check (auth.uid() is not null and (select private.owns_project(project_id)));
