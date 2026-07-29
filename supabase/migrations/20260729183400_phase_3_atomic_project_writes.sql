-- Phase 3 atomic project writes: immutability triggers, create_project, commit_project_change.

-- ---------------------------------------------------------------------------
-- Append-only / immutability protection
--
-- Authorization is structural only:
--   * DELETE of append-only rows is allowed solely when pg_trigger_depth() > 1
--     (FK parent cascade nested under the parent DELETE trigger stack).
--   * UPDATE is denied except cascade-driven reference clearing (depth > 1 and
--     only nullable FK reference columns change to null).
-- Custom GUCs are never treated as an authorization boundary.
-- ---------------------------------------------------------------------------

create or replace function private.reject_project_event_mutation()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
begin
  -- Nested FK cascade delete from projects (or deeper) only.
  if tg_op = 'DELETE' and pg_trigger_depth() > 1 then
    return old;
  end if;
  raise exception 'project_events_immutable'
    using errcode = 'P0001';
end;
$$;

revoke all on function private.reject_project_event_mutation() from public, anon, authenticated;

create trigger project_events_reject_update
before update on public.project_events
for each row
execute function private.reject_project_event_mutation();

create trigger project_events_reject_delete
before delete on public.project_events
for each row
execute function private.reject_project_event_mutation();

create or replace function private.reject_prompt_version_mutation()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
begin
  if tg_op = 'DELETE' then
    if pg_trigger_depth() > 1 then
      return old;
    end if;
    raise exception 'prompt_versions_immutable'
      using errcode = 'P0001';
  end if;

  -- UPDATE: only nested cascade may clear nullable reference columns.
  if tg_op = 'UPDATE' then
    if pg_trigger_depth() > 1
       and new.id is not distinct from old.id
       and new.project_id is not distinct from old.project_id
       and new.tool is not distinct from old.tool
       and new.version is not distinct from old.version
       and new.source is not distinct from old.source
       and new.project_state_version is not distinct from old.project_state_version
       and new.action_specification is not distinct from old.action_specification
       and new.prompt_text is not distinct from old.prompt_text
       and new.acceptance_criteria is not distinct from old.acceptance_criteria
       and new.content_hash is not distinct from old.content_hash
       and new.created_at is not distinct from old.created_at
       and (
         new.generation_run_id is not distinct from old.generation_run_id
         or new.generation_run_id is null
       )
       and (
         new.supersedes_prompt_version_id is not distinct from old.supersedes_prompt_version_id
         or new.supersedes_prompt_version_id is null
       )
    then
      return new;
    end if;
    raise exception 'prompt_versions_immutable'
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

revoke all on function private.reject_prompt_version_mutation() from public, anon, authenticated;

create trigger prompt_versions_reject_update
before update on public.prompt_versions
for each row
execute function private.reject_prompt_version_mutation();

create trigger prompt_versions_reject_delete
before delete on public.prompt_versions
for each row
execute function private.reject_prompt_version_mutation();

create or replace function private.reject_usage_ledger_mutation()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
begin
  if tg_op = 'DELETE' then
    if pg_trigger_depth() > 1 then
      return old;
    end if;
    raise exception 'usage_ledger_immutable'
      using errcode = 'P0001';
  end if;

  -- UPDATE: only nested cascade may clear nullable project/idempotency refs.
  if tg_op = 'UPDATE' then
    if pg_trigger_depth() > 1
       and new.id is not distinct from old.id
       and new.owner_id is not distinct from old.owner_id
       and new.entitlement_key is not distinct from old.entitlement_key
       and new.direction is not distinct from old.direction
       and new.quantity is not distinct from old.quantity
       and new.source_type is not distinct from old.source_type
       and new.source_id is not distinct from old.source_id
       and new.period_start is not distinct from old.period_start
       and new.period_end is not distinct from old.period_end
       and new.occurred_at is not distinct from old.occurred_at
       and new.created_at is not distinct from old.created_at
       and new.metadata is not distinct from old.metadata
       and (
         new.project_id is not distinct from old.project_id
         or new.project_id is null
       )
       and (
         new.idempotency_record_id is not distinct from old.idempotency_record_id
         or new.idempotency_record_id is null
       )
    then
      return new;
    end if;
    raise exception 'usage_ledger_immutable'
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

revoke all on function private.reject_usage_ledger_mutation() from public, anon, authenticated;

create trigger usage_ledger_reject_update
before update on public.usage_ledger
for each row
execute function private.reject_usage_ledger_mutation();

create trigger usage_ledger_reject_delete
before delete on public.usage_ledger
for each row
execute function private.reject_usage_ledger_mutation();

-- ---------------------------------------------------------------------------
-- Mandatory project.created event on insert
-- ---------------------------------------------------------------------------

