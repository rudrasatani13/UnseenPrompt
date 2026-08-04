begin;

select plan(68);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change
) values
  (
    '00000000-0000-0000-0000-000000000000',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'authenticated', 'authenticated', 'generation-a@users.invalid',
    extensions.crypt('x', extensions.gen_salt('bf')),
    timezone('utc', now()), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
    timezone('utc', now()), timezone('utc', now()), '', '', '', ''
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    'authenticated', 'authenticated', 'generation-b@users.invalid',
    extensions.crypt('x', extensions.gen_salt('bf')),
    timezone('utc', now()), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
    timezone('utc', now()), timezone('utc', now()), '', '', '', ''
  );

insert into public.profiles (id, display_name) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Generation A'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'Generation B');

insert into public.projects (id, owner_id, title, mode, stage, state_version) values
  ('01000000-0000-4000-8000-000000000011', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Generation A1', 'new_build', 'discovery', 1),
  ('01000000-0000-4000-8000-000000000012', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Generation A2', 'feature', 'discovery', 1),
  ('01000000-0000-4000-8000-000000000013', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'Generation B1', 'bug', 'discovery', 1);

-- Schema, constraints, index, and fixed function security properties.
select has_column('public', 'generation_runs', 'validation_result', 'validation_result column exists');
select ok(
  exists (
    select 1
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = 'generation_runs'
      and c.conname = 'generation_runs_validation_result_chk'
  ),
  'validation result closed constraint exists'
);
select ok(
  exists (
    select 1 from pg_indexes
    where schemaname = 'public'
      and tablename = 'generation_runs'
      and indexname = 'generation_runs_idempotency_record_uidx'
  ),
  'one-run-per-idempotency partial unique index exists'
);
select has_function(
  'public',
  'claim_generation_run',
  array['uuid', 'bigint', 'text', 'text', 'text', 'text', 'text'],
  'claim_generation_run signature exists'
);
select has_function(
  'public',
  'complete_generation_run',
  array['uuid', 'text', 'text', 'text', 'integer', 'integer', 'integer', 'integer', 'bigint', 'text', 'text'],
  'complete_generation_run signature exists'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'public.claim_generation_run(uuid,bigint,text,text,text,text,text)',
    'EXECUTE'
  ),
  'authenticated cannot execute retired claim_generation_run'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.claim_generation_run(uuid,bigint,text,text,text,text,text)',
    'EXECUTE'
  ),
  'anon cannot execute claim_generation_run'
);
select ok(
  not has_function_privilege(
    'service_role',
    'public.claim_generation_run(uuid,bigint,text,text,text,text,text)',
    'EXECUTE'
  ),
  'service_role cannot execute retired claim_generation_run'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'public.complete_generation_run(uuid,text,text,text,integer,integer,integer,integer,bigint,text,text)',
    'EXECUTE'
  ),
  'authenticated cannot execute retired complete_generation_run'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.complete_generation_run(uuid,text,text,text,integer,integer,integer,integer,bigint,text,text)',
    'EXECUTE'
  ),
  'anon cannot execute complete_generation_run'
);
select ok(
  not has_function_privilege(
    'service_role',
    'public.complete_generation_run(uuid,text,text,text,integer,integer,integer,integer,bigint,text,text)',
    'EXECUTE'
  ),
  'service_role cannot execute retired complete_generation_run'
);
select ok(
  has_table_privilege('authenticated', 'public.generation_runs', 'SELECT')
    and not has_table_privilege('authenticated', 'public.generation_runs', 'INSERT')
    and not has_table_privilege('authenticated', 'public.generation_runs', 'UPDATE')
    and not has_table_privilege('authenticated', 'public.generation_runs', 'DELETE'),
  'authenticated has select only on generation_runs'
);
select ok(
  has_table_privilege('authenticated', 'public.idempotency_records', 'SELECT')
    and not has_table_privilege('authenticated', 'public.idempotency_records', 'INSERT')
    and not has_table_privilege('authenticated', 'public.idempotency_records', 'UPDATE')
    and not has_table_privilege('authenticated', 'public.idempotency_records', 'DELETE'),
  'authenticated has select only on idempotency_records'
);
select ok(
  (select prosecdef from pg_proc where oid = 'public.claim_generation_run(uuid,bigint,text,text,text,text,text)'::regprocedure)
    and (select prosecdef from pg_proc where oid = 'public.complete_generation_run(uuid,text,text,text,integer,integer,integer,integer,bigint,text,text)'::regprocedure),
  'both RPCs are security definer functions'
);
select ok(
  (select proconfig @> array['search_path=pg_catalog, public, private']
   from pg_proc
   where oid = 'public.claim_generation_run(uuid,bigint,text,text,text,text,text)'::regprocedure)
    and (select proconfig @> array['search_path=pg_catalog, public, private']
        from pg_proc
        where oid = 'public.complete_generation_run(uuid,text,text,text,integer,integer,integer,integer,bigint,text,text)'::regprocedure),
  'both RPCs pin the private search path'
);

