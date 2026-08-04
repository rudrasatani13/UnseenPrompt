-- Phase 7 additive discovery boundary.
--
-- This migration deliberately leaves the Phase 5/v2 generation RPCs and the
-- Phase 6 project-delta columns in place.  New callers use the v3 subject-aware
-- generation RPCs and the owner-scoped discovery RPCs below.

-- ---------------------------------------------------------------------------
-- Shared private validators
-- ---------------------------------------------------------------------------

create or replace function private.phase7_json_keys_exact(
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

create or replace function private.phase7_json_keys_allowed(
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

create or replace function private.phase7_text_ok(
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
  if p_value is null or jsonb_typeof(p_value) <> 'string' then
    return false;
  end if;
  v_text := p_value #>> '{}';
  if not p_allow_empty and char_length(btrim(v_text)) = 0 then
    return false;
  end if;
  return octet_length(convert_to(v_text, 'UTF8')) <= p_max_bytes;
end;
$$;

create or replace function private.phase7_uuid_text_ok(p_value jsonb)
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

-- Keep the database-side question fingerprint byte-for-byte aligned with the domain contract:
-- CRLF/CR become LF, NFC normalization is applied, every ECMAScript whitespace code point is
-- converted to one ASCII space, surrounding spaces are trimmed, runs collapse, then lowercase
-- and SHA-256 are applied by the caller. PostgreSQL's POSIX \s class is locale-dependent and does
-- not cover all whitespace values accepted by JavaScript, so the code points are mapped explicitly.
create or replace function private.phase7_canonical_question_text(p_value text)
returns text
language plpgsql
immutable
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_text text;
  v_whitespace text;
begin
  v_text := normalize(replace(replace(p_value, E'\r\n', E'\n'), E'\r', E'\n'), NFC);
  foreach v_whitespace in array ARRAY[
    chr(9), chr(10), chr(11), chr(12), chr(13), chr(32), chr(160), chr(5760),
    chr(8192), chr(8193), chr(8194), chr(8195), chr(8196), chr(8197), chr(8198),
    chr(8199), chr(8200), chr(8201), chr(8202), chr(8232), chr(8233), chr(8239),
    chr(8287), chr(12288), chr(65279)
  ] loop
    v_text := replace(v_text, v_whitespace, ' ');
  end loop;
  return lower(regexp_replace(btrim(v_text), ' +', ' ', 'g'));
end;
$$;

create or replace function private.phase7_mode_fact_keys(p_mode text)
returns text[]
language sql
immutable
security definer
set search_path = pg_catalog, public, private
as $$
  select case p_mode
    when 'new_build' then array['audience','problem','desired_outcome','core_scope','constraints','success_criteria']::text[]
    when 'feature' then array['current_system','desired_change','user_value','integration_constraints','acceptance_criteria']::text[]
    when 'bug' then array['observed_behavior','expected_behavior','reproduction','environment','impact','regression_expectation']::text[]
    when 'review' then array['review_target','review_dimension','current_context','constraints','expected_output']::text[]
    when 'test' then array['system_under_test','test_scope','current_coverage','environment','success_criteria']::text[]
    when 'deploy' then array['deployable_artifact','target_environment','current_pipeline','release_constraints','rollback','verification']::text[]
    when 'improve' then array['improvement_target','baseline_problem','desired_metric','constraints','success_criteria']::text[]
    else null::text[]
  end;
$$;

create or replace function private.phase7_valid_intent_output(p_value jsonb)
returns boolean
language plpgsql
immutable
security definer
set search_path = pg_catalog, public, private
as $$
begin
  return private.phase7_json_keys_exact(p_value, array['mode','confidence','rationale','detectedLanguage'])
    and p_value->>'mode' in ('new_build','feature','bug','review','test','deploy','improve')
    and jsonb_typeof(p_value->'confidence') = 'number'
    and (p_value->>'confidence')::numeric between 0 and 1
    and private.phase7_text_ok(p_value->'rationale', 1000, false)
    and private.phase7_text_ok(p_value->'detectedLanguage', 64, false)
    and (p_value->>'detectedLanguage' = 'undetermined'
      or p_value->>'detectedLanguage' ~ '^[A-Za-z]{2,8}(?:-[A-Za-z0-9]{1,8})*$');
exception when others then
  return false;
end;
$$;

create or replace function private.phase7_valid_sufficiency_output(p_value jsonb)
returns boolean
language plpgsql
immutable
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_item jsonb;
  v_seen text[] := array[]::text[];
  v_key text;
begin
  if not private.phase7_json_keys_exact(p_value, array['isSufficient','confidence','missingFacts','rationale'])
     or jsonb_typeof(p_value->'isSufficient') <> 'boolean'
     or jsonb_typeof(p_value->'confidence') <> 'number'
     or (p_value->>'confidence')::numeric not between 0 and 1
     or jsonb_typeof(p_value->'missingFacts') <> 'array'
     or jsonb_array_length(p_value->'missingFacts') > 32
     or not private.phase7_text_ok(p_value->'rationale', 1000, false) then
    return false;
  end if;
  for v_item in select value from jsonb_array_elements(p_value->'missingFacts') loop
    if not private.phase7_text_ok(v_item, 160, false)
       or v_item #>> '{}' !~ '^[a-z][a-z0-9_]*$' then
      return false;
    end if;
    v_key := v_item #>> '{}';
    if v_key = any(v_seen) then
      return false;
    end if;
    v_seen := array_append(v_seen,v_key);
  end loop;
  return true;
exception when others then
  return false;
end;
$$;

create or replace function private.phase7_valid_question_output(p_value jsonb)
returns boolean
language plpgsql
immutable
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_item jsonb;
  v_seen text[] := array[]::text[];
  v_value text;
begin
  if not private.phase7_json_keys_exact(p_value, array['question','rationale','suggestedAnswers','allowsFreeText'])
     or not private.phase7_text_ok(p_value->'question', 500, false)
     or (length(p_value->>'question') - length(replace(p_value->>'question', '?', ''))) <> 1
     or not private.phase7_text_ok(p_value->'rationale', 1000, false)
     or jsonb_typeof(p_value->'suggestedAnswers') <> 'array'
     or jsonb_array_length(p_value->'suggestedAnswers') > 8
     or jsonb_typeof(p_value->'allowsFreeText') <> 'boolean' then
    return false;
  end if;
  for v_item in select value from jsonb_array_elements(p_value->'suggestedAnswers') loop
    if not private.phase7_json_keys_exact(v_item, array['label','value'])
       or not private.phase7_text_ok(v_item->'label', 240, false)
       or not private.phase7_text_ok(v_item->'value', 500, false) then
      return false;
    end if;
    v_value := v_item->>'value';
    if v_value = any(v_seen) then
      return false;
    end if;
    v_seen := array_append(v_seen, v_value);
  end loop;
  return true;
exception when others then
  return false;
end;
$$;

create or replace function private.phase7_valid_discovery_event_payload(
  p_event_type text,
  p_payload jsonb
)
returns boolean
language plpgsql
immutable
security definer
set search_path = pg_catalog, public, private
as $$
begin
  if p_event_type = 'discovery.started' then
    return private.phase7_json_keys_exact(p_payload, array['schemaVersion','sessionId','sourceDraftId','appliedStateVersion'])
      and p_payload->>'schemaVersion' = '1'
      and private.phase7_uuid_text_ok(p_payload->'sessionId')
      and private.phase7_uuid_text_ok(p_payload->'sourceDraftId')
      and jsonb_typeof(p_payload->'appliedStateVersion') = 'number'
      and (p_payload->>'appliedStateVersion')::bigint > 1;
  elsif p_event_type = 'discovery.sufficiency_assessed' then
    return private.phase7_json_keys_exact(p_payload, array['schemaVersion','sessionId','assessmentId','generationRunId','basisStateVersion','appliedStateVersion'])
      and p_payload->>'schemaVersion' = '1'
      and private.phase7_uuid_text_ok(p_payload->'sessionId')
      and private.phase7_uuid_text_ok(p_payload->'assessmentId')
      and private.phase7_uuid_text_ok(p_payload->'generationRunId')
      and jsonb_typeof(p_payload->'basisStateVersion') = 'number'
      and jsonb_typeof(p_payload->'appliedStateVersion') = 'number'
      and (p_payload->>'basisStateVersion')::bigint > 0
      and (p_payload->>'appliedStateVersion')::bigint = (p_payload->>'basisStateVersion')::bigint + 1;
  elsif p_event_type = 'discovery.question_proposed' then
    return private.phase7_json_keys_exact(p_payload, array['schemaVersion','sessionId','questionId','generationRunId','basisStateVersion','appliedStateVersion'])
      and p_payload->>'schemaVersion' = '1'
      and private.phase7_uuid_text_ok(p_payload->'sessionId')
      and private.phase7_uuid_text_ok(p_payload->'questionId')
      and private.phase7_uuid_text_ok(p_payload->'generationRunId')
      and jsonb_typeof(p_payload->'basisStateVersion') = 'number'
      and jsonb_typeof(p_payload->'appliedStateVersion') = 'number'
      and (p_payload->>'basisStateVersion')::bigint > 0
      and (p_payload->>'appliedStateVersion')::bigint = (p_payload->>'basisStateVersion')::bigint + 1;
  elsif p_event_type = 'discovery.answer_confirmed' then
    return private.phase7_json_keys_exact(p_payload, array['schemaVersion','sessionId','questionId','answerId','appliedStateVersion'])
      and p_payload->>'schemaVersion' = '1'
      and private.phase7_uuid_text_ok(p_payload->'sessionId')
      and private.phase7_uuid_text_ok(p_payload->'questionId')
      and private.phase7_uuid_text_ok(p_payload->'answerId')
      and jsonb_typeof(p_payload->'appliedStateVersion') = 'number'
      and (p_payload->>'appliedStateVersion')::bigint > 1;
  elsif p_event_type = 'discovery.answer_superseded' then
    return private.phase7_json_keys_exact(p_payload, array['schemaVersion','sessionId','questionId','answerId','predecessorAnswerId','appliedStateVersion'])
      and p_payload->>'schemaVersion' = '1'
      and private.phase7_uuid_text_ok(p_payload->'sessionId')
      and private.phase7_uuid_text_ok(p_payload->'questionId')
      and private.phase7_uuid_text_ok(p_payload->'answerId')
      and private.phase7_uuid_text_ok(p_payload->'predecessorAnswerId')
      and jsonb_typeof(p_payload->'appliedStateVersion') = 'number'
      and (p_payload->>'appliedStateVersion')::bigint > 1;
  elsif p_event_type in ('discovery.abandoned','discovery.resumed') then
    return private.phase7_json_keys_exact(p_payload, array['schemaVersion','sessionId','beforeStatus','afterStatus','appliedStateVersion'])
      and p_payload->>'schemaVersion' = '1'
      and private.phase7_uuid_text_ok(p_payload->'sessionId')
      and p_payload->>'beforeStatus' in ('active','sufficient','abandoned','blocked')
      and p_payload->>'afterStatus' in ('active','abandoned')
      and p_payload->>'beforeStatus' <> p_payload->>'afterStatus'
      and jsonb_typeof(p_payload->'appliedStateVersion') = 'number'
      and (p_payload->>'appliedStateVersion')::bigint > 1;
  elsif p_event_type = 'discovery.completed' then
    return private.phase7_json_keys_exact(p_payload, array['schemaVersion','sessionId','projectDeltaGenerationRunId','beforeStatus','afterStatus','fromStage','toStage','appliedStateVersion'])
      and p_payload->>'schemaVersion' = '1'
      and private.phase7_uuid_text_ok(p_payload->'sessionId')
      and private.phase7_uuid_text_ok(p_payload->'projectDeltaGenerationRunId')
      and p_payload->>'beforeStatus' = 'sufficient'
      and p_payload->>'afterStatus' = 'completed'
      and p_payload->>'fromStage' = 'discovery'
      and p_payload->>'toStage' = 'brief_confirmation'
      and jsonb_typeof(p_payload->'appliedStateVersion') = 'number'
      and (p_payload->>'appliedStateVersion')::bigint > 1;
  end if;
  -- An event in the discovery namespace must be one of the explicitly validated
  -- Phase 7 vocabulary entries above. Unknown names are rejected closed.
  if p_event_type like 'discovery.%' then
    return false;
  end if;
  return true;
exception when others then
  return false;
end;
$$;

revoke all on function private.phase7_json_keys_exact(jsonb,text[]) from public, anon, authenticated, service_role;
revoke all on function private.phase7_json_keys_allowed(jsonb,text[]) from public, anon, authenticated, service_role;
revoke all on function private.phase7_text_ok(jsonb,integer,boolean) from public, anon, authenticated, service_role;
revoke all on function private.phase7_uuid_text_ok(jsonb) from public, anon, authenticated, service_role;
revoke all on function private.phase7_canonical_question_text(text) from public, anon, authenticated, service_role;
revoke all on function private.phase7_mode_fact_keys(text) from public, anon, authenticated, service_role;
revoke all on function private.phase7_valid_intent_output(jsonb) from public, anon, authenticated, service_role;
revoke all on function private.phase7_valid_sufficiency_output(jsonb) from public, anon, authenticated, service_role;
revoke all on function private.phase7_valid_question_output(jsonb) from public, anon, authenticated, service_role;
revoke all on function private.phase7_valid_discovery_event_payload(text,jsonb) from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Composer drafts
-- ---------------------------------------------------------------------------

create table public.composer_drafts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  version bigint not null default 1,
  initial_request_text text not null,
  status text not null default 'routing',
  detected_mode text null,
  confidence numeric(20,18) null,
  rationale text null,
  detected_language text null,
  intent_generation_run_id uuid null,
  confirmed_mode text null,
  confirmed_title text null,
  project_id uuid null,
  last_error_code text null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  promoted_at timestamptz null,
  abandoned_at timestamptz null,
  constraint composer_drafts_version_positive_chk check (version > 0),
  constraint composer_drafts_initial_request_len_chk check (
    char_length(btrim(initial_request_text)) > 0
    and octet_length(convert_to(initial_request_text,'UTF8')) <= 16384
  ),
  constraint composer_drafts_status_chk check (status in ('routing','awaiting_confirmation','retry_required','promoted','abandoned')),
  constraint composer_drafts_mode_chk check (
    detected_mode is null or detected_mode in ('new_build','feature','bug','review','test','deploy','improve')
  ),
  constraint composer_drafts_confirmed_mode_chk check (
    confirmed_mode is null or confirmed_mode in ('new_build','feature','bug','review','test','deploy','improve')
  ),
  constraint composer_drafts_confidence_chk check (confidence is null or (confidence >= 0 and confidence <= 1)),
  constraint composer_drafts_rationale_len_chk check (rationale is null or (char_length(btrim(rationale)) > 0 and octet_length(convert_to(rationale,'UTF8')) <= 1000)),
  constraint composer_drafts_language_len_chk check (detected_language is null or (char_length(btrim(detected_language)) > 0 and octet_length(convert_to(detected_language,'UTF8')) <= 64)),
  constraint composer_drafts_title_len_chk check (confirmed_title is null or (char_length(btrim(confirmed_title)) > 0 and octet_length(convert_to(confirmed_title,'UTF8')) <= 240)),
  constraint composer_drafts_error_code_chk check (last_error_code is null or last_error_code in ('provider_unavailable','persistence_failed','invalid_output','provider_error','aborted','deadline_exceeded','attempt_timeout','authentication_failed','permission_denied','billing_or_quota_exhausted','rate_limited','invalid_provider_request','model_not_found','content_refused','output_truncated','configuration_error')),
  constraint composer_drafts_state_fields_chk check (
    (status = 'routing' and detected_mode is null and confidence is null and rationale is null and detected_language is null and intent_generation_run_id is null and confirmed_mode is null and confirmed_title is null and project_id is null and promoted_at is null and abandoned_at is null)
    or (status = 'retry_required' and detected_mode is null and confidence is null and rationale is null and detected_language is null and intent_generation_run_id is null and confirmed_mode is null and confirmed_title is null and project_id is null and promoted_at is null and abandoned_at is null and last_error_code is not null)
    or (status = 'awaiting_confirmation' and detected_mode is not null and confidence is not null and rationale is not null and detected_language is not null and intent_generation_run_id is not null and confirmed_mode is null and confirmed_title is null and project_id is null and promoted_at is null and abandoned_at is null)
    or (status = 'promoted' and detected_mode is not null and confidence is not null and rationale is not null and detected_language is not null and intent_generation_run_id is not null and confirmed_mode is not null and confirmed_title is not null and project_id is not null and promoted_at is not null and abandoned_at is null)
    or (status = 'abandoned' and project_id is null and promoted_at is null and abandoned_at is not null)
  ),
  constraint composer_drafts_owner_id_id_key unique (owner_id,id),
  constraint composer_drafts_project_id_id_key unique (project_id,id),
  constraint composer_drafts_project_fk foreign key (project_id) references public.projects (id) on delete cascade
);

create index composer_drafts_owner_updated_idx on public.composer_drafts(owner_id, updated_at desc);
create index composer_drafts_owner_status_idx on public.composer_drafts(owner_id, status);

create or replace function private.prevent_composer_draft_identity_mutation()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
begin
  if new.id is distinct from old.id or new.owner_id is distinct from old.owner_id or new.created_at is distinct from old.created_at then
    raise exception 'composer_draft_identity_immutable' using errcode='P0001';
  end if;
  return new;
end;
$$;

revoke all on function private.prevent_composer_draft_identity_mutation() from public, anon, authenticated, service_role;
create trigger composer_drafts_prevent_identity_mutation before update on public.composer_drafts for each row execute function private.prevent_composer_draft_identity_mutation();
create trigger composer_drafts_set_updated_at before update on public.composer_drafts for each row execute function private.set_updated_at();

alter table public.composer_drafts enable row level security;
revoke all on table public.composer_drafts from public, anon, authenticated;
grant select on table public.composer_drafts to authenticated;
grant all on table public.composer_drafts to service_role;
create policy composer_drafts_select_owned on public.composer_drafts for select to authenticated using (auth.uid() is not null and owner_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Subject-aware generation runs and replayable discovery output
-- ---------------------------------------------------------------------------

alter table public.generation_runs
  add column subject_kind text not null default 'project',
  add column composer_draft_id uuid null;

do $$
begin
  if exists (
    select 1 from public.generation_runs
    where subject_kind <> 'project' or project_id is null or composer_draft_id is not null
  ) then
    raise exception 'phase_7_generation_subject_backfill_invalid' using errcode='P0001';
  end if;
  if exists (
    select 1 from public.generation_runs
    where operation_kind = 'intent_detection' and project_id is not null
  ) then
    raise exception 'phase_7_generation_intent_backfill_required' using errcode='P0001';
  end if;
end;
$$;

alter table public.generation_runs alter column project_id drop not null;

alter table public.generation_runs
  add constraint generation_runs_subject_kind_chk check (subject_kind in ('project','composer_draft')),
  add constraint generation_runs_subject_xor_chk check ((subject_kind = 'project' and project_id is not null and composer_draft_id is null) or (subject_kind = 'composer_draft' and project_id is null and composer_draft_id is not null)),
  add constraint generation_runs_intent_subject_chk check (operation_kind <> 'intent_detection' or subject_kind = 'composer_draft'),
  add constraint generation_runs_project_delta_subject_chk check (operation_kind <> 'project_delta' or subject_kind = 'project');

alter table public.composer_drafts
  add constraint composer_drafts_intent_generation_fk
  foreign key (intent_generation_run_id) references public.generation_runs(id) on delete cascade;

alter table public.generation_runs
  drop constraint if exists generation_runs_project_id_fkey;
alter table public.generation_runs
  add constraint generation_runs_project_fk foreign key (project_id) references public.projects(id) on delete cascade,
  add constraint generation_runs_composer_draft_fk foreign key (composer_draft_id) references public.composer_drafts(id) on delete cascade;

create unique index generation_runs_composer_draft_id_id_key on public.generation_runs(composer_draft_id,id) where composer_draft_id is not null;
create index generation_runs_composer_draft_status_idx on public.generation_runs(composer_draft_id,status) where composer_draft_id is not null;

create or replace function private.prevent_generation_run_identity_mutation()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
begin
  if tg_op = 'UPDATE' and (
    new.id is distinct from old.id
    or new.project_id is distinct from old.project_id
    or new.composer_draft_id is distinct from old.composer_draft_id
    or new.subject_kind is distinct from old.subject_kind
    or new.operation_kind is distinct from old.operation_kind
    or new.project_state_version is distinct from old.project_state_version
    or new.input_schema_version is distinct from old.input_schema_version
    or new.output_schema_version is distinct from old.output_schema_version
    or new.correlation_id is distinct from old.correlation_id
    or new.created_at is distinct from old.created_at
    or (new.idempotency_record_id is distinct from old.idempotency_record_id and not (new.idempotency_record_id is null and pg_trigger_depth() > 1 and not exists (select 1 from public.idempotency_records ir where ir.id = old.idempotency_record_id)))
  ) then
    raise exception 'generation_run_identity_immutable' using errcode='P0001';
  end if;
  return new;
end;
$$;

-- Existing Phase 5 trigger points at the function above and therefore inherits the target guard.
revoke all on function private.prevent_generation_run_identity_mutation() from public, anon, authenticated, service_role;

create table public.generation_outputs (
  generation_run_id uuid primary key,
  operation_kind text not null,
  output_schema_version text not null,
  validated_output_text text not null,
  validated_output_hash text not null,
  created_at timestamptz not null default timezone('utc',now()),
  constraint generation_outputs_run_fk foreign key (generation_run_id) references public.generation_runs(id) on delete cascade,
  constraint generation_outputs_operation_chk check (operation_kind in ('intent_detection','discovery_sufficiency','clarification_question')),
  constraint generation_outputs_schema_chk check (output_schema_version = 'unseenprompt.model-output.' || operation_kind || '.v1'),
  constraint generation_outputs_text_len_chk check (octet_length(convert_to(validated_output_text,'UTF8')) <= 65536),
  constraint generation_outputs_hash_format_chk check (validated_output_hash ~ '^[0-9a-f]{64}$')
);

create or replace function private.phase7_compute_generation_output_hash()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
begin
  new.validated_output_hash := encode(extensions.digest(convert_to(new.validated_output_text,'UTF8'),'sha256'),'hex');
  return new;
end;
$$;

create or replace function private.phase7_validate_generation_output()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_run public.generation_runs%rowtype;
  v_doc jsonb;
begin
  select * into v_run from public.generation_runs where id = new.generation_run_id;
  if not found or v_run.status <> 'succeeded' or v_run.operation_kind <> new.operation_kind or v_run.output_schema_version <> new.output_schema_version or v_run.validation_result not in ('passed','repaired','reviewed') or (v_run.subject_kind <> 'project' and v_run.operation_kind <> 'intent_detection') then
    raise exception 'invalid_generation_output' using errcode='P0001';
  end if;
  begin v_doc := new.validated_output_text::jsonb; exception when others then raise exception 'invalid_generation_output' using errcode='P0001'; end;
  if new.operation_kind = 'intent_detection' and not private.phase7_valid_intent_output(v_doc) then raise exception 'invalid_generation_output' using errcode='P0001'; end if;
  if new.operation_kind = 'discovery_sufficiency' and not private.phase7_valid_sufficiency_output(v_doc) then raise exception 'invalid_generation_output' using errcode='P0001'; end if;
  if new.operation_kind = 'clarification_question' and not private.phase7_valid_question_output(v_doc) then raise exception 'invalid_generation_output' using errcode='P0001'; end if;
  if new.validated_output_hash is distinct from encode(extensions.digest(convert_to(new.validated_output_text,'UTF8'),'sha256'),'hex') then
    raise exception 'invalid_generation_output_hash' using errcode='P0001';
  end if;
  return new;
end;
$$;

create trigger generation_outputs_compute_hash before insert on public.generation_outputs for each row execute function private.phase7_compute_generation_output_hash();
create trigger generation_outputs_validate before insert on public.generation_outputs for each row execute function private.phase7_validate_generation_output();

alter table public.generation_outputs enable row level security;
revoke all on table public.generation_outputs from public, anon, authenticated;
grant select on table public.generation_outputs to authenticated;
grant all on table public.generation_outputs to service_role;
create policy generation_outputs_select_owned on public.generation_outputs for select to authenticated using (
  auth.uid() is not null and exists (
    select 1 from public.generation_runs gr
    where gr.id = generation_outputs.generation_run_id
      and ((gr.project_id is not null and private.owns_project(gr.project_id)) or (gr.composer_draft_id is not null and exists (select 1 from public.composer_drafts cd where cd.id=gr.composer_draft_id and cd.owner_id=auth.uid())))
  )
);

-- Discovery generation runs are never directly visible through the old project-only policy.
drop policy if exists generation_runs_select_owned on public.generation_runs;
create policy generation_runs_select_owned on public.generation_runs for select to authenticated using (
  auth.uid() is not null and ((project_id is not null and private.owns_project(project_id)) or (composer_draft_id is not null and exists (select 1 from public.composer_drafts cd where cd.id=composer_draft_id and cd.owner_id=auth.uid())))
);

-- ---------------------------------------------------------------------------
-- Discovery tables
-- ---------------------------------------------------------------------------

create table public.discovery_sessions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null unique references public.projects(id) on delete cascade,
  source_draft_id uuid not null unique references public.composer_drafts(id) on delete cascade,
  status text not null default 'active',
  policy_version integer not null default 1,
  active_question_id uuid null,
  latest_assessment_id uuid null,
  confirmed_turn_count integer not null default 1,
  block_code text null,
  started_at timestamptz not null default timezone('utc',now()),
  completed_at timestamptz null,
  abandoned_at timestamptz null,
  constraint discovery_sessions_status_chk check (status in ('active','sufficient','completed','abandoned','blocked')),
  constraint discovery_sessions_project_id_id_key unique (project_id,id),
  constraint discovery_sessions_policy_version_chk check (policy_version > 0),
  constraint discovery_sessions_turn_count_chk check (confirmed_turn_count between 1 and 12),
  constraint discovery_sessions_block_code_chk check (block_code is null or block_code = 'discovery_turn_limit_reached'),
  constraint discovery_sessions_lifecycle_chk check (
    (status in ('active','sufficient') and completed_at is null and abandoned_at is null and block_code is null)
    or (status = 'completed' and completed_at is not null and abandoned_at is null and block_code is null)
    or (status = 'abandoned' and abandoned_at is not null and completed_at is null and block_code is null)
    or (status = 'blocked' and block_code = 'discovery_turn_limit_reached' and completed_at is null and abandoned_at is null)
  ),
  constraint discovery_sessions_project_draft_fk foreign key (project_id,source_draft_id) references public.composer_drafts(project_id,id) on delete cascade deferrable initially deferred
);

create index discovery_sessions_project_status_idx on public.discovery_sessions(project_id,status);

-- The promoted composer request is durable discovery evidence in its own relation. The session
-- turn counter remains a fast policy projection, but it is never the only proof that a user input
-- exists. This row intentionally contains source content; it is owner-scoped and never copied into
-- metadata-only project event payloads.
create table public.discovery_inputs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null,
  session_id uuid not null,
  source text not null default 'initial_request',
  input_text text not null,
  confirmation_event_id uuid not null,
  created_at timestamptz not null default timezone('utc', now()),
  constraint discovery_inputs_project_id_id_key unique(project_id,id),
  constraint discovery_inputs_source_key unique(project_id,session_id,source),
  constraint discovery_inputs_source_chk check (source = 'initial_request'),
  constraint discovery_inputs_text_len_chk check (
    char_length(btrim(input_text)) > 0
    and octet_length(convert_to(input_text,'UTF8')) <= 16384
  ),
  constraint discovery_inputs_session_fk
    foreign key (project_id,session_id)
    references public.discovery_sessions(project_id,id)
    on delete cascade,
  constraint discovery_inputs_event_fk
    foreign key (project_id,confirmation_event_id)
    references public.project_events(project_id,id)
    on delete cascade
);

create index discovery_inputs_session_created_idx on public.discovery_inputs(session_id,created_at);

create or replace function private.prevent_discovery_input_mutation()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
begin
  if tg_op = 'DELETE' and pg_trigger_depth() > 1 then
    return old;
  end if;
  if tg_op = 'UPDATE' then
    if new.id is not distinct from old.id
       and new.project_id is not distinct from old.project_id
       and new.session_id is not distinct from old.session_id
       and new.source is not distinct from old.source
       and new.input_text is not distinct from old.input_text
       and new.confirmation_event_id is not distinct from old.confirmation_event_id
       and new.created_at is not distinct from old.created_at then
      return new;
    end if;
  end if;
  raise exception 'discovery_input_immutable' using errcode='P0001';
end;
$$;

revoke all on function private.prevent_discovery_input_mutation() from public, anon, authenticated, service_role;
create trigger discovery_inputs_immutable before update or delete on public.discovery_inputs
for each row execute function private.prevent_discovery_input_mutation();

alter table public.discovery_inputs enable row level security;
revoke all on table public.discovery_inputs from public, anon, authenticated;
grant select on table public.discovery_inputs to authenticated;
grant all on table public.discovery_inputs to service_role;
create policy discovery_inputs_select_owned on public.discovery_inputs
for select to authenticated using (auth.uid() is not null and private.owns_project(project_id));

create table public.discovery_assessments (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null,
  session_id uuid not null,
  generation_run_id uuid not null unique,
  basis_state_version bigint not null,
  is_sufficient boolean not null,
  confidence numeric(20,18) not null,
  missing_fact_keys text[] not null default array[]::text[],
  rationale text not null,
  policy_passed boolean not null,
  policy_failure_code text null,
  created_at timestamptz not null default timezone('utc',now()),
  constraint discovery_assessments_project_id_id_key unique(project_id,id),
  constraint discovery_assessments_session_fk foreign key (project_id,session_id) references public.discovery_sessions(project_id,id) on delete cascade,
  constraint discovery_assessments_generation_fk foreign key (project_id,generation_run_id) references public.generation_runs(project_id,id) on delete cascade,
  constraint discovery_assessments_basis_version_chk check (basis_state_version > 0),
  constraint discovery_assessments_confidence_chk check (confidence between 0 and 1),
  constraint discovery_assessments_missing_facts_chk check (cardinality(missing_fact_keys) <= 32 and array_length(missing_fact_keys,1) is distinct from 0 or cardinality(missing_fact_keys)=0),
  constraint discovery_assessments_rationale_len_chk check (char_length(btrim(rationale)) > 0 and octet_length(convert_to(rationale,'UTF8')) <= 1000),
  constraint discovery_assessments_failure_chk check ((policy_passed and policy_failure_code is null) or (not policy_passed and policy_failure_code is not null))
);

create index discovery_assessments_session_created_idx on public.discovery_assessments(session_id,created_at desc);

alter table public.discovery_sessions
  add constraint discovery_sessions_latest_assessment_fk
  foreign key (project_id,latest_assessment_id) references public.discovery_assessments(project_id,id) on delete set null;

create table public.discovery_questions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null,
  session_id uuid not null,
  generation_run_id uuid not null unique,
  position integer not null,
  target_fact_key text not null,
  basis_state_version bigint not null,
  question_text text not null,
  rationale text not null,
  suggested_answers jsonb not null default '[]'::jsonb,
  allows_free_text boolean not null default false,
  question_fingerprint text not null,
  status text not null default 'active',
  created_at timestamptz not null default timezone('utc',now()),
  answered_at timestamptz null,
  superseded_at timestamptz null,
  constraint discovery_questions_project_id_id_key unique(project_id,id),
  constraint discovery_questions_session_fk foreign key (project_id,session_id) references public.discovery_sessions(project_id,id) on delete cascade,
  constraint discovery_questions_generation_fk foreign key (project_id,generation_run_id) references public.generation_runs(project_id,id) on delete cascade,
  constraint discovery_questions_position_chk check (position between 1 and 12),
  constraint discovery_questions_fact_key_chk check (target_fact_key ~ '^[a-z][a-z0-9_]*$' and octet_length(target_fact_key) <= 160),
  constraint discovery_questions_basis_version_chk check (basis_state_version > 0),
  constraint discovery_questions_text_len_chk check (char_length(btrim(question_text)) > 0 and octet_length(convert_to(question_text,'UTF8')) <= 500 and (length(question_text)-length(replace(question_text,'?',''))) = 1),
  constraint discovery_questions_rationale_len_chk check (char_length(btrim(rationale)) > 0 and octet_length(convert_to(rationale,'UTF8')) <= 1000),
  constraint discovery_questions_suggestions_shape_chk check (jsonb_typeof(suggested_answers)='array' and jsonb_array_length(suggested_answers) <= 8 and octet_length(suggested_answers::text) <= 16384),
  constraint discovery_questions_fingerprint_chk check (question_fingerprint ~ '^[0-9a-f]{64}$'),
  constraint discovery_questions_status_chk check (status in ('active','answered','superseded')),
  constraint discovery_questions_lifecycle_chk check ((status='active' and answered_at is null and superseded_at is null) or (status='answered' and answered_at is not null and superseded_at is null) or (status='superseded' and superseded_at is not null)),
  constraint discovery_questions_unique_fingerprint unique(session_id,question_fingerprint)
);

