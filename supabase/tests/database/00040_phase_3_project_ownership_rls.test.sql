begin;

select plan(35);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change
) values
  (
    '00000000-0000-0000-0000-000000000000',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'authenticated', 'authenticated', 'owner-a@users.invalid',
    extensions.crypt('x', extensions.gen_salt('bf')),
    timezone('utc', now()), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
    timezone('utc', now()), timezone('utc', now()), '', '', '', ''
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    'authenticated', 'authenticated', 'owner-b@users.invalid',
    extensions.crypt('x', extensions.gen_salt('bf')),
    timezone('utc', now()), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
    timezone('utc', now()), timezone('utc', now()), '', '', '', ''
  );

insert into public.profiles (id, display_name) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Owner A'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'Owner B');

-- Stable unique hex IDs (projects 01xx, requirements 02xx, decisions 03xx, milestones 04xx,
-- summaries 05xx, generation 06xx, prompts 07xx, returns 08xx, artifacts 09xx,
-- extractions 0axx, suggestions 0bxx)
insert into public.projects (id, owner_id, title, mode, stage, state_version) values
  ('01000000-0000-4000-8000-000000000001', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Project A', 'new_build', 'discovery', 1),
  ('01000000-0000-4000-8000-000000000002', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'Project B', 'feature', 'discovery', 1);

insert into public.requirements (id, project_id, category, statement, status) values
  ('02000000-0000-4000-8000-000000000001', '01000000-0000-4000-8000-000000000001', 'func', 'Req A', 'proposed'),
  ('02000000-0000-4000-8000-000000000002', '01000000-0000-4000-8000-000000000002', 'func', 'Req B', 'proposed');

insert into public.decisions (id, project_id, decision_key, decision, status) values
  ('03000000-0000-4000-8000-000000000001', '01000000-0000-4000-8000-000000000001', 'k', 'Dec A', 'proposed'),
  ('03000000-0000-4000-8000-000000000002', '01000000-0000-4000-8000-000000000002', 'k', 'Dec B', 'proposed');

insert into public.milestones (id, project_id, position, title, suggested_status) values
  ('04000000-0000-4000-8000-000000000001', '01000000-0000-4000-8000-000000000001', 1, 'M A', 'pending'),
  ('04000000-0000-4000-8000-000000000002', '01000000-0000-4000-8000-000000000002', 1, 'M B', 'pending');

insert into public.project_summaries (
  id, project_id, summary_kind, version, based_on_event_sequence, summary_text, status
) values
  ('05000000-0000-4000-8000-000000000001', '01000000-0000-4000-8000-000000000001', 'brief', 1, 1, 'Summary A', 'current'),
  ('05000000-0000-4000-8000-000000000002', '01000000-0000-4000-8000-000000000002', 'brief', 1, 1, 'Summary B', 'current');

insert into public.generation_runs (id, project_id, operation_kind, status, project_state_version) values
  ('06000000-0000-4000-8000-000000000001', '01000000-0000-4000-8000-000000000001', 'prompt', 'queued', 1),
  ('06000000-0000-4000-8000-000000000002', '01000000-0000-4000-8000-000000000002', 'prompt', 'queued', 1);

insert into public.prompt_versions (
  id, project_id, generation_run_id, tool, version, source, project_state_version, prompt_text, content_hash
) values
  ('07000000-0000-4000-8000-000000000001', '01000000-0000-4000-8000-000000000001', '06000000-0000-4000-8000-000000000001', 'cursor', 1, 'generated', 1, 'Prompt A', 'hash-a'),
  ('07000000-0000-4000-8000-000000000002', '01000000-0000-4000-8000-000000000002', '06000000-0000-4000-8000-000000000002', 'cursor', 1, 'generated', 1, 'Prompt B', 'hash-b');

insert into public.agent_returns (id, project_id, prompt_version_id, status, content_hash) values
  ('08000000-0000-4000-8000-000000000001', '01000000-0000-4000-8000-000000000001', '07000000-0000-4000-8000-000000000001', 'submitted', 'hash-a'),
  ('08000000-0000-4000-8000-000000000002', '01000000-0000-4000-8000-000000000002', '07000000-0000-4000-8000-000000000002', 'submitted', 'hash-b');

insert into public.artifacts (
  id, project_id, agent_return_id, object_path, original_filename, media_type, size_bytes, content_hash, status
) values
  (
    '09000000-0000-4000-8000-000000000001',
    '01000000-0000-4000-8000-000000000001',
    '08000000-0000-4000-8000-000000000001',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/01000000-0000-4000-8000-000000000001/09000000-0000-4000-8000-000000000001/a.txt',
    'a.txt', 'text/plain', 10, 'hash-a', 'ready'
  ),
  (
    '09000000-0000-4000-8000-000000000002',
    '01000000-0000-4000-8000-000000000002',
    '08000000-0000-4000-8000-000000000002',
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/01000000-0000-4000-8000-000000000002/09000000-0000-4000-8000-000000000002/b.txt',
    'b.txt', 'text/plain', 10, 'hash-b', 'ready'
  );

insert into public.artifact_extractions (id, project_id, artifact_id, attempt, status, extractor_version) values
  ('0a000000-0000-4000-8000-000000000001', '01000000-0000-4000-8000-000000000001', '09000000-0000-4000-8000-000000000001', 1, 'queued', 'v1'),
  ('0a000000-0000-4000-8000-000000000002', '01000000-0000-4000-8000-000000000002', '09000000-0000-4000-8000-000000000002', 1, 'queued', 'v1');

insert into public.completion_suggestions (
  id, project_id, agent_return_id, suggested_status, rationale, decision_status
) values
  ('0b000000-0000-4000-8000-000000000001', '01000000-0000-4000-8000-000000000001', '08000000-0000-4000-8000-000000000001', 'completed', 'Looks done', 'pending'),
  ('0b000000-0000-4000-8000-000000000002', '01000000-0000-4000-8000-000000000002', '08000000-0000-4000-8000-000000000002', 'blocked', 'Needs work', 'pending');

-- User A
select set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}', true);
set local role authenticated;

