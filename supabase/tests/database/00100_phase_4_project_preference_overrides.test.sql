begin;

select plan(33);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change
) values
  (
    '00000000-0000-0000-0000-000000000000',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'authenticated', 'authenticated', 'override-a@users.invalid',
    extensions.crypt('x', extensions.gen_salt('bf')),
    timezone('utc', now()), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
    timezone('utc', now()), timezone('utc', now()), '', '', '', ''
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    'authenticated', 'authenticated', 'override-b@users.invalid',
    extensions.crypt('x', extensions.gen_salt('bf')),
    timezone('utc', now()), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
    timezone('utc', now()), timezone('utc', now()), '', '', '', ''
  );

insert into public.profiles (id, display_name) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Override A'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'Override B');

insert into public.projects (id, owner_id, title, mode, stage, state_version) values
  ('01000000-0000-4000-8000-000000000101', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Project A1', 'new_build', 'discovery', 1),
  ('01000000-0000-4000-8000-000000000102', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Project A2', 'new_build', 'discovery', 1),
  ('01000000-0000-4000-8000-000000000103', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'Project B', 'feature', 'discovery', 1);

select has_table('public', 'project_preference_overrides', 'overrides table exists');
select has_column('public', 'project_preference_overrides', 'project_id', 'project reference exists');
select has_column('public', 'project_preference_overrides', 'skill_level', 'skill override exists');
select has_column('public', 'project_preference_overrides', 'preferred_stack_behavior', 'stack behavior override exists');
select has_column('public', 'project_preference_overrides', 'preferred_stack', 'stack override exists');
select has_column('public', 'project_preference_overrides', 'coding_style', 'style override exists');
select has_column('public', 'project_preference_overrides', 'deployment_preference', 'deployment override exists');
select has_column('public', 'project_preference_overrides', 'updated_at', 'override timestamp exists');
select ok(
  (select relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relname = 'project_preference_overrides'),
  'RLS is enabled'
);
select ok(has_table_privilege('authenticated', 'public.project_preference_overrides', 'SELECT'), 'authenticated can select');
select ok(has_table_privilege('authenticated', 'public.project_preference_overrides', 'INSERT'), 'authenticated can insert');
select ok(has_table_privilege('authenticated', 'public.project_preference_overrides', 'UPDATE'), 'authenticated can update');
select ok(not has_table_privilege('authenticated', 'public.project_preference_overrides', 'DELETE'), 'authenticated cannot delete');

select throws_ok(
  $$insert into public.project_preference_overrides (project_id, skill_level)
    values ('01000000-0000-4000-8000-000000000101', 'expert')$$,
  '23514', null, 'invalid skill level rejected'
);
select throws_ok(
  $$insert into public.project_preference_overrides (project_id, preferred_stack_behavior)
    values ('01000000-0000-4000-8000-000000000101', 'always')$$,
  '23514', null, 'invalid stack behavior rejected'
);
select throws_ok(
  $$insert into public.project_preference_overrides (project_id, preferred_stack)
    values ('01000000-0000-4000-8000-000000000101', '[]'::jsonb)$$,
  '23514', null, 'stack must be an object'
);
select throws_ok(
  $$insert into public.project_preference_overrides (project_id, coding_style)
    values ('01000000-0000-4000-8000-000000000101', '[]'::jsonb)$$,
  '23514', null, 'style must be an object'
);
select throws_ok(
  $$insert into public.project_preference_overrides (project_id, preferred_stack)
    values ('01000000-0000-4000-8000-000000000101', jsonb_build_object('x', repeat('a', 16385)))$$,
  '23514', null, 'stack size is bounded'
);
select throws_ok(
  $$insert into public.project_preference_overrides (project_id, coding_style)
    values ('01000000-0000-4000-8000-000000000101', jsonb_build_object('x', repeat('a', 16385)))$$,
  '23514', null, 'style size is bounded'
);
select throws_ok(
  $$insert into public.project_preference_overrides (project_id, deployment_preference)
    values ('01000000-0000-4000-8000-000000000101', '   ')$$,
  '23514', null, 'blank deployment preference rejected'
);
select throws_ok(
  $$insert into public.project_preference_overrides (project_id, deployment_preference)
    values ('01000000-0000-4000-8000-000000000101', repeat('a', 256))$$,
  '23514', null, 'deployment preference size is bounded'
);

select set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}', true);
set local role authenticated;

select lives_ok(
  $$insert into public.project_preference_overrides (
      project_id, skill_level, preferred_stack, coding_style, deployment_preference
    ) values (
      '01000000-0000-4000-8000-000000000101', 'advanced', '{"frontend":"Next.js"}'::jsonb,
      '{"testing":"test_first"}'::jsonb, 'cloudflare'
    )$$,
  'A can create an override for own project'
);
select is((select count(*)::int from public.project_preference_overrides), 1, 'A sees own override');
select throws_ok(
  $$insert into public.project_preference_overrides (project_id)
    values ('01000000-0000-4000-8000-000000000101')$$,
  '23505', null, 'a project has at most one override'
);
select lives_ok(
  $$update public.project_preference_overrides
    set skill_level = null, preferred_stack = null, coding_style = null, deployment_preference = null
    where project_id = '01000000-0000-4000-8000-000000000101'$$,
  'A clears fields without deleting the override row'
);
select is(
  (select count(*)::int from public.preferences where owner_id = auth.uid()),
  0,
  'override changes do not create or modify global preferences'
);
select throws_ok(
  $$update public.project_preference_overrides
    set project_id = '01000000-0000-4000-8000-000000000102'
    where project_id = '01000000-0000-4000-8000-000000000101'$$,
  'P0001', 'project_preference_override_project_immutable',
  'A cannot move an override to another of A projects'
);
select throws_ok(
  $$delete from public.project_preference_overrides
    where project_id = '01000000-0000-4000-8000-000000000101'$$,
  '42501', null, 'A cannot delete an override'
);

reset role;
select set_config('request.jwt.claim.sub', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb","role":"authenticated"}', true);
set local role authenticated;

select is((select count(*)::int from public.project_preference_overrides), 0, 'B cannot see A override');
select throws_ok(
  $$insert into public.project_preference_overrides (project_id)
    values ('01000000-0000-4000-8000-000000000102')$$,
  '42501', null, 'B cannot create an override for A project'
);
update public.project_preference_overrides
set skill_level = 'beginner'
where project_id = '01000000-0000-4000-8000-000000000101';
select is(
  (select count(*)::int from public.project_preference_overrides
   where project_id = '01000000-0000-4000-8000-000000000101' and skill_level is not null),
  0,
  'B cannot update A override'
);

reset role;
set local role anon;
select throws_ok($$select * from public.project_preference_overrides$$, '42501', null, 'anon cannot select overrides');
select throws_ok(
  $$insert into public.project_preference_overrides (project_id)
    values ('01000000-0000-4000-8000-000000000103')$$,
  '42501', null, 'anon cannot create overrides'
);
reset role;

select * from finish();
rollback;
