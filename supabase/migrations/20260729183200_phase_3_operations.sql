-- Phase 3 operations: generation, prompts, returns, artifacts, extractions, suggestions.

-- ---------------------------------------------------------------------------
-- generation_runs
-- ---------------------------------------------------------------------------

create table public.generation_runs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  operation_kind text not null,
  status text not null,
  project_state_version bigint not null,
  provider text null,
  model text null,
  input_schema_version text null,
  output_schema_version text null,
  latency_ms integer null,
  input_tokens integer null,
  output_tokens integer null,
  retry_count integer not null default 0,
  estimated_cost_micros bigint null,
  correlation_id uuid not null default gen_random_uuid(),
  idempotency_record_id uuid null references public.idempotency_records (id) on delete set null,
  error_code text null,
  started_at timestamptz null,
  completed_at timestamptz null,
  created_at timestamptz not null default timezone('utc', now()),
  constraint generation_runs_operation_kind_len_chk
    check (
      char_length(btrim(operation_kind)) > 0
      and octet_length(operation_kind) <= 255
    ),
  constraint generation_runs_status_chk
    check (status in ('queued', 'running', 'succeeded', 'failed', 'canceled')),
  constraint generation_runs_project_state_version_chk check (project_state_version > 0),
  constraint generation_runs_provider_len_chk
    check (
      provider is null
      or (
        char_length(btrim(provider)) > 0
        and octet_length(provider) <= 255
      )
    ),
  constraint generation_runs_model_len_chk
    check (
      model is null
      or (
        char_length(btrim(model)) > 0
        and octet_length(model) <= 255
      )
    ),
  constraint generation_runs_input_schema_version_len_chk
    check (
      input_schema_version is null
      or (
        char_length(btrim(input_schema_version)) > 0
        and octet_length(input_schema_version) <= 255
      )
    ),
  constraint generation_runs_output_schema_version_len_chk
    check (
      output_schema_version is null
      or (
        char_length(btrim(output_schema_version)) > 0
        and octet_length(output_schema_version) <= 255
      )
    ),
  constraint generation_runs_latency_nonneg_chk
    check (latency_ms is null or latency_ms >= 0),
  constraint generation_runs_input_tokens_nonneg_chk
    check (input_tokens is null or input_tokens >= 0),
  constraint generation_runs_output_tokens_nonneg_chk
    check (output_tokens is null or output_tokens >= 0),
  constraint generation_runs_retry_count_nonneg_chk check (retry_count >= 0),
  constraint generation_runs_estimated_cost_nonneg_chk
    check (estimated_cost_micros is null or estimated_cost_micros >= 0),
  constraint generation_runs_error_code_len_chk
    check (
      error_code is null
      or (
        char_length(btrim(error_code)) > 0
        and octet_length(error_code) <= 255
      )
    ),
  constraint generation_runs_project_id_id_key unique (project_id, id)
);

comment on table public.generation_runs is
  'Provider-neutral generation run metadata. Never store full request/response bodies.';

create index generation_runs_project_id_idx on public.generation_runs (project_id);
create index generation_runs_project_status_idx on public.generation_runs (project_id, status);

alter table public.generation_runs enable row level security;

revoke all on table public.generation_runs from public, anon, authenticated;

grant select on table public.generation_runs to authenticated;
grant all on table public.generation_runs to service_role;

create policy generation_runs_select_owned
  on public.generation_runs
  for select
  to authenticated
  using (auth.uid() is not null and (select private.owns_project(project_id)));

-- ---------------------------------------------------------------------------
-- prompt_versions (immutable after insert)
-- ---------------------------------------------------------------------------

