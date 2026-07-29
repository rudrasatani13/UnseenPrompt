begin;

select plan(20);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change
) values (
  '00000000-0000-0000-0000-000000000000',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  'authenticated', 'authenticated', 'immut@users.invalid',
  extensions.crypt('x', extensions.gen_salt('bf')),
  timezone('utc', now()), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
  timezone('utc', now()), timezone('utc', now()), '', '', '', ''
);

insert into public.profiles (id, display_name)
values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Immut User');

insert into public.projects (id, owner_id, title, mode, stage, state_version)
values (
  '01000000-0000-4000-8000-000000000001',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  'Immutable Project', 'review', 'discovery', 1
);

insert into public.generation_runs (id, project_id, operation_kind, status, project_state_version)
values (
  '06000000-0000-4000-8000-000000000001',
  '01000000-0000-4000-8000-000000000001',
  'prompt', 'succeeded', 1
);

insert into public.prompt_versions (
  id, project_id, generation_run_id, tool, version, source, project_state_version, prompt_text, content_hash
) values (
  '07000000-0000-4000-8000-000000000001',
  '01000000-0000-4000-8000-000000000001',
  '06000000-0000-4000-8000-000000000001',
  'codex', 1, 'generated', 1, 'Do not rewrite me', 'hash-immut'
);

insert into public.idempotency_records (
  id, owner_id, project_id, scope, idempotency_key, request_fingerprint, status
) values (
  '08000000-0000-4000-8000-0000000000aa',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  '01000000-0000-4000-8000-000000000001',
  'billing',
  'ledger-link-key',
  'fp-ledger',
  'succeeded'
);

-- Linked usage entry (project + idempotency refs) must not block project delete.
insert into public.usage_ledger (
  owner_id, project_id, entitlement_key, direction, quantity, source_type, source_id,
  idempotency_record_id, period_start, period_end, occurred_at
) values (
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  '01000000-0000-4000-8000-000000000001',
  'projects', 'debit', 1, 'test', 'ledger-1',
  '08000000-0000-4000-8000-0000000000aa',
  timezone('utc', now()), timezone('utc', now()) + interval '1 day', timezone('utc', now())
);

select throws_ok(
  $$update public.project_events set event_type = 'rewritten'
    where project_id = '01000000-0000-4000-8000-000000000001'$$,
  'P0001', 'project_events_immutable', 'project_events update raises stable code'
);

select throws_ok(
  $$delete from public.project_events
    where project_id = '01000000-0000-4000-8000-000000000001'$$,
  'P0001', 'project_events_immutable', 'project_events direct delete raises stable code'
);

-- Custom GUC is not an authorization boundary.
select throws_ok(
  $q$set local private.allow_append_only_purge = 'on';
    delete from public.project_events
    where project_id = '01000000-0000-4000-8000-000000000001';$q$,
  'P0001',
  'project_events_immutable',
  'GUC alone cannot authorize append-only delete'
);

select throws_ok(
  $$update public.prompt_versions set prompt_text = 'rewritten'
    where id = '07000000-0000-4000-8000-000000000001'$$,
  'P0001', 'prompt_versions_immutable', 'prompt_versions update raises stable code'
);

select throws_ok(
  $$delete from public.prompt_versions
    where id = '07000000-0000-4000-8000-000000000001'$$,
  'P0001', 'prompt_versions_immutable', 'prompt_versions direct delete raises stable code'
);

select throws_ok(
  $$update public.usage_ledger set quantity = 99 where source_id = 'ledger-1'$$,
  'P0001', 'usage_ledger_immutable', 'usage ledger content update denied'
);

select throws_ok(
  $$update public.usage_ledger set project_id = null where source_id = 'ledger-1'$$,
  'P0001', 'usage_ledger_immutable', 'direct reference-null update denied without cascade'
);

select set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}', true);
set local role authenticated;

select throws_ok(
  $$delete from public.project_events where project_id = '01000000-0000-4000-8000-000000000001'$$,
  '42501', null, 'authenticated cannot delete project_events'
);

select throws_ok(
  $$delete from public.prompt_versions where id = '07000000-0000-4000-8000-000000000001'$$,
  '42501', null, 'authenticated cannot delete prompt_versions'
);

select throws_ok(
  $$update public.usage_ledger set quantity = 99 where source_id = 'ledger-1'$$,
  '42501', null, 'authenticated cannot update usage_ledger'
);

reset role;

select is(
  (select count(*)::int from public.project_events where project_id = '01000000-0000-4000-8000-000000000001'),
  1, 'event still present before cascade'
);

select is(
  (select count(*)::int from public.prompt_versions where project_id = '01000000-0000-4000-8000-000000000001'),
  1, 'prompt still present before cascade'
);

select is(
  (select count(*)::int from public.usage_ledger where source_id = 'ledger-1' and project_id is not null),
  1, 'linked ledger present before project delete'
);

-- Parent project delete: cascades immutable children and clears ledger project_id via SET NULL.
select lives_ok(
  $$delete from public.projects where id = '01000000-0000-4000-8000-000000000001'$$,
  'project with generation run, prompt, and linked ledger deletes'
);

select is(
  (select count(*)::int from public.project_events where project_id = '01000000-0000-4000-8000-000000000001'),
  0, 'parent cascade removed events'
);

select is(
  (select count(*)::int from public.prompt_versions where project_id = '01000000-0000-4000-8000-000000000001'),
  0, 'parent cascade removed prompts'
);

select is(
  (select count(*)::int from public.generation_runs where project_id = '01000000-0000-4000-8000-000000000001'),
  0, 'parent cascade removed generation runs'
);

select is(
  (select count(*)::int from public.usage_ledger where source_id = 'ledger-1'),
  1, 'ledger row retained after project delete'
);

select is(
  (select project_id from public.usage_ledger where source_id = 'ledger-1'),
  null,
  'ledger project_id cleared by cascade SET NULL only'
);

-- After parent delete, unrelated append-only rows still cannot be deleted via GUC.
select throws_ok(
  $q$set local private.allow_append_only_purge = 'on';
    delete from public.usage_ledger where source_id = 'ledger-1';$q$,
  'P0001',
  'usage_ledger_immutable',
  'post-parent-delete GUC cannot authorize ledger delete'
);

select * from finish();
rollback;