-- Unauthenticated and anonymous callers cannot use the RPCs.
set local role anon;
select throws_ok(
  $$select * from public.claim_generation_run(
      '01000000-0000-4000-8000-000000000011', 1,
      'anon-key', repeat('a', 64), 'intent_detection', 'unseenprompt.model-gateway-request.v1', 'unseenprompt.model-output.intent_detection.v1'
    )$$,
  '42501', null, 'anonymous claim rejected'
);
select throws_ok(
  $$select * from public.complete_generation_run(
      '06000000-0000-4000-8000-000000000001', 'failed', null, null,
      null, null, null, 0, null, 'not_attempted', 'aborted'
    )$$,
  '42501', null, 'anonymous completion rejected'
);
reset role;

select set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}', true);
-- The historical v1 function bodies remain available only to the migration owner for compatibility
-- checks. Production callers use the Phase 6 v2 RPCs.
reset role;

select throws_ok(
  $$select * from public.claim_generation_run(
      '01000000-0000-4000-8000-000000000013', 1,
      'foreign-key', repeat('b', 64), 'intent_detection', 'unseenprompt.model-gateway-request.v1', 'unseenprompt.model-output.intent_detection.v1'
    )$$,
  'P0001', 'project_not_found_or_not_owned', 'foreign project does not disclose ownership'
);
select throws_ok(
  $$select * from public.claim_generation_run(
      '01999999-9999-4999-8999-999999999999', 1,
      'missing-key', repeat('c', 64), 'intent_detection', 'unseenprompt.model-gateway-request.v1', 'unseenprompt.model-output.intent_detection.v1'
    )$$,
  'P0001', 'project_not_found_or_not_owned', 'missing project shares the ownership error'
);
select throws_ok(
  $$select * from public.claim_generation_run(
      '01000000-0000-4000-8000-000000000011', 2,
      'stale-key', repeat('d', 64), 'intent_detection', 'unseenprompt.model-gateway-request.v1', 'unseenprompt.model-output.intent_detection.v1'
    )$$,
  'P0001', 'stale_state_version', 'stale project state is rejected'
);
select is(
  (select count(*)::int from public.idempotency_records where idempotency_key = 'stale-key'),
  0,
  'stale claim leaves no idempotency record'
);
select throws_ok(
  $$select * from public.claim_generation_run(
      '01000000-0000-4000-8000-000000000011', 1,
      'bad-fingerprint-key', 'not-a-sha256-fingerprint', 'intent_detection', 'unseenprompt.model-gateway-request.v1', 'unseenprompt.model-output.intent_detection.v1'
    )$$,
  'P0001', 'invalid_request_fingerprint', 'fingerprint must be lowercase 64-hex'
);
select throws_ok(
  $$select * from public.claim_generation_run(
      '01000000-0000-4000-8000-000000000011', 1,
      'bad-operation-key', repeat('3', 64), 'arbitrary_operation', 'unseenprompt.model-gateway-request.v1', 'unseenprompt.model-output.intent_detection.v1'
    )$$,
  'P0001', 'invalid_operation_kind', 'operation kind is closed to Phase 5 operations'
);
select throws_ok(
  $$select * from public.claim_generation_run(
      '01000000-0000-4000-8000-000000000011', 1,
      'bad-input-schema-key', repeat('7', 64), 'intent_detection', 'wrong-input.v1', 'unseenprompt.model-output.intent_detection.v1'
    )$$,
  'P0001', 'invalid_input_schema_version', 'input schema version must match the gateway contract exactly'
);
select throws_ok(
  $$select * from public.claim_generation_run(
      '01000000-0000-4000-8000-000000000011', 1,
      'null-input-schema-key', repeat('8', 64), 'intent_detection', null, 'unseenprompt.model-output.intent_detection.v1'
    )$$,
  'P0001', 'invalid_input_schema_version', 'null input schema version is rejected'
);
select throws_ok(
  $$select * from public.claim_generation_run(
      '01000000-0000-4000-8000-000000000011', 1,
      'bad-output-schema-key', repeat('9', 64), 'intent_detection', 'unseenprompt.model-gateway-request.v1', 'wrong-output.v1'
    )$$,
  'P0001', 'invalid_output_schema_version', 'output schema version must match the operation exactly'
);
select throws_ok(
  $$select * from public.claim_generation_run(
      '01000000-0000-4000-8000-000000000011', 1,
      'null-output-schema-key', repeat('0', 64), 'intent_detection', 'unseenprompt.model-gateway-request.v1', null
    )$$,
  'P0001', 'invalid_output_schema_version', 'null output schema version is rejected'
);