create table public.prompt_versions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  generation_run_id uuid null,
  tool text not null,
  version integer not null,
  source text not null,
  project_state_version bigint not null,
  action_specification jsonb not null default '{}'::jsonb,
  prompt_text text not null,
  acceptance_criteria jsonb not null default '{}'::jsonb,
  supersedes_prompt_version_id uuid null,
  content_hash text not null,
  created_at timestamptz not null default timezone('utc', now()),
  constraint prompt_versions_tool_chk
    check (tool in ('claude_code', 'codex', 'cursor')),
  constraint prompt_versions_version_positive_chk check (version > 0),
  constraint prompt_versions_source_chk
    check (source in ('generated', 'user_edit')),
  constraint prompt_versions_project_state_version_chk check (project_state_version > 0),
  constraint prompt_versions_action_spec_object_chk
    check (jsonb_typeof(action_specification) = 'object'),
  constraint prompt_versions_action_spec_size_chk
    check (octet_length(action_specification::text) <= 131072),
  constraint prompt_versions_prompt_text_len_chk
    check (
      char_length(btrim(prompt_text)) > 0
      and octet_length(prompt_text) <= 262144
    ),
  constraint prompt_versions_acceptance_object_chk
    check (jsonb_typeof(acceptance_criteria) = 'object'),
  constraint prompt_versions_acceptance_size_chk
    check (octet_length(acceptance_criteria::text) <= 131072),
  constraint prompt_versions_content_hash_len_chk
    check (
      char_length(btrim(content_hash)) > 0
      and octet_length(content_hash) <= 255
    ),
  constraint prompt_versions_project_id_id_key unique (project_id, id),
  constraint prompt_versions_tool_version_key unique (project_id, tool, version),
  constraint prompt_versions_generation_run_fk
    foreign key (project_id, generation_run_id)
    references public.generation_runs (project_id, id)
    on delete set null (generation_run_id),
  constraint prompt_versions_supersedes_fk
    foreign key (project_id, supersedes_prompt_version_id)
    references public.prompt_versions (project_id, id)
    on delete set null (supersedes_prompt_version_id)
);

comment on table public.prompt_versions is
  'Immutable prompt text versions. Updates are rejected; history is append-only.';

create unique index prompt_versions_tool_version_desc_uidx
  on public.prompt_versions (project_id, tool, version desc);

create index prompt_versions_project_id_idx on public.prompt_versions (project_id);

alter table public.prompt_versions enable row level security;

revoke all on table public.prompt_versions from public, anon, authenticated;

grant select on table public.prompt_versions to authenticated;
grant all on table public.prompt_versions to service_role;

create policy prompt_versions_select_owned
  on public.prompt_versions
  for select
  to authenticated
  using (auth.uid() is not null and (select private.owns_project(project_id)));

-- ---------------------------------------------------------------------------
-- agent_returns
-- ---------------------------------------------------------------------------

create table public.agent_returns (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  prompt_version_id uuid not null,
  status text not null,
  pasted_content text null,
  content_hash text not null,
  idempotency_record_id uuid null references public.idempotency_records (id) on delete set null,
  submitted_at timestamptz not null default timezone('utc', now()),
  resolved_at timestamptz null,
  created_at timestamptz not null default timezone('utc', now()),
  constraint agent_returns_status_chk
    check (status in ('submitted', 'analyzing', 'analyzed', 'failed', 'resolved')),
  constraint agent_returns_pasted_content_len_chk
    check (
      pasted_content is null
      or (
        char_length(btrim(pasted_content)) > 0
        and octet_length(pasted_content) <= 262144
      )
    ),
  constraint agent_returns_content_hash_len_chk
    check (
      char_length(btrim(content_hash)) > 0
      and octet_length(content_hash) <= 255
    ),
  constraint agent_returns_project_id_id_key unique (project_id, id),
  constraint agent_returns_prompt_version_fk
    foreign key (project_id, prompt_version_id)
    references public.prompt_versions (project_id, id)
    on delete restrict
);

comment on table public.agent_returns is
  'Submitted agent output. Prompt relationship includes project_id for same-project integrity.';

create index agent_returns_project_id_idx on public.agent_returns (project_id);
create index agent_returns_project_status_idx on public.agent_returns (project_id, status);

