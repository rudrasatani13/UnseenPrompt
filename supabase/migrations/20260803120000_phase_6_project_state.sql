-- Phase 6 project state engine: additive resume state, replay-safe validated deltas, and
-- owner-scoped atomic command boundaries. Historical migrations are intentionally untouched.

-- ---------------------------------------------------------------------------
-- Additive project resume state and event schema version.
-- ---------------------------------------------------------------------------

alter table public.projects
  add column blocked_from_stage text null,
  add column archived_from_stage text null;

-- Existing interrupt rows cannot be assigned a resume target safely. Stop the migration rather
-- than inventing history; an owner-authored forward repair migration must supply these values.
do $$
begin
  if exists (
    select 1
    from public.projects
    where stage = 'blocked'
      and blocked_from_stage is null
  ) or exists (
    select 1
    from public.projects
    where stage = 'archived'
      and archived_from_stage is null
  ) then
    raise exception 'phase_6_resume_backfill_required'
      using errcode = 'P0001';
  end if;
end;
$$;

alter table public.projects
  add constraint projects_blocked_from_stage_chk
  check (
    blocked_from_stage is null
    or blocked_from_stage in (
      'discovery',
      'brief_confirmation',
      'ready_for_prompt',
      'prompt_active',
      'awaiting_return',
      'result_review',
      'iteration',
      'completed'
    )
  ),
  add constraint projects_archived_from_stage_chk
  check (
    archived_from_stage is null
    or archived_from_stage in (
      'discovery',
      'brief_confirmation',
      'ready_for_prompt',
      'prompt_active',
      'awaiting_return',
      'result_review',
      'blocked',
      'iteration',
      'completed'
    )
  ),
  add constraint projects_interrupt_resume_chk
  check (
    (
      stage = 'blocked'
      and blocker_summary is not null
      and char_length(btrim(blocker_summary)) > 0
      and blocked_from_stage is not null
      and archived_from_stage is null
      and archived_at is null
    )
    or (
      stage = 'archived'
      and archived_from_stage is not null
      and (
        (
          archived_from_stage = 'blocked'
          and blocker_summary is not null
          and blocked_from_stage is not null
        )
        or (
          archived_from_stage <> 'blocked'
          and blocker_summary is null
          and blocked_from_stage is null
        )
      )
    )
    or (
      stage not in ('blocked', 'archived')
      and blocker_summary is null
      and blocked_from_stage is null
      and archived_from_stage is null
      and archived_at is null
    )
  );

alter table public.project_events
  add column event_schema_version integer not null default 1;

alter table public.project_events
  add constraint project_events_event_schema_version_positive_chk
  check (event_schema_version > 0);

-- Existing milestone confirmation metadata cannot be inferred safely. Stop before adding the
-- Phase 6 invariants rather than inventing a user confirmation event or blocker explanation.
do $$
begin
  if exists (
    select 1
    from public.milestones m
    where (m.confirmed_status is null) <> (m.confirmation_event_id is null)
       or (m.confirmed_status is distinct from 'blocked' and m.blocked_reason is not null)
       or (m.confirmed_status = 'blocked' and m.blocked_reason is null)
  ) then
    raise exception 'phase_6_milestone_confirmation_backfill_required'
      using errcode = 'P0001',
        hint = 'Repair milestone confirmation_event_id and blocked_reason history before rerunning Phase 6.';
  end if;
end;
$$;

alter table public.milestones
  add constraint milestones_confirmation_event_consistency_chk
  check (
    (confirmed_status is null and confirmation_event_id is null)
    or (confirmed_status is not null and confirmation_event_id is not null)
  ),
  add constraint milestones_blocked_reason_consistency_chk
  check (
    (confirmed_status = 'blocked' and blocked_reason is not null)
    or (confirmed_status is distinct from 'blocked' and blocked_reason is null)
  );

-- ---------------------------------------------------------------------------
-- Small fixed-shape JSON helpers used by both RPCs. They accept no SQL fragments and never use
-- dynamic SQL, so JSON keys cannot become an execution surface.
-- ---------------------------------------------------------------------------

create or replace function private.phase6_json_keys_exact(
  p_value jsonb,
  p_keys text[]
)
returns boolean
language plpgsql
immutable
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_key text;
begin
  if p_value is null or jsonb_typeof(p_value) <> 'object' then
    return false;
  end if;
  if (select count(*) from jsonb_object_keys(p_value)) <> cardinality(p_keys) then
    return false;
  end if;
  for v_key in select jsonb_object_keys(p_value) loop
    if not (v_key = any (p_keys)) then
      return false;
    end if;
  end loop;
  return true;
end;
$$;

create or replace function private.phase6_json_keys_allowed(
  p_value jsonb,
  p_keys text[]
)
returns boolean
language plpgsql
immutable
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_key text;
begin
  if p_value is null or jsonb_typeof(p_value) <> 'object' then
    return false;
  end if;
  if (select count(*) from jsonb_object_keys(p_value)) > cardinality(p_keys) then
    return false;
  end if;
  for v_key in select jsonb_object_keys(p_value) loop
    if not (v_key = any (p_keys)) then
      return false;
    end if;
  end loop;
  return true;
end;
$$;

create or replace function private.phase6_json_text_ok(
  p_value jsonb,
  p_max_chars integer,
  p_allow_empty boolean default false
)
returns boolean
language plpgsql
immutable
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_text text;
begin
  if p_value is null or jsonb_typeof(p_value) <> 'string' then
    return false;
  end if;
  v_text := p_value #>> '{}';
  if char_length(v_text) > p_max_chars then
    return false;
  end if;
  if p_allow_empty then
    return true;
  end if;
  return char_length(btrim(v_text)) > 0;
end;
$$;

-- Command fields use the existing database byte ceilings. Phase 5 model output uses JavaScript
-- character limits and is allowed to retain multibyte text up to the root UTF-8 cap.
create or replace function private.phase6_command_text_ok(
  p_value jsonb,
  p_max_bytes integer,
  p_allow_empty boolean default false
)
returns boolean
language plpgsql
immutable
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_text text;
begin
  if not private.phase6_json_text_ok(p_value, p_max_bytes, p_allow_empty) then
    return false;
  end if;
  v_text := p_value #>> '{}';
  return octet_length(convert_to(v_text, 'UTF8')) <= p_max_bytes;
end;
$$;

create or replace function private.phase6_uuid_text_ok(p_value jsonb)
returns boolean
language plpgsql
immutable
security definer
set search_path = pg_catalog, public, private
as $$
begin
  return jsonb_typeof(p_value) = 'string'
    and p_value #>> '{}' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$';
end;
$$;

create or replace function private.phase6_valid_project_delta_proposal(
  p_value jsonb,
  p_kind text
)
returns boolean
language plpgsql
immutable
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_action text;
  v_reference text;
begin
  if p_kind in ('requirement', 'decision') then
    if not private.phase6_json_keys_exact(
      p_value,
      array['action', 'reference', 'statement', 'rationale']
    ) then
      return false;
    end if;
    if not private.phase6_json_text_ok(p_value->'action', 16, false)
       or not private.phase6_json_text_ok(p_value->'reference', 160, true)
       or not private.phase6_json_text_ok(p_value->'statement', 1000, false)
       or not private.phase6_json_text_ok(p_value->'rationale', 1000, false) then
      return false;
    end if;
    v_action := p_value->>'action';
    v_reference := p_value->>'reference';
    if v_action not in ('add', 'revise', 'remove') then
      return false;
    end if;
    if v_action <> 'add' and char_length(btrim(v_reference)) = 0 then
      return false;
    end if;
    return true;
  end if;

  if p_kind = 'milestone' then
    if not private.phase6_json_keys_exact(
      p_value,
      array['action', 'reference', 'title', 'rationale']
    ) then
      return false;
    end if;
    if not private.phase6_json_text_ok(p_value->'action', 16, false)
       or not private.phase6_json_text_ok(p_value->'reference', 160, true)
       or not private.phase6_json_text_ok(p_value->'title', 240, false)
       or not private.phase6_json_text_ok(p_value->'rationale', 1000, false) then
      return false;
    end if;
    v_action := p_value->>'action';
    v_reference := p_value->>'reference';
    if v_action not in ('add', 'revise', 'remove') then
      return false;
    end if;
    if v_action <> 'add' and char_length(btrim(v_reference)) = 0 then
      return false;
    end if;
    return true;
  end if;

  return false;
end;
$$;

create or replace function private.phase6_valid_project_delta_text(p_text text)
returns boolean
language plpgsql
immutable
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_document jsonb;
  v_item jsonb;
begin
  if p_text is null
     or octet_length(convert_to(p_text, 'UTF8')) > 65536 then
    return false;
  end if;
  begin
    v_document := p_text::jsonb;
  exception when others then
    return false;
  end;
  if not private.phase6_json_keys_exact(
    v_document,
    array[
      'summary',
      'requirementProposals',
      'decisionProposals',
      'milestoneProposals',
      'unresolvedConflicts'
    ]
  ) then
    return false;
  end if;
  if jsonb_typeof(v_document->'requirementProposals') <> 'array'
     or jsonb_typeof(v_document->'decisionProposals') <> 'array'
     or jsonb_typeof(v_document->'milestoneProposals') <> 'array'
     or jsonb_typeof(v_document->'unresolvedConflicts') <> 'array' then
    return false;
  end if;
  if jsonb_array_length(v_document->'requirementProposals') > 32
     or jsonb_array_length(v_document->'decisionProposals') > 32
     or jsonb_array_length(v_document->'milestoneProposals') > 32
     or jsonb_array_length(v_document->'unresolvedConflicts') > 32 then
    return false;
  end if;
  if not private.phase6_json_text_ok(v_document->'summary', 1000, false) then
    return false;
  end if;
  for v_item in select value from jsonb_array_elements(v_document->'requirementProposals') loop
    if not private.phase6_valid_project_delta_proposal(v_item, 'requirement') then
      return false;
    end if;
  end loop;
  for v_item in select value from jsonb_array_elements(v_document->'decisionProposals') loop
    if not private.phase6_valid_project_delta_proposal(v_item, 'decision') then
      return false;
    end if;
  end loop;
  for v_item in select value from jsonb_array_elements(v_document->'milestoneProposals') loop
    if not private.phase6_valid_project_delta_proposal(v_item, 'milestone') then
      return false;
    end if;
  end loop;
  for v_item in select value from jsonb_array_elements(v_document->'unresolvedConflicts') loop
    if not private.phase6_json_text_ok(v_item, 1000, false) then
      return false;
    end if;
  end loop;
  return true;
