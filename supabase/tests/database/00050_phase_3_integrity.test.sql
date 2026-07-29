begin;

select plan(17);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change
) values (
  '00000000-0000-0000-0000-000000000000',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  'authenticated', 'authenticated', 'integrity@users.invalid',
  extensions.crypt('x', extensions.gen_salt('bf')),
  timezone('utc', now()), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
  timezone('utc', now()), timezone('utc', now()), '', '', '', ''
);

insert into public.profiles (id, display_name)
values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Integrity User');

insert into public.projects (id, owner_id, title, mode, stage, state_version) values
  ('01000000-0000-4000-8000-000000000001', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Project One', 'new_build', 'discovery', 1),
  ('01000000-0000-4000-8000-000000000002', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Project Two', 'feature', 'discovery', 1);

insert into public.milestones (id, project_id, position, title, suggested_status) values
  ('04000000-0000-4000-8000-000000000001', '01000000-0000-4000-8000-000000000001', 1, 'M1', 'pending'),
  ('04000000-0000-4000-8000-000000000002', '01000000-0000-4000-8000-000000000002', 1, 'M2', 'pending');

insert into public.generation_runs (id, project_id, operation_kind, status, project_state_version) values
  ('06000000-0000-4000-8000-000000000001', '01000000-0000-4000-8000-000000000001', 'prompt', 'queued', 1),
  ('06000000-0000-4000-8000-000000000002', '01000000-0000-4000-8000-000000000002', 'prompt', 'queued', 1);

insert into public.prompt_versions (
  id, project_id, generation_run_id, tool, version, source, project_state_version, prompt_text, content_hash
) values
  ('07000000-0000-4000-8000-000000000001', '01000000-0000-4000-8000-000000000001', '06000000-0000-4000-8000-000000000001', 'cursor', 1, 'generated', 1, 'P1', 'h1'),
  ('07000000-0000-4000-8000-000000000002', '01000000-0000-4000-8000-000000000002', '06000000-0000-4000-8000-000000000002', 'cursor', 1, 'generated', 1, 'P2', 'h2');

select throws_ok(
  $$insert into public.agent_returns (project_id, prompt_version_id, status, content_hash)
    values (
      '01000000-0000-4000-8000-000000000001',
      '07000000-0000-4000-8000-000000000002',
      'submitted',
      'hx'
    )$$,
  '23503', null, 'cannot attach prompt from project two to project one return'
);

select throws_ok(
  $$update public.projects
    set active_milestone_id = '04000000-0000-4000-8000-000000000002'
    where id = '01000000-0000-4000-8000-000000000001'$$,
  '23503', null, 'active milestone must belong to same project'
);

select lives_ok(
  $$insert into public.agent_returns (id, project_id, prompt_version_id, status, content_hash)
    values (
      '08000000-0000-4000-8000-000000000001',
      '01000000-0000-4000-8000-000000000001',
      '07000000-0000-4000-8000-000000000001',
      'submitted',
      'h1'
    )$$,
  'same-project agent return ok'
);

select lives_ok(
  $$update public.projects
    set active_milestone_id = '04000000-0000-4000-8000-000000000001'
    where id = '01000000-0000-4000-8000-000000000001'$$,
  'same-project active milestone ok'
);

select lives_ok(
  $$update public.projects set title = title where id = '01000000-0000-4000-8000-000000000001'$$,
  'harmless project update allowed as superuser fixture path'
);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change
) values (
  '00000000-0000-0000-0000-000000000000',
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  'authenticated', 'authenticated', 'other@users.invalid',
  extensions.crypt('x', extensions.gen_salt('bf')),
  timezone('utc', now()), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
  timezone('utc', now()), timezone('utc', now()), '', '', '', ''
);

insert into public.profiles (id, display_name)
values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'Other');

select throws_ok(
  $$update public.projects
    set owner_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
    where id = '01000000-0000-4000-8000-000000000001'$$,
  'P0001', 'project_owner_immutable', 'owner reassignment raises project_owner_immutable'
);

select throws_ok(
  $$update public.milestones
    set project_id = '01000000-0000-4000-8000-000000000002'
    where id = '04000000-0000-4000-8000-000000000001'$$,
  'P0001', 'project_child_project_immutable', 'milestone cannot change project'
);

insert into public.requirements (
  id, project_id, category, statement, status, confirmed_at
) values (
  '02000000-0000-4000-8000-000000000001',
  '01000000-0000-4000-8000-000000000001',
  'func', 'Confirmed statement', 'confirmed', timezone('utc', now())
);

select throws_ok(
  $$update public.requirements
    set statement = 'Changed'
    where id = '02000000-0000-4000-8000-000000000001'$$,
  'P0001', 'confirmed_requirement_immutable', 'confirmed requirement statement frozen'
);

select lives_ok(
  $$insert into public.requirements (
      id, project_id, category, statement, status, supersedes_requirement_id
    ) values (
      '02000000-0000-4000-8000-000000000003',
      '01000000-0000-4000-8000-000000000001',
      'func', 'Successor statement', 'proposed',
      '02000000-0000-4000-8000-000000000001'
    )$$,
  'same-project supersession ok'
);

select throws_ok(
  $$insert into public.requirements (
      project_id, category, statement, status, supersedes_requirement_id
    ) values (
      '01000000-0000-4000-8000-000000000002',
      'func', 'Bad successor', 'proposed',
      '02000000-0000-4000-8000-000000000001'
    )$$,
  '23503', null, 'cross-project supersession rejected'
);

select throws_ok(
  $$insert into public.projects (owner_id, title, mode, stage)
    values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'X', 'nope', 'discovery')$$,
  '23514', null, 'invalid mode rejected'
);

select throws_ok(
  $$insert into public.projects (owner_id, title, mode, stage)
    values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '   ', 'bug', 'discovery')$$,
  '23514', null, 'empty title rejected'
);

select throws_ok(
  $$insert into public.projects (owner_id, title, mode, stage, archived_at)
    values (
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      'Archived bad', 'bug', 'archived', null
    )$$,
  '23514', null, 'archived stage requires archived_at'
);

insert into public.artifacts (
  id, project_id, object_path, original_filename, media_type, size_bytes, content_hash, status
) values (
  '09000000-0000-4000-8000-000000000001',
  '01000000-0000-4000-8000-000000000001',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/01000000-0000-4000-8000-000000000001/09000000-0000-4000-8000-000000000001/a.txt',
  'a.txt', 'text/plain', 1, 'h', 'ready'
);

select lives_ok(
  $$insert into public.artifact_extractions (
      project_id, artifact_id, attempt, status, extractor_version
    ) values (
      '01000000-0000-4000-8000-000000000001',
      '09000000-0000-4000-8000-000000000001',
      1, 'queued', 'v1'
    )$$,
  'first extraction attempt ok'
);

select throws_ok(
  $$insert into public.artifact_extractions (
      project_id, artifact_id, attempt, status, extractor_version
    ) values (
      '01000000-0000-4000-8000-000000000001',
      '09000000-0000-4000-8000-000000000001',
      1, 'queued', 'v1'
    )$$,
  '23505', null, 'duplicate extraction attempt rejected'
);

select is(
  (select count(*)::int from public.project_events
   where project_id = '01000000-0000-4000-8000-000000000001' and sequence_number = 1),
  1, 'project insert created sequence 1 event'
);

select is(
  (select state_version from public.projects where id = '01000000-0000-4000-8000-000000000001'),
  1::bigint, 'initial state_version is 1'
);

select * from finish();
rollback;