create temporary table tmp_generation_claim as
select *
from public.claim_generation_run(
  '01000000-0000-4000-8000-000000000011', 1,
  'generation-key-1', repeat('e', 64), 'risk_flags', 'unseenprompt.model-gateway-request.v1', 'unseenprompt.model-output.risk_flags.v1'
);

select is((select count(*)::int from tmp_generation_claim), 1, 'first claim returns one bounded row');
select is((select status from tmp_generation_claim), 'running', 'new claim returns running status');
select is(
  (select validation_result from public.generation_runs where id = (select run_id from tmp_generation_claim)),
  'not_attempted',
  'new claim uses safe validation default'
);
select is(
  (select status from public.idempotency_records where idempotency_key = 'generation-key-1'),
  'in_progress',
  'new claim creates in-progress generation idempotency'
);
select is(
  (select resource_id from public.idempotency_records where idempotency_key = 'generation-key-1'),
  (select run_id from tmp_generation_claim),
  'idempotency record links to claimed run'
);

select throws_ok(
  $$select * from public.claim_generation_run(
      '01000000-0000-4000-8000-000000000011', 1,
      'generation-key-1', repeat('f', 64), 'risk_flags', 'unseenprompt.model-gateway-request.v1', 'unseenprompt.model-output.risk_flags.v1'
    )$$,
  'P0001', 'idempotency_conflict', 'same key with different fingerprint conflicts'
);
select throws_ok(
  $$select * from public.claim_generation_run(
      '01000000-0000-4000-8000-000000000011', 1,
      'generation-key-1', repeat('e', 64), 'risk_flags', 'unseenprompt.model-gateway-request.v1', 'unseenprompt.model-output.risk_flags.v1'
    )$$,
  'P0001', 'idempotency_in_progress', 'same key while running is rejected'
);

-- Run identity fields cannot be rewritten after claim.
reset role;
select throws_ok(
  $$update public.generation_runs set id = '06000000-0000-4000-8000-000000000061'
    where id = (select run_id from tmp_generation_claim)$$,
  'P0001', 'generation_run_identity_immutable', 'run id is immutable'
);
select throws_ok(
  $$update public.generation_runs set project_id = '01000000-0000-4000-8000-000000000012'
    where id = (select run_id from tmp_generation_claim)$$,
  'P0001', 'generation_run_identity_immutable', 'project id is immutable'
);
select throws_ok(
  $$update public.generation_runs set project_state_version = 2
    where id = (select run_id from tmp_generation_claim)$$,
  'P0001', 'generation_run_identity_immutable', 'project state version is immutable'
);
select throws_ok(
  $$update public.generation_runs set operation_kind = 'project_delta'
    where id = (select run_id from tmp_generation_claim)$$,
  'P0001', 'generation_run_identity_immutable', 'operation kind is immutable'
);
select throws_ok(
  $$update public.generation_runs set input_schema_version = 'input.v2'
    where id = (select run_id from tmp_generation_claim)$$,
  'P0001', 'generation_run_identity_immutable', 'input schema version is immutable'
);
select throws_ok(
  $$update public.generation_runs set output_schema_version = 'output.v2'
    where id = (select run_id from tmp_generation_claim)$$,
  'P0001', 'generation_run_identity_immutable', 'output schema version is immutable'
);
select throws_ok(
  $$update public.generation_runs set idempotency_record_id = null
    where id = (select run_id from tmp_generation_claim)$$,
  'P0001', 'generation_run_identity_immutable', 'idempotency linkage is immutable'
);
select throws_ok(
  $$update public.generation_runs set correlation_id = '06000000-0000-4000-8000-000000000062'
    where id = (select run_id from tmp_generation_claim)$$,
  'P0001', 'generation_run_identity_immutable', 'correlation id is immutable'
);
select throws_ok(
  $$update public.generation_runs set created_at = created_at + interval '1 second'
    where id = (select run_id from tmp_generation_claim)$$,
  'P0001', 'generation_run_identity_immutable', 'created timestamp is immutable'
);