create unique index discovery_questions_one_active_uidx on public.discovery_questions(session_id) where status='active';
create index discovery_questions_session_position_idx on public.discovery_questions(session_id,position);

alter table public.discovery_sessions
  add constraint discovery_sessions_active_question_fk
  foreign key (project_id,active_question_id) references public.discovery_questions(project_id,id) on delete set null;

create table public.discovery_answers (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null,
  session_id uuid not null,
  question_id uuid not null,
  source text not null,
  answer_text text not null,
  status text not null default 'confirmed',
  supersedes_answer_id uuid null,
  confirmation_event_id uuid not null,
  created_at timestamptz not null default timezone('utc',now()),
  superseded_at timestamptz null,
  constraint discovery_answers_project_id_id_key unique(project_id,id),
  constraint discovery_answers_question_fk foreign key (project_id,question_id) references public.discovery_questions(project_id,id) on delete cascade,
  constraint discovery_answers_session_fk foreign key (project_id,session_id) references public.discovery_sessions(project_id,id) on delete cascade,
  constraint discovery_answers_event_fk foreign key (project_id,confirmation_event_id) references public.project_events(project_id,id) on delete cascade,
  constraint discovery_answers_supersedes_fk foreign key (project_id,supersedes_answer_id) references public.discovery_answers(project_id,id) on delete set null,
  constraint discovery_answers_source_chk check (source in ('suggested','free_text')),
  constraint discovery_answers_status_chk check (status in ('confirmed','superseded')),
  constraint discovery_answers_text_len_chk check (char_length(btrim(answer_text)) > 0 and octet_length(convert_to(answer_text,'UTF8')) <= 16384),
  constraint discovery_answers_lifecycle_chk check ((status='confirmed' and superseded_at is null) or (status='superseded' and superseded_at is not null)),
  constraint discovery_answers_no_self_chk check (supersedes_answer_id is null or supersedes_answer_id <> id),
  constraint discovery_answers_lineage_project_session_question_chk check (true)
);

