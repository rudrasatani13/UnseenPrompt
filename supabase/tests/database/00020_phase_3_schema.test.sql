begin;

select plan(80);

-- Schemas and tables
select has_schema('private', 'private schema exists');
select has_table('public', 'profiles', 'profiles exists');
select has_table('public', 'preferences', 'preferences exists');
select has_table('public', 'projects', 'projects exists');
select has_table('public', 'idempotency_records', 'idempotency_records exists');
select has_table('public', 'requirements', 'requirements exists');
select has_table('public', 'decisions', 'decisions exists');
select has_table('public', 'milestones', 'milestones exists');
select has_table('public', 'project_events', 'project_events exists');
select has_table('public', 'project_summaries', 'project_summaries exists');
select has_table('public', 'generation_runs', 'generation_runs exists');
select has_table('public', 'prompt_versions', 'prompt_versions exists');
select has_table('public', 'agent_returns', 'agent_returns exists');
select has_table('public', 'artifacts', 'artifacts exists');
select has_table('public', 'artifact_extractions', 'artifact_extractions exists');
select has_table('public', 'completion_suggestions', 'completion_suggestions exists');
select has_table('public', 'subscriptions', 'subscriptions exists');
select has_table('public', 'entitlements', 'entitlements exists');
select has_table('public', 'usage_ledger', 'usage_ledger exists');

-- Key columns
select has_column('public', 'profiles', 'display_name', 'profiles.display_name');
select has_column('public', 'projects', 'state_version', 'projects.state_version');
select has_column('public', 'projects', 'active_milestone_id', 'projects.active_milestone_id');
select has_column('public', 'project_events', 'sequence_number', 'project_events.sequence_number');
select has_column('public', 'prompt_versions', 'prompt_text', 'prompt_versions.prompt_text');
select has_column('public', 'artifacts', 'object_path', 'artifacts.object_path');
select has_column('public', 'idempotency_records', 'request_fingerprint', 'idempotency fingerprint');

-- RLS enabled
select ok((select relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relname = 'profiles'), 'RLS profiles');
select ok((select relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relname = 'preferences'), 'RLS preferences');
select ok((select relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relname = 'projects'), 'RLS projects');
select ok((select relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relname = 'requirements'), 'RLS requirements');
select ok((select relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relname = 'decisions'), 'RLS decisions');
select ok((select relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relname = 'milestones'), 'RLS milestones');
select ok((select relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relname = 'project_events'), 'RLS project_events');
select ok((select relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relname = 'project_summaries'), 'RLS project_summaries');
select ok((select relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relname = 'generation_runs'), 'RLS generation_runs');
select ok((select relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relname = 'prompt_versions'), 'RLS prompt_versions');
select ok((select relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relname = 'agent_returns'), 'RLS agent_returns');
select ok((select relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relname = 'artifacts'), 'RLS artifacts');
select ok((select relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relname = 'artifact_extractions'), 'RLS artifact_extractions');
select ok((select relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relname = 'completion_suggestions'), 'RLS completion_suggestions');
select ok((select relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relname = 'subscriptions'), 'RLS subscriptions');
select ok((select relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relname = 'entitlements'), 'RLS entitlements');
select ok((select relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relname = 'usage_ledger'), 'RLS usage_ledger');
select ok((select relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relname = 'idempotency_records'), 'RLS idempotency_records');

