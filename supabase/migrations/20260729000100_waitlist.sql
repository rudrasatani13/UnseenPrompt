-- Isolated double-opt-in waitlist schema. Additive only; never stores raw tokens.

create extension if not exists pgcrypto with schema extensions;

create table if not exists public.waitlist_entries (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  email_normalized text not null,
  status text not null check (status in ('pending', 'confirmed', 'removed')),
  consent_at timestamptz not null,
  confirmation_token_hash text,
  confirmation_expires_at timestamptz,
  confirmation_sent_at timestamptz,
  confirmation_idempotency_key uuid,
  confirmed_at timestamptz,
  management_version integer not null default 1 check (management_version > 0),
  removed_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint waitlist_entries_email_normalized_key unique (email_normalized)
);

create index if not exists waitlist_entries_status_idx on public.waitlist_entries (status);
create index if not exists waitlist_entries_confirmation_token_hash_idx
  on public.waitlist_entries (confirmation_token_hash)
  where confirmation_token_hash is not null;

alter table public.waitlist_entries enable row level security;

revoke all on table public.waitlist_entries from public, anon, authenticated;
revoke all on all functions in schema public from public, anon, authenticated;

create or replace function public.request_waitlist_confirmation(
  p_email text,
  p_email_normalized text,
  p_consent_at timestamptz,
  p_candidate_token_hash text,
  p_candidate_expires_at timestamptz,
  p_candidate_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_row public.waitlist_entries%rowtype;
  v_now timestamptz := timezone('utc', now());
begin
  if p_email is null or p_email_normalized is null or p_consent_at is null
     or p_candidate_token_hash is null or p_candidate_expires_at is null
     or p_candidate_idempotency_key is null then
    raise exception 'invalid_arguments';
  end if;

  insert into public.waitlist_entries (
    email,
    email_normalized,
    status,
    consent_at,
    confirmation_token_hash,
    confirmation_expires_at,
    confirmation_idempotency_key,
    confirmation_sent_at
  )
  values (
    p_email,
    p_email_normalized,
    'pending',
    p_consent_at,
    p_candidate_token_hash,
    p_candidate_expires_at,
    p_candidate_idempotency_key,
    null
  )
  on conflict (email_normalized) do nothing;

  select * into v_row
  from public.waitlist_entries
  where email_normalized = p_email_normalized
  for update;

  if not found then
    raise exception 'waitlist_row_missing';
  end if;

  if v_row.status = 'confirmed' then
    return jsonb_build_object('kind', 'confirmed');
  end if;

  if v_row.status = 'removed' then
    update public.waitlist_entries
    set
      email = p_email,
      status = 'pending',
      consent_at = p_consent_at,
      confirmation_token_hash = p_candidate_token_hash,
      confirmation_expires_at = p_candidate_expires_at,
      confirmation_idempotency_key = p_candidate_idempotency_key,
      confirmation_sent_at = null,
      confirmed_at = null,
      removed_at = null,
      management_version = v_row.management_version + 1,
      updated_at = v_now
    where id = v_row.id;

    return jsonb_build_object(
      'kind', 'send',
      'idempotency_key', p_candidate_idempotency_key
    );
  end if;

  -- pending
  if v_row.confirmation_sent_at is not null
     and v_row.confirmation_sent_at > v_now - interval '10 minutes' then
    return jsonb_build_object('kind', 'cooldown');
  end if;

  if v_row.confirmation_sent_at is null
     and v_row.confirmation_idempotency_key is not null
     and v_row.confirmation_expires_at is not null
     and v_row.confirmation_expires_at > v_now then
    return jsonb_build_object(
      'kind', 'send',
      'idempotency_key', v_row.confirmation_idempotency_key
    );
  end if;

  -- rotate to candidate (expired unsent, or past cooldown)
  update public.waitlist_entries
  set
    email = p_email,
    consent_at = p_consent_at,
    confirmation_token_hash = p_candidate_token_hash,
    confirmation_expires_at = p_candidate_expires_at,
    confirmation_idempotency_key = p_candidate_idempotency_key,
    confirmation_sent_at = null,
    updated_at = v_now
  where id = v_row.id;

  return jsonb_build_object(
    'kind', 'send',
    'idempotency_key', p_candidate_idempotency_key
  );
end;
$$;

create or replace function public.mark_waitlist_confirmation_sent(
  p_email_normalized text,
  p_idempotency_key uuid,
  p_sent_at timestamptz
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  update public.waitlist_entries
  set
    confirmation_sent_at = p_sent_at,
    updated_at = timezone('utc', now())
  where email_normalized = p_email_normalized
    and confirmation_idempotency_key = p_idempotency_key
    and status = 'pending';
end;
$$;

create or replace function public.confirm_waitlist_entry(
  p_token_hash text,
  p_now timestamptz
)
returns text
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_row public.waitlist_entries%rowtype;
begin
  select * into v_row
  from public.waitlist_entries
  where confirmation_token_hash = p_token_hash
  for update;

  if not found then
    return 'invalid';
  end if;

  if v_row.status = 'confirmed' then
    return 'already_confirmed';
  end if;

  if v_row.status <> 'pending' then
    return 'invalid';
  end if;

  if v_row.confirmation_expires_at is null or v_row.confirmation_expires_at <= p_now then
    return 'expired';
  end if;

  update public.waitlist_entries
  set
    status = 'confirmed',
    confirmed_at = p_now,
    updated_at = p_now
  where id = v_row.id;

  return 'confirmed';
end;
$$;

create or replace function public.remove_waitlist_entry(
  p_entry_id uuid,
  p_management_version integer,
  p_now timestamptz
)
returns text
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_row public.waitlist_entries%rowtype;
begin
  select * into v_row
  from public.waitlist_entries
  where id = p_entry_id
  for update;

  if not found then
    return 'invalid';
  end if;

  if v_row.management_version <> p_management_version then
    return 'invalid';
  end if;

  if v_row.status = 'removed' then
    return 'already_removed';
  end if;

  update public.waitlist_entries
  set
    status = 'removed',
    removed_at = p_now,
    management_version = v_row.management_version + 1,
    confirmation_token_hash = null,
    confirmation_expires_at = null,
    confirmation_idempotency_key = null,
    confirmation_sent_at = null,
    updated_at = p_now
  where id = v_row.id;

  return 'removed';
end;
$$;

create or replace function public.purge_expired_waitlist_entries()
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_now timestamptz := timezone('utc', now());
begin
  delete from public.waitlist_entries
  where status = 'pending'
    and created_at < v_now - interval '30 days';

  delete from public.waitlist_entries
  where status = 'removed'
    and removed_at is not null
    and removed_at < v_now - interval '24 hours';

  update public.waitlist_entries
  set
    confirmation_token_hash = null,
    confirmation_expires_at = null,
    confirmation_idempotency_key = null,
    confirmation_sent_at = null,
    updated_at = v_now
  where status = 'confirmed'
    and confirmation_expires_at is not null
    and confirmation_expires_at < v_now;
end;
$$;

revoke all on function public.request_waitlist_confirmation(text, text, timestamptz, text, timestamptz, uuid) from public, anon, authenticated;
revoke all on function public.mark_waitlist_confirmation_sent(text, uuid, timestamptz) from public, anon, authenticated;
revoke all on function public.confirm_waitlist_entry(text, timestamptz) from public, anon, authenticated;
revoke all on function public.remove_waitlist_entry(uuid, integer, timestamptz) from public, anon, authenticated;
revoke all on function public.purge_expired_waitlist_entries() from public, anon, authenticated;

grant execute on function public.request_waitlist_confirmation(text, text, timestamptz, text, timestamptz, uuid) to service_role;
grant execute on function public.mark_waitlist_confirmation_sent(text, uuid, timestamptz) to service_role;
grant execute on function public.confirm_waitlist_entry(text, timestamptz) to service_role;
grant execute on function public.remove_waitlist_entry(uuid, integer, timestamptz) to service_role;
grant execute on function public.purge_expired_waitlist_entries() to service_role;

-- Idempotent daily purge job when pg_cron is available.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid)
    from cron.job
    where jobname = 'purge-expired-waitlist-entries';

    perform cron.schedule(
      'purge-expired-waitlist-entries',
      '15 3 * * *',
      $cron$select public.purge_expired_waitlist_entries();$cron$
    );
  end if;
exception
  when undefined_table then
    null;
  when undefined_function then
    null;
end;
$$;
