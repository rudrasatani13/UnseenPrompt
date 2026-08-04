-- Phase 8 forward-only migration: extend the closed provider allowlist with the OpenCode Go
-- gateway (provider id `opencode`, model e.g. `deepseek-v4-flash`). The provider enum is
-- enforced inline inside the plpgsql bodies of the three live generation completion RPCs,
-- so each function is re-created with the added allowlist entry. CREATE OR REPLACE keeps
-- the existing ownership and EXECUTE grants intact; no privilege changes are intended.

-- ---------------------------------------------------------------------------
-- public.complete_generation_run (Phase 5, retired write path)
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
     and p_provider not in ('anthropic', 'openai', 'gemini', 'opencode') then
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

-- ---------------------------------------------------------------------------
-- public.complete_generation_run_v2 (Phase 6 project-delta completion)
-- ---------------------------------------------------------------------------

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
  if p_provider is not null and p_provider not in ('anthropic', 'openai', 'gemini', 'opencode') then
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

-- ---------------------------------------------------------------------------
-- public.complete_generation_run_v3_server (Phase 7 discovery completion)
-- ---------------------------------------------------------------------------

create or replace function public.complete_generation_run_v3_server(
  p_owner_id uuid,
  p_run_id uuid,
  p_status text,
  p_provider text,
  p_model text,
  p_latency_ms integer,
  p_input_tokens integer,
  p_output_tokens integer,
  p_retry_count integer,
  p_estimated_cost_micros bigint,
  p_validation_result text,
  p_error_code text,
  p_validated_project_delta_text text default null,
  p_validated_output_text text default null
)
returns table (
  run_id uuid,
  correlation_id uuid,
  status text,
  subject_kind text,
  subject_id uuid,
  subject_version bigint,
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
  validated_project_delta_hash text,
  validated_output_text text,
  validated_output_hash text
)
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_owner_id uuid := p_owner_id;
  v_run public.generation_runs%rowtype;
  v_project public.projects%rowtype;
  v_draft public.composer_drafts%rowtype;
  v_idempotency public.idempotency_records%rowtype;
  v_output public.generation_outputs%rowtype;
  v_doc jsonb;
  v_terminal boolean;
  v_same boolean;
  v_has_output boolean := false;