-- anon has no product table access
select ok(not has_table_privilege('anon', 'public.profiles', 'SELECT'), 'anon no profiles select');
select ok(not has_table_privilege('anon', 'public.preferences', 'SELECT'), 'anon no preferences select');
select ok(not has_table_privilege('anon', 'public.projects', 'SELECT'), 'anon no projects select');
select ok(not has_table_privilege('anon', 'public.requirements', 'SELECT'), 'anon no requirements select');
select ok(not has_table_privilege('anon', 'public.decisions', 'SELECT'), 'anon no decisions select');
select ok(not has_table_privilege('anon', 'public.milestones', 'SELECT'), 'anon no milestones select');
select ok(not has_table_privilege('anon', 'public.project_events', 'SELECT'), 'anon no events select');
select ok(not has_table_privilege('anon', 'public.project_summaries', 'SELECT'), 'anon no summaries select');
select ok(not has_table_privilege('anon', 'public.generation_runs', 'SELECT'), 'anon no generation_runs select');
select ok(not has_table_privilege('anon', 'public.prompt_versions', 'SELECT'), 'anon no prompt_versions select');
select ok(not has_table_privilege('anon', 'public.agent_returns', 'SELECT'), 'anon no agent_returns select');
select ok(not has_table_privilege('anon', 'public.artifacts', 'SELECT'), 'anon no artifacts select');
select ok(not has_table_privilege('anon', 'public.artifact_extractions', 'SELECT'), 'anon no extractions select');
select ok(not has_table_privilege('anon', 'public.completion_suggestions', 'SELECT'), 'anon no suggestions select');
select ok(not has_table_privilege('anon', 'public.subscriptions', 'SELECT'), 'anon no subscriptions select');
select ok(not has_table_privilege('anon', 'public.entitlements', 'SELECT'), 'anon no entitlements select');
select ok(not has_table_privilege('anon', 'public.usage_ledger', 'SELECT'), 'anon no usage_ledger select');
select ok(not has_table_privilege('anon', 'public.idempotency_records', 'SELECT'), 'anon no idempotency select');

-- authenticated grants (table privileges, not RLS)
select ok(has_table_privilege('authenticated', 'public.profiles', 'SELECT'), 'auth profiles select');
select ok(has_table_privilege('authenticated', 'public.profiles', 'INSERT'), 'auth profiles insert');
select ok(has_table_privilege('authenticated', 'public.profiles', 'UPDATE'), 'auth profiles update');
select ok(not has_table_privilege('authenticated', 'public.profiles', 'DELETE'), 'auth profiles no delete');
select ok(has_table_privilege('authenticated', 'public.projects', 'SELECT'), 'auth projects select');
select ok(not has_table_privilege('authenticated', 'public.projects', 'INSERT'), 'auth projects no direct insert');
select ok(not has_table_privilege('authenticated', 'public.projects', 'UPDATE'), 'auth projects no direct update');
select ok(not has_table_privilege('authenticated', 'public.project_events', 'UPDATE'), 'auth events no update');
select ok(not has_table_privilege('authenticated', 'public.project_events', 'DELETE'), 'auth events no delete');
select ok(not has_table_privilege('authenticated', 'public.prompt_versions', 'UPDATE'), 'auth prompts no update');
select ok(not has_table_privilege('authenticated', 'public.subscriptions', 'INSERT'), 'auth subscriptions no insert');
select ok(not has_table_privilege('authenticated', 'public.usage_ledger', 'INSERT'), 'auth ledger no insert');

-- Functions
select has_function('private', 'owns_project', array['uuid'], 'owns_project helper');
select has_function('public', 'create_project', array['text', 'text', 'text', 'text', 'text'], 'create_project rpc');
select has_function(
  'public',
  'commit_project_change',
  array['uuid', 'bigint', 'text', 'text', 'text', 'jsonb', 'text', 'text', 'text', 'text', 'uuid', 'timestamptz', 'text'],
  'commit_project_change rpc'
);

-- Indexes
select ok(
  exists (
    select 1 from pg_indexes
    where schemaname = 'public'
      and tablename = 'projects'
      and indexname = 'projects_owner_id_idx'
  ),
  'projects owner index'
);

select ok(
  exists (
    select 1 from pg_indexes
    where schemaname = 'public'
      and tablename = 'idempotency_records'
      and indexname = 'idempotency_records_owner_scope_key_uidx'
  ),
  'idempotency owner partial unique index'
);

select ok(
  exists (
    select 1 from storage.buckets where id = 'project-artifacts' and public = false
  ),
  'private project-artifacts bucket'
);

select * from finish();
rollback;