create or replace function private.project_created_event()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
begin
  insert into public.project_events (
    project_id,
    sequence_number,
    event_type,
    actor_type,
    actor_id,
    payload
  )
  values (
    new.id,
    1,
    'project.created',
    'user',
    new.owner_id,
    jsonb_build_object(
      'title', new.title,
      'mode', new.mode,
      'stage', new.stage
    )
  );

  if new.state_version is distinct from 1 then
    raise exception 'project_initial_state_version_invalid'
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

revoke all on function private.project_created_event() from public, anon, authenticated;

create trigger projects_created_event
after insert on public.projects
for each row
execute function private.project_created_event();

-- ---------------------------------------------------------------------------
-- create_project
-- ---------------------------------------------------------------------------

create or replace function public.create_project(
  p_idempotency_key text,
  p_request_fingerprint text,
  p_title text,
  p_mode text,
  p_selected_tool text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_owner_id uuid := auth.uid();
  v_existing public.idempotency_records%rowtype;
  v_project public.projects%rowtype;
  v_event_id uuid;
  v_creation_version bigint;
  v_claimed boolean := false;
  v_claim_attempt integer;
begin
  if v_owner_id is null then
    raise exception 'authentication_required'
      using errcode = 'P0001';
  end if;

  if p_idempotency_key is null
     or char_length(btrim(p_idempotency_key)) = 0
     or octet_length(p_idempotency_key) > 255 then
    raise exception 'invalid_idempotency_key'
      using errcode = 'P0001';
  end if;

  if p_request_fingerprint is null
     or char_length(btrim(p_request_fingerprint)) = 0
     or octet_length(p_request_fingerprint) > 255 then
    raise exception 'invalid_request_fingerprint'
      using errcode = 'P0001';
  end if;

  if p_title is null
     or char_length(btrim(p_title)) = 0
     or octet_length(p_title) > 240 then
    raise exception 'invalid_title'
      using errcode = 'P0001';
  end if;

  if p_mode is null
     or p_mode not in (
       'new_build', 'feature', 'bug', 'review', 'test', 'deploy', 'improve'
     ) then
    raise exception 'invalid_mode'
      using errcode = 'P0001';
  end if;

  if p_selected_tool is not null
     and p_selected_tool not in ('claude_code', 'codex', 'cursor') then
    raise exception 'invalid_selected_tool'
      using errcode = 'P0001';
  end if;

  if not exists (select 1 from public.profiles where id = v_owner_id) then
    raise exception 'profile_required'
      using errcode = 'P0001';
  end if;

  -- Atomic claim: first inserter wins; concurrent callers lock the winner row.
  -- Retry when a concurrent claimant rolls back between conflict and lock.
  for v_claim_attempt in 1..5 loop
    insert into public.idempotency_records (
      owner_id,
      scope,
      idempotency_key,
      request_fingerprint,
      status
    )
    values (
      v_owner_id,
      'lifecycle',
      p_idempotency_key,
      p_request_fingerprint,
      'in_progress'
    )
    on conflict (owner_id, scope, idempotency_key) where (owner_id is not null)
    do nothing
    returning * into v_existing;

    if found then
      v_claimed := true;
      exit;
    end if;

    select *
    into v_existing
    from public.idempotency_records
    where owner_id = v_owner_id
      and scope = 'lifecycle'
      and idempotency_key = p_idempotency_key
    for update;

    if found then
      exit;
    end if;
  end loop;

  if not v_claimed and v_existing.id is null then
    raise exception 'idempotency_claim_failed'
      using errcode = 'P0001';
  end if;

  if not v_claimed then
    if v_existing.request_fingerprint is distinct from p_request_fingerprint then
      raise exception 'idempotency_fingerprint_conflict'
        using errcode = 'P0001';
    end if;

    if v_existing.status = 'succeeded' then
      if v_existing.resource_type is distinct from 'project'
         or v_existing.resource_id is null then
        raise exception 'idempotency_resource_mismatch'
          using errcode = 'P0001';
      end if;

      select *
      into v_project
      from public.projects
      where id = v_existing.resource_id
        and owner_id = v_owner_id;

      if not found then
        raise exception 'idempotency_resource_missing'
          using errcode = 'P0001';
      end if;

      select pe.id, pe.sequence_number
      into v_event_id, v_creation_version
      from public.project_events pe
      where pe.project_id = v_project.id
        and pe.sequence_number = 1;

      if v_event_id is null or v_creation_version is null then
        raise exception 'idempotency_event_missing'
          using errcode = 'P0001';
      end if;

      -- Return the original creation result (sequence 1), not the mutable projection.
      return jsonb_build_object(
        'project_id', v_project.id,
        'state_version', v_creation_version,
        'event_id', v_event_id,
        'replayed', true
      );
    end if;

    if v_existing.status = 'in_progress' then
      raise exception 'idempotency_in_progress'
        using errcode = 'P0001';
    end if;

    if v_existing.status = 'failed' then
      raise exception 'idempotency_failed_retry_not_allowed'
        using errcode = 'P0001';
    end if;

    raise exception 'idempotency_invalid_state'
      using errcode = 'P0001';
  end if;

  insert into public.projects (
    owner_id,
    title,
    mode,
    stage,
    selected_tool,
    state_version
  )
  values (
    v_owner_id,
    p_title,
    p_mode,
    'discovery',
    p_selected_tool,
    1
  )
  returning * into v_project;

  select pe.id into v_event_id
  from public.project_events pe
  where pe.project_id = v_project.id
    and pe.sequence_number = 1;

  if v_event_id is null then
    raise exception 'project_created_event_missing'
      using errcode = 'P0001';
  end if;

  update public.idempotency_records
  set
    status = 'succeeded',
    resource_type = 'project',
    resource_id = v_project.id,
    project_id = v_project.id,
    completed_at = timezone('utc', now())
  where id = v_existing.id;

  return jsonb_build_object(
    'project_id', v_project.id,
    'state_version', 1::bigint,
    'event_id', v_event_id,
    'replayed', false
  );
end;
$$;

comment on function public.create_project(text, text, text, text, text) is
  'Authenticated owner-facing project creation with lifecycle idempotency.';

revoke all on function public.create_project(text, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.create_project(text, text, text, text, text)
  to authenticated;

-- ---------------------------------------------------------------------------
-- commit_project_change
-- ---------------------------------------------------------------------------

create or replace function public.commit_project_change(
  p_project_id uuid,
  p_expected_state_version bigint,
  p_idempotency_key text,
  p_request_fingerprint text,
  p_event_type text,
  p_event_payload jsonb,
  p_title text,
  p_mode text,
  p_stage text,
  p_selected_tool text,
  p_active_milestone_id uuid,
  p_archived_at timestamptz,
  p_blocker_summary text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_owner_id uuid := auth.uid();
  v_project public.projects%rowtype;
  v_existing public.idempotency_records%rowtype;
  v_event_id uuid;
  v_next_version bigint;
  v_claimed boolean := false;
  v_claim_attempt integer;
begin
  if v_owner_id is null then
    raise exception 'authentication_required'
      using errcode = 'P0001';
  end if;

  if p_project_id is null then
    raise exception 'invalid_project_id'
      using errcode = 'P0001';
  end if;

  if p_idempotency_key is null
     or char_length(btrim(p_idempotency_key)) = 0
     or octet_length(p_idempotency_key) > 255 then
    raise exception 'invalid_idempotency_key'
      using errcode = 'P0001';
  end if;

  if p_request_fingerprint is null
     or char_length(btrim(p_request_fingerprint)) = 0
     or octet_length(p_request_fingerprint) > 255 then
    raise exception 'invalid_request_fingerprint'
      using errcode = 'P0001';
  end if;

  if p_event_type is null
     or char_length(btrim(p_event_type)) = 0
     or octet_length(p_event_type) > 255 then
    raise exception 'invalid_event_type'
      using errcode = 'P0001';
  end if;

  if p_event_payload is null
     or jsonb_typeof(p_event_payload) <> 'object'
     or octet_length(p_event_payload::text) > 65536 then
    raise exception 'invalid_event_payload'
      using errcode = 'P0001';
  end if;

  select *
  into v_project
  from public.projects
  where id = p_project_id
  for update;

  if not found then
    raise exception 'project_not_found'
      using errcode = 'P0001';
  end if;

  if v_project.owner_id is distinct from v_owner_id then
    raise exception 'project_not_owned'
      using errcode = 'P0001';
  end if;

  for v_claim_attempt in 1..5 loop
    insert into public.idempotency_records (
      owner_id,
      project_id,
      scope,
      idempotency_key,
      request_fingerprint,
      status
    )
    values (
      v_owner_id,
      p_project_id,
      'lifecycle',
      p_idempotency_key,
      p_request_fingerprint,
      'in_progress'
    )
    on conflict (owner_id, scope, idempotency_key) where (owner_id is not null)
    do nothing
    returning * into v_existing;

    if found then
      v_claimed := true;
      exit;
    end if;

    select *
    into v_existing
    from public.idempotency_records
    where owner_id = v_owner_id
      and scope = 'lifecycle'
      and idempotency_key = p_idempotency_key
    for update;

    if found then
      exit;
    end if;
  end loop;

  if not v_claimed and v_existing.id is null then
    raise exception 'idempotency_claim_failed'
      using errcode = 'P0001';
  end if;

  if not v_claimed then
    if v_existing.request_fingerprint is distinct from p_request_fingerprint then
      raise exception 'idempotency_fingerprint_conflict'
        using errcode = 'P0001';
    end if;

    -- Cross-project or cross-operation key reuse is a hard failure.
    if v_existing.project_id is not null
       and v_existing.project_id is distinct from p_project_id then
      raise exception 'idempotency_project_mismatch'
        using errcode = 'P0001';
    end if;

    if v_existing.status = 'succeeded' then
      if v_existing.resource_type is distinct from 'project_event'
         or v_existing.resource_id is null then
        raise exception 'idempotency_resource_mismatch'
          using errcode = 'P0001';
      end if;

      select pe.id, pe.sequence_number
      into v_event_id, v_next_version
      from public.project_events pe
      where pe.id = v_existing.resource_id
        and pe.project_id = p_project_id;

      if v_event_id is null or v_next_version is null then
        raise exception 'idempotency_event_missing'
          using errcode = 'P0001';
      end if;

      return jsonb_build_object(
        'project_id', p_project_id,
        'state_version', v_next_version,
        'event_id', v_event_id,
        'replayed', true
      );
    end if;

    if v_existing.status = 'in_progress' then
      raise exception 'idempotency_in_progress'
        using errcode = 'P0001';
    end if;

    if v_existing.status = 'failed' then
      raise exception 'idempotency_failed_retry_not_allowed'
        using errcode = 'P0001';
    end if;

    raise exception 'idempotency_invalid_state'
      using errcode = 'P0001';
  end if;

  if p_expected_state_version is distinct from v_project.state_version then
    raise exception 'stale_state_version'
      using errcode = 'P0001';
  end if;

  if p_active_milestone_id is not null
     and not exists (
       select 1
       from public.milestones m
       where m.id = p_active_milestone_id
         and m.project_id = p_project_id
     ) then
    raise exception 'active_milestone_not_in_project'
      using errcode = 'P0001';
  end if;

  if p_title is null
     or char_length(btrim(p_title)) = 0
     or octet_length(p_title) > 240 then
    raise exception 'invalid_title'
      using errcode = 'P0001';
  end if;

  if p_mode is null
     or p_mode not in (
       'new_build', 'feature', 'bug', 'review', 'test', 'deploy', 'improve'
     ) then
    raise exception 'invalid_mode'
      using errcode = 'P0001';
  end if;

  if p_stage is null
     or p_stage not in (
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
     ) then
    raise exception 'invalid_stage'
      using errcode = 'P0001';
  end if;

  if p_selected_tool is not null
     and p_selected_tool not in ('claude_code', 'codex', 'cursor') then
    raise exception 'invalid_selected_tool'
      using errcode = 'P0001';
  end if;

  if (p_stage = 'archived' and p_archived_at is null)
     or (p_stage <> 'archived' and p_archived_at is not null) then
    raise exception 'archive_stage_mismatch'
      using errcode = 'P0001';
  end if;

  if p_blocker_summary is not null
     and (
       char_length(btrim(p_blocker_summary)) = 0
       or octet_length(p_blocker_summary) > 32768
     ) then
    raise exception 'invalid_blocker_summary'
      using errcode = 'P0001';
  end if;

  v_next_version := v_project.state_version + 1;

  insert into public.project_events (
    project_id,
    sequence_number,
    event_type,
    actor_type,
    actor_id,
    idempotency_record_id,
    payload
  )
  values (
    p_project_id,
    v_next_version,
    p_event_type,
    'user',
    v_owner_id,
    v_existing.id,
    p_event_payload
  )
  returning id into v_event_id;

  update public.projects
  set
    title = p_title,
    mode = p_mode,
    stage = p_stage,
    selected_tool = p_selected_tool,
    active_milestone_id = p_active_milestone_id,
    archived_at = p_archived_at,
    blocker_summary = p_blocker_summary,
    state_version = v_next_version,
    last_activity_at = timezone('utc', now())
  where id = p_project_id;

  update public.idempotency_records
  set
    status = 'succeeded',
    resource_type = 'project_event',
    resource_id = v_event_id,
    project_id = p_project_id,
    completed_at = timezone('utc', now())
  where id = v_existing.id;

  return jsonb_build_object(
    'project_id', p_project_id,
    'state_version', v_next_version,
    'event_id', v_event_id,
    'replayed', false
  );
end;
$$;

comment on function public.commit_project_change(
  uuid, bigint, text, text, text, jsonb, text, text, text, text, uuid, timestamptz, text
) is
  'Atomic project projection update + event with optimistic concurrency and idempotency.';

revoke all on function public.commit_project_change(
  uuid, bigint, text, text, text, jsonb, text, text, text, text, uuid, timestamptz, text
) from public, anon, authenticated;

grant execute on function public.commit_project_change(
  uuid, bigint, text, text, text, jsonb, text, text, text, text, uuid, timestamptz, text
) to authenticated;