-- Invalid terminal combinations and bounded numeric metadata fail closed.
reset role;
select throws_ok(
  $$select * from public.complete_generation_run(
      (select run_id from tmp_generation_claim), 'succeeded', 'openai', 'model-x',
      10, 1, 2, 0, 3, 'not_attempted', null
    )$$,
  'P0001', 'invalid_succeeded_generation', 'success requires a valid validation result'
);
select throws_ok(
  $$select * from public.complete_generation_run(
      (select run_id from tmp_generation_claim), 'succeeded', 'openai', 'model-x',
      10, 1, 2, 0, 3, 'passed', 'provider_error'
    )$$,
  'P0001', 'invalid_succeeded_generation', 'success cannot include an error'
);
select throws_ok(
  $$select * from public.complete_generation_run(
      (select run_id from tmp_generation_claim), 'succeeded', null, 'model-x',
      10, 1, 2, 0, 3, 'passed', null
    )$$,
  'P0001', 'invalid_succeeded_generation', 'success requires provider and latency metadata'
);
select throws_ok(
  $$select * from public.complete_generation_run(
      (select run_id from tmp_generation_claim), 'failed', null, null,
      10, 1, 2, 0, 3, 'passed', 'provider_error'
    )$$,
  'P0001', 'invalid_failed_generation', 'failure cannot have a valid validation result'
);
select throws_ok(
  $$select * from public.complete_generation_run(
      (select run_id from tmp_generation_claim), 'failed', null, null,
      -1, 1, 2, 0, 3, 'failed', 'provider_error'
    )$$,
  'P0001', 'invalid_latency_ms', 'negative latency is rejected'
);
select throws_ok(
  $$select * from public.complete_generation_run(
      (select run_id from tmp_generation_claim), 'failed', null, null,
      1, -1, 2, 0, 3, 'failed', 'provider_error'
    )$$,
  'P0001', 'invalid_input_tokens', 'negative input tokens are rejected'
);
select throws_ok(
  $$select * from public.complete_generation_run(
      (select run_id from tmp_generation_claim), 'failed', null, null,
      1, 1, -1, 0, 3, 'failed', 'provider_error'
    )$$,
  'P0001', 'invalid_output_tokens', 'negative output tokens are rejected'
);
select throws_ok(
  $$select * from public.complete_generation_run(
      (select run_id from tmp_generation_claim), 'failed', null, null,
      1, 1, 2, -1, 3, 'failed', 'provider_error'
    )$$,
  'P0001', 'invalid_retry_count', 'negative retry count is rejected'
);
select throws_ok(
  $$select * from public.complete_generation_run(
      (select run_id from tmp_generation_claim), 'failed', null, null,
      1, 1, 2, 0, -1, 'failed', 'provider_error'
    )$$,
  'P0001', 'invalid_estimated_cost_micros', 'negative cost is rejected'
);
select throws_ok(
  $$select * from public.complete_generation_run(
      (select run_id from tmp_generation_claim), 'failed', null, null,
      1, 1, 2, 0, 3, 'failed', 'raw_provider_error'
    )$$,
  'P0001', 'invalid_error_code', 'arbitrary error codes are rejected'
);
select throws_ok(
  $$select * from public.complete_generation_run(
      (select run_id from tmp_generation_claim), 'failed', 'provider-x', 'model-x',
      1, 1, 2, 0, 3, 'failed', 'provider_error'
    )$$,
  'P0001', 'invalid_provider', 'provider is closed to supported adapters'
);