create unique index discovery_answers_one_current_question_uidx on public.discovery_answers(question_id) where status='confirmed';
create unique index discovery_answers_one_successor_uidx on public.discovery_answers(supersedes_answer_id) where supersedes_answer_id is not null;
create index discovery_answers_session_created_idx on public.discovery_answers(session_id,created_at);

create or replace function private.validate_discovery_assessment_row()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_key text;
  v_seen text[] := array[]::text[];
begin
  if new.missing_fact_keys is null or cardinality(new.missing_fact_keys) > 32 then raise exception 'invalid_missing_fact' using errcode='P0001'; end if;
  foreach v_key in array new.missing_fact_keys loop
    if v_key is null or char_length(btrim(v_key))=0 or octet_length(convert_to(v_key,'UTF8'))>160 or v_key !~ '^[a-z][a-z0-9_]*$' or v_key = any(v_seen) then raise exception 'invalid_missing_fact' using errcode='P0001'; end if;
    v_seen:=array_append(v_seen,v_key);
  end loop;
  return new;
end;
$$;
revoke all on function private.validate_discovery_assessment_row() from public,anon,authenticated,service_role;
create trigger discovery_assessments_validate_row before insert or update on public.discovery_assessments for each row execute function private.validate_discovery_assessment_row();

create or replace function private.validate_discovery_question_row()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_item jsonb;
  v_seen text[] := array[]::text[];
  v_value text;
  v_run public.generation_runs%rowtype;
  v_project_mode text;
begin
  if new.suggested_answers is null or jsonb_typeof(new.suggested_answers)<>'array' or jsonb_array_length(new.suggested_answers)>8 then raise exception 'invalid_question' using errcode='P0001'; end if;
  for v_item in select value from jsonb_array_elements(new.suggested_answers) loop
    if not private.phase7_json_keys_exact(v_item,array['label','value']) or not private.phase7_text_ok(v_item->'label',240,false) or not private.phase7_text_ok(v_item->'value',500,false) then raise exception 'invalid_question' using errcode='P0001'; end if;
    v_value:=v_item->>'value';
    if v_value=any(v_seen) then raise exception 'duplicate_question_answer' using errcode='P0001'; end if;
    v_seen:=array_append(v_seen,v_value);
  end loop;
  if new.question_fingerprint is distinct from encode(extensions.digest(convert_to(private.phase7_canonical_question_text(new.question_text),'UTF8'),'sha256'),'hex') then raise exception 'invalid_question_fingerprint' using errcode='P0001'; end if;
  select mode into v_project_mode from public.projects where id=new.project_id;
  if not found or (new.target_fact_key <> 'clarify_scope' and not (new.target_fact_key = any(private.phase7_mode_fact_keys(v_project_mode)))) then raise exception 'invalid_missing_fact' using errcode='P0001'; end if;
  select * into v_run from public.generation_runs where id=new.generation_run_id and project_id=new.project_id;
  if not found or v_run.operation_kind<>'clarification_question' or v_run.status<>'succeeded' or v_run.output_schema_version<>'unseenprompt.model-output.clarification_question.v1' then raise exception 'invalid_generation_output' using errcode='P0001'; end if;
  return new;
end;
$$;
revoke all on function private.validate_discovery_question_row() from public,anon,authenticated,service_role;
create trigger discovery_questions_validate_row before insert or update on public.discovery_questions for each row execute function private.validate_discovery_question_row();

-- Immutable question content and answer identity/lineage. Status timestamps are the only mutable
-- question fields; answer content is immutable and corrections create successors.
create or replace function private.prevent_discovery_question_content_mutation()
returns trigger language plpgsql security definer set search_path = pg_catalog, public, private as $$
begin
  if new.id is distinct from old.id or new.project_id is distinct from old.project_id or new.session_id is distinct from old.session_id or new.generation_run_id is distinct from old.generation_run_id or new.position is distinct from old.position or new.target_fact_key is distinct from old.target_fact_key or new.basis_state_version is distinct from old.basis_state_version or new.question_text is distinct from old.question_text or new.rationale is distinct from old.rationale or new.suggested_answers is distinct from old.suggested_answers or new.allows_free_text is distinct from old.allows_free_text or new.question_fingerprint is distinct from old.question_fingerprint or new.created_at is distinct from old.created_at then
    raise exception 'discovery_question_immutable' using errcode='P0001';
  end if;
  if old.status not in ('active','answered') and new.status is distinct from old.status then
    raise exception 'discovery_question_immutable' using errcode='P0001';
  end if;
  return new;
end;
$$;
revoke all on function private.prevent_discovery_question_content_mutation() from public, anon, authenticated, service_role;
create trigger discovery_questions_immutable before update on public.discovery_questions for each row execute function private.prevent_discovery_question_content_mutation();

create or replace function private.prevent_discovery_answer_content_mutation()
returns trigger language plpgsql security definer set search_path = pg_catalog, public, private as $$
begin
  if new.id is distinct from old.id or new.project_id is distinct from old.project_id or new.session_id is distinct from old.session_id or new.question_id is distinct from old.question_id or new.source is distinct from old.source or new.answer_text is distinct from old.answer_text or new.supersedes_answer_id is distinct from old.supersedes_answer_id or new.confirmation_event_id is distinct from old.confirmation_event_id or new.created_at is distinct from old.created_at then
    raise exception 'discovery_answer_immutable' using errcode='P0001';
  end if;
  if old.status <> 'confirmed' and new.status is distinct from old.status then
    raise exception 'discovery_answer_immutable' using errcode='P0001';
  end if;
  return new;
end;
$$;
revoke all on function private.prevent_discovery_answer_content_mutation() from public, anon, authenticated, service_role;
create trigger discovery_answers_immutable before update on public.discovery_answers for each row execute function private.prevent_discovery_answer_content_mutation();

create or replace function private.validate_discovery_answer_lineage()
returns trigger language plpgsql security definer set search_path = pg_catalog, public, private as $$
declare v_question public.discovery_questions%rowtype; v_predecessor public.discovery_answers%rowtype;
begin
  select * into v_question from public.discovery_questions where id=new.question_id and project_id=new.project_id;
  if not found then raise exception 'question_not_found' using errcode='P0001'; end if;
  if new.session_id is distinct from (select session_id from public.discovery_questions where id=new.question_id) then raise exception 'discovery_answer_lineage_conflict' using errcode='P0001'; end if;
  if new.supersedes_answer_id is not null then
    select * into v_predecessor from public.discovery_answers where id=new.supersedes_answer_id and project_id=new.project_id;
    if not found or v_predecessor.session_id is distinct from new.session_id or v_predecessor.question_id is distinct from new.question_id or v_predecessor.status not in ('confirmed','superseded') then raise exception 'discovery_answer_lineage_conflict' using errcode='P0001'; end if;
  end if;
  return new;
end;
$$;
revoke all on function private.validate_discovery_answer_lineage() from public, anon, authenticated, service_role;
create trigger discovery_answers_validate_lineage before insert on public.discovery_answers for each row execute function private.validate_discovery_answer_lineage();

-- Composite FK on sessions is deferred until promotion updates the draft project link. This keeps
-- the draft/project/session promotion atomic while still proving the owner-scoped relationship.
alter table public.discovery_sessions validate constraint discovery_sessions_project_draft_fk;

