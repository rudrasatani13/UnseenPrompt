create or replace function public.execute_composer_draft_command_v1(
  p_draft_id uuid,
  p_expected_version bigint,
  p_idempotency_key text,
  p_request_fingerprint text,
  p_command jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_owner_id uuid := auth.uid();
  v_draft public.composer_drafts%rowtype;
  v_existing public.idempotency_records%rowtype;
  v_run public.generation_runs%rowtype;
  v_output public.generation_outputs%rowtype;
  v_project public.projects%rowtype;
  v_session public.discovery_sessions%rowtype;
  v_event public.project_events%rowtype;
  v_command_type text;
  v_next_version bigint;
  v_project_version bigint;
begin
  if v_owner_id is null then raise exception 'auth_required' using errcode='P0001'; end if;
  if p_draft_id is null or p_expected_version is null or p_expected_version<=0 or p_idempotency_key is null or char_length(btrim(p_idempotency_key))=0 or octet_length(p_idempotency_key)>255 or p_request_fingerprint is null or p_request_fingerprint !~ '^[0-9a-f]{64}$' or not private.phase7_valid_draft_command(p_command) then raise exception 'validation_failed' using errcode='P0001'; end if;
  select * into v_draft from public.composer_drafts where id=p_draft_id and owner_id=v_owner_id for update;
  if not found then raise exception 'draft_not_found' using errcode='P0001'; end if;
  v_command_type := p_command->>'type';
  insert into public.idempotency_records(owner_id,scope,idempotency_key,request_fingerprint,status,resource_type)
  values(v_owner_id,'lifecycle',p_idempotency_key,p_request_fingerprint,'in_progress','composer_draft_command')
  on conflict(owner_id,scope,idempotency_key) where owner_id is not null do nothing
  returning * into v_existing;
  if not found then
    select * into v_existing from public.idempotency_records where owner_id=v_owner_id and scope='lifecycle' and idempotency_key=p_idempotency_key for update;
    if not found or v_existing.request_fingerprint is distinct from p_request_fingerprint or v_existing.resource_type is distinct from 'composer_draft_command' or v_existing.resource_id is distinct from p_draft_id then raise exception 'idempotency_conflict' using errcode='P0001'; end if;
    if v_existing.status='in_progress' then raise exception 'idempotency_in_progress' using errcode='P0001'; end if;
    if v_existing.status='succeeded' then
      select * into v_draft from public.composer_drafts where id=p_draft_id and owner_id=v_owner_id;
      if not found then raise exception 'persistence_failed' using errcode='P0001'; end if;
      if p_command->>'type'='retry_intent' then
        return jsonb_build_object('draftId',v_draft.id,'version',v_draft.version,'status',v_draft.status,'projectId',v_draft.project_id,'initialRequestText',v_draft.initial_request_text,'replayed',true);
      end if;
      return jsonb_build_object('draftId',v_draft.id,'version',v_draft.version,'status',v_draft.status,'projectId',v_draft.project_id,'replayed',true);
    end if;
    raise exception 'persistence_failed' using errcode='P0001';
  end if;
  if v_command_type='confirm_and_promote' and v_draft.status='promoted' then
    if p_command->>'confirmedTitle' is distinct from v_draft.confirmed_title or p_command->>'confirmedMode' is distinct from v_draft.confirmed_mode then raise exception 'idempotency_conflict' using errcode='P0001'; end if;
    update public.idempotency_records set status='succeeded',resource_id=v_draft.id,project_id=v_draft.project_id,completed_at=timezone('utc',now()) where id=v_existing.id;
    return jsonb_build_object('draftId',v_draft.id,'version',v_draft.version,'status','promoted','projectId',v_draft.project_id,'replayed',true);
  end if;
  if p_expected_version is distinct from v_draft.version then raise exception 'stale_draft_version' using errcode='P0001'; end if;
  v_next_version := v_draft.version + 1;

  if v_command_type='retry_intent' then
    if v_draft.status <> 'retry_required' then raise exception 'invalid_draft_state' using errcode='P0001'; end if;
    update public.composer_drafts set status='routing',last_error_code=null,version=v_next_version where id=v_draft.id;
  elsif v_command_type='apply_intent' then
    if v_draft.status not in ('routing','retry_required') then raise exception 'invalid_draft_state' using errcode='P0001'; end if;
    select gr.* into v_run from public.generation_runs gr join public.composer_drafts d on d.id=gr.composer_draft_id and d.owner_id=v_owner_id where gr.id=(p_command->>'generationRunId')::uuid for update;
    if not found or v_run.subject_kind <> 'composer_draft' or v_run.operation_kind <> 'intent_detection' or v_run.input_schema_version <> 'unseenprompt.model-gateway-request.v3' or v_run.status <> 'succeeded' or v_run.project_state_version is distinct from v_draft.version or v_run.output_schema_version is distinct from 'unseenprompt.model-output.intent_detection.v1' then raise exception 'invalid_generation_output' using errcode='P0001'; end if;
    select * into v_output from public.generation_outputs where generation_run_id=v_run.id;
    if not found or v_output.operation_kind <> 'intent_detection' or v_output.output_schema_version is distinct from 'unseenprompt.model-output.intent_detection.v1' or v_output.validated_output_hash is distinct from encode(extensions.digest(convert_to(v_output.validated_output_text,'UTF8'),'sha256'),'hex') then raise exception 'invalid_generation_output' using errcode='P0001'; end if;
    update public.composer_drafts set status='awaiting_confirmation',detected_mode=v_output.validated_output_text::jsonb->>'mode',confidence=(v_output.validated_output_text::jsonb->>'confidence')::numeric,rationale=v_output.validated_output_text::jsonb->>'rationale',detected_language=v_output.validated_output_text::jsonb->>'detectedLanguage',intent_generation_run_id=v_run.id,last_error_code=null,version=v_next_version where id=v_draft.id;
  elsif v_command_type='abandon_draft' then
    if v_draft.status='promoted' or v_draft.status='abandoned' then raise exception 'invalid_draft_state' using errcode='P0001'; end if;
    update public.composer_drafts set status='abandoned',abandoned_at=timezone('utc',now()),version=v_next_version where id=v_draft.id;
  elsif v_command_type='confirm_and_promote' then
    if v_draft.status <> 'awaiting_confirmation' then raise exception 'invalid_draft_state' using errcode='P0001'; end if;
    insert into public.projects(owner_id,title,mode,stage,state_version) values(v_owner_id,p_command->>'confirmedTitle',p_command->>'confirmedMode','discovery',1) returning * into v_project;
    update public.composer_drafts set status='promoted',confirmed_mode=p_command->>'confirmedMode',confirmed_title=p_command->>'confirmedTitle',project_id=v_project.id,promoted_at=timezone('utc',now()),version=v_next_version where id=v_draft.id;
    insert into public.discovery_sessions(project_id,source_draft_id,status,policy_version,confirmed_turn_count) values(v_project.id,v_draft.id,'active',1,1) returning * into v_session;
    v_project_version := v_project.state_version + 1;
    insert into public.project_events(project_id,sequence_number,event_type,event_schema_version,actor_type,actor_id,payload) values(v_project.id,v_project_version,'discovery.started',1,'user',v_owner_id,jsonb_build_object('schemaVersion',1,'sessionId',v_session.id,'sourceDraftId',v_draft.id,'appliedStateVersion',v_project_version)) returning * into v_event;
    insert into public.discovery_inputs(project_id,session_id,source,input_text,confirmation_event_id) values(v_project.id,v_session.id,'initial_request',v_draft.initial_request_text,v_event.id);
    update public.projects set state_version=v_project_version,last_activity_at=timezone('utc',now()) where id=v_project.id;
    update public.idempotency_records set project_id=v_project.id,status='succeeded',resource_id=v_draft.id,completed_at=timezone('utc',now()) where id=v_existing.id;
    return jsonb_build_object('draftId',v_draft.id,'version',v_next_version,'status','promoted','projectId',v_project.id,'sessionId',v_session.id,'stateVersion',v_project_version,'eventId',v_event.id,'replayed',false);
  end if;
  update public.idempotency_records set status='succeeded',resource_id=v_draft.id,completed_at=timezone('utc',now()) where id=v_existing.id;
  select * into v_draft from public.composer_drafts where id=v_draft.id;
  if v_command_type='retry_intent' then
    return jsonb_build_object('draftId',v_draft.id,'version',v_draft.version,'status',v_draft.status,'projectId',v_draft.project_id,'initialRequestText',v_draft.initial_request_text,'replayed',false);
  end if;
  return jsonb_build_object('draftId',v_draft.id,'version',v_draft.version,'status',v_draft.status,'projectId',v_draft.project_id,'replayed',false);
end;
$$;

revoke all on function public.execute_composer_draft_command_v1(uuid,bigint,text,text,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.execute_composer_draft_command_v1(uuid,bigint,text,text,jsonb) to authenticated;
