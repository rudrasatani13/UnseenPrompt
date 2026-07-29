-- Phase 3 project core: ownership helper, projects, idempotency, confirmed state, events.

-- ---------------------------------------------------------------------------
-- projects (created first without deferred active_milestone FK)
-- ---------------------------------------------------------------------------

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  title text not null,
  mode text not null,
  stage text not null default 'discovery',
  selected_tool text null,
  active_milestone_id uuid null,
  blocker_summary text null,
  state_version bigint not null default 1,
  last_activity_at timestamptz not null default timezone('utc', now()),
  archived_at timestamptz null,
  deleted_at timestamptz null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint projects_title_len_chk
    check (
      char_length(btrim(title)) > 0
      and octet_length(title) <= 240
    ),
  constraint projects_mode_chk
    check (
      mode in (
        'new_build',
        'feature',
        'bug',
        'review',
        'test',
        'deploy',
        'improve'
      )
    ),
  constraint projects_stage_chk
    check (
      stage in (
        'discovery',
        'brief_confirmation',
        'ready_for_prompt',
        'prompt_active',
        'awaiting_return',
        'result_review',
        'blocked',
        'iteration',
        'completed',
        'archived'
      )
    ),
  constraint projects_selected_tool_chk
    check (
      selected_tool is null
      or selected_tool in ('claude_code', 'codex', 'cursor')
    ),
  constraint projects_blocker_summary_len_chk
    check (
      blocker_summary is null
      or (
        char_length(btrim(blocker_summary)) > 0
        and octet_length(blocker_summary) <= 32768
      )
    ),
  constraint projects_state_version_positive_chk
    check (state_version > 0),
  constraint projects_archive_stage_agree_chk
    check (
      (stage = 'archived' and archived_at is not null)
      or (stage <> 'archived' and archived_at is null)
    ),
  constraint projects_owner_id_id_key unique (owner_id, id),
  constraint projects_id_owner_id_key unique (id, owner_id)
);

comment on table public.projects is
  'Project root. Direct owner reassignment is impossible; owner writes go through atomic RPCs.';

create index projects_owner_id_idx on public.projects (owner_id);
create index projects_owner_updated_at_idx on public.projects (owner_id, updated_at desc);
create index projects_owner_archived_activity_idx
  on public.projects (owner_id, archived_at, last_activity_at desc);

create trigger projects_set_updated_at
before update on public.projects
for each row
execute function private.set_updated_at();

-- Prevent owner_id changes after insert (including privileged accidental reassignment).
create or replace function private.prevent_project_owner_reassignment()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
begin
  if new.owner_id is distinct from old.owner_id then
    raise exception 'project_owner_immutable'
      using errcode = 'P0001';
  end if;
  if new.id is distinct from old.id then
    raise exception 'project_id_immutable'
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

revoke all on function private.prevent_project_owner_reassignment() from public, anon, authenticated;

create trigger projects_prevent_owner_reassignment
before update on public.projects
for each row
execute function private.prevent_project_owner_reassignment();

alter table public.projects enable row level security;

revoke all on table public.projects from public, anon, authenticated;

-- Owner SELECT only. Insert/update go through security-definer RPCs (P3-04).
grant select on table public.projects to authenticated;
grant all on table public.projects to service_role;