select is((select count(*)::int from public.projects), 1, 'A sees one project');
select is((select count(*)::int from public.requirements), 1, 'A sees own requirements');
select is((select count(*)::int from public.decisions), 1, 'A sees own decisions');
select is((select count(*)::int from public.milestones), 1, 'A sees own milestones');
select is((select count(*)::int from public.project_events), 1, 'A sees own events');
select is((select count(*)::int from public.project_summaries), 1, 'A sees own summaries');
select is((select count(*)::int from public.generation_runs), 1, 'A sees own generation runs');
select is((select count(*)::int from public.prompt_versions), 1, 'A sees own prompts');
select is((select count(*)::int from public.agent_returns), 1, 'A sees own returns');
select is((select count(*)::int from public.artifacts), 1, 'A sees own artifacts');
select is((select count(*)::int from public.artifact_extractions), 1, 'A sees own extractions');
select is((select count(*)::int from public.completion_suggestions), 1, 'A sees own suggestions');

select is(
  (select count(*)::int from public.projects where id = '01000000-0000-4000-8000-000000000002'),
  0,
  'A cannot see B project'
);

select throws_ok(
  $$insert into public.requirements (project_id, category, statement, status)
    values ('01000000-0000-4000-8000-000000000001', 'x', 'y', 'proposed')$$,
  '42501', null, 'A cannot direct-insert requirements'
);

select throws_ok(
  $$insert into public.project_events (project_id, sequence_number, event_type, actor_type, payload)
    values ('01000000-0000-4000-8000-000000000001', 2, 'x', 'user', '{}'::jsonb)$$,
  '42501', null, 'A cannot direct-insert events'
);

select throws_ok(
  $$update public.projects set title = 'Hacked' where id = '01000000-0000-4000-8000-000000000001'$$,
  '42501', null, 'A cannot direct-update projects'
);

select throws_ok(
  $$delete from public.requirements where id = '02000000-0000-4000-8000-000000000001'$$,
  '42501', null, 'A cannot delete requirements'
);

reset role;

-- User B
select set_config('request.jwt.claim.sub', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb","role":"authenticated"}', true);
set local role authenticated;

select is((select count(*)::int from public.projects), 1, 'B sees one project');
select is(
  (select count(*)::int from public.requirements where id = '02000000-0000-4000-8000-000000000001'),
  0, 'B cannot see A requirement'
);
select is(
  (select count(*)::int from public.prompt_versions where id = '07000000-0000-4000-8000-000000000001'),
  0, 'B cannot see A prompt'
);
select is(
  (select count(*)::int from public.artifacts where id = '09000000-0000-4000-8000-000000000001'),
  0, 'B cannot see A artifact'
);
select is(
  (select count(*)::int from public.completion_suggestions where id = '0b000000-0000-4000-8000-000000000001'),
  0, 'B cannot see A suggestion'
);

-- No update grant: privilege error (not zero-row)
select throws_ok(
  $$update public.milestones set title = 'Nope' where id = '04000000-0000-4000-8000-000000000001'$$,
  '42501', null, 'B cannot update A milestone'
);

reset role;

set local role anon;
select throws_ok($$select * from public.projects$$, '42501', null, 'anon cannot select projects');
select throws_ok($$select * from public.project_events$$, '42501', null, 'anon cannot select events');
select throws_ok($$select * from public.prompt_versions$$, '42501', null, 'anon cannot select prompts');
select throws_ok($$select * from public.artifacts$$, '42501', null, 'anon cannot select artifacts');
reset role;

select ok(not has_table_privilege('authenticated', 'public.generation_runs', 'INSERT'), 'no generation insert grant');
select ok(not has_table_privilege('authenticated', 'public.agent_returns', 'INSERT'), 'no agent_return insert grant');
select ok(not has_table_privilege('authenticated', 'public.artifacts', 'INSERT'), 'no artifact insert grant');
select ok(not has_table_privilege('authenticated', 'public.artifact_extractions', 'UPDATE'), 'no extraction update grant');
select ok(not has_table_privilege('authenticated', 'public.completion_suggestions', 'UPDATE'), 'no suggestion update grant');
select ok(not has_table_privilege('authenticated', 'public.milestones', 'DELETE'), 'no milestone delete grant');
select ok(has_table_privilege('authenticated', 'public.prompt_versions', 'SELECT'), 'prompt select granted');
select ok(has_table_privilege('authenticated', 'public.project_events', 'SELECT'), 'event select granted');

select * from finish();
rollback;
