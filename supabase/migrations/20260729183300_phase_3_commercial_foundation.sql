-- Phase 3 commercial foundation shapes only. Paddle sync remains Phase 15.

-- ---------------------------------------------------------------------------
-- subscriptions
-- ---------------------------------------------------------------------------

create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  provider text not null,
  external_customer_id text null,
  external_subscription_id text null,
  status text not null,
  effective_at timestamptz not null,
  provider_occurred_at timestamptz not null,
  scheduled_change jsonb null,
  canceled_at timestamptz null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint subscriptions_provider_chk check (provider = 'paddle'),
  constraint subscriptions_status_chk
    check (
      status in ('trialing', 'active', 'past_due', 'paused', 'canceled')
    ),
  constraint subscriptions_external_customer_id_len_chk
    check (
      external_customer_id is null
      or (
        char_length(btrim(external_customer_id)) > 0
        and octet_length(external_customer_id) <= 255
      )
    ),
  constraint subscriptions_external_subscription_id_len_chk
    check (
      external_subscription_id is null
      or (
        char_length(btrim(external_subscription_id)) > 0
        and octet_length(external_subscription_id) <= 255
      )
    ),
  constraint subscriptions_scheduled_change_object_chk
    check (
      scheduled_change is null
      or jsonb_typeof(scheduled_change) = 'object'
    ),
  constraint subscriptions_scheduled_change_size_chk
    check (
      scheduled_change is null
      or octet_length(scheduled_change::text) <= 65536
    )
);

comment on table public.subscriptions is
  'Billing subscription projection. Users may read their own rows only.';

create unique index subscriptions_provider_customer_uidx
  on public.subscriptions (provider, external_customer_id)
  where external_customer_id is not null;

create unique index subscriptions_provider_subscription_uidx
  on public.subscriptions (provider, external_subscription_id)
  where external_subscription_id is not null;

create index subscriptions_owner_id_idx on public.subscriptions (owner_id);

create trigger subscriptions_set_updated_at
before update on public.subscriptions
for each row
execute function private.set_updated_at();

alter table public.subscriptions enable row level security;

revoke all on table public.subscriptions from public, anon, authenticated;

grant select on table public.subscriptions to authenticated;
grant all on table public.subscriptions to service_role;

create policy subscriptions_select_own
  on public.subscriptions
  for select
  to authenticated
  using (auth.uid() is not null and owner_id = auth.uid());

-- ---------------------------------------------------------------------------
-- entitlements
-- ---------------------------------------------------------------------------

create table public.entitlements (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  entitlement_key text not null,
  enabled boolean null,
  limit_amount bigint null,
  unit text null,
  source text not null,
  valid_from timestamptz not null,
  valid_until timestamptz null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint entitlements_key_len_chk
    check (
      char_length(btrim(entitlement_key)) > 0
      and octet_length(entitlement_key) <= 255
    ),
  constraint entitlements_exactly_one_value_chk
    check (
      (enabled is not null and limit_amount is null)
      or (enabled is null and limit_amount is not null)
    ),
  constraint entitlements_limit_nonneg_chk
    check (limit_amount is null or limit_amount >= 0),
  constraint entitlements_unit_len_chk
    check (
      unit is null
      or (
        char_length(btrim(unit)) > 0
        and octet_length(unit) <= 255
      )
    ),
  constraint entitlements_source_len_chk
    check (
      char_length(btrim(source)) > 0
      and octet_length(source) <= 255
    ),
  constraint entitlements_valid_range_chk
    check (valid_until is null or valid_until > valid_from)
);

comment on table public.entitlements is
  'Resolved entitlement rows. Exactly one of enabled or limit_amount is populated.';

create index entitlements_owner_id_idx on public.entitlements (owner_id);
create index entitlements_owner_key_source_idx
  on public.entitlements (owner_id, entitlement_key, source, valid_from);

create trigger entitlements_set_updated_at
before update on public.entitlements
for each row
execute function private.set_updated_at();

alter table public.entitlements enable row level security;

revoke all on table public.entitlements from public, anon, authenticated;

grant select on table public.entitlements to authenticated;
grant all on table public.entitlements to service_role;

create policy entitlements_select_own
  on public.entitlements
  for select
  to authenticated
  using (auth.uid() is not null and owner_id = auth.uid());

-- ---------------------------------------------------------------------------
-- usage_ledger (append-only)
-- ---------------------------------------------------------------------------

create table public.usage_ledger (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  project_id uuid null,
  entitlement_key text not null,
  direction text not null,
  quantity bigint not null,
  source_type text not null,
  source_id text not null,
  idempotency_record_id uuid null references public.idempotency_records (id) on delete set null,
  period_start timestamptz not null,
  period_end timestamptz not null,
  occurred_at timestamptz not null,
  created_at timestamptz not null default timezone('utc', now()),
  metadata jsonb not null default '{}'::jsonb,
  constraint usage_ledger_entitlement_key_len_chk
    check (
      char_length(btrim(entitlement_key)) > 0
      and octet_length(entitlement_key) <= 255
    ),
  constraint usage_ledger_direction_chk check (direction in ('debit', 'credit')),
  constraint usage_ledger_quantity_positive_chk check (quantity > 0),
  constraint usage_ledger_source_type_len_chk
    check (
      char_length(btrim(source_type)) > 0
      and octet_length(source_type) <= 255
    ),
  constraint usage_ledger_source_id_len_chk
    check (
      char_length(btrim(source_id)) > 0
      and octet_length(source_id) <= 255
    ),
  constraint usage_ledger_period_chk check (period_end > period_start),
  constraint usage_ledger_metadata_object_chk
    check (jsonb_typeof(metadata) = 'object'),
  constraint usage_ledger_metadata_size_chk
    check (octet_length(metadata::text) <= 65536),
  constraint usage_ledger_owner_project_fk
    foreign key (owner_id, project_id)
    references public.projects (owner_id, id)
    on delete set null (project_id)
);

comment on table public.usage_ledger is
  'Append-only usage entries. Users have read-only access to their own rows.';

create unique index usage_ledger_source_uidx
  on public.usage_ledger (source_type, source_id);

create index usage_ledger_owner_id_idx on public.usage_ledger (owner_id);
create index usage_ledger_project_id_idx
  on public.usage_ledger (project_id)
  where project_id is not null;

alter table public.usage_ledger enable row level security;

revoke all on table public.usage_ledger from public, anon, authenticated;

grant select on table public.usage_ledger to authenticated;
grant all on table public.usage_ledger to service_role;

create policy usage_ledger_select_own
  on public.usage_ledger
  for select
  to authenticated
  using (auth.uid() is not null and owner_id = auth.uid());