-- Discovery event payload validator is enforced only for the Phase 7 event vocabulary.
create or replace function private.validate_phase7_discovery_event_payload()
returns trigger language plpgsql security definer set search_path = pg_catalog, public, private as $$
begin
  if new.event_type like 'discovery.%' and not private.phase7_valid_discovery_event_payload(new.event_type,new.payload) then
    raise exception 'invalid_discovery_event_payload' using errcode='P0001';
  end if;
  return new;
end;
$$;
revoke all on function private.validate_phase7_discovery_event_payload() from public, anon, authenticated, service_role;
create trigger project_events_validate_phase7_payload before insert on public.project_events for each row execute function private.validate_phase7_discovery_event_payload();

-- Ownership policies/grants for discovery data.
alter table public.discovery_sessions enable row level security;
alter table public.discovery_assessments enable row level security;
alter table public.discovery_questions enable row level security;
alter table public.discovery_answers enable row level security;
revoke all on table public.discovery_sessions, public.discovery_assessments, public.discovery_questions, public.discovery_answers from public, anon, authenticated;
grant select on table public.discovery_sessions, public.discovery_assessments, public.discovery_questions, public.discovery_answers to authenticated;
grant all on table public.discovery_sessions, public.discovery_assessments, public.discovery_questions, public.discovery_answers to service_role;
create policy discovery_sessions_select_owned on public.discovery_sessions for select to authenticated using (auth.uid() is not null and private.owns_project(project_id));
create policy discovery_assessments_select_owned on public.discovery_assessments for select to authenticated using (auth.uid() is not null and private.owns_project(project_id));
create policy discovery_questions_select_owned on public.discovery_questions for select to authenticated using (auth.uid() is not null and private.owns_project(project_id));
create policy discovery_answers_select_owned on public.discovery_answers for select to authenticated using (auth.uid() is not null and private.owns_project(project_id));

-- ---------------------------------------------------------------------------
-- Subject-aware generation claim/complete RPCs (v3)
-- ---------------------------------------------------------------------------

-- The public v3 names are retained as revoked compatibility stubs below.  Generation claims and
-- completions must cross the server-only service-role boundary so a browser JWT cannot forge a
-- provider result or choose an arbitrary generation operation.
drop function if exists public.claim_generation_run_v3(text,uuid,bigint,text,text,text,text,text);
drop function if exists public.complete_generation_run_v3(uuid,text,text,text,integer,integer,integer,integer,bigint,text,text,text,text);