alter table public.agent_returns enable row level security;

revoke all on table public.agent_returns from public, anon, authenticated;

grant select on table public.agent_returns to authenticated;
grant all on table public.agent_returns to service_role;

create policy agent_returns_select_owned
  on public.agent_returns
  for select
  to authenticated
  using (auth.uid() is not null and (select private.owns_project(project_id)));

-- ---------------------------------------------------------------------------
-- artifacts
-- ---------------------------------------------------------------------------

create table public.artifacts (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  agent_return_id uuid null,
  object_path text not null,
  original_filename text not null,
  media_type text not null,
  size_bytes bigint not null,
  content_hash text not null,
  status text not null,
  created_at timestamptz not null default timezone('utc', now()),
  deleted_at timestamptz null,
  purged_at timestamptz null,
  constraint artifacts_object_path_len_chk
    check (
      char_length(btrim(object_path)) > 0
      and octet_length(object_path) <= 1024
    ),
  constraint artifacts_original_filename_len_chk
    check (
      char_length(btrim(original_filename)) > 0
      and octet_length(original_filename) <= 255
    ),
  constraint artifacts_media_type_len_chk
    check (
      char_length(btrim(media_type)) > 0
      and octet_length(media_type) <= 255
    ),
  constraint artifacts_size_bytes_nonneg_chk check (size_bytes >= 0),
  constraint artifacts_content_hash_len_chk
    check (
      char_length(btrim(content_hash)) > 0
      and octet_length(content_hash) <= 255
    ),
  constraint artifacts_status_chk
    check (
      status in (
        'pending',
        'uploaded',
        'processing',
        'ready',
        'failed',
        'deleted',
        'purged'
      )
    ),
  constraint artifacts_object_path_key unique (object_path),
  constraint artifacts_project_id_id_key unique (project_id, id),
  constraint artifacts_agent_return_fk
    foreign key (project_id, agent_return_id)
    references public.agent_returns (project_id, id)
    on delete set null (agent_return_id)
);

comment on table public.artifacts is
  'Private Storage metadata only. object_path is canonical; never store signed URLs.';

create index artifacts_project_id_idx on public.artifacts (project_id);
create index artifacts_project_status_idx on public.artifacts (project_id, status);

alter table public.artifacts enable row level security;

revoke all on table public.artifacts from public, anon, authenticated;

grant select on table public.artifacts to authenticated;
grant all on table public.artifacts to service_role;

create policy artifacts_select_owned
  on public.artifacts
  for select
  to authenticated
  using (auth.uid() is not null and (select private.owns_project(project_id)));

-- ---------------------------------------------------------------------------
-- artifact_extractions
-- ---------------------------------------------------------------------------

create table public.artifact_extractions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  artifact_id uuid not null,
  attempt integer not null,
  status text not null,
  extractor_version text not null,
  extracted_text text null,
  redacted_text text null,
  secrets_detected boolean not null default false,
  redaction_metadata jsonb not null default '{}'::jsonb,
  error_code text null,
  started_at timestamptz null,
  completed_at timestamptz null,
  created_at timestamptz not null default timezone('utc', now()),
  constraint artifact_extractions_attempt_positive_chk check (attempt > 0),
  constraint artifact_extractions_status_chk
    check (status in ('queued', 'processing', 'succeeded', 'failed', 'superseded')),
  constraint artifact_extractions_extractor_version_len_chk
    check (
      char_length(btrim(extractor_version)) > 0
      and octet_length(extractor_version) <= 255
    ),
  constraint artifact_extractions_extracted_text_len_chk
    check (
      extracted_text is null
      or octet_length(extracted_text) <= 524288
    ),
  constraint artifact_extractions_redacted_text_len_chk
    check (
      redacted_text is null
      or octet_length(redacted_text) <= 524288
    ),
  constraint artifact_extractions_redaction_object_chk
    check (jsonb_typeof(redaction_metadata) = 'object'),
  constraint artifact_extractions_redaction_size_chk
    check (octet_length(redaction_metadata::text) <= 65536),
  constraint artifact_extractions_error_code_len_chk
    check (
      error_code is null
      or (
        char_length(btrim(error_code)) > 0
        and octet_length(error_code) <= 255
      )
    ),
  constraint artifact_extractions_project_id_id_key unique (project_id, id),
  constraint artifact_extractions_attempt_key unique (project_id, artifact_id, attempt),
  constraint artifact_extractions_artifact_fk
    foreign key (project_id, artifact_id)
    references public.artifacts (project_id, id)
    on delete cascade
);

