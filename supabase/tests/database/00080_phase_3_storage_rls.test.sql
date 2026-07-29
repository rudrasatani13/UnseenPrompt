begin;

select plan(12);

select ok(
  exists (select 1 from storage.buckets where id = 'project-artifacts' and public is false),
  'project-artifacts bucket is private'
);

select ok(
  not exists (
    select 1 from storage.buckets where id = 'project-artifacts' and public is true
  ),
  'project-artifacts is not public'
);

select ok(
  exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'project_artifacts_select_own'
  ),
  'owner select policy exists'
);

select ok(
  not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname like '%project_artifacts%'
      and cmd in ('INSERT', 'UPDATE', 'DELETE', 'ALL')
  ),
  'no authenticated mutation policies for project-artifacts'
);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change
) values
  (
    '00000000-0000-0000-0000-000000000000',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'authenticated', 'authenticated', 'storage-a@users.invalid',
    extensions.crypt('x', extensions.gen_salt('bf')),
    timezone('utc', now()), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
    timezone('utc', now()), timezone('utc', now()), '', '', '', ''
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    'authenticated', 'authenticated', 'storage-b@users.invalid',
    extensions.crypt('x', extensions.gen_salt('bf')),
    timezone('utc', now()), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
    timezone('utc', now()), timezone('utc', now()), '', '', '', ''
  );

insert into storage.objects (id, bucket_id, name, owner_id)
values
  (
    '11111111-1111-4111-8111-111111111111',
    'project-artifacts',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/01000000-0000-4000-8000-000000000001/09000000-0000-4000-8000-000000000001/a.txt',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  ),
  (
    '22222222-2222-4222-8222-222222222222',
    'project-artifacts',
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/01000000-0000-4000-8000-000000000002/09000000-0000-4000-8000-000000000002/b.txt',
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
  );

select set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}', true);
set local role authenticated;

select is(
  (select count(*)::int from storage.objects where bucket_id = 'project-artifacts'),
  1,
  'user A lists only own storage objects'
);

select is(
  (select count(*)::int from storage.objects where id = '22222222-2222-4222-8222-222222222222'),
  0,
  'user A cannot read user B object'
);

-- Insert denied by missing policy (RLS) or privilege depending on storage grants
select throws_ok(
  $$insert into storage.objects (bucket_id, name, owner)
    values (
      'project-artifacts',
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/x/y/z.txt',
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
    )$$,
  null, null, 'authenticated cannot insert storage objects'
);

-- Update filtered by RLS: zero rows, object name unchanged
update storage.objects
set name = 'hacked'
where id = '11111111-1111-4111-8111-111111111111';

select is(
  (select count(*)::int from storage.objects where name = 'hacked'),
  0,
  'authenticated cannot update storage object names'
);

-- Direct SQL delete is blocked by Storage protect_delete (or RLS when applicable)
select throws_ok(
  $$delete from storage.objects where id = '11111111-1111-4111-8111-111111111111'$$,
  null,
  null,
  'authenticated cannot delete storage objects via SQL'
);

reset role;

select set_config('request.jwt.claim.sub', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb","role":"authenticated"}', true);
set local role authenticated;

select is(
  (select count(*)::int from storage.objects where id = '11111111-1111-4111-8111-111111111111'),
  0,
  'user B cannot access user A object'
);

reset role;

-- Anon must not see project-artifacts objects under RLS
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claims', '', true);
set local role anon;

select is(
  (select count(*)::int from storage.objects where bucket_id = 'project-artifacts'),
  0,
  'anon cannot list project-artifacts content'
);

reset role;

select ok(
  exists (
    select 1 from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'waitlist_entries'
  ),
  'waitlist_entries still present after storage migration'
);

select * from finish();
rollback;