create or replace function public.claim_generation_run_v3_server(
  p_owner_id uuid,
  p_subject_kind text,
  p_subject_id uuid,
  p_subject_state_version bigint,
  p_idempotency_key text,
  p_request_fingerprint text,
  p_operation_kind text,
  p_input_schema_version text,
  p_output_schema_version text
)
returns table (
  run_id uuid,
  correlation_id uuid,
  claim_status text,
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
  v_project public.projects%rowtype;
  v_draft public.composer_drafts%rowtype;
  v_existing public.idempotency_records%rowtype;
  v_run public.generation_runs%rowtype;
  v_output public.generation_outputs%rowtype;
begin
  if auth.role() <> 'service_role' then raise exception 'server_only' using errcode='42501'; end if;
  if v_owner_id is null then raise exception 'authentication_required' using errcode='P0001'; end if;
  if p_subject_kind not in ('project','composer_draft') or p_subject_id is null then raise exception 'invalid_generation_subject' using errcode='P0001'; end if;
  if p_subject_state_version is null or p_subject_state_version <= 0 then raise exception 'invalid_subject_version' using errcode='P0001'; end if;
  if p_idempotency_key is null or char_length(btrim(p_idempotency_key))=0 or octet_length(p_idempotency_key)>255 then raise exception 'invalid_idempotency_key' using errcode='P0001'; end if;
  if p_request_fingerprint is null or p_request_fingerprint !~ '^[0-9a-f]{64}$' then raise exception 'invalid_request_fingerprint' using errcode='P0001'; end if;
  if p_input_schema_version is distinct from 'unseenprompt.model-gateway-request.v3' then raise exception 'invalid_input_schema_version' using errcode='P0001'; end if;
  if p_operation_kind not in ('intent_detection','discovery_sufficiency','clarification_question') then raise exception 'invalid_operation_kind' using errcode='P0001'; end if;
  if p_output_schema_version is distinct from ('unseenprompt.model-output.' || p_operation_kind || '.v1') then raise exception 'invalid_output_schema_version' using errcode='P0001'; end if;
  if p_operation_kind = 'intent_detection' and p_subject_kind <> 'composer_draft' then raise exception 'invalid_generation_subject' using errcode='P0001'; end if;
  if p_operation_kind <> 'intent_detection' and p_subject_kind <> 'project' then raise exception 'invalid_generation_subject' using errcode='P0001'; end if;

  if p_subject_kind = 'project' then
    select * into v_project from public.projects where id=p_subject_id and owner_id=v_owner_id for update;
    if not found then raise exception 'project_not_found_or_not_owned' using errcode='P0001'; end if;
  else
    select * into v_draft from public.composer_drafts where id=p_subject_id and owner_id=v_owner_id for update;
    if not found then raise exception 'draft_not_found' using errcode='P0001'; end if;
  end if;

  insert into public.idempotency_records(owner_id,project_id,scope,idempotency_key,request_fingerprint,status,resource_type)
  values(v_owner_id,case when p_subject_kind='project' then p_subject_id else null end,'generation',p_idempotency_key,p_request_fingerprint,'in_progress','generation_run')
  on conflict (owner_id,scope,idempotency_key) where owner_id is not null do nothing
  returning * into v_existing;

  if not found then
    select * into v_existing from public.idempotency_records where owner_id=v_owner_id and scope='generation' and idempotency_key=p_idempotency_key for update;
    if not found or v_existing.request_fingerprint is distinct from p_request_fingerprint or v_existing.resource_type is distinct from 'generation_run' or v_existing.project_id is distinct from (case when p_subject_kind='project' then p_subject_id else null end) then raise exception 'idempotency_conflict' using errcode='P0001'; end if;
    if v_existing.status='in_progress' then raise exception 'idempotency_in_progress' using errcode='P0001'; end if;
    if v_existing.status='failed' then
      select error_code into v_run.error_code from public.generation_runs where id=v_existing.resource_id and idempotency_record_id=v_existing.id;
      if v_run.error_code is not null then raise exception using message=v_run.error_code, errcode='P0001'; end if;
      raise exception 'generation_failed' using errcode='P0001';
    end if;
    if v_existing.status='succeeded' then
      select * into v_run from public.generation_runs where id=v_existing.resource_id for update;
      -- The idempotency key/fingerprint identifies the original subject version. Once a
      -- successful run exists, a retry must replay it even if the subject projection has since
      -- advanced; comparing the run version to the caller's stale snapshot would defeat replay.
      if not found or v_run.subject_kind is distinct from p_subject_kind or (case when p_subject_kind='project' then v_run.project_id else v_run.composer_draft_id end) is distinct from p_subject_id or v_run.operation_kind is distinct from p_operation_kind or v_run.input_schema_version is distinct from p_input_schema_version or v_run.output_schema_version is distinct from p_output_schema_version then raise exception 'idempotency_conflict' using errcode='P0001'; end if;
      if p_operation_kind='project_delta' and v_run.validated_project_delta_text is not null then
        return query select v_run.id,v_run.correlation_id,'replayed'::text,v_run.status,v_run.subject_kind,case when v_run.subject_kind='project' then v_run.project_id else v_run.composer_draft_id end,v_run.project_state_version,v_run.project_state_version,v_run.operation_kind,v_run.input_schema_version,v_run.output_schema_version,v_run.provider,v_run.model,v_run.latency_ms,v_run.input_tokens,v_run.output_tokens,v_run.retry_count,v_run.estimated_cost_micros,v_run.validation_result,v_run.error_code,v_run.validated_project_delta_text,v_run.validated_project_delta_hash,null::text,null::text;
        return;
      elsif p_operation_kind in ('intent_detection','discovery_sufficiency','clarification_question') then
        select * into v_output from public.generation_outputs where generation_run_id=v_run.id;
        if not found or v_output.operation_kind is distinct from p_operation_kind or v_output.output_schema_version is distinct from p_output_schema_version or v_output.validated_output_hash is distinct from encode(extensions.digest(convert_to(v_output.validated_output_text,'UTF8'),'sha256'),'hex') then raise exception 'persistence_failed' using errcode='P0001'; end if;
        return query select v_run.id,v_run.correlation_id,'replayed'::text,v_run.status,v_run.subject_kind,case when v_run.subject_kind='project' then v_run.project_id else v_run.composer_draft_id end,v_run.project_state_version,v_run.project_state_version,v_run.operation_kind,v_run.input_schema_version,v_run.output_schema_version,v_run.provider,v_run.model,v_run.latency_ms,v_run.input_tokens,v_run.output_tokens,v_run.retry_count,v_run.estimated_cost_micros,v_run.validation_result,v_run.error_code,null::text,null::text,v_output.validated_output_text,v_output.validated_output_hash;
        return;
      end if;
      raise exception 'idempotency_replay_unavailable' using errcode='P0001';
    end if;
    raise exception 'idempotency_invalid_state' using errcode='P0001';
  end if;

  if p_subject_kind='project' and p_subject_state_version is distinct from v_project.state_version then raise exception 'stale_state_version' using errcode='P0001'; end if;
  if p_subject_kind='composer_draft' and p_subject_state_version is distinct from v_draft.version then raise exception 'stale_draft_version' using errcode='P0001'; end if;
  insert into public.generation_runs(project_id,composer_draft_id,subject_kind,operation_kind,status,project_state_version,input_schema_version,output_schema_version,idempotency_record_id,started_at)
  values(case when p_subject_kind='project' then p_subject_id else null end,case when p_subject_kind='composer_draft' then p_subject_id else null end,p_subject_kind,p_operation_kind,'running',p_subject_state_version,p_input_schema_version,p_output_schema_version,v_existing.id,timezone('utc',now()))
  returning * into v_run;
  update public.idempotency_records set resource_id=v_run.id where id=v_existing.id;
  return query select v_run.id,v_run.correlation_id,'running'::text,v_run.status,v_run.subject_kind,case when v_run.subject_kind='project' then v_run.project_id else v_run.composer_draft_id end,v_run.project_state_version,v_run.project_state_version,v_run.operation_kind,v_run.input_schema_version,v_run.output_schema_version,null::text,null::text,null::integer,null::integer,null::integer,null::integer,null::bigint,v_run.validation_result,null::text,null::text,null::text,null::text,null::text;
end;
$$;

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
  if p_provider is not null and p_provider not in ('anthropic','openai','gemini') then raise exception 'invalid_provider' using errcode='P0001'; end if;
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

revoke all on function public.claim_generation_run_v3_server(uuid,text,uuid,bigint,text,text,text,text,text) from public,anon,authenticated,service_role;
revoke all on function public.complete_generation_run_v3_server(uuid,uuid,text,text,text,integer,integer,integer,integer,bigint,text,text,text,text) from public,anon,authenticated,service_role;
grant execute on function public.claim_generation_run_v3_server(uuid,text,uuid,bigint,text,text,text,text,text) to service_role;
grant execute on function public.complete_generation_run_v3_server(uuid,uuid,text,text,text,integer,integer,integer,integer,bigint,text,text,text,text) to service_role;

-- Preserve the old public signatures as explicit denial stubs. This gives existing clients a stable
-- permission failure while preventing an authenticated JWT from reaching the generation write path.
create or replace function public.claim_generation_run_v3(
  p_subject_kind text,
  p_subject_id uuid,
  p_subject_state_version bigint,
  p_idempotency_key text,
  p_request_fingerprint text,
  p_operation_kind text,
  p_input_schema_version text,
  p_output_schema_version text
)
returns table (
  run_id uuid,
  correlation_id uuid,
  claim_status text,
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
  v_owner_id uuid := auth.uid();
begin
  if auth.role() <> 'service_role' then raise exception 'server_only' using errcode='42501'; end if;
  if v_owner_id is null then raise exception 'authentication_required' using errcode='P0001'; end if;
  return query select * from public.claim_generation_run_v3_server(
    v_owner_id,
    p_subject_kind,
    p_subject_id,
    p_subject_state_version,
    p_idempotency_key,
    p_request_fingerprint,
    p_operation_kind,
    p_input_schema_version,
    p_output_schema_version
  );
end;
$$;

create or replace function public.complete_generation_run_v3(
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
  v_owner_id uuid := auth.uid();
begin
  if auth.role() <> 'service_role' then raise exception 'server_only' using errcode='42501'; end if;
  if v_owner_id is null then raise exception 'authentication_required' using errcode='P0001'; end if;
  return query select * from public.complete_generation_run_v3_server(
    v_owner_id,
    p_run_id,
    p_status,
    p_provider,
    p_model,
    p_latency_ms,
    p_input_tokens,
    p_output_tokens,
    p_retry_count,
    p_estimated_cost_micros,
    p_validation_result,
    p_error_code,
    p_validated_project_delta_text,
    p_validated_output_text
  );
end;
$$;

revoke all on function public.claim_generation_run_v3(text,uuid,bigint,text,text,text,text,text) from public,anon,authenticated,service_role;
revoke all on function public.complete_generation_run_v3(uuid,text,text,text,integer,integer,integer,integer,bigint,text,text,text,text) from public,anon,authenticated,service_role;
grant execute on function public.claim_generation_run_v3(text,uuid,bigint,text,text,text,text,text) to service_role;
grant execute on function public.complete_generation_run_v3(uuid,text,text,text,integer,integer,integer,integer,bigint,text,text,text,text) to service_role;

-- Phase 6's v2 generation functions remain the legacy project-delta API, but Phase 7 must not
-- expose their provider-result write path to a browser JWT either. These wrappers are the only
-- server-role entry point and derive the effective owner from a server-validated request identity.
create or replace function public.claim_generation_run_v2_server(
  p_owner_id uuid,
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
begin
  if auth.role() <> 'service_role' then raise exception 'server_only' using errcode='42501'; end if;
  if p_owner_id is null then raise exception 'authentication_required' using errcode='P0001'; end if;
  perform set_config('request.jwt.claim.sub', p_owner_id::text, true);
  return query
  select * from public.claim_generation_run_v2(
    p_project_id,
    p_project_state_version,
    p_idempotency_key,
    p_request_fingerprint,
    p_operation_kind,
    p_input_schema_version,
    p_output_schema_version
  );
end;
$$;

create or replace function public.complete_generation_run_v2_server(
  p_owner_id uuid,
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
begin
  if auth.role() <> 'service_role' then raise exception 'server_only' using errcode='42501'; end if;
  if p_owner_id is null then raise exception 'authentication_required' using errcode='P0001'; end if;
  perform set_config('request.jwt.claim.sub', p_owner_id::text, true);
  return query
  select * from public.complete_generation_run_v2(
    p_run_id,
    p_status,
    p_provider,
    p_model,
    p_latency_ms,
    p_input_tokens,
    p_output_tokens,
    p_retry_count,
    p_estimated_cost_micros,
    p_validation_result,
    p_error_code,
    p_validated_project_delta_text
  );
end;
$$;

revoke all on function public.claim_generation_run_v2_server(uuid,uuid,bigint,text,text,text,text,text) from public,anon,authenticated,service_role;
revoke all on function public.complete_generation_run_v2_server(uuid,uuid,text,text,text,integer,integer,integer,integer,bigint,text,text,text) from public,anon,authenticated,service_role;
grant execute on function public.claim_generation_run_v2_server(uuid,uuid,bigint,text,text,text,text,text) to service_role;
grant execute on function public.complete_generation_run_v2_server(uuid,uuid,text,text,text,integer,integer,integer,integer,bigint,text,text,text) to service_role;

-- Remove the historical authenticated grants without modifying the Phase 6 migration itself.
revoke execute on function public.claim_generation_run_v2(uuid,bigint,text,text,text,text,text) from authenticated,service_role;
revoke execute on function public.complete_generation_run_v2(uuid,text,text,text,integer,integer,integer,integer,bigint,text,text,text) from authenticated,service_role;

-- ---------------------------------------------------------------------------
-- Composer draft RPCs
-- ---------------------------------------------------------------------------

create or replace function private.phase7_valid_draft_command(p_command jsonb)
returns boolean
language plpgsql
immutable
security definer
set search_path = pg_catalog, public, private
as $$
begin
  if p_command is null or not private.phase7_json_keys_allowed(p_command,array['type','generationRunId','confirmedMode','confirmedTitle']) then return false; end if;
  if not private.phase7_text_ok(p_command->'type',64,false) then return false; end if;
  if p_command->>'type'='retry_intent' or p_command->>'type'='abandon_draft' then return private.phase7_json_keys_exact(p_command,array['type']); end if;
  if p_command->>'type'='apply_intent' then return private.phase7_json_keys_exact(p_command,array['type','generationRunId']) and private.phase7_uuid_text_ok(p_command->'generationRunId'); end if;
  if p_command->>'type'='confirm_and_promote' then return private.phase7_json_keys_exact(p_command,array['type','confirmedMode','confirmedTitle']) and p_command->>'confirmedMode' in ('new_build','feature','bug','review','test','deploy','improve') and private.phase7_text_ok(p_command->'confirmedTitle',240,false); end if;
  return false;
end;
$$;
revoke all on function private.phase7_valid_draft_command(jsonb) from public,anon,authenticated,service_role;

create or replace function public.create_composer_draft_v1(
  p_idempotency_key text,
  p_request_fingerprint text,
  p_initial_request_text text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_owner_id uuid := auth.uid();
  v_existing public.idempotency_records%rowtype;
  v_draft public.composer_drafts%rowtype;
begin
  if v_owner_id is null then raise exception 'auth_required' using errcode='P0001'; end if;
  if p_idempotency_key is null or char_length(btrim(p_idempotency_key))=0 or octet_length(p_idempotency_key)>255 then raise exception 'validation_failed' using errcode='P0001'; end if;
  if p_request_fingerprint is null or p_request_fingerprint !~ '^[0-9a-f]{64}$' then raise exception 'validation_failed' using errcode='P0001'; end if;
  if p_initial_request_text is null or char_length(btrim(p_initial_request_text))=0 or octet_length(convert_to(p_initial_request_text,'UTF8'))>16384 then raise exception 'validation_failed' using errcode='P0001'; end if;
  insert into public.idempotency_records(owner_id,scope,idempotency_key,request_fingerprint,status,resource_type)
  values(v_owner_id,'lifecycle',p_idempotency_key,p_request_fingerprint,'in_progress','composer_draft')
  on conflict(owner_id,scope,idempotency_key) where owner_id is not null do nothing
  returning * into v_existing;
  if not found then
    select * into v_existing from public.idempotency_records where owner_id=v_owner_id and scope='lifecycle' and idempotency_key=p_idempotency_key for update;
    if not found or v_existing.request_fingerprint is distinct from p_request_fingerprint or v_existing.resource_type is distinct from 'composer_draft' then raise exception 'idempotency_conflict' using errcode='P0001'; end if;
    if v_existing.status='in_progress' then raise exception 'idempotency_in_progress' using errcode='P0001'; end if;
    if v_existing.status='succeeded' then
      select * into v_draft from public.composer_drafts where id=v_existing.resource_id and owner_id=v_owner_id;
      if not found then raise exception 'persistence_failed' using errcode='P0001'; end if;
      if v_draft.status='routing' then
        return jsonb_build_object('draftId',v_draft.id,'version',v_draft.version,'status','routing','replayed',true);
      elsif v_draft.status='retry_required' then
        return jsonb_build_object('draftId',v_draft.id,'version',v_draft.version,'status','retry_required','initialRequestText',v_draft.initial_request_text,'lastErrorCode',v_draft.last_error_code,'replayed',true);
      elsif v_draft.status='awaiting_confirmation' then
        return jsonb_build_object('draftId',v_draft.id,'version',v_draft.version,'status','awaiting_confirmation','intent',jsonb_build_object('mode',v_draft.detected_mode,'confidence',v_draft.confidence,'rationale',v_draft.rationale,'detectedLanguage',v_draft.detected_language),'replayed',true);
      end if;
      raise exception 'persistence_failed' using errcode='P0001';
    end if;
    raise exception 'persistence_failed' using errcode='P0001';
  end if;
  insert into public.composer_drafts(owner_id,initial_request_text,status,version) values(v_owner_id,p_initial_request_text,'routing',1) returning * into v_draft;
  update public.idempotency_records set status='succeeded',resource_id=v_draft.id,completed_at=timezone('utc',now()) where id=v_existing.id;
  return jsonb_build_object('draftId',v_draft.id,'version',v_draft.version,'status',v_draft.status,'replayed',false);
end;
$$;

create or replace function public.execute_composer_draft_command_v1(
  p_draft_id uuid,
  p_expected_version bigint,
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
  v_draft public.composer_drafts%rowtype;
  v_existing public.idempotency_records%rowtype;
  v_run public.generation_runs%rowtype;
  v_output public.generation_outputs%rowtype;
  v_project public.projects%rowtype;
  v_session public.discovery_sessions%rowtype;
  v_event public.project_events%rowtype;
  v_command_type text;
  v_next_version bigint;
  v_project_version bigint;
begin
  if v_owner_id is null then raise exception 'auth_required' using errcode='P0001'; end if;
  if p_draft_id is null or p_expected_version is null or p_expected_version<=0 or p_idempotency_key is null or char_length(btrim(p_idempotency_key))=0 or octet_length(p_idempotency_key)>255 or p_request_fingerprint is null or p_request_fingerprint !~ '^[0-9a-f]{64}$' or not private.phase7_valid_draft_command(p_command) then raise exception 'validation_failed' using errcode='P0001'; end if;
  select * into v_draft from public.composer_drafts where id=p_draft_id and owner_id=v_owner_id for update;
  if not found then raise exception 'draft_not_found' using errcode='P0001'; end if;
  insert into public.idempotency_records(owner_id,scope,idempotency_key,request_fingerprint,status,resource_type)
  values(v_owner_id,'lifecycle',p_idempotency_key,p_request_fingerprint,'in_progress','composer_draft_command')
  on conflict(owner_id,scope,idempotency_key) where owner_id is not null do nothing
  returning * into v_existing;
  if not found then
    select * into v_existing from public.idempotency_records where owner_id=v_owner_id and scope='lifecycle' and idempotency_key=p_idempotency_key for update;
    if not found or v_existing.request_fingerprint is distinct from p_request_fingerprint or v_existing.resource_type is distinct from 'composer_draft_command' or v_existing.resource_id is distinct from p_draft_id then raise exception 'idempotency_conflict' using errcode='P0001'; end if;
    if v_existing.status='in_progress' then raise exception 'idempotency_in_progress' using errcode='P0001'; end if;
    if v_existing.status='succeeded' then
      select * into v_draft from public.composer_drafts where id=p_draft_id and owner_id=v_owner_id;
      if not found then raise exception 'persistence_failed' using errcode='P0001'; end if;
      if p_command->>'type'='retry_intent' then
        return jsonb_build_object('draftId',v_draft.id,'version',v_draft.version,'status',v_draft.status,'projectId',v_draft.project_id,'initialRequestText',v_draft.initial_request_text,'replayed',true);
      end if;
      return jsonb_build_object('draftId',v_draft.id,'version',v_draft.version,'status',v_draft.status,'projectId',v_draft.project_id,'replayed',true);
    end if;
    raise exception 'persistence_failed' using errcode='P0001';
  end if;
  if p_expected_version is distinct from v_draft.version then raise exception 'stale_draft_version' using errcode='P0001'; end if;
  v_command_type := p_command->>'type';
  v_next_version := v_draft.version + 1;

  if v_command_type='retry_intent' then
    if v_draft.status <> 'retry_required' then raise exception 'invalid_draft_state' using errcode='P0001'; end if;
    update public.composer_drafts set status='routing',last_error_code=null,version=v_next_version where id=v_draft.id;
  elsif v_command_type='apply_intent' then
    if v_draft.status not in ('routing','retry_required') then raise exception 'invalid_draft_state' using errcode='P0001'; end if;
    select gr.* into v_run from public.generation_runs gr join public.composer_drafts d on d.id=gr.composer_draft_id and d.owner_id=v_owner_id where gr.id=(p_command->>'generationRunId')::uuid for update;
    if not found or v_run.subject_kind <> 'composer_draft' or v_run.operation_kind <> 'intent_detection' or v_run.input_schema_version <> 'unseenprompt.model-gateway-request.v3' or v_run.status <> 'succeeded' or v_run.project_state_version is distinct from v_draft.version or v_run.output_schema_version is distinct from 'unseenprompt.model-output.intent_detection.v1' then raise exception 'invalid_generation_output' using errcode='P0001'; end if;
    select * into v_output from public.generation_outputs where generation_run_id=v_run.id;
    if not found or v_output.operation_kind <> 'intent_detection' or v_output.output_schema_version is distinct from 'unseenprompt.model-output.intent_detection.v1' or v_output.validated_output_hash is distinct from encode(extensions.digest(convert_to(v_output.validated_output_text,'UTF8'),'sha256'),'hex') then raise exception 'invalid_generation_output' using errcode='P0001'; end if;
    update public.composer_drafts set status='awaiting_confirmation',detected_mode=v_output.validated_output_text::jsonb->>'mode',confidence=(v_output.validated_output_text::jsonb->>'confidence')::numeric,rationale=v_output.validated_output_text::jsonb->>'rationale',detected_language=v_output.validated_output_text::jsonb->>'detectedLanguage',intent_generation_run_id=v_run.id,last_error_code=null,version=v_next_version where id=v_draft.id;
  elsif v_command_type='abandon_draft' then
    if v_draft.status='promoted' or v_draft.status='abandoned' then raise exception 'invalid_draft_state' using errcode='P0001'; end if;
    update public.composer_drafts set status='abandoned',abandoned_at=timezone('utc',now()),version=v_next_version where id=v_draft.id;
  elsif v_command_type='confirm_and_promote' then
    if v_draft.status <> 'awaiting_confirmation' then raise exception 'invalid_draft_state' using errcode='P0001'; end if;
    insert into public.projects(owner_id,title,mode,stage,state_version) values(v_owner_id,p_command->>'confirmedTitle',p_command->>'confirmedMode','discovery',1) returning * into v_project;
    update public.composer_drafts set status='promoted',confirmed_mode=p_command->>'confirmedMode',confirmed_title=p_command->>'confirmedTitle',project_id=v_project.id,promoted_at=timezone('utc',now()),version=v_next_version where id=v_draft.id;
    insert into public.discovery_sessions(project_id,source_draft_id,status,policy_version,confirmed_turn_count) values(v_project.id,v_draft.id,'active',1,1) returning * into v_session;
    v_project_version := v_project.state_version + 1;
    insert into public.project_events(project_id,sequence_number,event_type,event_schema_version,actor_type,actor_id,payload) values(v_project.id,v_project_version,'discovery.started',1,'user',v_owner_id,jsonb_build_object('schemaVersion',1,'sessionId',v_session.id,'sourceDraftId',v_draft.id,'appliedStateVersion',v_project_version)) returning * into v_event;
    insert into public.discovery_inputs(project_id,session_id,source,input_text,confirmation_event_id)
    values(v_project.id,v_session.id,'initial_request',v_draft.initial_request_text,v_event.id);
    update public.projects set state_version=v_project_version,last_activity_at=timezone('utc',now()) where id=v_project.id;
    update public.idempotency_records set project_id=v_project.id,status='succeeded',resource_id=v_draft.id,completed_at=timezone('utc',now()) where id=v_existing.id;
    return jsonb_build_object('draftId',v_draft.id,'version',v_next_version,'status','promoted','projectId',v_project.id,'sessionId',v_session.id,'stateVersion',v_project_version,'eventId',v_event.id,'replayed',false);
  end if;
  update public.idempotency_records set status='succeeded',resource_id=v_draft.id,completed_at=timezone('utc',now()) where id=v_existing.id;
  select * into v_draft from public.composer_drafts where id=v_draft.id;
  if v_command_type='retry_intent' then
    return jsonb_build_object('draftId',v_draft.id,'version',v_draft.version,'status',v_draft.status,'projectId',v_draft.project_id,'initialRequestText',v_draft.initial_request_text,'replayed',false);
  end if;
  return jsonb_build_object('draftId',v_draft.id,'version',v_draft.version,'status',v_draft.status,'projectId',v_draft.project_id,'replayed',false);
end;
$$;

revoke all on function public.create_composer_draft_v1(text,text,text) from public,anon,authenticated,service_role;
revoke all on function public.execute_composer_draft_command_v1(uuid,bigint,text,text,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.create_composer_draft_v1(text,text,text) to authenticated;
grant execute on function public.execute_composer_draft_command_v1(uuid,bigint,text,text,jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- Owner-scoped discovery snapshot
-- ---------------------------------------------------------------------------

create or replace function public.get_discovery_snapshot_v1(p_project_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_owner_id uuid := auth.uid();
  v_snapshot jsonb;
begin
  if v_owner_id is null then raise exception 'auth_required' using errcode='P0001'; end if;
  with project_row as (
    select p.id,p.mode,p.stage,p.state_version,s.id as session_id,s.source_draft_id,s.status as session_status,s.policy_version,s.active_question_id,s.latest_assessment_id,s.confirmed_turn_count,s.block_code,s.started_at,s.completed_at,s.abandoned_at,cd.initial_request_text
    from public.projects p join public.discovery_sessions s on s.project_id=p.id join public.composer_drafts cd on cd.id=s.source_draft_id
    where p.id=p_project_id and p.owner_id=v_owner_id and p.deleted_at is null
  )
  select jsonb_build_object(
    'projectId',p.id,'mode',p.mode,'stage',p.stage,'stateVersion',p.state_version,'initialRequestText',p.initial_request_text,
    'session',jsonb_build_object('id',p.session_id,'projectId',p.id,'sourceDraftId',p.source_draft_id,'status',p.session_status,'policyVersion',p.policy_version,'activeQuestionId',p.active_question_id,'latestAssessmentId',p.latest_assessment_id,'confirmedTurnCount',p.confirmed_turn_count,'blockCode',p.block_code,'startedAt',p.started_at,'completedAt',p.completed_at,'abandonedAt',p.abandoned_at),
    'confirmedQuestions',coalesce((select jsonb_agg(jsonb_build_object('id',q.id,'projectId',q.project_id,'sessionId',q.session_id,'generationRunId',q.generation_run_id,'position',q.position,'targetFactKey',q.target_fact_key,'basisStateVersion',q.basis_state_version,'questionText',q.question_text,'rationale',q.rationale,'suggestedAnswers',q.suggested_answers,'allowsFreeText',q.allows_free_text,'questionFingerprint',q.question_fingerprint,'status',q.status,'createdAt',q.created_at,'answeredAt',q.answered_at,'supersededAt',q.superseded_at) order by q.position,q.id) from public.discovery_questions q where q.project_id=p.id and q.status in ('answered','superseded')),'[]'::jsonb),
    'confirmedAnswers',coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'projectId',a.project_id,'sessionId',a.session_id,'questionId',a.question_id,'source',a.source,'answerText',a.answer_text,'status',a.status,'supersedesAnswerId',a.supersedes_answer_id,'confirmationEventId',a.confirmation_event_id,'createdAt',a.created_at,'supersededAt',a.superseded_at) order by a.created_at,a.id) from public.discovery_answers a where a.project_id=p.id),'[]'::jsonb),
    'assessments',coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'projectId',a.project_id,'sessionId',a.session_id,'generationRunId',a.generation_run_id,'basisStateVersion',a.basis_state_version,'isSufficient',a.is_sufficient,'confidence',a.confidence,'missingFactKeys',a.missing_fact_keys,'rationale',a.rationale,'policyPassed',a.policy_passed,'policyFailureCode',a.policy_failure_code,'createdAt',a.created_at) order by a.created_at,a.id) from public.discovery_assessments a where a.project_id=p.id),'[]'::jsonb),
    'activeQuestion',(select jsonb_build_object('id',q.id,'projectId',q.project_id,'sessionId',q.session_id,'generationRunId',q.generation_run_id,'position',q.position,'targetFactKey',q.target_fact_key,'basisStateVersion',q.basis_state_version,'questionText',q.question_text,'rationale',q.rationale,'suggestedAnswers',q.suggested_answers,'allowsFreeText',q.allows_free_text,'questionFingerprint',q.question_fingerprint,'status',q.status,'createdAt',q.created_at,'answeredAt',q.answered_at,'supersededAt',q.superseded_at) from public.discovery_questions q where q.id=p.active_question_id and q.project_id=p.id)
  ) into v_snapshot from project_row p;
  if not found then raise exception 'discovery_not_found' using errcode='P0001'; end if;
  return v_snapshot;
end;
$$;
revoke all on function public.get_discovery_snapshot_v1(uuid) from public,anon,authenticated,service_role;
grant execute on function public.get_discovery_snapshot_v1(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Assessment and question application RPCs
-- ---------------------------------------------------------------------------

create or replace function private.phase7_valid_discovery_command(p_command jsonb)
returns boolean
language plpgsql
immutable
security definer
set search_path = pg_catalog, public, private
as $$
begin
  if p_command is null or not private.phase7_json_keys_allowed(p_command,array['type','questionId','predecessorAnswerId','source','answerText']) then return false; end if;
  if not private.phase7_text_ok(p_command->'type',64,false) then return false; end if;
  if p_command->>'type' in ('advance_discovery','abandon_discovery','resume_discovery') then return private.phase7_json_keys_exact(p_command,array['type']); end if;
  if p_command->>'type'='confirm_answer' then return private.phase7_json_keys_exact(p_command,array['type','questionId','source','answerText']) and private.phase7_uuid_text_ok(p_command->'questionId') and p_command->>'source' in ('suggested','free_text') and private.phase7_text_ok(p_command->'answerText',16384,false); end if;
  if p_command->>'type'='revise_answer' then return private.phase7_json_keys_exact(p_command,array['type','questionId','predecessorAnswerId','source','answerText']) and private.phase7_uuid_text_ok(p_command->'questionId') and private.phase7_uuid_text_ok(p_command->'predecessorAnswerId') and p_command->>'source' in ('suggested','free_text') and private.phase7_text_ok(p_command->'answerText',16384,false); end if;
  return false;
end;
$$;
revoke all on function private.phase7_valid_discovery_command(jsonb) from public,anon,authenticated,service_role;

create or replace function public.apply_discovery_assessment_v1(
  p_project_id uuid,
  p_generation_run_id uuid,
  p_expected_state_version bigint,
  p_idempotency_key text,
  p_request_fingerprint text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_owner_id uuid := auth.uid();
  v_project public.projects%rowtype;
  v_session public.discovery_sessions%rowtype;
  v_run public.generation_runs%rowtype;
  v_output public.generation_outputs%rowtype;
  v_existing public.idempotency_records%rowtype;
  v_assessment public.discovery_assessments%rowtype;
  v_doc jsonb;
  v_facts text[];
  v_raw text[];
  v_missing text[] := array[]::text[];
  v_key text;
  v_policy_passed boolean;
  v_policy_code text;
  v_status text;
  v_next_version bigint;
  v_event public.project_events%rowtype;
begin
  if v_owner_id is null then raise exception 'auth_required' using errcode='P0001'; end if;
  if p_project_id is null or p_generation_run_id is null or p_expected_state_version is null or p_expected_state_version<=0 or p_idempotency_key is null or char_length(btrim(p_idempotency_key))=0 or octet_length(p_idempotency_key)>255 or p_request_fingerprint is null or p_request_fingerprint !~ '^[0-9a-f]{64}$' then raise exception 'validation_failed' using errcode='P0001'; end if;
  select * into v_project from public.projects where id=p_project_id and owner_id=v_owner_id for update;
  if not found then raise exception 'project_not_found' using errcode='P0001'; end if;
  -- Replay is resolved while the owner/project lock is held, before any caller snapshot version
  -- or current lifecycle state is checked. A committed receipt remains replayable after later
  -- discovery activity advances the project version.
  select * into v_existing
  from public.idempotency_records
  where owner_id=v_owner_id and project_id=p_project_id and scope='lifecycle' and idempotency_key=p_idempotency_key
  for update;
  if found then
    if v_existing.request_fingerprint is distinct from p_request_fingerprint or v_existing.resource_type is distinct from 'discovery_assessment' then raise exception 'idempotency_conflict' using errcode='P0001'; end if;
    if v_existing.status='in_progress' then raise exception 'idempotency_in_progress' using errcode='P0001'; end if;
    if v_existing.status='failed' then raise exception 'persistence_failed' using errcode='P0001'; end if;
    if v_existing.status='succeeded' then
      select * into v_assessment from public.discovery_assessments where id=v_existing.resource_id and project_id=p_project_id;
      if not found then raise exception 'persistence_failed' using errcode='P0001'; end if;
      return jsonb_build_object('assessmentId',v_assessment.id,'status',case when v_assessment.policy_passed then 'sufficient' else coalesce((select status from public.discovery_sessions where id=v_assessment.session_id),'active') end,'stateVersion',v_assessment.basis_state_version+1,'replayed',true);
    end if;
  end if;
  if v_project.stage <> 'discovery' or p_expected_state_version is distinct from v_project.state_version then raise exception 'stale_state_version' using errcode='P0001'; end if;
  select * into v_session from public.discovery_sessions where project_id=p_project_id for update;
  if not found then raise exception 'discovery_not_found' using errcode='P0001'; end if;
  if v_session.status <> 'active' then raise exception 'invalid_discovery_state' using errcode='P0001'; end if;
  if v_session.active_question_id is not null then raise exception 'active_question_exists' using errcode='P0001'; end if;
  select gr.* into v_run from public.generation_runs gr where gr.id=p_generation_run_id and gr.project_id=p_project_id and gr.subject_kind='project' for update;
  if not found or v_run.operation_kind <> 'discovery_sufficiency' or v_run.input_schema_version <> 'unseenprompt.model-gateway-request.v3' or v_run.output_schema_version <> 'unseenprompt.model-output.discovery_sufficiency.v1' or v_run.status <> 'succeeded' or v_run.project_state_version is distinct from p_expected_state_version then raise exception 'invalid_generation_output' using errcode='P0001'; end if;
  select * into v_output from public.generation_outputs where generation_run_id=v_run.id;
  if not found then raise exception 'invalid_generation_output' using errcode='P0001'; end if;
  v_doc := v_output.validated_output_text::jsonb;
  v_facts := private.phase7_mode_fact_keys(v_project.mode);
  select coalesce(array_agg(e.value order by e.ordinality),'{}'::text[]) into v_raw from jsonb_array_elements_text(v_doc->'missingFacts') with ordinality as e(value,ordinality);
  foreach v_key in array v_raw loop
    if not (v_key = any(v_facts)) or v_key = any(v_missing) then raise exception 'invalid_missing_fact' using errcode='P0001'; end if;
    v_missing := array_append(v_missing,v_key);
  end loop;
  -- Reorder by the code-owned policy, never by model ordering.
  select coalesce(array_agg(f order by i),'{}'::text[]) into v_missing from unnest(v_facts) with ordinality as u(f,i) where f=any(v_missing);
  if (v_doc->>'isSufficient')::boolean and (v_doc->>'confidence')::numeric >= 0.8 and cardinality(v_missing)=0 then v_policy_passed:=true; v_policy_code:=null; v_status:='sufficient'; else v_policy_passed:=false; v_policy_code:='sufficiency_policy_failed'; v_status:='active'; end if;
  if v_session.confirmed_turn_count >= 12 and not v_policy_passed then v_policy_code:='discovery_turn_limit_reached'; v_status:='blocked'; end if;

  insert into public.idempotency_records(owner_id,project_id,scope,idempotency_key,request_fingerprint,status,resource_type)
  values(v_owner_id,p_project_id,'lifecycle',p_idempotency_key,p_request_fingerprint,'in_progress','discovery_assessment')
  on conflict(owner_id,scope,idempotency_key) where owner_id is not null do nothing
  returning * into v_existing;
  if not found then
    select * into v_existing from public.idempotency_records where owner_id=v_owner_id and project_id=p_project_id and scope='lifecycle' and idempotency_key=p_idempotency_key for update;
    if not found or v_existing.request_fingerprint is distinct from p_request_fingerprint or v_existing.resource_type is distinct from 'discovery_assessment' then raise exception 'idempotency_conflict' using errcode='P0001'; end if;
    if v_existing.status='in_progress' then raise exception 'idempotency_in_progress' using errcode='P0001'; end if;
    if v_existing.status='succeeded' then select * into v_assessment from public.discovery_assessments where id=v_existing.resource_id and project_id=p_project_id; if not found then raise exception 'persistence_failed' using errcode='P0001'; end if; return jsonb_build_object('assessmentId',v_assessment.id,'status',case when v_assessment.policy_passed then 'sufficient' else coalesce((select status from public.discovery_sessions where id=v_assessment.session_id),'active') end,'stateVersion',v_assessment.basis_state_version+1,'replayed',true); end if;
    raise exception 'persistence_failed' using errcode='P0001';
  end if;
  v_next_version := v_project.state_version + 1;
  insert into public.discovery_assessments(project_id,session_id,generation_run_id,basis_state_version,is_sufficient,confidence,missing_fact_keys,rationale,policy_passed,policy_failure_code) values(p_project_id,v_session.id,v_run.id,p_expected_state_version,(v_doc->>'isSufficient')::boolean,(v_doc->>'confidence')::numeric,v_missing,v_doc->>'rationale',v_policy_passed,v_policy_code) returning * into v_assessment;
  update public.discovery_sessions set latest_assessment_id=v_assessment.id,status=v_status,block_code=case when v_status='blocked' then 'discovery_turn_limit_reached' else null end where id=v_session.id;
  insert into public.project_events(project_id,sequence_number,event_type,event_schema_version,actor_type,actor_id,payload) values(p_project_id,v_next_version,'discovery.sufficiency_assessed',1,'user',v_owner_id,jsonb_build_object('schemaVersion',1,'sessionId',v_session.id,'assessmentId',v_assessment.id,'generationRunId',v_run.id,'basisStateVersion',p_expected_state_version,'appliedStateVersion',v_next_version)) returning * into v_event;
  update public.projects set state_version=v_next_version,last_activity_at=timezone('utc',now()) where id=p_project_id;
  update public.idempotency_records set status='succeeded',resource_id=v_assessment.id,completed_at=timezone('utc',now()) where id=v_existing.id;
  return jsonb_build_object('assessmentId',v_assessment.id,'status',v_status,'policyPassed',v_policy_passed,'stateVersion',v_next_version,'eventId',v_event.id,'replayed',false);
end;
$$;

create or replace function public.apply_discovery_question_v1(
  p_project_id uuid,
  p_generation_run_id uuid,
  p_expected_state_version bigint,
  p_idempotency_key text,
  p_request_fingerprint text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_owner_id uuid := auth.uid(); v_project public.projects%rowtype; v_session public.discovery_sessions%rowtype; v_run public.generation_runs%rowtype; v_output public.generation_outputs%rowtype; v_assessment public.discovery_assessments%rowtype; v_existing public.idempotency_records%rowtype; v_question public.discovery_questions%rowtype; v_doc jsonb; v_target_fact_key text; v_fingerprint text; v_next_version bigint; v_event public.project_events%rowtype;
begin
  if v_owner_id is null then raise exception 'auth_required' using errcode='P0001'; end if;
  if p_project_id is null or p_generation_run_id is null or p_expected_state_version is null or p_expected_state_version<=0 or p_idempotency_key is null or char_length(btrim(p_idempotency_key))=0 or octet_length(p_idempotency_key)>255 or p_request_fingerprint is null or p_request_fingerprint !~ '^[0-9a-f]{64}$' then raise exception 'validation_failed' using errcode='P0001'; end if;
  select * into v_project from public.projects where id=p_project_id and owner_id=v_owner_id for update; if not found then raise exception 'project_not_found' using errcode='P0001'; end if;
  select * into v_existing from public.idempotency_records where owner_id=v_owner_id and project_id=p_project_id and scope='lifecycle' and idempotency_key=p_idempotency_key for update;
  if found then
    if v_existing.request_fingerprint is distinct from p_request_fingerprint or v_existing.resource_type is distinct from 'discovery_question' then raise exception 'idempotency_conflict' using errcode='P0001'; end if;
    if v_existing.status='in_progress' then raise exception 'idempotency_in_progress' using errcode='P0001'; end if;
    if v_existing.status='failed' then raise exception 'persistence_failed' using errcode='P0001'; end if;
    if v_existing.status='succeeded' then
      select * into v_question from public.discovery_questions where id=v_existing.resource_id and project_id=p_project_id;
      if not found then raise exception 'persistence_failed' using errcode='P0001'; end if;
      return jsonb_build_object('questionId',v_question.id,'stateVersion',v_question.basis_state_version+1,'replayed',true);
    end if;
  end if;
  if v_project.stage<>'discovery' or p_expected_state_version is distinct from v_project.state_version then raise exception 'stale_state_version' using errcode='P0001'; end if;
  select * into v_session from public.discovery_sessions where project_id=p_project_id for update; if not found then raise exception 'discovery_not_found' using errcode='P0001'; end if;
  if v_session.status<>'active' then raise exception 'invalid_discovery_state' using errcode='P0001'; end if;
  if v_session.active_question_id is not null then raise exception 'active_question_exists' using errcode='P0001'; end if;
  select * into v_assessment from public.discovery_assessments where id=v_session.latest_assessment_id and project_id=p_project_id;
  if not found or v_assessment.policy_passed or v_assessment.basis_state_version+1 is distinct from p_expected_state_version then raise exception 'invalid_discovery_state' using errcode='P0001'; end if;
  select * into v_run from public.generation_runs where id=p_generation_run_id and project_id=p_project_id and subject_kind='project' for update; if not found or v_run.operation_kind<>'clarification_question' or v_run.input_schema_version <> 'unseenprompt.model-gateway-request.v3' or v_run.output_schema_version<>'unseenprompt.model-output.clarification_question.v1' or v_run.status<>'succeeded' or v_run.project_state_version is distinct from p_expected_state_version then raise exception 'invalid_generation_output' using errcode='P0001'; end if;
  select * into v_output from public.generation_outputs where generation_run_id=v_run.id; if not found then raise exception 'invalid_generation_output' using errcode='P0001'; end if;
  v_doc:=v_output.validated_output_text::jsonb;
  v_target_fact_key:=coalesce(v_assessment.missing_fact_keys[1],'clarify_scope');
  v_fingerprint:=encode(extensions.digest(convert_to(private.phase7_canonical_question_text(v_doc->>'question'),'UTF8'),'sha256'),'hex');
  if exists(select 1 from public.discovery_questions where session_id=v_session.id and question_fingerprint=v_fingerprint) then raise exception 'duplicate_question' using errcode='P0001'; end if;
  insert into public.idempotency_records(owner_id,project_id,scope,idempotency_key,request_fingerprint,status,resource_type) values(v_owner_id,p_project_id,'lifecycle',p_idempotency_key,p_request_fingerprint,'in_progress','discovery_question') on conflict(owner_id,scope,idempotency_key) where owner_id is not null do nothing returning * into v_existing;
  if not found then select * into v_existing from public.idempotency_records where owner_id=v_owner_id and project_id=p_project_id and scope='lifecycle' and idempotency_key=p_idempotency_key for update; if not found or v_existing.request_fingerprint is distinct from p_request_fingerprint or v_existing.resource_type is distinct from 'discovery_question' then raise exception 'idempotency_conflict' using errcode='P0001'; end if; if v_existing.status='in_progress' then raise exception 'idempotency_in_progress' using errcode='P0001'; end if; if v_existing.status='succeeded' then select * into v_question from public.discovery_questions where id=v_existing.resource_id and project_id=p_project_id; if not found then raise exception 'persistence_failed' using errcode='P0001'; end if; return jsonb_build_object('questionId',v_question.id,'stateVersion',v_question.basis_state_version+1,'replayed',true); end if; raise exception 'persistence_failed' using errcode='P0001'; end if;
  v_next_version:=v_project.state_version+1;
  insert into public.discovery_questions(project_id,session_id,generation_run_id,position,target_fact_key,basis_state_version,question_text,rationale,suggested_answers,allows_free_text,question_fingerprint,status) values(p_project_id,v_session.id,v_run.id,v_session.confirmed_turn_count,v_target_fact_key,p_expected_state_version,v_doc->>'question',v_doc->>'rationale',v_doc->'suggestedAnswers',(v_doc->>'allowsFreeText')::boolean,v_fingerprint,'active') returning * into v_question;
  update public.discovery_sessions set active_question_id=v_question.id where id=v_session.id;
  insert into public.project_events(project_id,sequence_number,event_type,event_schema_version,actor_type,actor_id,payload) values(p_project_id,v_next_version,'discovery.question_proposed',1,'user',v_owner_id,jsonb_build_object('schemaVersion',1,'sessionId',v_session.id,'questionId',v_question.id,'generationRunId',v_run.id,'basisStateVersion',p_expected_state_version,'appliedStateVersion',v_next_version)) returning * into v_event;
  update public.projects set state_version=v_next_version,last_activity_at=timezone('utc',now()) where id=p_project_id;
  update public.idempotency_records set status='succeeded',resource_id=v_question.id,completed_at=timezone('utc',now()) where id=v_existing.id;
  return jsonb_build_object('questionId',v_question.id,'stateVersion',v_next_version,'eventId',v_event.id,'replayed',false);
end;
$$;

revoke all on function public.apply_discovery_assessment_v1(uuid,uuid,bigint,text,text) from public,anon,authenticated,service_role;
revoke all on function public.apply_discovery_question_v1(uuid,uuid,bigint,text,text) from public,anon,authenticated,service_role;
grant execute on function public.apply_discovery_assessment_v1(uuid,uuid,bigint,text,text) to authenticated,service_role;
grant execute on function public.apply_discovery_question_v1(uuid,uuid,bigint,text,text) to authenticated,service_role;

-- ---------------------------------------------------------------------------
-- User discovery commands (answer, correction, abandon, resume)
-- ---------------------------------------------------------------------------

create or replace function public.execute_discovery_command_v1(
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
  v_owner_id uuid := auth.uid(); v_project public.projects%rowtype; v_session public.discovery_sessions%rowtype; v_question public.discovery_questions%rowtype; v_answer public.discovery_answers%rowtype; v_predecessor public.discovery_answers%rowtype; v_existing public.idempotency_records%rowtype; v_event public.project_events%rowtype; v_type text; v_next_version bigint; v_answer_id uuid; v_event_id uuid; v_before_status text; v_after_status text;
begin
  if v_owner_id is null then raise exception 'auth_required' using errcode='P0001'; end if;
  if p_project_id is null or p_expected_state_version is null or p_expected_state_version<=0 or p_idempotency_key is null or char_length(btrim(p_idempotency_key))=0 or octet_length(p_idempotency_key)>255 or p_request_fingerprint is null or p_request_fingerprint !~ '^[0-9a-f]{64}$' or not private.phase7_valid_discovery_command(p_command) then raise exception 'validation_failed' using errcode='P0001'; end if;
  select * into v_project from public.projects where id=p_project_id and owner_id=v_owner_id for update; if not found then raise exception 'project_not_found' using errcode='P0001'; end if;
  -- Resolve a committed lifecycle receipt before comparing the caller's possibly stale version.
  select * into v_existing from public.idempotency_records where owner_id=v_owner_id and project_id=p_project_id and scope='lifecycle' and idempotency_key=p_idempotency_key for update;
  if found then
    if v_existing.request_fingerprint is distinct from p_request_fingerprint or v_existing.resource_type is distinct from 'discovery_command' then raise exception 'idempotency_conflict' using errcode='P0001'; end if;
    if v_existing.status='in_progress' then raise exception 'idempotency_in_progress' using errcode='P0001'; end if;
    if v_existing.status='failed' then raise exception 'persistence_failed' using errcode='P0001'; end if;
    if v_existing.status='succeeded' then return jsonb_build_object('projectId',p_project_id,'stateVersion',v_project.state_version,'eventId',v_existing.resource_id,'replayed',true); end if;
  end if;
  if p_expected_state_version is distinct from v_project.state_version then raise exception 'stale_state_version' using errcode='P0001'; end if;
  select * into v_session from public.discovery_sessions where project_id=p_project_id for update; if not found then raise exception 'discovery_not_found' using errcode='P0001'; end if;
  v_type:=p_command->>'type';

  insert into public.idempotency_records(owner_id,project_id,scope,idempotency_key,request_fingerprint,status,resource_type) values(v_owner_id,p_project_id,'lifecycle',p_idempotency_key,p_request_fingerprint,'in_progress','discovery_command') on conflict(owner_id,scope,idempotency_key) where owner_id is not null do nothing returning * into v_existing;
  if not found then
    select * into v_existing from public.idempotency_records where owner_id=v_owner_id and project_id=p_project_id and scope='lifecycle' and idempotency_key=p_idempotency_key for update;
    if not found or v_existing.request_fingerprint is distinct from p_request_fingerprint or v_existing.resource_type is distinct from 'discovery_command' then raise exception 'idempotency_conflict' using errcode='P0001'; end if;
    if v_existing.status='in_progress' then raise exception 'idempotency_in_progress' using errcode='P0001'; end if;
    if v_existing.status='succeeded' then return jsonb_build_object('projectId',p_project_id,'stateVersion',v_project.state_version,'eventId',v_existing.resource_id,'replayed',true); end if;
    raise exception 'persistence_failed' using errcode='P0001';
  end if;

  if v_type='advance_discovery' then
    if v_session.status <> 'active' then raise exception 'invalid_discovery_state' using errcode='P0001'; end if;
    if v_session.active_question_id is not null then raise exception 'active_question_exists' using errcode='P0001'; end if;
    update public.idempotency_records set status='succeeded',completed_at=timezone('utc',now()) where id=v_existing.id;
    return jsonb_build_object('projectId',p_project_id,'stateVersion',v_project.state_version,'eventId',null,'replayed',false);
  elsif v_type='confirm_answer' or v_type='revise_answer' then
    if v_type='confirm_answer' and v_session.status <> 'active' then raise exception 'invalid_discovery_state' using errcode='P0001'; end if;
    if v_type='revise_answer' and v_session.status not in ('active','sufficient') then raise exception 'invalid_discovery_state' using errcode='P0001'; end if;
    if v_type='confirm_answer' then
      if v_session.active_question_id is null or v_session.active_question_id is distinct from (p_command->>'questionId')::uuid then raise exception 'question_not_active' using errcode='P0001'; end if;
      select * into v_question from public.discovery_questions where id=(p_command->>'questionId')::uuid and project_id=p_project_id for update;
      if not found or v_question.status <> 'active' then raise exception 'question_not_active' using errcode='P0001'; end if;
      if p_command->>'source'='suggested' then
        if not exists(select 1 from jsonb_array_elements(v_question.suggested_answers) a where a->>'value'=p_command->>'answerText') then raise exception 'answer_not_allowed' using errcode='P0001'; end if;
      elsif not v_question.allows_free_text then raise exception 'answer_not_allowed' using errcode='P0001'; end if;
      v_answer_id:=gen_random_uuid(); v_next_version:=v_project.state_version+1;
      insert into public.project_events(project_id,sequence_number,event_type,event_schema_version,actor_type,actor_id,payload) values(p_project_id,v_next_version,'discovery.answer_confirmed',1,'user',v_owner_id,jsonb_build_object('schemaVersion',1,'sessionId',v_session.id,'questionId',v_question.id,'answerId',v_answer_id,'appliedStateVersion',v_next_version)) returning * into v_event;
      insert into public.discovery_answers(id,project_id,session_id,question_id,source,answer_text,status,confirmation_event_id) values(v_answer_id,p_project_id,v_session.id,v_question.id,p_command->>'source',p_command->>'answerText','confirmed',v_event.id) returning * into v_answer;
      update public.discovery_questions set status='answered',answered_at=timezone('utc',now()) where id=v_question.id;
      update public.discovery_sessions set active_question_id=null,confirmed_turn_count=confirmed_turn_count+1 where id=v_session.id;
      update public.projects set state_version=v_next_version,last_activity_at=timezone('utc',now()) where id=p_project_id;
      update public.idempotency_records set status='succeeded',resource_id=v_event.id,completed_at=timezone('utc',now()) where id=v_existing.id;
      return jsonb_build_object('projectId',p_project_id,'stateVersion',v_next_version,'eventId',v_event.id,'answerId',v_answer.id,'replayed',false);
    else
      select * into v_question from public.discovery_questions where id=(p_command->>'questionId')::uuid and project_id=p_project_id for update;
      if not found or v_question.status <> 'answered' then raise exception 'question_not_found' using errcode='P0001'; end if;
      select * into v_predecessor from public.discovery_answers where id=(p_command->>'predecessorAnswerId')::uuid and project_id=p_project_id and question_id=v_question.id for update;
      if not found or v_predecessor.status <> 'confirmed' then raise exception 'answer_not_allowed' using errcode='P0001'; end if;
      if p_command->>'source'='suggested' then
        if not exists(select 1 from jsonb_array_elements(v_question.suggested_answers) a where a->>'value'=p_command->>'answerText') then raise exception 'answer_not_allowed' using errcode='P0001'; end if;
      elsif not v_question.allows_free_text then raise exception 'answer_not_allowed' using errcode='P0001'; end if;
      v_answer_id:=gen_random_uuid(); v_next_version:=v_project.state_version+1;
      insert into public.project_events(project_id,sequence_number,event_type,event_schema_version,actor_type,actor_id,payload) values(p_project_id,v_next_version,'discovery.answer_superseded',1,'user',v_owner_id,jsonb_build_object('schemaVersion',1,'sessionId',v_session.id,'questionId',v_question.id,'answerId',v_answer_id,'predecessorAnswerId',v_predecessor.id,'appliedStateVersion',v_next_version)) returning * into v_event;
      -- Free the one-current-answer index before inserting the immutable successor. The lineage
      -- trigger accepts this same-transaction superseded predecessor and the unique successor
      -- index still prevents a second correction from the same predecessor.
      update public.discovery_answers set status='superseded',superseded_at=timezone('utc',now()) where id=v_predecessor.id;
      insert into public.discovery_answers(id,project_id,session_id,question_id,source,answer_text,status,supersedes_answer_id,confirmation_event_id) values(v_answer_id,p_project_id,v_session.id,v_question.id,p_command->>'source',p_command->>'answerText','confirmed',v_predecessor.id,v_event.id) returning * into v_answer;
      update public.discovery_answers a
      set status='superseded',superseded_at=timezone('utc',now())
      where a.project_id=p_project_id
        and a.status='confirmed'
        and exists (
          select 1 from public.discovery_questions q
          where q.id=a.question_id
            and q.project_id=p_project_id
            and q.basis_state_version > v_question.basis_state_version
        );
      update public.discovery_questions q
      set status='superseded',superseded_at=timezone('utc',now())
      where q.project_id=p_project_id
        and q.status in ('active','answered')
        and q.basis_state_version > v_question.basis_state_version;
      -- A correction replaces an existing confirmed turn; it must not consume another generated-
      -- question slot or overflow the bounded turn counter at the ceiling.
      update public.discovery_sessions set active_question_id=null,latest_assessment_id=null,status='active',block_code=null where id=v_session.id;
      update public.projects set state_version=v_next_version,last_activity_at=timezone('utc',now()) where id=p_project_id;
      update public.idempotency_records set status='succeeded',resource_id=v_event.id,completed_at=timezone('utc',now()) where id=v_existing.id;
      return jsonb_build_object('projectId',p_project_id,'stateVersion',v_next_version,'eventId',v_event.id,'answerId',v_answer.id,'replayed',false);
    end if;
  elsif v_type='abandon_discovery' then
    if v_session.status not in ('active','sufficient','blocked') then raise exception 'invalid_discovery_state' using errcode='P0001'; end if;
    v_before_status:=v_session.status; v_after_status:='abandoned'; v_next_version:=v_project.state_version+1;
    insert into public.project_events(project_id,sequence_number,event_type,event_schema_version,actor_type,actor_id,payload) values(p_project_id,v_next_version,'discovery.abandoned',1,'user',v_owner_id,jsonb_build_object('schemaVersion',1,'sessionId',v_session.id,'beforeStatus',v_before_status,'afterStatus',v_after_status,'appliedStateVersion',v_next_version)) returning * into v_event;
    update public.discovery_sessions set status='abandoned',abandoned_at=timezone('utc',now()),block_code=null where id=v_session.id;
  elsif v_type='resume_discovery' then
    if v_session.status <> 'abandoned' then raise exception 'invalid_discovery_state' using errcode='P0001'; end if;
    v_before_status:='abandoned'; v_after_status:='active'; v_next_version:=v_project.state_version+1;
    insert into public.project_events(project_id,sequence_number,event_type,event_schema_version,actor_type,actor_id,payload) values(p_project_id,v_next_version,'discovery.resumed',1,'user',v_owner_id,jsonb_build_object('schemaVersion',1,'sessionId',v_session.id,'beforeStatus',v_before_status,'afterStatus',v_after_status,'appliedStateVersion',v_next_version)) returning * into v_event;
    update public.discovery_sessions set status='active',abandoned_at=null where id=v_session.id;
  end if;
  if v_type in ('abandon_discovery','resume_discovery') then
    update public.projects set state_version=v_next_version,last_activity_at=timezone('utc',now()) where id=p_project_id;
    update public.idempotency_records set status='succeeded',resource_id=v_event.id,completed_at=timezone('utc',now()) where id=v_existing.id;
    return jsonb_build_object('projectId',p_project_id,'stateVersion',v_next_version,'eventId',v_event.id,'replayed',false);
  end if;
  raise exception 'validation_failed' using errcode='P0001';
end;
$$;

revoke all on function public.execute_discovery_command_v1(uuid,bigint,text,text,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.execute_discovery_command_v1(uuid,bigint,text,text,jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- Completion handoff to Phase 8
-- ---------------------------------------------------------------------------

create or replace function public.complete_discovery_v1(
  p_project_id uuid,
  p_generation_run_id uuid,
  p_expected_state_version bigint,
  p_idempotency_key text,
  p_request_fingerprint text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_owner_id uuid := auth.uid(); v_project public.projects%rowtype; v_session public.discovery_sessions%rowtype; v_run public.generation_runs%rowtype; v_existing public.idempotency_records%rowtype; v_event public.project_events%rowtype; v_next_version bigint; v_doc jsonb;
begin
  if v_owner_id is null then raise exception 'auth_required' using errcode='P0001'; end if;
  if p_project_id is null or p_generation_run_id is null or p_expected_state_version is null or p_expected_state_version<=0 or p_idempotency_key is null or char_length(btrim(p_idempotency_key))=0 or octet_length(p_idempotency_key)>255 or p_request_fingerprint is null or p_request_fingerprint !~ '^[0-9a-f]{64}$' then raise exception 'validation_failed' using errcode='P0001'; end if;
  select * into v_project from public.projects where id=p_project_id and owner_id=v_owner_id for update; if not found then raise exception 'project_not_found' using errcode='P0001'; end if;
  -- Return the original completion receipt before checking the now-current stage/version. This
  -- makes a retried HTTP response loss replayable after the stage has already advanced.
  select * into v_existing from public.idempotency_records where owner_id=v_owner_id and project_id=p_project_id and scope='lifecycle' and idempotency_key=p_idempotency_key for update;
  if found then
    if v_existing.request_fingerprint is distinct from p_request_fingerprint or v_existing.resource_type is distinct from 'discovery_completion' then raise exception 'idempotency_conflict' using errcode='P0001'; end if;
    if v_existing.status='in_progress' then raise exception 'idempotency_in_progress' using errcode='P0001'; end if;
    if v_existing.status='failed' then raise exception 'persistence_failed' using errcode='P0001'; end if;
    if v_existing.status='succeeded' then return jsonb_build_object('projectId',p_project_id,'stateVersion',v_project.state_version,'eventId',v_existing.resource_id,'replayed',true); end if;
  end if;
  if v_project.stage <> 'discovery' or v_project.state_version is distinct from p_expected_state_version then raise exception 'stale_state_version' using errcode='P0001'; end if;
  select * into v_session from public.discovery_sessions where project_id=p_project_id for update; if not found or v_session.status <> 'sufficient' then raise exception 'invalid_discovery_state' using errcode='P0001'; end if;
  select * into v_run from public.generation_runs where id=p_generation_run_id and project_id=p_project_id and subject_kind='project' for update; if not found or v_run.operation_kind<>'project_delta' or v_run.output_schema_version<>'unseenprompt.model-output.project_delta.v1' or v_run.status<>'succeeded' or v_run.validated_project_delta_text is null then raise exception 'proposal_incomplete' using errcode='P0001'; end if;
  begin v_doc:=v_run.validated_project_delta_text::jsonb; exception when others then raise exception 'proposal_incomplete' using errcode='P0001'; end;
  if jsonb_array_length(v_doc->'requirementProposals') < 1
     or jsonb_array_length(v_doc->'decisionProposals') <> 0
     or jsonb_array_length(v_doc->'milestoneProposals') <> 0
     or jsonb_array_length(v_doc->'unresolvedConflicts') > 0 then
    raise exception 'proposal_incomplete' using errcode='P0001';
  end if;
  -- A run claimed against the current version is still eligible to reach the explicit
  -- proposal_not_applied guard below; only a run from a future snapshot is stale here.
  if v_run.project_state_version > p_expected_state_version then raise exception 'stale_state_version' using errcode='P0001'; end if;
  if not exists (
    select 1 from public.project_delta_applications pda
    where pda.project_id=p_project_id and pda.generation_run_id=p_generation_run_id
  ) then
    raise exception 'proposal_not_applied' using errcode='P0001';
  end if;

  insert into public.idempotency_records(owner_id,project_id,scope,idempotency_key,request_fingerprint,status,resource_type) values(v_owner_id,p_project_id,'lifecycle',p_idempotency_key,p_request_fingerprint,'in_progress','discovery_completion') on conflict(owner_id,scope,idempotency_key) where owner_id is not null do nothing returning * into v_existing;
  if not found then
    select * into v_existing from public.idempotency_records where owner_id=v_owner_id and project_id=p_project_id and scope='lifecycle' and idempotency_key=p_idempotency_key for update;
    if not found or v_existing.request_fingerprint is distinct from p_request_fingerprint or v_existing.resource_type is distinct from 'discovery_completion' then raise exception 'idempotency_conflict' using errcode='P0001'; end if;
    if v_existing.status='in_progress' then raise exception 'idempotency_in_progress' using errcode='P0001'; end if;
    if v_existing.status='succeeded' then return jsonb_build_object('projectId',p_project_id,'stateVersion',v_project.state_version,'eventId',v_existing.resource_id,'replayed',true); end if;
    raise exception 'persistence_failed' using errcode='P0001';
  end if;
  v_next_version:=v_project.state_version+1;
  insert into public.project_events(project_id,sequence_number,event_type,event_schema_version,actor_type,actor_id,payload) values(p_project_id,v_next_version,'discovery.completed',1,'user',v_owner_id,jsonb_build_object('schemaVersion',1,'sessionId',v_session.id,'projectDeltaGenerationRunId',v_run.id,'beforeStatus','sufficient','afterStatus','completed','fromStage','discovery','toStage','brief_confirmation','appliedStateVersion',v_next_version)) returning * into v_event;
  update public.discovery_sessions set status='completed',completed_at=timezone('utc',now()) where id=v_session.id;
  update public.projects set stage='brief_confirmation',state_version=v_next_version,last_activity_at=timezone('utc',now()) where id=p_project_id;
  update public.idempotency_records set status='succeeded',resource_id=v_event.id,completed_at=timezone('utc',now()) where id=v_existing.id;
  return jsonb_build_object('projectId',p_project_id,'stateVersion',v_next_version,'eventId',v_event.id,'replayed',false);
end;
$$;

revoke all on function public.complete_discovery_v1(uuid,uuid,bigint,text,text) from public,anon,authenticated,service_role;
grant execute on function public.complete_discovery_v1(uuid,uuid,bigint,text,text) to authenticated,service_role;

-- Generation output is append-only validated evidence. Server-only generation RPCs are the only
-- write path for provider output; lifecycle apply RPCs consume the validated rows owner-scoped.
create or replace function private.prevent_generation_output_mutation()
returns trigger language plpgsql security definer set search_path = pg_catalog, public, private as $$
begin
  if tg_op = 'DELETE' and pg_trigger_depth() > 1 then
    return old;
  end if;
  raise exception 'generation_output_immutable' using errcode='P0001';
end;
$$;
revoke all on function private.prevent_generation_output_mutation() from public,anon,authenticated,service_role;
create trigger generation_outputs_immutable before update or delete on public.generation_outputs for each row execute function private.prevent_generation_output_mutation();

-- Keep all discovery RPCs explicit and non-public. These comments are also useful migration-level
-- contract markers for generated client adapters.
comment on function public.claim_generation_run_v3_server(uuid,text,uuid,bigint,text,text,text,text,text) is 'Phase 7 server-only subject-aware generation claim with durable validated-output replay.';
comment on function public.complete_generation_run_v3_server(uuid,uuid,text,text,text,integer,integer,integer,integer,bigint,text,text,text,text) is 'Phase 7 server-only subject-aware generation completion with durable validated-output hash.';
comment on function public.claim_generation_run_v2_server(uuid,uuid,bigint,text,text,text,text,text) is 'Phase 7 server-only wrapper for the legacy project-delta generation claim.';
comment on function public.complete_generation_run_v2_server(uuid,uuid,text,text,text,integer,integer,integer,integer,bigint,text,text,text) is 'Phase 7 server-only wrapper for the legacy project-delta generation completion.';
comment on function public.create_composer_draft_v1(text,text,text) is 'Owner-derived composer draft creation; no raw provider data is accepted.';
comment on function public.execute_composer_draft_command_v1(uuid,bigint,text,text,jsonb) is 'Atomic owner-scoped draft intent/promotion lifecycle command.';
comment on function public.get_discovery_snapshot_v1(uuid) is 'Owner-scoped resumable discovery snapshot.';
comment on function public.apply_discovery_assessment_v1(uuid,uuid,bigint,text,text) is 'Apply a durable advisory sufficiency assessment through deterministic policy.';
comment on function public.apply_discovery_question_v1(uuid,uuid,bigint,text,text) is 'Persist one targeted immutable clarification question.';
comment on function public.execute_discovery_command_v1(uuid,bigint,text,text,jsonb) is 'Atomic owner-scoped answer, correction, abandon, and resume command.';
comment on function public.complete_discovery_v1(uuid,uuid,bigint,text,text) is 'Complete discovery and hand off proposed delta to Phase 8.';
