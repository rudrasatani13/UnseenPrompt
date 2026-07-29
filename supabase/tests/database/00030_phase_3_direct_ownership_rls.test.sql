begin;

select plan(24);

-- Fixture users
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change
) values
  (
    '00000000-0000-0000-0000-000000000000',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'authenticated', 'authenticated', 'user-a@users.invalid',
    extensions.crypt('x', extensions.gen_salt('bf')),
    timezone('utc', now()), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
    timezone('utc', now()), timezone('utc', now()), '', '', '', ''
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    'authenticated', 'authenticated', 'user-b@users.invalid',
    extensions.crypt('x', extensions.gen_salt('bf')),
    timezone('utc', now()), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
    timezone('utc', now()), timezone('utc', now()), '', '', '', ''
  );

insert into public.profiles (id, display_name) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'User A'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'User B');

insert into public.preferences (owner_id, skill_level, preferred_stack_behavior) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'beginner', 'recommend'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'advanced', 'ask');

insert into public.subscriptions (
  owner_id, provider, status, effective_at, provider_occurred_at, external_subscription_id
) values (
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'paddle', 'active',
  timezone('utc', now()), timezone('utc', now()), 'sub_seed_a'
);

insert into public.entitlements (
  owner_id, entitlement_key, enabled, source, valid_from
) values (
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'projects', true, 'plan', timezone('utc', now())
);

insert into public.usage_ledger (
  owner_id, entitlement_key, direction, quantity, source_type, source_id,
  period_start, period_end, occurred_at
) values (
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'projects', 'debit', 1, 'test', 'src-a-1',
  timezone('utc', now()) - interval '1 day', timezone('utc', now()) + interval '30 days',
  timezone('utc', now())
);

insert into public.idempotency_records (
  owner_id, scope, idempotency_key, request_fingerprint, status
) values (
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'lifecycle', 'key-a', 'fp-a', 'succeeded'
);

insert into public.idempotency_records (
  scope, idempotency_key, request_fingerprint, status
) values (
  'billing', 'ownerless-key', 'fp-bill', 'succeeded'
);

-- As user A
select set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}', true);
set local role authenticated;

select is((select count(*)::int from public.profiles), 1, 'user A sees only own profile');
select is((select display_name from public.profiles), 'User A', 'user A profile content');
select is((select count(*)::int from public.preferences), 1, 'user A sees only own preferences');
select is((select count(*)::int from public.subscriptions), 1, 'user A sees own subscription');
select is((select count(*)::int from public.entitlements), 1, 'user A sees own entitlements');
select is((select count(*)::int from public.usage_ledger), 1, 'user A sees own ledger');
select is(
  (select count(*)::int from public.idempotency_records),
  1,
  'user A sees own idempotency only (not ownerless)'
);

select throws_ok(
  $$insert into public.profiles (id, display_name)
    values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'Hijack')$$,
  '42501',
  null,
  'user A cannot insert profile for B'
);

select lives_ok(
  $$update public.profiles set display_name = 'User A Updated' where id = auth.uid()$$,
  'user A can update own profile'
);

-- RLS filters foreign rows: zero-row update, no exception
update public.profiles
set display_name = 'Nope'
where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

select is(
  (select count(*)::int from public.profiles where display_name = 'Nope'),
  0,
  'user A cannot change B profile via update'
);

select throws_ok(
  $$insert into public.subscriptions (
    owner_id, provider, status, effective_at, provider_occurred_at
  ) values (auth.uid(), 'paddle', 'active', timezone('utc', now()), timezone('utc', now()))$$,
  '42501',
  null,
  'user cannot insert subscription'
);

select throws_ok(
  $$insert into public.usage_ledger (
    owner_id, entitlement_key, direction, quantity, source_type, source_id,
    period_start, period_end, occurred_at
  ) values (
    auth.uid(), 'projects', 'debit', 1, 'x', 'y',
    timezone('utc', now()), timezone('utc', now()) + interval '1 day', timezone('utc', now())
  )$$,
  '42501',
  null,
  'user cannot insert usage ledger'
);

reset role;

-- As user B
select set_config('request.jwt.claim.sub', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb","role":"authenticated"}', true);
set local role authenticated;

select is(
  (select count(*)::int from public.profiles where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
  0,
  'user B cannot see A profile'
);
select is((select count(*)::int from public.subscriptions), 0, 'user B sees no A subscription');
select is((select count(*)::int from public.idempotency_records), 0, 'user B sees no A idempotency');

reset role;

-- As anon
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claims', '', true);
set local role anon;

select throws_ok($$select count(*) from public.profiles$$, '42501', null, 'anon cannot select profiles');
select throws_ok($$select count(*) from public.preferences$$, '42501', null, 'anon cannot select preferences');
select throws_ok($$select count(*) from public.subscriptions$$, '42501', null, 'anon cannot select subscriptions');

reset role;

-- Missing JWT
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claims', '{}', true);
set local role authenticated;

select is((select count(*)::int from public.profiles), 0, 'authenticated without uid sees no profiles');

select throws_ok(
  $$insert into public.profiles (id, display_name)
    values ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'X')$$,
  null,
  null,
  'authenticated without uid cannot insert profile'
);

reset role;

select is(
  (select count(*)::int from public.profiles where id in (
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
  )),
  2,
  'fixtures remain for cascade checks'
);

select ok(not has_table_privilege('authenticated', 'public.subscriptions', 'UPDATE'), 'authenticated cannot update subscriptions');
select ok(not has_table_privilege('authenticated', 'public.entitlements', 'DELETE'), 'authenticated cannot delete entitlements');
select ok(
  (select display_name from public.profiles where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb') = 'User B',
  'B profile still original after A attempt'
);

select * from finish();
rollback;