begin
  if auth.role() <> 'service_role' then raise exception 'server_only' using errcode='42501'; end if;
  if v_owner_id is null then raise exception 'authentication_required' using errcode='P0001'; end if;
  if p_run_id is null or p_status not in ('succeeded','failed','canceled') then raise exception 'invalid_generation_completion' using errcode='P0001'; end if;
  if p_provider is not null and p_provider not in ('anthropic','openai','gemini','opencode') then raise exception 'invalid_provider' using errcode='P0001'; end if;
  if p_model is not null and (char_length(btrim(p_model))=0 or octet_length(p_model)>255) then raise exception 'invalid_model' using errcode='P0001'; end if;
  if p_latency_ms is not null and p_latency_ms<0 then raise exception 'invalid_latency_ms' using errcode='P0001'; end if;
  if p_input_tokens is not null and p_input_tokens<0 then raise exception 'invalid_input_tokens' using errcode='P0001'; end if;
  if p_output_tokens is not null and p_output_tokens<0 then raise exception 'invalid_output_tokens' using errcode='P0001'; end if;
  if p_retry_count is null or p_retry_count<0 then raise exception 'invalid_retry_count' using errcode='P0001'; end if;
  if p_estimated_cost_micros is not null and p_estimated_cost_micros<0 then raise exception 'invalid_estimated_cost_micros' using errcode='P0001'; end if;
  if p_validation_result is null or p_validation_result not in ('not_attempted','passed','repaired','reviewed','failed') then raise exception 'invalid_validation_result' using errcode='P0001'; end if;
  if p_error_code is not null and p_error_code not in ('aborted','deadline_exceeded','attempt_timeout','authentication_failed','permission_denied','billing_or_quota_exhausted','rate_limited','provider_unavailable','invalid_provider_request','model_not_found','content_refused','output_truncated','invalid_output','configuration_error','persistence_failed','provider_error','idempotency_conflict','idempotency_in_progress','idempotency_replay_unavailable') then raise exception 'invalid_error_code' using errcode='P0001'; end if;
  if p_status='succeeded' and (p_provider is null or p_model is null or p_latency_ms is null or p_validation_result not in ('passed','repaired','reviewed') or p_error_code is not null) then raise exception 'invalid_succeeded_generation' using errcode='P0001'; end if;
  if p_status<>'succeeded' and (p_error_code is null or p_validation_result not in ('not_attempted','failed')) then raise exception 'invalid_failed_generation' using errcode='P0001'; end if;
  if p_validated_output_text is not null and octet_length(convert_to(p_validated_output_text,'UTF8')) > 65536 then raise exception 'invalid_generation_output' using errcode='P0001'; end if;

  select gr.* into v_run from public.generation_runs gr where gr.id=p_run_id and ((gr.project_id is not null and exists(select 1 from public.projects p where p.id=gr.project_id and p.owner_id=v_owner_id)) or (gr.composer_draft_id is not null and exists(select 1 from public.composer_drafts d where d.id=gr.composer_draft_id and d.owner_id=v_owner_id)));
  if not found then raise exception 'generation_run_not_found_or_not_owned' using errcode='P0001'; end if;
  if v_run.subject_kind='project' then select * into v_project from public.projects where id=v_run.project_id and owner_id=v_owner_id for update; else select * into v_draft from public.composer_drafts where id=v_run.composer_draft_id and owner_id=v_owner_id for update; end if;
  select * into v_run from public.generation_runs where id=p_run_id for update;
  if v_run.idempotency_record_id is null then raise exception 'generation_idempotency_missing' using errcode='P0001'; end if;
  select * into v_idempotency from public.idempotency_records where id=v_run.idempotency_record_id and owner_id=v_owner_id and scope='generation' for update;
  if not found then raise exception 'generation_idempotency_missing' using errcode='P0001'; end if;
  if v_run.operation_kind not in ('intent_detection','discovery_sufficiency','clarification_question') then
    raise exception 'invalid_operation_kind' using errcode='P0001';
  end if;

  if v_run.operation_kind='project_delta' then
    if p_status='succeeded' and (p_validated_project_delta_text is null or not private.phase6_valid_project_delta_text(p_validated_project_delta_text)) then raise exception 'validated_project_delta_required' using errcode='P0001'; end if;
    if p_validated_output_text is not null then raise exception 'validated_output_not_allowed' using errcode='P0001'; end if;
  elsif p_validated_project_delta_text is not null then
    raise exception 'validated_project_delta_not_allowed' using errcode='P0001';
  elsif p_status='succeeded' and v_run.operation_kind in ('intent_detection','discovery_sufficiency','clarification_question') then
    if p_validated_output_text is null then raise exception 'validated_output_required' using errcode='P0001'; end if;
    begin v_doc := p_validated_output_text::jsonb; exception when others then raise exception 'invalid_generation_output' using errcode='P0001'; end;
    if v_run.operation_kind='intent_detection' and not private.phase7_valid_intent_output(v_doc) then raise exception 'invalid_generation_output' using errcode='P0001'; end if;
    if v_run.operation_kind='discovery_sufficiency' and not private.phase7_valid_sufficiency_output(v_doc) then raise exception 'invalid_generation_output' using errcode='P0001'; end if;
    if v_run.operation_kind='clarification_question' and not private.phase7_valid_question_output(v_doc) then raise exception 'invalid_generation_output' using errcode='P0001'; end if;
  elsif p_validated_output_text is not null then
    raise exception 'validated_output_not_allowed' using errcode='P0001';
  end if;

  v_terminal := v_run.status in ('succeeded','failed','canceled');
  if v_terminal then
    select * into v_output from public.generation_outputs where generation_run_id=v_run.id;
    v_has_output := found;
    v_same := v_run.status=p_status and v_run.provider is not distinct from p_provider and v_run.model is not distinct from p_model and v_run.latency_ms is not distinct from p_latency_ms and v_run.input_tokens is not distinct from p_input_tokens and v_run.output_tokens is not distinct from p_output_tokens and v_run.retry_count is not distinct from p_retry_count and v_run.estimated_cost_micros is not distinct from p_estimated_cost_micros and v_run.validation_result is not distinct from p_validation_result and v_run.error_code is not distinct from p_error_code and v_run.validated_project_delta_text is not distinct from p_validated_project_delta_text and (case when p_validated_output_text is null then not v_has_output else (v_has_output and v_output.validated_output_text is not distinct from p_validated_output_text) end);
    if not v_same then raise exception 'generation_completion_conflict' using errcode='P0001'; end if;
  else
    if v_run.status is distinct from 'running' or v_idempotency.status is distinct from 'in_progress' then raise exception 'generation_run_not_running' using errcode='P0001'; end if;
    update public.generation_runs set status=p_status,provider=p_provider,model=p_model,latency_ms=p_latency_ms,input_tokens=p_input_tokens,output_tokens=p_output_tokens,retry_count=p_retry_count,estimated_cost_micros=p_estimated_cost_micros,validation_result=p_validation_result,error_code=p_error_code,validated_project_delta_text=p_validated_project_delta_text,completed_at=timezone('utc',now()) where id=v_run.id;
    if p_status <> 'succeeded'
       and v_run.subject_kind = 'composer_draft'
       and v_run.operation_kind = 'intent_detection'
       and v_draft.status = 'routing' then
      update public.composer_drafts
      set status='retry_required',last_error_code=p_error_code,version=version+1
      where id=v_draft.id;
    end if;
    if p_status='succeeded' and p_validated_output_text is not null then
      insert into public.generation_outputs(generation_run_id,operation_kind,output_schema_version,validated_output_text,validated_output_hash) values(v_run.id,v_run.operation_kind,v_run.output_schema_version,p_validated_output_text,encode(extensions.digest(convert_to(p_validated_output_text,'UTF8'),'sha256'),'hex'));
    end if;
    update public.idempotency_records set status=case when p_status='succeeded' then 'succeeded' else 'failed' end,completed_at=timezone('utc',now()) where id=v_idempotency.id;
    select * into v_run from public.generation_runs where id=v_run.id;
    select * into v_output from public.generation_outputs where generation_run_id=v_run.id;
    v_has_output := found;
  end if;
  return query select v_run.id,v_run.correlation_id,v_run.status,v_run.subject_kind,case when v_run.subject_kind='project' then v_run.project_id else v_run.composer_draft_id end,v_run.project_state_version,v_run.project_state_version,v_run.operation_kind,v_run.input_schema_version,v_run.output_schema_version,v_run.provider,v_run.model,v_run.latency_ms,v_run.input_tokens,v_run.output_tokens,v_run.retry_count,v_run.estimated_cost_micros,v_run.validation_result,v_run.error_code,v_run.validated_project_delta_text,v_run.validated_project_delta_hash,case when v_has_output then v_output.validated_output_text else null end,case when v_has_output then v_output.validated_output_hash else null end;
end;
$$;
