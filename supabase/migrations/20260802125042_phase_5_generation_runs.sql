-- Phase 5 generation persistence: additive validation metadata and owner-derived RPCs.
-- Prompts, model output, provider payloads, credentials, and other sensitive content are
-- intentionally absent from this migration.

-- ---------------------------------------------------------------------------
-- Additive generation-run metadata and one-run-per-idempotency invariant.
-- ---------------------------------------------------------------------------

alter table public.generation_runs
  add column validation_result text not null default 'not_attempted';

alter table public.generation_runs
  add constraint generation_runs_validation_result_chk
  check (validation_result in ('not_attempted', 'passed', 'repaired', 'reviewed', 'failed'));

create unique index generation_runs_idempotency_record_uidx
  on public.generation_runs (idempotency_record_id)
  where idempotency_record_id is not null;

-- ---------------------------------------------------------------------------
-- Run identity immutability.
--
-- All run identity fields are immutable after insert, including under
-- privileged database roles. The historical FK is ON DELETE SET NULL, so the
-- trigger permits only that database-internal action after the old parent row
-- is gone; direct/application linkage changes remain rejected.
-- ---------------------------------------------------------------------------

create or replace function private.prevent_generation_run_identity_mutation()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
begin
  if tg_op <> 'UPDATE' then
    return new;
  end if;

  if new.id is distinct from old.id
     or new.project_id is distinct from old.project_id
     or new.operation_kind is distinct from old.operation_kind
     or new.project_state_version is distinct from old.project_state_version
     or new.input_schema_version is distinct from old.input_schema_version
     or new.output_schema_version is distinct from old.output_schema_version
     or new.correlation_id is distinct from old.correlation_id
     or new.created_at is distinct from old.created_at
     or (
       new.idempotency_record_id is distinct from old.idempotency_record_id
       and not (
         new.idempotency_record_id is null
         and pg_trigger_depth() > 1
         and not exists (
           select 1
           from public.idempotency_records ir
           where ir.id = old.idempotency_record_id
         )
       )
     ) then
    raise exception 'generation_run_identity_immutable'
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

revoke all on function private.prevent_generation_run_identity_mutation() from public, anon, authenticated, service_role;

create trigger generation_runs_prevent_identity_mutation
before update on public.generation_runs
for each row
execute function private.prevent_generation_run_identity_mutation();

-- ---------------------------------------------------------------------------
-- claim_generation_run
-- ---------------------------------------------------------------------------