create policy projects_select_own
  on public.projects
  for select
  to authenticated
  using (auth.uid() is not null and owner_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Ownership helper (after projects exists)
-- ---------------------------------------------------------------------------

create or replace function private.owns_project(p_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, private
as $$
  select exists (
    select 1
    from public.projects p
    where p.id = p_project_id
      and p.owner_id = auth.uid()
      and auth.uid() is not null
  );
$$;

comment on function private.owns_project(uuid) is
  'Returns whether auth.uid() owns the given project. Used only by RLS policies.';

revoke all on function private.owns_project(uuid) from public, anon, authenticated;
grant execute on function private.owns_project(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- idempotency_records
-- ---------------------------------------------------------------------------

create table public.idempotency_records (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid null references public.profiles (id) on delete cascade,
  project_id uuid null,
  scope text not null,
  idempotency_key text not null,
  request_fingerprint text not null,
  status text not null,
  resource_type text null,
  resource_id uuid null,
  created_at timestamptz not null default timezone('utc', now()),
  completed_at timestamptz null,
  expires_at timestamptz null,
  constraint idempotency_records_scope_chk
    check (scope in ('generation', 'upload', 'workflow', 'lifecycle', 'billing')),
  constraint idempotency_records_status_chk
    check (status in ('in_progress', 'succeeded', 'failed')),
  constraint idempotency_records_key_len_chk
    check (
      char_length(btrim(idempotency_key)) > 0
      and octet_length(idempotency_key) <= 255
    ),
  constraint idempotency_records_fingerprint_len_chk
    check (
      char_length(btrim(request_fingerprint)) > 0
      and octet_length(request_fingerprint) <= 255
    ),
  constraint idempotency_records_resource_type_len_chk
    check (
      resource_type is null
      or (
        char_length(btrim(resource_type)) > 0
        and octet_length(resource_type) <= 255
      )
    ),
  constraint idempotency_records_owner_project_fk
    foreign key (owner_id, project_id)
    references public.projects (owner_id, id)
    on delete cascade
);

comment on table public.idempotency_records is
  'Request fingerprint and status only. Never store full response, prompt, or secret bodies.';

-- Partial uniqueness: owner-scoped and ownerless namespaces.
create unique index idempotency_records_owner_scope_key_uidx
  on public.idempotency_records (owner_id, scope, idempotency_key)
  where owner_id is not null;

create unique index idempotency_records_scope_key_ownerless_uidx
  on public.idempotency_records (scope, idempotency_key)
  where owner_id is null;

create index idempotency_records_owner_id_idx
  on public.idempotency_records (owner_id)
  where owner_id is not null;

create index idempotency_records_project_id_idx
  on public.idempotency_records (project_id)
  where project_id is not null;

alter table public.idempotency_records enable row level security;

revoke all on table public.idempotency_records from public, anon, authenticated;

grant select on table public.idempotency_records to authenticated;
grant all on table public.idempotency_records to service_role;

create policy idempotency_records_select_own
  on public.idempotency_records
  for select
  to authenticated
  using (auth.uid() is not null and owner_id = auth.uid());

-- ---------------------------------------------------------------------------
-- project_events (before children that reference events)
-- ---------------------------------------------------------------------------

create table public.project_events (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  sequence_number bigint not null,
  event_type text not null,
  actor_type text not null,
  actor_id uuid null,
  idempotency_record_id uuid null references public.idempotency_records (id) on delete set null,
  correlation_id uuid not null default gen_random_uuid(),
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  constraint project_events_sequence_positive_chk check (sequence_number > 0),
  constraint project_events_event_type_len_chk
    check (
      char_length(btrim(event_type)) > 0
      and octet_length(event_type) <= 255
    ),
  constraint project_events_actor_type_chk
    check (actor_type in ('user', 'system', 'model', 'workflow', 'billing')),
  constraint project_events_payload_object_chk
    check (jsonb_typeof(payload) = 'object'),
  constraint project_events_payload_size_chk
    check (octet_length(payload::text) <= 65536),
  constraint project_events_project_id_id_key unique (project_id, id),
  constraint project_events_project_sequence_key unique (project_id, sequence_number)
);

comment on table public.project_events is
  'Append-only project history. No direct UPDATE/DELETE grants for authenticated.';

create unique index project_events_project_sequence_desc_uidx
  on public.project_events (project_id, sequence_number desc);

create unique index project_events_idempotency_record_uidx
  on public.project_events (idempotency_record_id)
  where idempotency_record_id is not null;

create index project_events_project_id_idx on public.project_events (project_id);

alter table public.project_events enable row level security;

revoke all on table public.project_events from public, anon, authenticated;

grant select on table public.project_events to authenticated;
grant all on table public.project_events to service_role;

create policy project_events_select_owned
  on public.project_events
  for select
  to authenticated
  using (auth.uid() is not null and (select private.owns_project(project_id)));

-- ---------------------------------------------------------------------------
-- requirements
-- ---------------------------------------------------------------------------

create table public.requirements (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  category text not null,
  statement text not null,
  rationale text null,
  status text not null,
  source_event_id uuid null,
  supersedes_requirement_id uuid null,
  confirmed_at timestamptz null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint requirements_category_len_chk
    check (
      char_length(btrim(category)) > 0
      and octet_length(category) <= 255
    ),
  constraint requirements_statement_len_chk
    check (
      char_length(btrim(statement)) > 0
      and octet_length(statement) <= 16384
    ),
  constraint requirements_rationale_len_chk
    check (
      rationale is null
      or (
        char_length(btrim(rationale)) > 0
        and octet_length(rationale) <= 32768
      )
    ),
  constraint requirements_status_chk
    check (status in ('proposed', 'confirmed', 'rejected', 'superseded')),
  constraint requirements_confirmed_at_chk
    check (
      (status = 'confirmed' and confirmed_at is not null)
      or (status <> 'confirmed' and confirmed_at is null)
    ),
  constraint requirements_project_id_id_key unique (project_id, id),
  constraint requirements_source_event_fk
    foreign key (project_id, source_event_id)
    references public.project_events (project_id, id)
    on delete set null (source_event_id),
  constraint requirements_supersedes_fk
    foreign key (project_id, supersedes_requirement_id)
    references public.requirements (project_id, id)
    on delete set null (supersedes_requirement_id),
  constraint requirements_supersedes_not_self_chk
    check (
      supersedes_requirement_id is null
      or supersedes_requirement_id <> id
    )
);

comment on table public.requirements is
  'Project requirements. Confirmed content is frozen; changes create successors.';

create index requirements_project_id_idx on public.requirements (project_id);
create index requirements_project_status_idx on public.requirements (project_id, status);

create trigger requirements_set_updated_at
before update on public.requirements
for each row
execute function private.set_updated_at();

create or replace function private.freeze_confirmed_requirement()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
begin
  if old.status = 'confirmed' then
    if new.statement is distinct from old.statement
       or new.category is distinct from old.category
       or new.rationale is distinct from old.rationale
       or new.project_id is distinct from old.project_id
       or new.id is distinct from old.id then
      raise exception 'confirmed_requirement_immutable'
        using errcode = 'P0001';
    end if;
  end if;
  if new.project_id is distinct from old.project_id then
    raise exception 'project_child_project_immutable'
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

revoke all on function private.freeze_confirmed_requirement() from public, anon, authenticated;

create trigger requirements_freeze_confirmed
before update on public.requirements
for each row
execute function private.freeze_confirmed_requirement();

alter table public.requirements enable row level security;

revoke all on table public.requirements from public, anon, authenticated;

grant select on table public.requirements to authenticated;
grant all on table public.requirements to service_role;

create policy requirements_select_owned
  on public.requirements
  for select
  to authenticated
  using (auth.uid() is not null and (select private.owns_project(project_id)));

-- ---------------------------------------------------------------------------
-- decisions
-- ---------------------------------------------------------------------------

create table public.decisions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  decision_key text not null,
  decision text not null,
  rationale text null,
  status text not null,
  source_event_id uuid null,
  supersedes_decision_id uuid null,
  confirmed_at timestamptz null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint decisions_decision_key_len_chk
    check (
      char_length(btrim(decision_key)) > 0
      and octet_length(decision_key) <= 255
    ),
  constraint decisions_decision_len_chk
    check (
      char_length(btrim(decision)) > 0
      and octet_length(decision) <= 16384
    ),
  constraint decisions_rationale_len_chk
    check (
      rationale is null
      or (
        char_length(btrim(rationale)) > 0
        and octet_length(rationale) <= 32768
      )
    ),
  constraint decisions_status_chk
    check (status in ('proposed', 'confirmed', 'rejected', 'superseded')),
  constraint decisions_confirmed_at_chk
    check (
      (status = 'confirmed' and confirmed_at is not null)
      or (status <> 'confirmed' and confirmed_at is null)
    ),
  constraint decisions_project_id_id_key unique (project_id, id),
  constraint decisions_source_event_fk
    foreign key (project_id, source_event_id)
    references public.project_events (project_id, id)
    on delete set null (source_event_id),
  constraint decisions_supersedes_fk
    foreign key (project_id, supersedes_decision_id)
    references public.decisions (project_id, id)
    on delete set null (supersedes_decision_id),
  constraint decisions_supersedes_not_self_chk
    check (
      supersedes_decision_id is null
      or supersedes_decision_id <> id
    )
);

comment on table public.decisions is
  'Project decisions. Confirmed content is frozen; changes create successors.';

create index decisions_project_id_idx on public.decisions (project_id);
create index decisions_project_status_idx on public.decisions (project_id, status);

create trigger decisions_set_updated_at
before update on public.decisions
for each row
execute function private.set_updated_at();

create or replace function private.freeze_confirmed_decision()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
begin
  if old.status = 'confirmed' then
    if new.decision is distinct from old.decision
       or new.decision_key is distinct from old.decision_key
       or new.rationale is distinct from old.rationale
       or new.project_id is distinct from old.project_id
       or new.id is distinct from old.id then
      raise exception 'confirmed_decision_immutable'
        using errcode = 'P0001';
    end if;
  end if;
  if new.project_id is distinct from old.project_id then
    raise exception 'project_child_project_immutable'
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

revoke all on function private.freeze_confirmed_decision() from public, anon, authenticated;

create trigger decisions_freeze_confirmed
before update on public.decisions
for each row
execute function private.freeze_confirmed_decision();

alter table public.decisions enable row level security;

revoke all on table public.decisions from public, anon, authenticated;

grant select on table public.decisions to authenticated;
grant all on table public.decisions to service_role;

create policy decisions_select_owned
  on public.decisions
  for select
  to authenticated
  using (auth.uid() is not null and (select private.owns_project(project_id)));

-- ---------------------------------------------------------------------------
-- milestones
-- ---------------------------------------------------------------------------

create table public.milestones (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  position integer not null,
  title text not null,
  description text null,
  suggested_status text not null,
  confirmed_status text null,
  confirmation_event_id uuid null,
  blocked_reason text null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint milestones_position_positive_chk check (position > 0),
  constraint milestones_title_len_chk
    check (
      char_length(btrim(title)) > 0
      and octet_length(title) <= 240
    ),
  constraint milestones_description_len_chk
    check (
      description is null
      or (
        char_length(btrim(description)) > 0
        and octet_length(description) <= 32768
      )
    ),
  constraint milestones_suggested_status_chk
    check (
      suggested_status in (
        'pending',
        'in_progress',
        'completed',
        'needs_verification',
        'blocked'
      )
    ),
  constraint milestones_confirmed_status_chk
    check (
      confirmed_status is null
      or confirmed_status in (
        'pending',
        'in_progress',
        'completed',
        'needs_verification',
        'blocked'
      )
    ),
  constraint milestones_blocked_reason_len_chk
    check (
      blocked_reason is null
      or (
        char_length(btrim(blocked_reason)) > 0
        and octet_length(blocked_reason) <= 32768
      )
    ),
  constraint milestones_project_id_id_key unique (project_id, id),
  constraint milestones_project_position_key unique (project_id, position),
  constraint milestones_confirmation_event_fk
    foreign key (project_id, confirmation_event_id)
    references public.project_events (project_id, id)
    on delete set null (confirmation_event_id)
);

comment on table public.milestones is
  'Suggested and confirmed milestone state remain separate columns.';

create index milestones_project_id_idx on public.milestones (project_id);
create index milestones_project_status_idx on public.milestones (project_id, suggested_status);

create trigger milestones_set_updated_at
before update on public.milestones
for each row
execute function private.set_updated_at();

create or replace function private.prevent_milestone_project_reassignment()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
begin
  if new.project_id is distinct from old.project_id or new.id is distinct from old.id then
    raise exception 'project_child_project_immutable'
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

revoke all on function private.prevent_milestone_project_reassignment() from public, anon, authenticated;

create trigger milestones_prevent_project_reassignment
before update on public.milestones
for each row
execute function private.prevent_milestone_project_reassignment();

alter table public.milestones enable row level security;

revoke all on table public.milestones from public, anon, authenticated;

grant select on table public.milestones to authenticated;
grant all on table public.milestones to service_role;

create policy milestones_select_owned
  on public.milestones
  for select
  to authenticated
  using (auth.uid() is not null and (select private.owns_project(project_id)));

-- Active milestone must belong to the same project. Null is allowed until set.
alter table public.projects
  add constraint projects_active_milestone_fk
  foreign key (id, active_milestone_id)
  references public.milestones (project_id, id)
  on delete set null (active_milestone_id);

-- ---------------------------------------------------------------------------
-- project_summaries
-- ---------------------------------------------------------------------------

create table public.project_summaries (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  summary_kind text not null,
  version integer not null,
  based_on_event_sequence bigint not null,
  summary_text text not null,
  structured_facts jsonb not null default '{}'::jsonb,
  status text not null,
  created_at timestamptz not null default timezone('utc', now()),
  constraint project_summaries_kind_len_chk
    check (
      char_length(btrim(summary_kind)) > 0
      and octet_length(summary_kind) <= 255
    ),
  constraint project_summaries_version_positive_chk check (version > 0),
  constraint project_summaries_based_on_positive_chk check (based_on_event_sequence > 0),
  constraint project_summaries_text_len_chk
    check (
      char_length(btrim(summary_text)) > 0
      and octet_length(summary_text) <= 65536
    ),
  constraint project_summaries_facts_object_chk
    check (jsonb_typeof(structured_facts) = 'object'),
  constraint project_summaries_facts_size_chk
    check (octet_length(structured_facts::text) <= 65536),
  constraint project_summaries_status_chk
    check (status in ('current', 'superseded')),
  constraint project_summaries_project_id_id_key unique (project_id, id),
  constraint project_summaries_kind_version_key unique (project_id, summary_kind, version)
);

comment on table public.project_summaries is
  'Versioned project summaries. At most one current summary per project/kind.';

create unique index project_summaries_current_kind_uidx
  on public.project_summaries (project_id, summary_kind)
  where status = 'current';

create index project_summaries_project_id_idx on public.project_summaries (project_id);

alter table public.project_summaries enable row level security;

revoke all on table public.project_summaries from public, anon, authenticated;

grant select on table public.project_summaries to authenticated;
grant all on table public.project_summaries to service_role;

create policy project_summaries_select_owned
  on public.project_summaries
  for select
  to authenticated
  using (auth.uid() is not null and (select private.owns_project(project_id)));
