begin;

select plan(20);

select has_table('public', 'waitlist_entries', 'waitlist_entries table exists');

select has_column('public', 'waitlist_entries', 'email_normalized', 'email_normalized column');
select has_column('public', 'waitlist_entries', 'management_version', 'management_version column');
select has_column('public', 'waitlist_entries', 'confirmation_token_hash', 'token hash column');

select ok(
  (select relrowsecurity from pg_class where relname = 'waitlist_entries'),
  'RLS enabled on waitlist_entries'
);

select ok(
  not has_table_privilege('anon', 'public.waitlist_entries', 'SELECT'),
  'anon cannot select waitlist_entries'
);

select ok(
  not has_table_privilege('authenticated', 'public.waitlist_entries', 'INSERT'),
  'authenticated cannot insert waitlist_entries'
);

-- Core RPC behaviour runs as the superuser in pgTAP; exercise function logic.
select is(
  (
    select public.request_waitlist_confirmation(
      'Person@Example.COM',
      'person@example.com',
      timezone('utc', now()),
      repeat('a', 64),
      timezone('utc', now()) + interval '24 hours',
      '550e8400-e29b-41d4-a716-446655440000'
    ) ->> 'kind'
  ),
  'send',
  'first request returns send'
);

select is(
  (
    select public.request_waitlist_confirmation(
      'Person@Example.COM',
      'person@example.com',
      timezone('utc', now()),
      repeat('b', 64),
      timezone('utc', now()) + interval '24 hours',
      '660e8400-e29b-41d4-a716-446655440000'
    ) ->> 'idempotency_key'
  ),
  '550e8400-e29b-41d4-a716-446655440000',
  'unsent pending reuses stored idempotency key'
);

select lives_ok(
  $$select public.mark_waitlist_confirmation_sent(
      'person@example.com',
      '550e8400-e29b-41d4-a716-446655440000',
      timezone('utc', now())
    )$$,
  'mark sent succeeds'
);

select is(
  (
    select public.request_waitlist_confirmation(
      'Person@Example.COM',
      'person@example.com',
      timezone('utc', now()),
      repeat('c', 64),
      timezone('utc', now()) + interval '24 hours',
      '770e8400-e29b-41d4-a716-446655440000'
    ) ->> 'kind'
  ),
  'cooldown',
  'ten-minute cooldown returns cooldown'
);

update public.waitlist_entries
set confirmation_sent_at = timezone('utc', now()) - interval '11 minutes'
where email_normalized = 'person@example.com';

select is(
  (
    select public.request_waitlist_confirmation(
      'Person@Example.COM',
      'person@example.com',
      timezone('utc', now()),
      repeat('d', 64),
      timezone('utc', now()) + interval '24 hours',
      '880e8400-e29b-41d4-a716-446655440000'
    ) ->> 'idempotency_key'
  ),
  '880e8400-e29b-41d4-a716-446655440000',
  'post-cooldown rotates to candidate key'
);

select is(
  public.confirm_waitlist_entry(repeat('d', 64), timezone('utc', now())),
  'confirmed',
  'valid token confirms'
);

select is(
  public.confirm_waitlist_entry(repeat('d', 64), timezone('utc', now())),
  'already_confirmed',
  'repeat confirmation is already_confirmed'
);

select is(
  (
    select public.request_waitlist_confirmation(
      'Person@Example.COM',
      'person@example.com',
      timezone('utc', now()),
      repeat('e', 64),
      timezone('utc', now()) + interval '24 hours',
      '990e8400-e29b-41d4-a716-446655440000'
    ) ->> 'kind'
  ),
  'confirmed',
  'confirmed address request returns confirmed'
);

select is(
  public.confirm_waitlist_entry(repeat('f', 64), timezone('utc', now())),
  'invalid',
  'unknown token is invalid'
);

insert into public.waitlist_entries (
  email, email_normalized, status, consent_at,
  confirmation_token_hash, confirmation_expires_at, confirmation_idempotency_key
) values (
  'expire@example.com', 'expire@example.com', 'pending', timezone('utc', now()),
  repeat('1', 64), timezone('utc', now()) - interval '1 minute',
  'aa0e8400-e29b-41d4-a716-446655440000'
);

select is(
  public.confirm_waitlist_entry(repeat('1', 64), timezone('utc', now())),
  'expired',
  'expired token returns expired'
);

select is(
  public.remove_waitlist_entry(
    (select id from public.waitlist_entries where email_normalized = 'person@example.com'),
    1,
    timezone('utc', now())
  ),
  'removed',
  'versioned removal succeeds'
);

select is(
  public.remove_waitlist_entry(
    (select id from public.waitlist_entries where email_normalized = 'person@example.com'),
    1,
    timezone('utc', now())
  ),
  'invalid',
  'stale management version is invalid'
);

select is(
  public.remove_waitlist_entry(
    (select id from public.waitlist_entries where email_normalized = 'person@example.com'),
    2,
    timezone('utc', now())
  ),
  'already_removed',
  'repeat removal with current version is already_removed'
);

-- Purge behaviour
update public.waitlist_entries
set
  status = 'pending',
  created_at = timezone('utc', now()) - interval '31 days',
  removed_at = null
where email_normalized = 'expire@example.com';

insert into public.waitlist_entries (
  email, email_normalized, status, consent_at, removed_at, management_version
) values (
  'gone@example.com', 'gone@example.com', 'removed', timezone('utc', now()),
  timezone('utc', now()) - interval '25 hours', 2
);

insert into public.waitlist_entries (
  email, email_normalized, status, consent_at, confirmed_at,
  confirmation_token_hash, confirmation_expires_at, confirmation_idempotency_key
) values (
  'clear@example.com', 'clear@example.com', 'confirmed', timezone('utc', now()),
  timezone('utc', now()) - interval '2 days',
  repeat('9', 64), timezone('utc', now()) - interval '1 hour',
  'bb0e8400-e29b-41d4-a716-446655440000'
);

select lives_ok($$select public.purge_expired_waitlist_entries()$$, 'purge runs');

select is(
  (select count(*)::int from public.waitlist_entries where email_normalized = 'expire@example.com'),
  0,
  'pending older than 30 days purged'
);

select is(
  (select count(*)::int from public.waitlist_entries where email_normalized = 'gone@example.com'),
  0,
  'removed older than 24 hours purged'
);

select is(
  (
    select confirmation_token_hash
    from public.waitlist_entries
    where email_normalized = 'clear@example.com'
  ),
  null,
  'expired confirmation fields cleared on confirmed rows'
);

select * from finish();
rollback;