create or replace function public.claim_generation_run(
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
  status text,
  project_state_version bigint,
  operation_kind text,
  input_schema_version text,
  output_schema_version text
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
  v_claimed boolean := false;
begin
  if v_owner_id is null then
    raise exception 'authentication_required'
      using errcode = 'P0001';
  end if;

  if p_project_id is null then
    raise exception 'invalid_project_id'
      using errcode = 'P0001';
  end if;

  if p_project_state_version is null or p_project_state_version <= 0 then
    raise exception 'invalid_project_state_version'
      using errcode = 'P0001';
  end if;

  if p_idempotency_key is null
     or char_length(btrim(p_idempotency_key)) = 0
     or octet_length(p_idempotency_key) > 255 then
    raise exception 'invalid_idempotency_key'
      using errcode = 'P0001';
  end if;

  if p_request_fingerprint is null
     or p_request_fingerprint !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid_request_fingerprint'
      using errcode = 'P0001';
  end if;

  if p_operation_kind is null
     or p_operation_kind not in (
       'intent_detection',
       'discovery_sufficiency',
       'clarification_question',
       'project_delta',
       'stack_recommendation',
       'action_specification',
       'evidence_analysis',
       'completion_suggestion',
       'risk_flags'
     ) then
    raise exception 'invalid_operation_kind'
      using errcode = 'P0001';
  end if;

  if p_input_schema_version is distinct from 'unseenprompt.model-gateway-request.v1' then
    raise exception 'invalid_input_schema_version'
      using errcode = 'P0001';
  end if;

  if p_output_schema_version is distinct from ('unseenprompt.model-output.' || p_operation_kind || '.v1') then
    raise exception 'invalid_output_schema_version'
      using errcode = 'P0001';
  end if;

  -- Lock the project before checking its version. This serializes claims with
  -- project state transitions and keeps the ownership and version check in
  -- the same transaction as the idempotency claim and run insert.
  select *
  into v_project
  from public.projects
  where id = p_project_id
    and owner_id = v_owner_id
  for update;

  -- Missing and foreign projects intentionally share one stable error so the
  -- RPC cannot be used as a project-existence oracle.
  if not found then
    raise exception 'project_not_found_or_not_owned'
      using errcode = 'P0001';
  end if;

  if p_project_state_version is distinct from v_project.state_version then
    raise exception 'stale_state_version'
      using errcode = 'P0001';
  end if;

  -- The partial unique index is the database-level serialization point. An
  -- ON CONFLICT no-op waits for a concurrent claimant and then locks its row.
  insert into public.idempotency_records (
    owner_id,
    project_id,
    scope,
    idempotency_key,
    request_fingerprint,
    status,
    resource_type
  )
  values (
    v_owner_id,
    p_project_id,
    'generation',
    p_idempotency_key,
    p_request_fingerprint,
    'in_progress',
    'generation_run'
  )
  on conflict (owner_id, scope, idempotency_key) where owner_id is not null
  do nothing
  returning * into v_existing;

  if found then
    v_claimed := true;
  else
    select *
    into v_existing
    from public.idempotency_records
    where owner_id = v_owner_id
      and scope = 'generation'
      and idempotency_key = p_idempotency_key
    for update;

    if not found then
      raise exception 'idempotency_claim_failed'
        using errcode = 'P0001';
    end if;
  end if;

  if not v_claimed then
    if v_existing.request_fingerprint is distinct from p_request_fingerprint
       or v_existing.project_id is distinct from p_project_id
       or v_existing.resource_type is distinct from 'generation_run' then
      raise exception 'idempotency_conflict'
        using errcode = 'P0001';
    end if;

    if v_existing.status = 'in_progress' then
      raise exception 'idempotency_in_progress'
        using errcode = 'P0001';
    end if;

    if v_existing.status = 'succeeded' then
      raise exception 'idempotency_replay_unavailable'
        using errcode = 'P0001';
    end if;

    if v_existing.status = 'failed' then
      -- A failed run is terminal and is deliberately not retried with the
      -- same key. Its error code is safe because completion validates it
      -- against the closed allowlist below.
      select gr.error_code
      into v_run.error_code
      from public.generation_runs gr
      where gr.id = v_existing.resource_id
        and gr.idempotency_record_id = v_existing.id;

      if v_run.error_code in (
        'aborted',
        'deadline_exceeded',
        'attempt_timeout',
        'authentication_failed',
        'permission_denied',
        'billing_or_quota_exhausted',
        'rate_limited',
        'provider_unavailable',
        'invalid_provider_request',
        'model_not_found',
        'content_refused',
        'output_truncated',
        'invalid_output',
        'configuration_error',
        'persistence_failed',
        'provider_error',
        'idempotency_conflict',
        'idempotency_in_progress',
        'idempotency_replay_unavailable'
      ) then
        raise exception using message = v_run.error_code, errcode = 'P0001';
      end if;

      raise exception 'generation_failed'
        using errcode = 'P0001';
    end if;

    raise exception 'idempotency_invalid_state'
      using errcode = 'P0001';
  end if;

  insert into public.generation_runs (
    project_id,
    operation_kind,
    status,
    project_state_version,
    input_schema_version,
    output_schema_version,
    idempotency_record_id,
    started_at
  )
  values (
    p_project_id,
    p_operation_kind,
    'running',
    p_project_state_version,
    p_input_schema_version,
    p_output_schema_version,
    v_existing.id,
    timezone('utc', now())
  )
  returning * into v_run;

  update public.idempotency_records
  set resource_id = v_run.id
  where id = v_existing.id;

  return query
  select
    v_run.id,
    v_run.correlation_id,
    v_run.status,
    v_run.project_state_version,
    v_run.operation_kind,
    v_run.input_schema_version,
    v_run.output_schema_version;
end;
$$;

comment on function public.claim_generation_run(uuid, bigint, text, text, text, text, text) is
  'Owner-derived atomic generation claim. Stores bounded metadata only; never accepts model content.';

revoke all on function public.claim_generation_run(uuid, bigint, text, text, text, text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.claim_generation_run(uuid, bigint, text, text, text, text, text)
  to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- complete_generation_run
-- ---------------------------------------------------------------------------

create or replace function public.complete_generation_run(
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
  p_error_code text default null
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
  error_code text
)
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_owner_id uuid := auth.uid();
  v_run public.generation_runs%rowtype;
  v_idempotency public.idempotency_records%rowtype;
  v_now timestamptz := timezone('utc', now());
  v_terminal_status boolean;
  v_same_completion boolean;
begin
  if v_owner_id is null then
    raise exception 'authentication_required'
      using errcode = 'P0001';
  end if;

  if p_run_id is null then
    raise exception 'invalid_generation_run_id'
      using errcode = 'P0001';
  end if;

  if p_status is null or p_status not in ('succeeded', 'failed', 'canceled') then
    raise exception 'invalid_generation_terminal_status'
      using errcode = 'P0001';
  end if;

  if p_provider is not null
     and p_provider not in ('anthropic', 'openai', 'gemini') then
    raise exception 'invalid_provider'
      using errcode = 'P0001';
  end if;

  if p_model is not null
     and (
       char_length(btrim(p_model)) = 0
       or octet_length(p_model) > 255
     ) then
    raise exception 'invalid_model'
      using errcode = 'P0001';
  end if;

  if p_latency_ms is not null and p_latency_ms < 0 then
    raise exception 'invalid_latency_ms'
      using errcode = 'P0001';
  end if;

  if p_input_tokens is not null and p_input_tokens < 0 then
    raise exception 'invalid_input_tokens'
      using errcode = 'P0001';
  end if;

  if p_output_tokens is not null and p_output_tokens < 0 then
    raise exception 'invalid_output_tokens'
      using errcode = 'P0001';
  end if;

  if p_retry_count is null or p_retry_count < 0 then
    raise exception 'invalid_retry_count'
      using errcode = 'P0001';
  end if;

  if p_estimated_cost_micros is not null and p_estimated_cost_micros < 0 then
    raise exception 'invalid_estimated_cost_micros'
      using errcode = 'P0001';
  end if;

  if p_validation_result is null
     or p_validation_result not in ('not_attempted', 'passed', 'repaired', 'reviewed', 'failed') then
    raise exception 'invalid_validation_result'
      using errcode = 'P0001';
  end if;

  if p_error_code is not null
     and p_error_code not in (
       'aborted',
       'deadline_exceeded',
       'attempt_timeout',
       'authentication_failed',
       'permission_denied',
       'billing_or_quota_exhausted',
       'rate_limited',
       'provider_unavailable',
       'invalid_provider_request',
       'model_not_found',
       'content_refused',
       'output_truncated',
       'invalid_output',
       'configuration_error',
       'persistence_failed',
       'provider_error',
       'idempotency_conflict',
       'idempotency_in_progress',
       'idempotency_replay_unavailable'
     ) then
    raise exception 'invalid_error_code'
      using errcode = 'P0001';
  end if;

  if p_status = 'succeeded' then
    if p_provider is null
       or p_model is null
       or p_latency_ms is null
       or p_validation_result not in ('passed', 'repaired', 'reviewed')
       or p_error_code is not null then
      raise exception 'invalid_succeeded_generation'
        using errcode = 'P0001';
    end if;
  else
    if p_error_code is null
       or p_validation_result not in ('not_attempted', 'failed') then
      raise exception 'invalid_failed_generation'
        using errcode = 'P0001';
    end if;
  end if;

  -- The owner predicate is part of the locked lookup, so not-found and
  -- foreign-run requests expose the same stable error.
  select gr.*
  into v_run
  from public.generation_runs gr
  join public.projects p
    on p.id = gr.project_id
   and p.owner_id = v_owner_id
  where gr.id = p_run_id
  for update of gr;

  if not found then
    raise exception 'generation_run_not_found_or_not_owned'
      using errcode = 'P0001';
  end if;

  v_terminal_status := v_run.status in ('succeeded', 'failed', 'canceled');

  if v_terminal_status then
    v_same_completion := v_run.status = p_status
      and v_run.provider is not distinct from p_provider
      and v_run.model is not distinct from p_model
      and v_run.latency_ms is not distinct from p_latency_ms
      and v_run.input_tokens is not distinct from p_input_tokens
      and v_run.output_tokens is not distinct from p_output_tokens
      and v_run.retry_count is not distinct from p_retry_count
      and v_run.estimated_cost_micros is not distinct from p_estimated_cost_micros
      and v_run.validation_result is not distinct from p_validation_result
      and v_run.error_code is not distinct from p_error_code;

    if not v_same_completion then
      raise exception 'generation_completion_conflict'
        using errcode = 'P0001';
    end if;

    return query
    select
      v_run.id,
      v_run.correlation_id,
      v_run.status,
      v_run.project_state_version,
      v_run.operation_kind,
      v_run.input_schema_version,
      v_run.output_schema_version,
      v_run.provider,
      v_run.model,
      v_run.latency_ms,
      v_run.input_tokens,
      v_run.output_tokens,
      v_run.retry_count,
      v_run.estimated_cost_micros,
      v_run.validation_result,
      v_run.error_code;
    return;
  end if;

  if v_run.status is distinct from 'running' then
    raise exception 'generation_run_not_running'
      using errcode = 'P0001';
  end if;

  if v_run.idempotency_record_id is null then
    raise exception 'generation_idempotency_missing'
      using errcode = 'P0001';
  end if;

  select *
  into v_idempotency
  from public.idempotency_records ir
  where ir.id = v_run.idempotency_record_id
    and ir.owner_id = v_owner_id
    and ir.scope = 'generation'
  for update;

  if not found or v_idempotency.status is distinct from 'in_progress' then
    raise exception 'generation_idempotency_missing'
      using errcode = 'P0001';
  end if;

  update public.generation_runs
  set
    status = p_status,
    provider = p_provider,
    model = p_model,
    latency_ms = p_latency_ms,
    input_tokens = p_input_tokens,
    output_tokens = p_output_tokens,
    retry_count = p_retry_count,
    estimated_cost_micros = p_estimated_cost_micros,
    validation_result = p_validation_result,
    error_code = p_error_code,
    completed_at = v_now
  where id = v_run.id;

  update public.idempotency_records
  set
    status = case when p_status = 'succeeded' then 'succeeded' else 'failed' end,
    completed_at = v_now
  where id = v_idempotency.id;

  select gr.*
  into v_run
  from public.generation_runs gr
  where gr.id = v_run.id;

  return query
  select
    v_run.id,
    v_run.correlation_id,
    v_run.status,
    v_run.project_state_version,
    v_run.operation_kind,
    v_run.input_schema_version,
    v_run.output_schema_version,
    v_run.provider,
    v_run.model,
    v_run.latency_ms,
    v_run.input_tokens,
    v_run.output_tokens,
    v_run.retry_count,
    v_run.estimated_cost_micros,
    v_run.validation_result,
    v_run.error_code;
end;
$$;

comment on function public.complete_generation_run(uuid, text, text, text, integer, integer, integer, integer, bigint, text, text) is
  'Owner-derived atomic terminal generation completion. Stores bounded metadata only; never accepts model content.';

revoke all on function public.complete_generation_run(uuid, text, text, text, integer, integer, integer, integer, bigint, text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.complete_generation_run(uuid, text, text, text, integer, integer, integer, integer, bigint, text, text)
  to authenticated, service_role;