comment on table public.artifact_extractions is
  'Bounded extraction attempts. Each retry is a new row; source files live in Storage.';

create index artifact_extractions_project_id_idx on public.artifact_extractions (project_id);

alter table public.artifact_extractions enable row level security;

revoke all on table public.artifact_extractions from public, anon, authenticated;

grant select on table public.artifact_extractions to authenticated;
grant all on table public.artifact_extractions to service_role;

create policy artifact_extractions_select_owned
  on public.artifact_extractions
  for select
  to authenticated
  using (auth.uid() is not null and (select private.owns_project(project_id)));

-- ---------------------------------------------------------------------------
-- completion_suggestions
-- ---------------------------------------------------------------------------

create table public.completion_suggestions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  agent_return_id uuid not null,
  milestone_id uuid null,
  suggested_status text not null,
  rationale text not null,
  evidence_summary jsonb not null default '{}'::jsonb,
  decision_status text not null default 'pending',
  decision_event_id uuid null,
  decided_at timestamptz null,
  created_at timestamptz not null default timezone('utc', now()),
  constraint completion_suggestions_suggested_status_chk
    check (
      suggested_status in (
        'completed',
        'needs_verification',
        'blocked',
        'in_progress'
      )
    ),
  constraint completion_suggestions_rationale_len_chk
    check (
      char_length(btrim(rationale)) > 0
      and octet_length(rationale) <= 32768
    ),
  constraint completion_suggestions_evidence_object_chk
    check (jsonb_typeof(evidence_summary) = 'object'),
  constraint completion_suggestions_evidence_size_chk
    check (octet_length(evidence_summary::text) <= 65536),
  constraint completion_suggestions_decision_status_chk
    check (decision_status in ('pending', 'accepted', 'rejected')),
  constraint completion_suggestions_decided_chk
    check (
      (
        decision_status = 'pending'
        and decided_at is null
        and decision_event_id is null
      )
      or (
        decision_status in ('accepted', 'rejected')
        and decided_at is not null
        and decision_event_id is not null
      )
    ),
  constraint completion_suggestions_project_id_id_key unique (project_id, id),
  constraint completion_suggestions_agent_return_fk
    foreign key (project_id, agent_return_id)
    references public.agent_returns (project_id, id)
    on delete cascade,
  constraint completion_suggestions_milestone_fk
    foreign key (project_id, milestone_id)
    references public.milestones (project_id, id)
    on delete set null (milestone_id),
  constraint completion_suggestions_decision_event_fk
    foreign key (project_id, decision_event_id)
    references public.project_events (project_id, id)
    on delete set null (decision_event_id)
);

comment on table public.completion_suggestions is
  'Suggested completion state is separate from user-confirmed milestone/project state.';

create index completion_suggestions_project_id_idx on public.completion_suggestions (project_id);
create index completion_suggestions_project_status_idx
  on public.completion_suggestions (project_id, decision_status);

alter table public.completion_suggestions enable row level security;

revoke all on table public.completion_suggestions from public, anon, authenticated;

grant select on table public.completion_suggestions to authenticated;
grant all on table public.completion_suggestions to service_role;

create policy completion_suggestions_select_owned
  on public.completion_suggestions
  for select
  to authenticated
  using (auth.uid() is not null and (select private.owns_project(project_id)));