end;
$$;

revoke all on function private.phase6_json_keys_exact(jsonb, text[]) from public, anon, authenticated;
revoke all on function private.phase6_json_keys_allowed(jsonb, text[]) from public, anon, authenticated;
revoke all on function private.phase6_json_text_ok(jsonb, integer, boolean) from public, anon, authenticated;
revoke all on function private.phase6_command_text_ok(jsonb, integer, boolean) from public, anon, authenticated;
revoke all on function private.phase6_uuid_text_ok(jsonb) from public, anon, authenticated;
revoke all on function private.phase6_valid_project_delta_proposal(jsonb, text) from public, anon, authenticated;
revoke all on function private.phase6_valid_project_delta_text(text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Validated Phase 5 project-delta persistence and apply-once receipt.
-- ---------------------------------------------------------------------------

alter table public.generation_runs
  add column validated_project_delta_text text null,
  add column validated_project_delta_hash text null;

create or replace function private.compute_validated_project_delta_hash()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
begin
  if new.validated_project_delta_text is null then
    new.validated_project_delta_hash := null;
  else
    new.validated_project_delta_hash := encode(
      extensions.digest(convert_to(new.validated_project_delta_text, 'UTF8'), 'sha256'),
      'hex'
    );
  end if;
  return new;
end;
$$;

revoke all on function private.compute_validated_project_delta_hash() from public, anon, authenticated;

create trigger generation_runs_compute_validated_delta_hash
before insert or update on public.generation_runs
for each row
execute function private.compute_validated_project_delta_hash();

alter table public.generation_runs
  add constraint generation_runs_validated_delta_pair_chk
  check (
    (validated_project_delta_text is null and validated_project_delta_hash is null)
    or (validated_project_delta_text is not null and validated_project_delta_hash is not null)
  ),
  add constraint generation_runs_validated_delta_shape_chk
  check (
    validated_project_delta_text is null
    or (
      operation_kind = 'project_delta'
      and output_schema_version = 'unseenprompt.model-output.project_delta.v1'
      and status = 'succeeded'
      and validation_result in ('passed', 'repaired', 'reviewed')
      and private.phase6_valid_project_delta_text(validated_project_delta_text)
      and validated_project_delta_hash = encode(
        extensions.digest(convert_to(validated_project_delta_text, 'UTF8'), 'sha256'),
        'hex'
      )
      and validated_project_delta_hash ~ '^[0-9a-f]{64}$'
    )
  );

create unique index decisions_project_confirmed_key_uidx
  on public.decisions (project_id, decision_key)
  where status = 'confirmed';

create unique index requirements_project_successor_uidx
  on public.requirements (project_id, supersedes_requirement_id)
  where supersedes_requirement_id is not null;

create unique index decisions_project_successor_uidx
  on public.decisions (project_id, supersedes_decision_id)
  where supersedes_decision_id is not null;

create table public.project_delta_applications (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  generation_run_id uuid not null,
  event_id uuid not null,
  applied_state_version bigint not null,
  created_at timestamptz not null default timezone('utc', now()),
  constraint project_delta_applications_project_id_id_key unique (project_id, id),
  constraint project_delta_applications_generation_run_uidx unique (generation_run_id),
  constraint project_delta_applications_event_uidx unique (event_id),
  constraint project_delta_applications_version_positive_chk check (applied_state_version > 0),
  constraint project_delta_applications_generation_run_fk
    foreign key (project_id, generation_run_id)
    references public.generation_runs (project_id, id)
    on delete cascade,
  constraint project_delta_applications_event_fk
    foreign key (project_id, event_id)
    references public.project_events (project_id, id)
    on delete cascade
);

comment on table public.project_delta_applications is
  'Apply-once receipt for a persisted, validated project_delta.v1 proposal. The receipt contains no proposal text.';

create index project_delta_applications_project_id_idx
  on public.project_delta_applications (project_id, created_at desc);

alter table public.project_delta_applications enable row level security;
revoke all on table public.project_delta_applications from public, anon, authenticated;
grant select on table public.project_delta_applications to authenticated;
grant all on table public.project_delta_applications to service_role;

create policy project_delta_applications_select_owned
  on public.project_delta_applications
  for select
  to authenticated
  using (auth.uid() is not null and (select private.owns_project(project_id)));

-- ---------------------------------------------------------------------------
-- Owner-scoped canonical snapshot boundary.
-- ---------------------------------------------------------------------------

create or replace function public.get_project_state_snapshot_v1(
  p_project_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_owner_id uuid := auth.uid();
  v_snapshot jsonb;
begin
  if v_owner_id is null then
    raise exception 'auth_required' using errcode = 'P0001';
  end if;
  if p_project_id is null then
    raise exception 'validation_failed' using errcode = 'P0001';
  end if;

  -- All canonical sections are selected by one statement. The project CTE is owner-scoped and
  -- excludes soft-deleted rows; child rows are correlated to that exact project, so no caller
  -- supplied owner or cross-tenant identifier can widen the snapshot.
  with project_row as (
    select
      p.id,
      p.mode,
      p.stage,
      p.state_version,
      p.selected_tool,
      p.active_milestone_id,
      p.blocker_summary,
      p.blocked_from_stage,
      p.archived_from_stage,
      p.archived_at
    from public.projects p
    where p.id = p_project_id
      and p.owner_id = v_owner_id
      and p.deleted_at is null
  )
  select jsonb_build_object(
    'projection', jsonb_build_object(
      'id', p.id,
      'mode', p.mode,
      'stage', p.stage,
      'state_version', p.state_version,
      'selected_tool', p.selected_tool,
      'active_milestone_id', p.active_milestone_id,
      'blocker_summary', p.blocker_summary,
      'blocked_from_stage', p.blocked_from_stage,
      'archived_from_stage', p.archived_from_stage,
      'archived_at', p.archived_at
    ),
    'requirements', (
      select coalesce(
        jsonb_agg(
          jsonb_build_object(
            'id', r.id,
            'project_id', r.project_id,
            'category', r.category,
            'statement', r.statement,
            'rationale', r.rationale,
            'status', r.status,
            'source_event_id', r.source_event_id,
            'supersedes_requirement_id', r.supersedes_requirement_id,
            'confirmed_at', r.confirmed_at,
            'created_at', r.created_at,
            'updated_at', r.updated_at
          )
          order by r.category, r.confirmed_at nulls last, r.id
        ),
        '[]'::jsonb
      )
      from public.requirements r
      where r.project_id = p.id
    ),
    'decisions', (
      select coalesce(
        jsonb_agg(
          jsonb_build_object(
            'id', d.id,
            'project_id', d.project_id,
            'decision_key', d.decision_key,
            'decision', d.decision,
            'rationale', d.rationale,
            'status', d.status,
            'source_event_id', d.source_event_id,
            'supersedes_decision_id', d.supersedes_decision_id,
            'confirmed_at', d.confirmed_at,
            'created_at', d.created_at,
            'updated_at', d.updated_at
          )
          order by d.decision_key, d.confirmed_at nulls last, d.id
        ),
        '[]'::jsonb
      )
      from public.decisions d
      where d.project_id = p.id
    ),
    'milestones', (
      select coalesce(
        jsonb_agg(
          jsonb_build_object(
            'id', m.id,
            'project_id', m.project_id,
            'position', m.position,
            'title', m.title,
            'description', m.description,
            'suggested_status', m.suggested_status,
            'confirmed_status', m.confirmed_status,
            'confirmation_event_id', m.confirmation_event_id,
            'blocked_reason', m.blocked_reason,
            'created_at', m.created_at,
            'updated_at', m.updated_at
          )
          order by m.position, m.id
        ),
        '[]'::jsonb
      )
      from public.milestones m
      where m.project_id = p.id
    ),
    'summaries', (
      select coalesce(
        jsonb_agg(
          jsonb_build_object(
            'id', s.id,
            'project_id', s.project_id,
            'summary_kind', s.summary_kind,
            'version', s.version,
            'based_on_event_sequence', s.based_on_event_sequence,
            'summary_text', s.summary_text,
            'structured_facts', s.structured_facts,
            'status', s.status,
            'created_at', s.created_at
          )
          order by s.summary_kind, s.version desc, s.id
        ),
        '[]'::jsonb
      )
      from public.project_summaries s
      where s.project_id = p.id
    ),
    'preferences', case when pref.id is null then null else jsonb_build_object(
      'skill_level', pref.skill_level,
      'preferred_stack_behavior', pref.preferred_stack_behavior,
      'preferred_stack', pref.preferred_stack,
      'coding_style', pref.coding_style,
      'deployment_preference', pref.deployment_preference
    ) end,
    'project_preference_override', case when ppo.id is null then null else jsonb_build_object(
      'skill_level', ppo.skill_level,
      'preferred_stack_behavior', ppo.preferred_stack_behavior,
      'preferred_stack', ppo.preferred_stack,
      'coding_style', ppo.coding_style,
      'deployment_preference', ppo.deployment_preference
    ) end,
    'recent_evidence', '[]'::jsonb
  )
  into v_snapshot
  from project_row p
  left join public.preferences pref on pref.owner_id = v_owner_id
  left join public.project_preference_overrides ppo on ppo.project_id = p.id;

  if not found then
    raise exception 'project_not_found' using errcode = 'P0001';
  end if;
  return v_snapshot;
end;
$$;

revoke all on function public.get_project_state_snapshot_v1(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.get_project_state_snapshot_v1(uuid)
  to authenticated;

-- ---------------------------------------------------------------------------
-- Versioned generation RPCs. v1 functions remain in the catalog for migration compatibility but
-- lose both authenticated and service-role execution after v2 exists.
-- ---------------------------------------------------------------------------

create or replace function public.claim_generation_run_v2(
  p_project_id uuid,
  p_project_state_version bigint,
  p_idempotency_key text,
  p_request_fingerprint text,
  p_operation_kind text,
  p_input_schema_version text default null,
  p_output_schema_version text default null
)
returns table (
  run_id uuid,
  correlation_id uuid,
  claim_status text,
  status text,
  project_state_version bigint,
  operation_kind text,
  input_schema_version text,
  output_schema_version text,
  provider text,
  model text,
  latency_ms integer,
  input_tokens integer,
  output_tokens integer,
  retry_count integer,
  estimated_cost_micros bigint,
  validation_result text,
  error_code text,
  validated_project_delta_text text,
  validated_project_delta_hash text
)
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_owner_id uuid := auth.uid();
  v_project public.projects%rowtype;
  v_existing public.idempotency_records%rowtype;
  v_run public.generation_runs%rowtype;
begin
  if v_owner_id is null then raise exception 'authentication_required' using errcode = 'P0001'; end if;
  if p_project_id is null then raise exception 'invalid_project_id' using errcode = 'P0001'; end if;
  if p_project_state_version is null or p_project_state_version <= 0 then
    raise exception 'invalid_project_state_version' using errcode = 'P0001';
  end if;
  if p_idempotency_key is null or char_length(btrim(p_idempotency_key)) = 0
     or octet_length(p_idempotency_key) > 255 then
    raise exception 'invalid_idempotency_key' using errcode = 'P0001';
  end if;
  if p_request_fingerprint is null or p_request_fingerprint !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid_request_fingerprint' using errcode = 'P0001';
  end if;
  if p_operation_kind is null or p_operation_kind not in (
    'intent_detection', 'discovery_sufficiency', 'clarification_question', 'project_delta',
    'stack_recommendation', 'action_specification', 'evidence_analysis',
    'completion_suggestion', 'risk_flags'
  ) then
    raise exception 'invalid_operation_kind' using errcode = 'P0001';
  end if;
  if p_input_schema_version is distinct from 'unseenprompt.model-gateway-request.v1' then
    raise exception 'invalid_input_schema_version' using errcode = 'P0001';
  end if;
  if p_output_schema_version is distinct from ('unseenprompt.model-output.' || p_operation_kind || '.v1') then
    raise exception 'invalid_output_schema_version' using errcode = 'P0001';
  end if;

  select * into v_project
  from public.projects
  where id = p_project_id and owner_id = v_owner_id
  for update;
  if not found then raise exception 'project_not_found_or_not_owned' using errcode = 'P0001'; end if;

  insert into public.idempotency_records (
    owner_id, project_id, scope, idempotency_key, request_fingerprint, status, resource_type
  ) values (
    v_owner_id, p_project_id, 'generation', p_idempotency_key, p_request_fingerprint,
    'in_progress', 'generation_run'
  )
  on conflict (owner_id, scope, idempotency_key) where owner_id is not null do nothing
  returning * into v_existing;

  if not found then
    select * into v_existing
    from public.idempotency_records
    where owner_id = v_owner_id and scope = 'generation' and idempotency_key = p_idempotency_key
    for update;
    if not found then raise exception 'idempotency_claim_failed' using errcode = 'P0001'; end if;
    if v_existing.request_fingerprint is distinct from p_request_fingerprint
       or v_existing.project_id is distinct from p_project_id
       or v_existing.resource_type is distinct from 'generation_run' then
      raise exception 'idempotency_conflict' using errcode = 'P0001';
    end if;
    if v_existing.status = 'in_progress' then
      raise exception 'idempotency_in_progress' using errcode = 'P0001';
    end if;
    if v_existing.status = 'succeeded' then
      select * into v_run
      from public.generation_runs
      where id = v_existing.resource_id and project_id = p_project_id
      for update;
      if not found then raise exception 'idempotency_resource_missing' using errcode = 'P0001'; end if;
      if v_run.operation_kind is distinct from p_operation_kind
         or v_run.input_schema_version is distinct from p_input_schema_version
         or v_run.output_schema_version is distinct from p_output_schema_version then
        raise exception 'idempotency_conflict' using errcode = 'P0001';
      end if;
      if v_run.operation_kind = 'project_delta'
         and v_run.output_schema_version = 'unseenprompt.model-output.project_delta.v1'
         and v_run.status = 'succeeded'
         and v_run.validated_project_delta_text is not null then
        return query select
          v_run.id, v_run.correlation_id, 'replayed'::text, v_run.status,
          v_run.project_state_version, v_run.operation_kind, v_run.input_schema_version,
          v_run.output_schema_version, v_run.provider, v_run.model, v_run.latency_ms,
          v_run.input_tokens, v_run.output_tokens, v_run.retry_count,
          v_run.estimated_cost_micros, v_run.validation_result, v_run.error_code,
          v_run.validated_project_delta_text, v_run.validated_project_delta_hash;
        return;
      end if;
      raise exception 'idempotency_replay_unavailable' using errcode = 'P0001';
    end if;
    if v_existing.status = 'failed' then
      select gr.error_code into v_run.error_code
      from public.generation_runs gr
      where gr.id = v_existing.resource_id and gr.idempotency_record_id = v_existing.id;
      if v_run.error_code in (
        'aborted','deadline_exceeded','attempt_timeout','authentication_failed','permission_denied',
        'billing_or_quota_exhausted','rate_limited','provider_unavailable','invalid_provider_request',
        'model_not_found','content_refused','output_truncated','invalid_output','configuration_error',
        'persistence_failed','provider_error','idempotency_conflict','idempotency_in_progress',
        'idempotency_replay_unavailable'
      ) then
        raise exception using message = v_run.error_code, errcode = 'P0001';
      end if;
      raise exception 'generation_failed' using errcode = 'P0001';
    end if;
    raise exception 'idempotency_invalid_state' using errcode = 'P0001';
  end if;

  if p_project_state_version is distinct from v_project.state_version then
    raise exception 'stale_state_version' using errcode = 'P0001';
  end if;

  insert into public.generation_runs (
    project_id, operation_kind, status, project_state_version, input_schema_version,
    output_schema_version, idempotency_record_id, started_at
  ) values (
    p_project_id, p_operation_kind, 'running', p_project_state_version, p_input_schema_version,
    p_output_schema_version, v_existing.id, timezone('utc', now())
  ) returning * into v_run;

  update public.idempotency_records set resource_id = v_run.id where id = v_existing.id;

  return query select
    v_run.id, v_run.correlation_id, 'running'::text, v_run.status,
    v_run.project_state_version, v_run.operation_kind, v_run.input_schema_version,
    v_run.output_schema_version, null::text, null::text, null::integer, null::integer,
    null::integer, null::integer, null::bigint, v_run.validation_result, null::text,
    null::text, null::text;
end;
$$;

create or replace function public.complete_generation_run_v2(
  p_run_id uuid,
  p_status text,
  p_provider text default null,
  p_model text default null,
  p_latency_ms integer default null,
  p_input_tokens integer default null,
  p_output_tokens integer default null,
  p_retry_count integer default 0,
  p_estimated_cost_micros bigint default null,
  p_validation_result text default 'not_attempted',
  p_error_code text default null,
  p_validated_project_delta_text text default null
)
returns table (
  run_id uuid,
  correlation_id uuid,
  status text,
  project_state_version bigint,
  operation_kind text,
  input_schema_version text,
  output_schema_version text,
  provider text,
  model text,
  latency_ms integer,
  input_tokens integer,
  output_tokens integer,
  retry_count integer,
  estimated_cost_micros bigint,
  validation_result text,
  error_code text,
  validated_project_delta_text text,
  validated_project_delta_hash text
)
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_owner_id uuid := auth.uid();
  v_project public.projects%rowtype;
  v_run public.generation_runs%rowtype;
  v_idempotency public.idempotency_records%rowtype;
  v_terminal boolean;
  v_same boolean;
  v_now timestamptz := timezone('utc', now());
begin
  if v_owner_id is null then raise exception 'authentication_required' using errcode = 'P0001'; end if;
  if p_run_id is null then raise exception 'invalid_generation_run_id' using errcode = 'P0001'; end if;
  if p_status is null or p_status not in ('succeeded', 'failed', 'canceled') then
    raise exception 'invalid_generation_terminal_status' using errcode = 'P0001';
  end if;
  if p_provider is not null and p_provider not in ('anthropic', 'openai', 'gemini') then
    raise exception 'invalid_provider' using errcode = 'P0001';
  end if;
  if p_model is not null and (char_length(btrim(p_model)) = 0 or octet_length(p_model) > 255) then
    raise exception 'invalid_model' using errcode = 'P0001';
  end if;
  if p_latency_ms is not null and p_latency_ms < 0 then raise exception 'invalid_latency_ms' using errcode = 'P0001'; end if;
  if p_input_tokens is not null and p_input_tokens < 0 then raise exception 'invalid_input_tokens' using errcode = 'P0001'; end if;
  if p_output_tokens is not null and p_output_tokens < 0 then raise exception 'invalid_output_tokens' using errcode = 'P0001'; end if;
  if p_retry_count is null or p_retry_count < 0 then raise exception 'invalid_retry_count' using errcode = 'P0001'; end if;
  if p_estimated_cost_micros is not null and p_estimated_cost_micros < 0 then
    raise exception 'invalid_estimated_cost_micros' using errcode = 'P0001';
  end if;
  if p_validation_result is null or p_validation_result not in ('not_attempted', 'passed', 'repaired', 'reviewed', 'failed') then
    raise exception 'invalid_validation_result' using errcode = 'P0001';
  end if;
  if p_error_code is not null and p_error_code not in (
    'aborted','deadline_exceeded','attempt_timeout','authentication_failed','permission_denied',
    'billing_or_quota_exhausted','rate_limited','provider_unavailable','invalid_provider_request',
    'model_not_found','content_refused','output_truncated','invalid_output','configuration_error',
    'persistence_failed','provider_error','idempotency_conflict','idempotency_in_progress',
    'idempotency_replay_unavailable'
  ) then
    raise exception 'invalid_error_code' using errcode = 'P0001';
  end if;
  if p_status = 'succeeded' then
    if p_provider is null or p_model is null or p_latency_ms is null
       or p_validation_result not in ('passed', 'repaired', 'reviewed')
       or p_error_code is not null then
      raise exception 'invalid_succeeded_generation' using errcode = 'P0001';
    end if;
  elsif p_error_code is null or p_validation_result not in ('not_attempted', 'failed') then
    raise exception 'invalid_failed_generation' using errcode = 'P0001';
  end if;

  if p_validated_project_delta_text is not null
     and (p_status <> 'succeeded' or not private.phase6_valid_project_delta_text(p_validated_project_delta_text)) then
    raise exception 'invalid_validated_project_delta' using errcode = 'P0001';
  end if;

  -- All v2 generation paths use project -> idempotency -> generation lock order. The initial
  -- owner join is read-only and intentionally gives missing/foreign run IDs one stable error.
  select gr.* into v_run
  from public.generation_runs gr
  join public.projects p on p.id = gr.project_id and p.owner_id = v_owner_id
  where gr.id = p_run_id;
  if not found then raise exception 'generation_run_not_found_or_not_owned' using errcode = 'P0001'; end if;
  select * into v_project
  from public.projects
  where id = v_run.project_id and owner_id = v_owner_id
  for update;
  if not found then raise exception 'generation_run_not_found_or_not_owned' using errcode = 'P0001'; end if;
  if v_run.idempotency_record_id is null then raise exception 'generation_idempotency_missing' using errcode = 'P0001'; end if;
  select * into v_idempotency
  from public.idempotency_records
  where id = v_run.idempotency_record_id and owner_id = v_owner_id and scope = 'generation'
  for update;
  if not found then raise exception 'generation_idempotency_missing' using errcode = 'P0001'; end if;
  select * into v_run from public.generation_runs where id = p_run_id for update;

  if v_run.operation_kind = 'project_delta' then
    if p_status = 'succeeded' and p_validated_project_delta_text is null then
      raise exception 'validated_project_delta_required' using errcode = 'P0001';
    end if;
  elsif p_validated_project_delta_text is not null then
    raise exception 'validated_project_delta_not_allowed' using errcode = 'P0001';
  end if;

  v_terminal := v_run.status in ('succeeded', 'failed', 'canceled');
  if v_terminal then
    v_same := v_run.status = p_status
      and v_run.provider is not distinct from p_provider
      and v_run.model is not distinct from p_model
      and v_run.latency_ms is not distinct from p_latency_ms
      and v_run.input_tokens is not distinct from p_input_tokens
      and v_run.output_tokens is not distinct from p_output_tokens
      and v_run.retry_count is not distinct from p_retry_count
      and v_run.estimated_cost_micros is not distinct from p_estimated_cost_micros
      and v_run.validation_result is not distinct from p_validation_result
      and v_run.error_code is not distinct from p_error_code
      and v_run.validated_project_delta_text is not distinct from p_validated_project_delta_text;
    if not v_same then raise exception 'generation_completion_conflict' using errcode = 'P0001'; end if;
    return query select
      v_run.id, v_run.correlation_id, v_run.status, v_run.project_state_version,
      v_run.operation_kind, v_run.input_schema_version, v_run.output_schema_version,
      v_run.provider, v_run.model, v_run.latency_ms, v_run.input_tokens, v_run.output_tokens,
      v_run.retry_count, v_run.estimated_cost_micros, v_run.validation_result, v_run.error_code,
      v_run.validated_project_delta_text, v_run.validated_project_delta_hash;
    return;
  end if;
  if v_run.status is distinct from 'running' then raise exception 'generation_run_not_running' using errcode = 'P0001'; end if;
  if v_idempotency.status is distinct from 'in_progress' then
    raise exception 'generation_idempotency_missing' using errcode = 'P0001';
  end if;

  update public.generation_runs
  set status = p_status,
      provider = p_provider,
      model = p_model,
      latency_ms = p_latency_ms,
      input_tokens = p_input_tokens,
      output_tokens = p_output_tokens,
      retry_count = p_retry_count,
      estimated_cost_micros = p_estimated_cost_micros,
      validation_result = p_validation_result,
      error_code = p_error_code,
      validated_project_delta_text = p_validated_project_delta_text,
      completed_at = v_now
  where id = v_run.id;

  update public.idempotency_records
  set status = case when p_status = 'succeeded' then 'succeeded' else 'failed' end,
      completed_at = v_now
  where id = v_idempotency.id;

  select * into v_run from public.generation_runs where id = v_run.id;
  return query select
    v_run.id, v_run.correlation_id, v_run.status, v_run.project_state_version,
    v_run.operation_kind, v_run.input_schema_version, v_run.output_schema_version,
    v_run.provider, v_run.model, v_run.latency_ms, v_run.input_tokens, v_run.output_tokens,
    v_run.retry_count, v_run.estimated_cost_micros, v_run.validation_result, v_run.error_code,
    v_run.validated_project_delta_text, v_run.validated_project_delta_hash;
end;
$$;

revoke all on function public.claim_generation_run_v2(uuid, bigint, text, text, text, text, text)
  from public, anon, authenticated, service_role;
revoke all on function public.complete_generation_run_v2(uuid, text, text, text, integer, integer, integer, integer, bigint, text, text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.claim_generation_run_v2(uuid, bigint, text, text, text, text, text)
  to authenticated, service_role;
grant execute on function public.complete_generation_run_v2(uuid, text, text, text, integer, integer, integer, integer, bigint, text, text, text)
  to authenticated, service_role;

revoke all on function public.claim_generation_run(uuid, bigint, text, text, text, text, text)
  from authenticated, service_role;
revoke all on function public.complete_generation_run(uuid, text, text, text, integer, integer, integer, integer, bigint, text, text)
  from authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Command validation and deterministic lifecycle helpers.
-- ---------------------------------------------------------------------------

create or replace function private.phase6_valid_command(p_command jsonb)
returns boolean
language plpgsql
immutable
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_type text;
  v_status text;
begin
  if p_command is null or not private.phase6_json_keys_allowed(p_command, array[
    'type', 'to', 'blockerSummary', 'mode', 'milestoneId', 'requirementId', 'category',
    'predecessorId', 'statement', 'rationale', 'decisionId', 'decisionKey', 'decision',
    'status', 'blockedReason', 'summaryKind', 'summaryText', 'structuredFacts'
  ]) then
    return false;
  end if;
  if not private.phase6_command_text_ok(p_command->'type', 64, false) then return false; end if;
  v_type := p_command->>'type';
  if v_type = 'transition_stage' then
    return private.phase6_json_keys_exact(p_command, array['type', 'to'])
      and private.phase6_command_text_ok(p_command->'to', 64, false)
      and p_command->>'to' in ('discovery','brief_confirmation','ready_for_prompt','prompt_active','awaiting_return','result_review','iteration','completed');
  elsif v_type = 'block_project' then
    return private.phase6_json_keys_exact(p_command, array['type', 'blockerSummary'])
      and private.phase6_command_text_ok(p_command->'blockerSummary', 32768, false);
  elsif v_type in ('unblock_project', 'archive_project', 'restore_project') then
    return private.phase6_json_keys_exact(p_command, array['type']);
  elsif v_type = 'change_mode' then
    return private.phase6_json_keys_exact(p_command, array['type', 'mode'])
      and p_command->>'mode' in ('new_build','feature','bug','review','test','deploy','improve');
  elsif v_type = 'set_active_milestone' then
    return private.phase6_json_keys_exact(p_command, array['type', 'milestoneId'])
      and (p_command->'milestoneId' is null or jsonb_typeof(p_command->'milestoneId') = 'null' or private.phase6_uuid_text_ok(p_command->'milestoneId'));
  elsif v_type = 'confirm_requirement' then
    return private.phase6_json_keys_exact(p_command, array['type','requirementId','category'])
      and private.phase6_uuid_text_ok(p_command->'requirementId')
      and private.phase6_command_text_ok(p_command->'category', 255, false);
  elsif v_type = 'reject_requirement' then
    return private.phase6_json_keys_exact(p_command, array['type','requirementId'])
      and private.phase6_uuid_text_ok(p_command->'requirementId');
  elsif v_type = 'supersede_requirement' then
    return private.phase6_json_keys_allowed(p_command, array['type','predecessorId','category','statement','rationale'])
      and p_command ? 'predecessorId' and p_command ? 'category' and p_command ? 'statement'
      and private.phase6_uuid_text_ok(p_command->'predecessorId')
      and private.phase6_command_text_ok(p_command->'category', 255, false)
      and private.phase6_command_text_ok(p_command->'statement', 16384, false)
      and (not (p_command ? 'rationale') or p_command->'rationale' is null or private.phase6_command_text_ok(p_command->'rationale', 32768, false));
  elsif v_type = 'confirm_decision' then
    return private.phase6_json_keys_exact(p_command, array['type','decisionId','decisionKey'])
      and private.phase6_uuid_text_ok(p_command->'decisionId')
      and private.phase6_command_text_ok(p_command->'decisionKey', 255, false);
  elsif v_type = 'reject_decision' then
    return private.phase6_json_keys_exact(p_command, array['type','decisionId'])
      and private.phase6_uuid_text_ok(p_command->'decisionId');
  elsif v_type = 'supersede_decision' then
    return private.phase6_json_keys_allowed(p_command, array['type','predecessorId','decisionKey','decision','rationale'])
      and p_command ? 'predecessorId' and p_command ? 'decision'
      and private.phase6_uuid_text_ok(p_command->'predecessorId')
      and private.phase6_command_text_ok(p_command->'decision', 16384, false)
      and (not (p_command ? 'decisionKey') or p_command->'decisionKey' is null or private.phase6_command_text_ok(p_command->'decisionKey', 255, false))
      and (not (p_command ? 'rationale') or p_command->'rationale' is null or private.phase6_command_text_ok(p_command->'rationale', 32768, false));
  elsif v_type = 'confirm_milestone_status' then
    if not private.phase6_json_keys_allowed(p_command, array['type','milestoneId','status','blockedReason'])
       or not (p_command ? 'milestoneId') or not (p_command ? 'status')
       or not private.phase6_uuid_text_ok(p_command->'milestoneId')
       or p_command->>'status' not in ('pending','in_progress','completed','needs_verification','blocked') then
      return false;
    end if;
    v_status := p_command->>'status';
    if v_status = 'blocked' then
      return p_command ? 'blockedReason'
        and private.phase6_command_text_ok(p_command->'blockedReason', 32768, false);
    end if;
    return not (p_command ? 'blockedReason') or p_command->'blockedReason' is null;
  elsif v_type = 'replace_summary' then
    return private.phase6_json_keys_allowed(p_command, array['type','summaryKind','summaryText','structuredFacts'])
      and p_command ? 'summaryKind' and p_command ? 'summaryText'
      and private.phase6_command_text_ok(p_command->'summaryKind', 255, false)
      and private.phase6_command_text_ok(p_command->'summaryText', 65536, false)
      and (not (p_command ? 'structuredFacts') or (p_command->'structuredFacts' is not null and jsonb_typeof(p_command->'structuredFacts') = 'object' and octet_length((p_command->'structuredFacts')::text) <= 65536));
  end if;
  return false;
end;
$$;

revoke all on function private.phase6_valid_command(jsonb) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Atomic authenticated user command RPC.
-- ---------------------------------------------------------------------------

create or replace function public.execute_project_command_v1(
  p_project_id uuid,
  p_expected_state_version bigint,
  p_idempotency_key text,
  p_request_fingerprint text,
  p_command jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_owner_id uuid := auth.uid();
  v_project public.projects%rowtype;
  v_idempotency public.idempotency_records%rowtype;
  v_event_id uuid;
  v_next_version bigint;
  v_type text;
  v_to text;
  v_mode text;
  v_milestone_id uuid;
  v_previous_milestone_id uuid;
  v_requirement_id uuid;
  v_decision_id uuid;
  v_predecessor_id uuid;
  v_status text;
  v_event_type text;
  v_payload jsonb;
  v_rationale text;
  v_structured jsonb;
  v_summary_id uuid;
  v_summary_version integer;
  v_new_requirement_id uuid;
  v_new_decision_id uuid;
  v_superseded_requirement_id uuid;
  v_superseded_decision_id uuid;
  v_claimed boolean;
  v_existing_event public.project_events%rowtype;
begin
  if v_owner_id is null then raise exception 'auth_required' using errcode = 'P0001'; end if;
  if p_project_id is null or p_expected_state_version is null or p_expected_state_version <= 0
     or p_idempotency_key is null or char_length(btrim(p_idempotency_key)) = 0
     or octet_length(p_idempotency_key) > 255
     or p_request_fingerprint is null or p_request_fingerprint !~ '^[0-9a-f]{64}$'
     or not private.phase6_valid_command(p_command) then
    raise exception 'validation_failed' using errcode = 'P0001';
  end if;

  select * into v_project
  from public.projects
  where id = p_project_id
    and owner_id = v_owner_id
  for update;
  if not found then
    raise exception 'project_not_found' using errcode = 'P0001';
  end if;

  insert into public.idempotency_records (
    owner_id, project_id, scope, idempotency_key, request_fingerprint, status, resource_type
  ) values (
    v_owner_id, p_project_id, 'lifecycle', p_idempotency_key, p_request_fingerprint,
    'in_progress', 'project_event'
  )
  on conflict (owner_id, scope, idempotency_key) where owner_id is not null do nothing
  returning * into v_idempotency;
  v_claimed := found;
  if not v_claimed then
    select * into v_idempotency
    from public.idempotency_records
    where owner_id = v_owner_id and scope = 'lifecycle' and idempotency_key = p_idempotency_key
    for update;
    if not found or v_idempotency.request_fingerprint is distinct from p_request_fingerprint
       or v_idempotency.project_id is distinct from p_project_id
       or v_idempotency.resource_type is distinct from 'project_event' then
      raise exception 'idempotency_conflict' using errcode = 'P0001';
    end if;
    if v_idempotency.status = 'in_progress' then raise exception 'idempotency_in_progress' using errcode = 'P0001'; end if;
    if v_idempotency.status = 'succeeded' then
      select * into v_existing_event from public.project_events
      where id = v_idempotency.resource_id and project_id = p_project_id;
      if not found then raise exception 'persistence_failed' using errcode = 'P0001'; end if;
      return jsonb_build_object('project_id', p_project_id, 'state_version', v_existing_event.sequence_number, 'event_id', v_existing_event.id, 'replayed', true);
    end if;
    raise exception 'persistence_failed' using errcode = 'P0001';
  end if;

  if p_expected_state_version is distinct from v_project.state_version then
    raise exception 'stale_state_version' using errcode = 'P0001';
  end if;
  v_type := p_command->>'type';
  if v_project.stage = 'archived' and v_type <> 'restore_project' then
    raise exception 'invalid_transition' using errcode = 'P0001';
  end if;
  v_next_version := v_project.state_version + 1;
  v_event_type := null;
  v_payload := jsonb_build_object('schemaVersion', 1);

  if v_type = 'transition_stage' then
    v_to := p_command->>'to';
    if v_project.stage in ('blocked','archived') or v_to in ('blocked','archived') or v_to = v_project.stage then
      raise exception 'invalid_transition' using errcode = 'P0001';
    end if;
    if not (
      (v_project.stage = 'discovery' and v_to = 'brief_confirmation')
      or (v_project.stage = 'brief_confirmation' and v_to in ('discovery','ready_for_prompt'))
      or (v_project.stage = 'ready_for_prompt' and v_to in ('brief_confirmation','prompt_active'))
      or (v_project.stage = 'prompt_active' and v_to = 'awaiting_return')
      or (v_project.stage = 'awaiting_return' and v_to = 'result_review')
      or (v_project.stage = 'result_review' and v_to in ('iteration','completed'))
      or (v_project.stage = 'iteration' and v_to in ('ready_for_prompt','completed'))
      or (v_project.stage = 'completed' and v_to = 'iteration')
    ) then raise exception 'invalid_transition' using errcode = 'P0001'; end if;
    if v_project.stage = 'brief_confirmation' and v_to = 'ready_for_prompt' then
      if not exists (select 1 from public.requirements r where r.project_id = p_project_id and r.status = 'confirmed')
         or v_project.blocker_summary is not null then
        raise exception 'transition_precondition_failed' using errcode = 'P0001';
      end if;
    elsif v_project.stage = 'ready_for_prompt' and v_to = 'prompt_active' then
      if v_project.selected_tool is null or v_project.active_milestone_id is null then
        raise exception 'transition_precondition_failed' using errcode = 'P0001';
      end if;
    elsif v_project.stage = 'prompt_active' and v_to = 'awaiting_return' and v_project.blocker_summary is not null then
      raise exception 'transition_precondition_failed' using errcode = 'P0001';
    elsif v_to = 'completed' then
      if v_project.blocker_summary is not null then raise exception 'completion_precondition_failed' using errcode = 'P0001'; end if;
      if not exists (select 1 from public.milestones where project_id = p_project_id) then
        raise exception 'completion_precondition_failed' using errcode = 'P0001';
      end if;
      if exists (select 1 from public.milestones m where m.project_id = p_project_id and m.confirmed_status is distinct from 'completed') then
        raise exception 'completion_precondition_failed' using errcode = 'P0001';
      end if;
    elsif v_project.stage = 'iteration' and v_to = 'ready_for_prompt' then
      if v_project.active_milestone_id is null or exists (select 1 from public.milestones m where m.id = v_project.active_milestone_id and m.confirmed_status = 'completed') then
        raise exception 'transition_precondition_failed' using errcode = 'P0001';
      end if;
    end if;
    v_event_type := case when v_to = 'completed' then 'project.completed' else 'project.stage_transitioned' end;
    v_payload := v_payload || jsonb_build_object('from', v_project.stage, 'to', v_to);
  elsif v_type = 'block_project' then
    if v_project.stage in ('blocked','archived','completed') then raise exception 'invalid_transition' using errcode = 'P0001'; end if;
    v_event_type := 'project.blocked';
    v_payload := v_payload || jsonb_build_object('from', v_project.stage, 'to', 'blocked');
  elsif v_type = 'unblock_project' then
    if v_project.stage <> 'blocked' or v_project.blocked_from_stage is null then raise exception 'resume_target_unavailable' using errcode = 'P0001'; end if;
    v_to := v_project.blocked_from_stage;
    v_event_type := 'project.unblocked';
    v_payload := v_payload || jsonb_build_object('from','blocked','to',v_to);
  elsif v_type = 'archive_project' then
    if v_project.stage = 'archived' then raise exception 'invalid_transition' using errcode = 'P0001'; end if;
    v_event_type := 'project.archived';
    v_payload := v_payload || jsonb_build_object('from', v_project.stage, 'to', 'archived');
  elsif v_type = 'restore_project' then
    if v_project.stage <> 'archived' or v_project.archived_from_stage is null then raise exception 'resume_target_unavailable' using errcode = 'P0001'; end if;
    v_to := v_project.archived_from_stage;
    v_event_type := 'project.restored';
    v_payload := v_payload || jsonb_build_object('from','archived','to',v_to);
  elsif v_type = 'change_mode' then
    if v_project.stage = 'archived' or v_project.mode = p_command->>'mode' then raise exception 'invalid_transition' using errcode = 'P0001'; end if;
    v_event_type := 'project.mode_changed';
    v_payload := v_payload || jsonb_build_object('from',v_project.mode,'to',p_command->>'mode');
  elsif v_type = 'set_active_milestone' then
    if v_project.stage = 'archived' then raise exception 'invalid_transition' using errcode = 'P0001'; end if;
    if p_command->'milestoneId' is null then v_milestone_id := null; else v_milestone_id := (p_command->>'milestoneId')::uuid; end if;
    if v_milestone_id is not null and not exists (select 1 from public.milestones m where m.id = v_milestone_id and m.project_id = p_project_id) then raise exception 'entity_not_found' using errcode = 'P0001'; end if;
    if v_milestone_id is not distinct from v_project.active_milestone_id then raise exception 'invalid_transition' using errcode = 'P0001'; end if;
    v_event_type := case when v_milestone_id is null then 'milestone.deactivated' else 'milestone.activated' end;
    v_payload := v_payload || jsonb_build_object('previousMilestoneId',v_project.active_milestone_id,'milestoneId',v_milestone_id);
  elsif v_type in ('confirm_requirement','reject_requirement','supersede_requirement') then
    if v_type = 'confirm_requirement' then v_requirement_id := (p_command->>'requirementId')::uuid; elsif v_type = 'reject_requirement' then v_requirement_id := (p_command->>'requirementId')::uuid; else v_predecessor_id := (p_command->>'predecessorId')::uuid; end if;
    if v_type <> 'supersede_requirement' then
      select * into v_existing_event from public.project_events where id = v_requirement_id and project_id = p_project_id;
    end if;
    if v_type = 'confirm_requirement' then
      if not exists (select 1 from public.requirements r where r.id = v_requirement_id and r.project_id = p_project_id) then raise exception 'entity_not_found' using errcode='P0001'; end if;
      if (select status from public.requirements where id=v_requirement_id) <> 'proposed' then raise exception 'entity_state_conflict' using errcode='P0001'; end if;
      v_superseded_requirement_id := (select supersedes_requirement_id from public.requirements where id=v_requirement_id);
      if v_superseded_requirement_id is not null then
        if not exists (select 1 from public.requirements where id=v_superseded_requirement_id and project_id=p_project_id and status='confirmed') then raise exception 'supersession_conflict' using errcode='P0001'; end if;
        if exists (select 1 from public.requirements where supersedes_requirement_id=v_superseded_requirement_id and id<>v_requirement_id) then raise exception 'supersession_conflict' using errcode='P0001'; end if;
      end if;
      v_event_type := 'requirement.confirmed';
    elsif v_type = 'reject_requirement' then
      if not exists (select 1 from public.requirements r where r.id = v_requirement_id and r.project_id = p_project_id) then raise exception 'entity_not_found' using errcode='P0001'; end if;
      if (select status from public.requirements where id=v_requirement_id) <> 'proposed' then raise exception 'entity_state_conflict' using errcode='P0001'; end if;
      v_event_type := 'requirement.rejected';
    else
      if not exists (select 1 from public.requirements r where r.id=v_predecessor_id and r.project_id=p_project_id and r.status='confirmed') then raise exception 'supersession_conflict' using errcode='P0001'; end if;
      if exists (select 1 from public.requirements r where r.supersedes_requirement_id=v_predecessor_id) then raise exception 'supersession_conflict' using errcode='P0001'; end if;
      v_new_requirement_id := gen_random_uuid();
      v_event_type := 'requirement.superseded';
    end if;
  elsif v_type in ('confirm_decision','reject_decision','supersede_decision') then
    if v_type = 'confirm_decision' then v_decision_id := (p_command->>'decisionId')::uuid; elsif v_type='reject_decision' then v_decision_id := (p_command->>'decisionId')::uuid; else v_predecessor_id := (p_command->>'predecessorId')::uuid; end if;
    if v_type = 'confirm_decision' then
      if not exists (select 1 from public.decisions d where d.id=v_decision_id and d.project_id=p_project_id) then raise exception 'entity_not_found' using errcode='P0001'; end if;
      if (select status from public.decisions where id=v_decision_id) <> 'proposed' then raise exception 'entity_state_conflict' using errcode='P0001'; end if;
      v_mode := lower(btrim(p_command->>'decisionKey'));
      if v_mode !~ '^[a-z0-9]+(?:[._-][a-z0-9]+)*$' or octet_length(v_mode)>255 then raise exception 'validation_failed' using errcode='P0001'; end if;
      v_superseded_decision_id := (select supersedes_decision_id from public.decisions where id=v_decision_id);
      if exists (
        select 1
        from public.decisions d
        where d.project_id=p_project_id
          and d.status='confirmed'
          and d.decision_key=v_mode
          and d.id<>v_decision_id
          and (v_superseded_decision_id is null or d.id<>v_superseded_decision_id)
      ) then raise exception 'decision_key_conflict' using errcode='P0001'; end if;
      if v_superseded_decision_id is not null then
        if not exists (select 1 from public.decisions where id=v_superseded_decision_id and project_id=p_project_id and status='confirmed') then raise exception 'supersession_conflict' using errcode='P0001'; end if;
        if exists (select 1 from public.decisions where supersedes_decision_id=v_superseded_decision_id and id<>v_decision_id) then raise exception 'supersession_conflict' using errcode='P0001'; end if;
      end if;
      v_event_type := 'decision.confirmed';
    elsif v_type = 'reject_decision' then
      if not exists (select 1 from public.decisions d where d.id=v_decision_id and d.project_id=p_project_id) then raise exception 'entity_not_found' using errcode='P0001'; end if;
      if (select status from public.decisions where id=v_decision_id) <> 'proposed' then raise exception 'entity_state_conflict' using errcode='P0001'; end if;
      v_event_type := 'decision.rejected';
    else
      if not exists (select 1 from public.decisions d where d.id=v_predecessor_id and d.project_id=p_project_id and d.status='confirmed') then raise exception 'supersession_conflict' using errcode='P0001'; end if;
      if exists (select 1 from public.decisions d where d.supersedes_decision_id=v_predecessor_id) then raise exception 'supersession_conflict' using errcode='P0001'; end if;
      v_mode := coalesce(lower(btrim(p_command->>'decisionKey')), (select decision_key from public.decisions where id=v_predecessor_id));
      if v_mode !~ '^[a-z0-9]+(?:[._-][a-z0-9]+)*$' or octet_length(v_mode)>255 then raise exception 'validation_failed' using errcode='P0001'; end if;
      if exists (select 1 from public.decisions d where d.project_id=p_project_id and d.status='confirmed' and d.decision_key=v_mode and d.id<>v_predecessor_id) then raise exception 'decision_key_conflict' using errcode='P0001'; end if;
      v_new_decision_id := gen_random_uuid();
      v_event_type := 'decision.superseded';
    end if;
  elsif v_type = 'confirm_milestone_status' then
    v_milestone_id := (p_command->>'milestoneId')::uuid;
    if not exists (select 1 from public.milestones m where m.id=v_milestone_id and m.project_id=p_project_id) then raise exception 'entity_not_found' using errcode='P0001'; end if;
    v_status := p_command->>'status';
    v_event_type := 'milestone.status_confirmed';
    v_payload := v_payload || jsonb_build_object(
      'previousMilestoneId',v_project.active_milestone_id,
      'milestoneId',v_milestone_id,
      'beforeStatus',(select confirmed_status from public.milestones where id=v_milestone_id),
      'afterStatus',v_status
    );
  elsif v_type = 'replace_summary' then
    v_structured := coalesce(p_command->'structuredFacts','{}'::jsonb);
    v_summary_version := coalesce((select max(version)+1 from public.project_summaries where project_id=p_project_id and summary_kind=p_command->>'summaryKind'),1);
    v_summary_id := gen_random_uuid();
    v_payload := v_payload || jsonb_build_object('summaryId',v_summary_id,'summaryKind',p_command->>'summaryKind','version',v_summary_version);
    v_event_type := 'project.summary_replaced';
  else
    raise exception 'validation_failed' using errcode='P0001';
  end if;

  if v_type = 'confirm_requirement' then
    v_payload := v_payload || jsonb_build_object('entityId',v_requirement_id,'beforeStatus','proposed','afterStatus','confirmed');
    if v_superseded_requirement_id is not null then
      v_payload := v_payload || jsonb_build_object('predecessorId',v_superseded_requirement_id);
    end if;
  elsif v_type = 'reject_requirement' then
    v_payload := v_payload || jsonb_build_object('entityId',v_requirement_id,'beforeStatus','proposed','afterStatus','rejected');
  elsif v_type = 'supersede_requirement' then
    v_payload := v_payload || jsonb_build_object('entityId',v_new_requirement_id,'predecessorId',v_predecessor_id,'beforeStatus','confirmed','afterStatus','superseded');
  elsif v_type = 'confirm_decision' then
    v_payload := v_payload || jsonb_build_object('entityId',v_decision_id,'beforeStatus','proposed','afterStatus','confirmed');
    if v_superseded_decision_id is not null then
      v_payload := v_payload || jsonb_build_object('predecessorId',v_superseded_decision_id);
    end if;
  elsif v_type = 'reject_decision' then
    v_payload := v_payload || jsonb_build_object('entityId',v_decision_id,'beforeStatus','proposed','afterStatus','rejected');
  elsif v_type = 'supersede_decision' then
    v_payload := v_payload || jsonb_build_object('entityId',v_new_decision_id,'predecessorId',v_predecessor_id,'beforeStatus','confirmed','afterStatus','superseded');
  end if;

  -- Event first gives every controlled child mutation one immutable source event. All statements
  -- remain in this transaction; a later error rolls the event back as well.
  insert into public.project_events (
    project_id, sequence_number, event_type, event_schema_version, actor_type, actor_id,
    idempotency_record_id, payload
  ) values (
    p_project_id, v_next_version, v_event_type, 1, 'user', v_owner_id, v_idempotency.id, v_payload
  ) returning * into v_existing_event;
  v_event_id := v_existing_event.id;

  if v_type = 'transition_stage' then
    update public.projects set stage=v_to, state_version=v_next_version, last_activity_at=timezone('utc',now()) where id=p_project_id;
  elsif v_type = 'block_project' then
    update public.projects set stage='blocked', blocked_from_stage=v_project.stage, blocker_summary=p_command->>'blockerSummary', state_version=v_next_version, last_activity_at=timezone('utc',now()) where id=p_project_id;
  elsif v_type = 'unblock_project' then
    update public.projects set stage=v_to, blocked_from_stage=null, blocker_summary=null, state_version=v_next_version, last_activity_at=timezone('utc',now()) where id=p_project_id;
  elsif v_type = 'archive_project' then
    update public.projects set stage='archived', archived_from_stage=v_project.stage, blocked_from_stage=case when v_project.stage='blocked' then v_project.blocked_from_stage else null end, blocker_summary=case when v_project.stage='blocked' then v_project.blocker_summary else null end, archived_at=timezone('utc',now()), state_version=v_next_version, last_activity_at=timezone('utc',now()) where id=p_project_id;
  elsif v_type = 'restore_project' then
    update public.projects set stage=v_to, archived_from_stage=null, archived_at=null, blocked_from_stage=case when v_to='blocked' then blocked_from_stage else null end, blocker_summary=case when v_to='blocked' then blocker_summary else null end, state_version=v_next_version, last_activity_at=timezone('utc',now()) where id=p_project_id;
  elsif v_type = 'change_mode' then
    update public.projects set mode=p_command->>'mode', state_version=v_next_version, last_activity_at=timezone('utc',now()) where id=p_project_id;
  elsif v_type = 'set_active_milestone' then
    update public.projects set active_milestone_id=v_milestone_id, state_version=v_next_version, last_activity_at=timezone('utc',now()) where id=p_project_id;
  elsif v_type = 'confirm_requirement' then
    update public.requirements set category=p_command->>'category', status='confirmed', confirmed_at=timezone('utc',now()), source_event_id=v_event_id where id=v_requirement_id;
    if exists (select 1 from public.requirements where id=v_requirement_id and supersedes_requirement_id is not null) then
      update public.requirements set status='superseded', confirmed_at=null, source_event_id=v_event_id where id=(select supersedes_requirement_id from public.requirements where id=v_requirement_id);
    end if;
    update public.projects set state_version=v_next_version,last_activity_at=timezone('utc',now()) where id=p_project_id;
  elsif v_type = 'reject_requirement' then
    update public.requirements set status='rejected', source_event_id=v_event_id where id=v_requirement_id;
    update public.projects set state_version=v_next_version,last_activity_at=timezone('utc',now()) where id=p_project_id;
  elsif v_type = 'supersede_requirement' then
    insert into public.requirements (id,project_id,category,statement,rationale,status,source_event_id,supersedes_requirement_id,confirmed_at)
    values (v_new_requirement_id,p_project_id,p_command->>'category',p_command->>'statement',case when p_command->'rationale' is null then null else p_command->>'rationale' end,'confirmed',v_event_id,v_predecessor_id,timezone('utc',now()));
    update public.requirements set status='superseded', confirmed_at=null, source_event_id=v_event_id where id=v_predecessor_id;
    update public.projects set state_version=v_next_version,last_activity_at=timezone('utc',now()) where id=p_project_id;
  elsif v_type = 'confirm_decision' then
    if exists (select 1 from public.decisions where id=v_decision_id and supersedes_decision_id is not null) then
      update public.decisions set status='superseded',confirmed_at=null,source_event_id=v_event_id where id=(select supersedes_decision_id from public.decisions where id=v_decision_id);
    end if;
    update public.decisions set decision_key=v_mode,status='confirmed',confirmed_at=timezone('utc',now()),source_event_id=v_event_id where id=v_decision_id;
    update public.projects set state_version=v_next_version,last_activity_at=timezone('utc',now()) where id=p_project_id;
  elsif v_type = 'reject_decision' then
    update public.decisions set status='rejected',source_event_id=v_event_id where id=v_decision_id;
    update public.projects set state_version=v_next_version,last_activity_at=timezone('utc',now()) where id=p_project_id;
  elsif v_type = 'supersede_decision' then
    update public.decisions set status='superseded', confirmed_at=null, source_event_id=v_event_id where id=v_predecessor_id;
    insert into public.decisions (id,project_id,decision_key,decision,rationale,status,source_event_id,supersedes_decision_id,confirmed_at)
    values (v_new_decision_id,p_project_id,v_mode,p_command->>'decision',case when p_command->'rationale' is null then null else p_command->>'rationale' end,'confirmed',v_event_id,v_predecessor_id,timezone('utc',now()));
    update public.projects set state_version=v_next_version,last_activity_at=timezone('utc',now()) where id=p_project_id;
  elsif v_type = 'confirm_milestone_status' then
    update public.milestones set confirmed_status=v_status, blocked_reason=case when v_status='blocked' then p_command->>'blockedReason' else null end, confirmation_event_id=v_event_id where id=v_milestone_id;
    update public.projects set state_version=v_next_version,last_activity_at=timezone('utc',now()) where id=p_project_id;
  elsif v_type = 'replace_summary' then
    update public.project_summaries set status='superseded' where project_id=p_project_id and summary_kind=p_command->>'summaryKind' and status='current';
    insert into public.project_summaries (id,project_id,summary_kind,version,based_on_event_sequence,summary_text,structured_facts,status)
    values (v_summary_id,p_project_id,p_command->>'summaryKind',v_summary_version,v_next_version,p_command->>'summaryText',v_structured,'current');
    update public.projects set state_version=v_next_version,last_activity_at=timezone('utc',now()) where id=p_project_id;
  end if;

  update public.idempotency_records set status='succeeded',resource_type='project_event',resource_id=v_event_id,project_id=p_project_id,completed_at=timezone('utc',now()) where id=v_idempotency.id;
  return jsonb_build_object('project_id',p_project_id,'state_version',v_next_version,'event_id',v_event_id,'replayed',false);
end;
$$;

revoke all on function public.execute_project_command_v1(uuid,bigint,text,text,jsonb) from public, anon, authenticated, service_role;
grant execute on function public.execute_project_command_v1(uuid,bigint,text,text,jsonb) to authenticated;

revoke all on function public.commit_project_change(uuid,bigint,text,text,text,jsonb,text,text,text,text,uuid,timestamptz,text)
  from authenticated;
grant execute on function public.commit_project_change(uuid,bigint,text,text,text,jsonb,text,text,text,text,uuid,timestamptz,text)
  to service_role;

-- ---------------------------------------------------------------------------
-- Apply a persisted, validated project_delta.v1 proposal. The run UUID, not caller content, is the
-- apply-once identity. Model data creates proposals/suggestions only; this RPC never confirms them.
-- ---------------------------------------------------------------------------

create or replace function public.apply_validated_project_delta_v1(
  p_project_id uuid,
  p_generation_run_id uuid,
  p_expected_state_version bigint
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_owner_id uuid := auth.uid();
  v_run public.generation_runs%rowtype;
  v_project public.projects%rowtype;
  v_application public.project_delta_applications%rowtype;
  v_event public.project_events%rowtype;
  v_doc jsonb;
  v_item jsonb;
  v_action text;
  v_reference text;
  v_id uuid;
  v_position integer;
  v_next_version bigint;
  v_created_requirements jsonb := '[]'::jsonb;
  v_updated_requirements jsonb := '[]'::jsonb;
  v_created_decisions jsonb := '[]'::jsonb;
  v_updated_decisions jsonb := '[]'::jsonb;
  v_created_milestones jsonb := '[]'::jsonb;
  v_updated_milestones jsonb := '[]'::jsonb;
  v_index integer := 0;
begin
  if v_owner_id is null then raise exception 'auth_required' using errcode='P0001'; end if;
  if p_project_id is null or p_generation_run_id is null or p_expected_state_version is null or p_expected_state_version <= 0 then raise exception 'validation_failed' using errcode='P0001'; end if;

  -- Lock order is project first, then generation, matching the v2 claim and lifecycle RPCs. The
  -- owner/project join intentionally gives missing, foreign, and misbound run IDs the same safe
  -- result before any replay or mutation can occur.
  select gr.* into v_run
  from public.generation_runs gr
  join public.projects p on p.id=gr.project_id and p.id=p_project_id and p.owner_id=v_owner_id
  where gr.id=p_generation_run_id and gr.project_id=p_project_id;
  if not found then raise exception 'proposal_not_replayable' using errcode='P0001'; end if;
  select * into v_project from public.projects where id=p_project_id and owner_id=v_owner_id for update;
  if not found then raise exception 'project_not_found' using errcode='P0001'; end if;
  select * into v_run from public.generation_runs where id=p_generation_run_id for update;

  select * into v_application
  from public.project_delta_applications
  where project_id=p_project_id and generation_run_id=p_generation_run_id
  for update;
  if found then
    select * into v_event from public.project_events where id=v_application.event_id;
    if not found then raise exception 'persistence_failed' using errcode='P0001'; end if;
    return jsonb_build_object('project_id',v_application.project_id,'state_version',v_application.applied_state_version,'event_id',v_application.event_id,'replayed',true);
  end if;

  -- A persisted proposal may replay after archival, but a new application must not mutate an
  -- archived project. This check intentionally follows the apply-once receipt lookup.
  if v_project.stage = 'archived' then
    raise exception 'invalid_transition' using errcode='P0001';
  end if;

  if v_run.project_state_version is distinct from p_expected_state_version then
    raise exception 'proposal_conflict' using errcode = 'P0001';
  end if;
  if v_project.state_version is distinct from p_expected_state_version then raise exception 'stale_state_version' using errcode='P0001'; end if;
  if v_run.status <> 'succeeded' or v_run.operation_kind <> 'project_delta' then raise exception 'proposal_schema_mismatch' using errcode='P0001'; end if;
  if v_run.output_schema_version <> 'unseenprompt.model-output.project_delta.v1' or v_run.validated_project_delta_text is null then raise exception 'proposal_not_replayable' using errcode='P0001'; end if;
  if v_run.validated_project_delta_hash <> encode(extensions.digest(convert_to(v_run.validated_project_delta_text,'UTF8'),'sha256'),'hex')
     or not private.phase6_valid_project_delta_text(v_run.validated_project_delta_text) then raise exception 'proposal_schema_mismatch' using errcode='P0001'; end if;
  v_doc := v_run.validated_project_delta_text::jsonb;
  if jsonb_array_length(v_doc->'unresolvedConflicts') > 0 then raise exception 'proposal_conflict' using errcode='P0001'; end if;
  if exists (
    select 1 from (
      select value->>'reference' as reference
      from jsonb_array_elements(v_doc->'requirementProposals')
      where value->>'action' = 'revise'
      group by value->>'reference'
      having count(*) > 1
    ) duplicate_requirement_references
  ) then raise exception 'proposal_conflict' using errcode='P0001'; end if;
  if exists (
    select 1 from (
      select value->>'reference' as reference
      from jsonb_array_elements(v_doc->'decisionProposals')
      where value->>'action' = 'revise'
      group by value->>'reference'
      having count(*) > 1
    ) duplicate_decision_references
  ) then raise exception 'proposal_conflict' using errcode='P0001'; end if;
  if exists (
    select 1 from (
      select value->>'reference' as reference
      from jsonb_array_elements(v_doc->'milestoneProposals')
      where value->>'action' = 'revise'
      group by value->>'reference'
      having count(*) > 1
    ) duplicate_milestone_references
  ) then raise exception 'proposal_conflict' using errcode='P0001'; end if;

  -- Validate every action/reference before creating a child so conflicts cannot be interpreted as
  -- partial proposal application. All inserts below remain rollback-safe as an additional guard.
  for v_item in select value from jsonb_array_elements(v_doc->'requirementProposals') loop
    v_action := v_item->>'action'; v_reference := v_item->>'reference';
    if v_action = 'remove' then raise exception 'proposal_conflict' using errcode='P0001'; end if;
    if not private.phase6_command_text_ok(v_item->'statement', 16384, false)
       or not private.phase6_command_text_ok(v_item->'rationale', 32768, false) then
      raise exception 'proposal_conflict' using errcode='P0001';
    end if;
    if v_action = 'revise' then
      begin v_id := v_reference::uuid; exception when others then raise exception 'proposal_conflict' using errcode='P0001'; end;
      if not exists (select 1 from public.requirements r where r.id=v_id and r.project_id=v_project.id and r.status='confirmed') then raise exception 'proposal_conflict' using errcode='P0001'; end if;
      if exists (select 1 from public.requirements r where r.supersedes_requirement_id=v_id) then raise exception 'proposal_conflict' using errcode='P0001'; end if;
    end if;
  end loop;
  for v_item in select value from jsonb_array_elements(v_doc->'decisionProposals') loop
    v_action := v_item->>'action'; v_reference := v_item->>'reference';
    if v_action = 'remove' then raise exception 'proposal_conflict' using errcode='P0001'; end if;
    if not private.phase6_command_text_ok(v_item->'statement', 16384, false)
       or not private.phase6_command_text_ok(v_item->'rationale', 32768, false) then
      raise exception 'proposal_conflict' using errcode='P0001';
    end if;
    if v_action = 'revise' then
      begin v_id := v_reference::uuid; exception when others then raise exception 'proposal_conflict' using errcode='P0001'; end;
      if not exists (select 1 from public.decisions d where d.id=v_id and d.project_id=v_project.id and d.status='confirmed') then raise exception 'proposal_conflict' using errcode='P0001'; end if;
      if exists (select 1 from public.decisions d where d.supersedes_decision_id=v_id) then raise exception 'proposal_conflict' using errcode='P0001'; end if;
    end if;
  end loop;
  for v_item in select value from jsonb_array_elements(v_doc->'milestoneProposals') loop
    v_action := v_item->>'action'; v_reference := v_item->>'reference';
    if v_action = 'remove' then raise exception 'proposal_conflict' using errcode='P0001'; end if;
    if not private.phase6_command_text_ok(v_item->'title', 240, false)
       or not private.phase6_command_text_ok(v_item->'rationale', 32768, false) then
      raise exception 'proposal_conflict' using errcode='P0001';
    end if;
    if v_action = 'revise' then
      begin v_id := v_reference::uuid; exception when others then raise exception 'proposal_conflict' using errcode='P0001'; end;
      if not exists (select 1 from public.milestones m where m.id=v_id and m.project_id=v_project.id) then raise exception 'proposal_conflict' using errcode='P0001'; end if;
    end if;
  end loop;

  v_next_version := v_project.state_version + 1;
  for v_item in select value from jsonb_array_elements(v_doc->'requirementProposals') loop
    if v_item->>'action' = 'add' then
      v_id := gen_random_uuid();
      insert into public.requirements (id,project_id,category,statement,rationale,status)
      values (v_id,v_project.id,'model_proposal',v_item->>'statement',v_item->>'rationale','proposed');
      v_created_requirements := v_created_requirements || jsonb_build_array(v_id);
    else
      v_id := (v_item->>'reference')::uuid;
      insert into public.requirements (id,project_id,category,statement,rationale,status,supersedes_requirement_id)
      values (gen_random_uuid(),v_project.id,'model_proposal',v_item->>'statement',v_item->>'rationale','proposed',v_id);
      v_created_requirements := v_created_requirements || jsonb_build_array((select id from public.requirements where project_id=v_project.id and supersedes_requirement_id=v_id and status='proposed' order by created_at desc limit 1));
      v_updated_requirements := v_updated_requirements || jsonb_build_array(v_id);
    end if;
  end loop;
  v_index := 0;
  for v_item in select value from jsonb_array_elements(v_doc->'decisionProposals') loop
    if v_item->>'action' = 'add' then
      v_id := gen_random_uuid();
      insert into public.decisions (id,project_id,decision_key,decision,rationale,status)
      values (v_id,v_project.id,'proposal:' || p_generation_run_id::text || ':' || v_index::text,v_item->>'statement',v_item->>'rationale','proposed');
      v_created_decisions := v_created_decisions || jsonb_build_array(v_id);
    else
      v_id := (v_item->>'reference')::uuid;
      insert into public.decisions (id,project_id,decision_key,decision,rationale,status,supersedes_decision_id)
      select gen_random_uuid(),v_project.id,d.decision_key,v_item->>'statement',v_item->>'rationale','proposed',d.id
      from public.decisions d where d.id=v_id and d.project_id=v_project.id;
      v_created_decisions := v_created_decisions || jsonb_build_array((select id from public.decisions where project_id=v_project.id and supersedes_decision_id=v_id and status='proposed' order by created_at desc limit 1));
      v_updated_decisions := v_updated_decisions || jsonb_build_array(v_id);
    end if;
    v_index := v_index + 1;
  end loop;
  v_position := coalesce((select max(position)+1 from public.milestones where project_id=v_project.id),1);
  for v_item in select value from jsonb_array_elements(v_doc->'milestoneProposals') loop
    if v_item->>'action' = 'add' then
      v_id := gen_random_uuid();
      insert into public.milestones (id,project_id,position,title,description,suggested_status)
      values (v_id,v_project.id,v_position,v_item->>'title',v_item->>'rationale','pending');
      v_created_milestones := v_created_milestones || jsonb_build_array(v_id);
      v_position := v_position + 1;
    else
      v_id := (v_item->>'reference')::uuid;
      update public.milestones set title=v_item->>'title',description=v_item->>'rationale' where id=v_id and project_id=v_project.id;
      v_updated_milestones := v_updated_milestones || jsonb_build_array(v_id);
    end if;
  end loop;

  insert into public.project_events (
    project_id,sequence_number,event_type,event_schema_version,actor_type,actor_id,payload
  ) values (
    v_project.id,v_next_version,'project.delta_proposed',1,'user',v_owner_id,
    jsonb_build_object('schemaVersion',1,'generationRunId',p_generation_run_id,
      'createdRequirementIds',v_created_requirements,'updatedRequirementIds',v_updated_requirements,
      'createdDecisionIds',v_created_decisions,'updatedDecisionIds',v_updated_decisions,
      'createdMilestoneIds',v_created_milestones,'updatedMilestoneIds',v_updated_milestones)
  ) returning * into v_event;

  update public.requirements set source_event_id=v_event.id where id in (select jsonb_array_elements_text(v_created_requirements)::uuid);
  update public.decisions set source_event_id=v_event.id where id in (select jsonb_array_elements_text(v_created_decisions)::uuid);
  update public.projects set state_version=v_next_version,last_activity_at=timezone('utc',now()) where id=v_project.id;
  insert into public.project_delta_applications (project_id,generation_run_id,event_id,applied_state_version)
  values (v_project.id,p_generation_run_id,v_event.id,v_next_version);
  return jsonb_build_object('project_id',v_project.id,'state_version',v_next_version,'event_id',v_event.id,'replayed',false);
end;
$$;

revoke all on function public.apply_validated_project_delta_v1(uuid,uuid,bigint) from public, anon, authenticated, service_role;
grant execute on function public.apply_validated_project_delta_v1(uuid,uuid,bigint) to authenticated;