-- A successful completion is atomic with its idempotency terminal update and
-- an identical retry is idempotent.
select lives_ok(
  $$select * from public.complete_generation_run(
      (select run_id from tmp_generation_claim), 'succeeded', 'openai', 'model-x',
      10, 1, 2, 0, 3, 'passed', null
    )$$,
  'valid success completion succeeds'
);
select is(
  (select status from public.generation_runs where id = (select run_id from tmp_generation_claim)),
  'succeeded',
  'success status is persisted'
);
select is(
  (select status from public.idempotency_records where idempotency_key = 'generation-key-1'),
  'succeeded',
  'success marks idempotency terminal'
);
select lives_ok(
  $$select * from public.complete_generation_run(
      (select run_id from tmp_generation_claim), 'succeeded', 'openai', 'model-x',
      10, 1, 2, 0, 3, 'passed', null
    )$$,
  'identical terminal completion is idempotent'
);
select throws_ok(
  $$select * from public.complete_generation_run(
      (select run_id from tmp_generation_claim), 'failed', null, null,
      10, 1, 2, 0, 3, 'failed', 'provider_error'
    )$$,
  'P0001', 'generation_completion_conflict', 'conflicting terminal completion is rejected'
);
select throws_ok(
  $$select * from public.claim_generation_run(
      '01000000-0000-4000-8000-000000000011', 1,
      'generation-key-1', repeat('e', 64), 'risk_flags', 'unseenprompt.model-gateway-request.v1', 'unseenprompt.model-output.risk_flags.v1'
    )$$,
  'P0001', 'idempotency_replay_unavailable', 'successful replay is unavailable without output storage'
);

-- Failed and canceled terminal runs expose only their stable error code on a
-- repeated claim, never a provider payload or arbitrary detail.
create temporary table tmp_failed_claim as
select *
from public.claim_generation_run(
  '01000000-0000-4000-8000-000000000011', 1,
  'generation-key-failed', repeat('1', 64), 'risk_flags', 'unseenprompt.model-gateway-request.v1', 'unseenprompt.model-output.risk_flags.v1'
);
select lives_ok(
  $$select * from public.complete_generation_run(
      (select run_id from tmp_failed_claim), 'failed', null, null,
      11, 4, 0, 1, 0, 'failed', 'provider_error'
    )$$,
  'valid failed completion succeeds'
);
select is(
  (select status from public.idempotency_records where idempotency_key = 'generation-key-failed'),
  'failed',
  'failed completion marks idempotency failed'
);
select throws_ok(
  $$select * from public.claim_generation_run(
      '01000000-0000-4000-8000-000000000011', 1,
      'generation-key-failed', repeat('1', 64), 'risk_flags', 'unseenprompt.model-gateway-request.v1', 'unseenprompt.model-output.risk_flags.v1'
    )$$,
  'P0001', 'provider_error', 'failed replay returns its stable terminal code'
);

create temporary table tmp_canceled_claim as
select *
from public.claim_generation_run(
  '01000000-0000-4000-8000-000000000011', 1,
  'generation-key-canceled', repeat('2', 64), 'risk_flags', 'unseenprompt.model-gateway-request.v1', 'unseenprompt.model-output.risk_flags.v1'
);
select lives_ok(
  $$select * from public.complete_generation_run(
      (select run_id from tmp_canceled_claim), 'canceled', null, null,
      null, null, null, 0, null, 'not_attempted', 'aborted'
    )$$,
  'valid canceled completion succeeds'
);
select throws_ok(
  $$select * from public.claim_generation_run(
      '01000000-0000-4000-8000-000000000011', 1,
      'generation-key-canceled', repeat('2', 64), 'risk_flags', 'unseenprompt.model-gateway-request.v1', 'unseenprompt.model-output.risk_flags.v1'
    )$$,
  'P0001', 'aborted', 'canceled replay returns its stable terminal code'
);

-- Project deletion must still be able to cascade the historical generation
-- idempotency reference: the nested FK SET NULL is the only permitted linkage
-- change, and the run/idempotency rows are then removed by their project FKs.
create temporary table tmp_cascade_claim as
select *
from public.claim_generation_run(
  '01000000-0000-4000-8000-000000000012', 1,
  'generation-key-cascade', repeat('4', 64), 'project_delta', 'unseenprompt.model-gateway-request.v1', 'unseenprompt.model-output.project_delta.v1'
);
reset role;
select lives_ok(
  $$delete from public.projects where id = '01000000-0000-4000-8000-000000000012'$$,
  'owned project deletion cascades claimed generation records'
);
select is(
  (select count(*)::int from public.generation_runs where id = (select run_id from tmp_cascade_claim)),
  0,
  'claimed generation run is removed with its project'
);
select is(
  (select count(*)::int from public.idempotency_records where idempotency_key = 'generation-key-cascade'),
  0,
  'generation idempotency record is removed with its project'
);

select * from finish();
rollback;
