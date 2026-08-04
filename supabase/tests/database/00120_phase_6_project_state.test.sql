begin;

select plan(183);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change
) values
  ('00000000-0000-0000-0000-000000000000','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','authenticated','authenticated','phase6-a@users.invalid',extensions.crypt('x', extensions.gen_salt('bf')),timezone('utc',now()),'{}','{}',timezone('utc',now()),timezone('utc',now()),'','','',''),
  ('00000000-0000-0000-0000-000000000000','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','authenticated','authenticated','phase6-b@users.invalid',extensions.crypt('x', extensions.gen_salt('bf')),timezone('utc',now()),'{}','{}',timezone('utc',now()),timezone('utc',now()),'','','','');
insert into public.profiles (id, display_name) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','Phase 6 A'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','Phase 6 B');
insert into public.projects (id, owner_id, title, mode, stage, state_version) values
  ('02000000-0000-4000-8000-000000000001','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','Phase 6 A','new_build','discovery',1),
  ('02000000-0000-4000-8000-000000000002','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','Phase 6 B','bug','discovery',1);

select has_column('public','projects','blocked_from_stage','blocked resume column exists');
select has_column('public','projects','archived_from_stage','archived resume column exists');
select has_column('public','project_events','event_schema_version','event schema version exists');
select has_column('public','generation_runs','validated_project_delta_text','validated delta text exists');
select has_column('public','generation_runs','validated_project_delta_hash','validated delta hash exists');
select has_table('public','project_delta_applications','apply-once relation exists');
select ok(exists (select 1 from pg_constraint where conrelid='public.milestones'::regclass and conname='milestones_confirmation_event_consistency_chk'),'milestone confirmation linkage constraint exists');
select ok(exists (select 1 from pg_constraint where conrelid='public.milestones'::regclass and conname='milestones_blocked_reason_consistency_chk'),'milestone blocked reason constraint exists');
select ok(exists (select 1 from pg_indexes where schemaname='public' and indexname='decisions_project_confirmed_key_uidx'),'confirmed decision keys are unique');
select ok(exists (select 1 from pg_indexes where schemaname='public' and indexname='requirements_project_successor_uidx'),'requirement lineage cannot branch');
select ok(exists (select 1 from pg_indexes where schemaname='public' and indexname='decisions_project_successor_uidx'),'decision lineage cannot branch');
select has_function('public','claim_generation_run_v2',array['uuid','bigint','text','text','text','text','text'],'v2 claim exists');
select has_function('public','complete_generation_run_v2',array['uuid','text','text','text','integer','integer','integer','integer','bigint','text','text','text'],'v2 complete exists');
select has_function('public','execute_project_command_v1',array['uuid','bigint','text','text','jsonb'],'state command exists');
select has_function('public','apply_validated_project_delta_v1',array['uuid','uuid','bigint'],'delta apply exists');
select has_function('public','get_project_state_snapshot_v1',array['uuid'],'state snapshot exists');
select ok(not has_function_privilege('authenticated','public.commit_project_change(uuid,bigint,text,text,text,jsonb,text,text,text,text,uuid,timestamptz,text)','EXECUTE'),'old commit is retired for authenticated');
select ok(not has_function_privilege('authenticated','public.claim_generation_run(uuid,bigint,text,text,text,text,text)','EXECUTE'),'old claim is retired for authenticated');
select ok(not has_function_privilege('service_role','public.claim_generation_run(uuid,bigint,text,text,text,text,text)','EXECUTE'),'old claim is retired for service role');
select ok(has_function_privilege('authenticated','public.execute_project_command_v1(uuid,bigint,text,text,jsonb)','EXECUTE'),'authenticated can execute state command');
select ok(not has_function_privilege('anon','public.execute_project_command_v1(uuid,bigint,text,text,jsonb)','EXECUTE'),'anon cannot execute state command');
select ok(has_function_privilege('authenticated','public.get_project_state_snapshot_v1(uuid)','EXECUTE')
  and not has_function_privilege('anon','public.get_project_state_snapshot_v1(uuid)','EXECUTE')
  and not has_function_privilege('service_role','public.get_project_state_snapshot_v1(uuid)','EXECUTE'),'state snapshot is authenticated-only');
select ok(has_table_privilege('authenticated','public.project_delta_applications','SELECT') and not has_table_privilege('authenticated','public.project_delta_applications','INSERT'),'apply receipt is read-only to authenticated');
select ok((select proconfig @> array['search_path=pg_catalog, public, private'] from pg_proc where oid='public.execute_project_command_v1(uuid,bigint,text,text,jsonb)'::regprocedure),'state RPC pins search path');
select ok((select prosecdef from pg_proc where oid='public.apply_validated_project_delta_v1(uuid,uuid,bigint)'::regprocedure),'delta apply is security definer');

select set_config('request.jwt.claim.sub','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',true);
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claims','{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}',true);
set local role authenticated;

create temporary table tmp_phase6_snapshot as
select public.get_project_state_snapshot_v1('02000000-0000-4000-8000-000000000001') as payload;
select ok((select payload->'projection'->>'id'='02000000-0000-4000-8000-000000000001'
  and jsonb_typeof(payload->'requirements')='array'
  and jsonb_typeof(payload->'decisions')='array'
  and jsonb_typeof(payload->'milestones')='array'
  and jsonb_typeof(payload->'summaries')='array'
  and payload ?& array['projection','requirements','decisions','milestones','summaries','preferences','project_preference_override','recent_evidence']
  from tmp_phase6_snapshot),'owner receives one canonical state snapshot shape');

create temporary table tmp_phase6_claim as
select * from public.claim_generation_run_v2(
  '02000000-0000-4000-8000-000000000001',1,'phase6-generation-key',repeat('a',64),'project_delta',
  'unseenprompt.model-gateway-request.v1','unseenprompt.model-output.project_delta.v1'
);
select is((select claim_status from tmp_phase6_claim),'running','new v2 claim is running');
select is((select status from tmp_phase6_claim),'running','new v2 run status is running');

select lives_ok($$select * from public.complete_generation_run_v2(
  (select run_id from tmp_phase6_claim),'succeeded','openai','model-phase6',10,1,2,0,3,'passed',null,
  '{"summary":"A bounded proposal","requirementProposals":[{"action":"add","reference":"","statement":"Users can sign in.","rationale":"Ownership is required."}],"decisionProposals":[{"action":"add","reference":"","statement":"Use a typed boundary.","rationale":"The boundary limits unsafe data."}],"milestoneProposals":[{"action":"add","reference":"","title":"First milestone","rationale":"Establish the foundation."}],"unresolvedConflicts":[]}'
 )$$,'valid v2 project delta persists');
select ok((select validated_project_delta_hash = encode(extensions.digest(convert_to(validated_project_delta_text,'UTF8'),'sha256'),'hex') from public.generation_runs where id=(select run_id from tmp_phase6_claim)),'delta hash is database computed');
select is((select octet_length(validated_project_delta_text)::int from public.generation_runs where id=(select run_id from tmp_phase6_claim)),442,'exact validated text is retained');

create temporary table tmp_phase6_replay as
select * from public.claim_generation_run_v2(
  '02000000-0000-4000-8000-000000000001',1,'phase6-generation-key',repeat('a',64),'project_delta',
  'unseenprompt.model-gateway-request.v1','unseenprompt.model-output.project_delta.v1'
);
select is((select claim_status from tmp_phase6_replay),'replayed','duplicate delta claim replays');
select is((select validated_project_delta_hash from tmp_phase6_replay),(select validated_project_delta_hash from public.generation_runs where id=(select run_id from tmp_phase6_claim)),'replay returns hash');

select lives_ok($$select public.apply_validated_project_delta_v1('02000000-0000-4000-8000-000000000001',(select run_id from tmp_phase6_claim),1)$$,'stored delta applies atomically');
select is((select state_version from public.projects where id='02000000-0000-4000-8000-000000000001'),2::bigint,'delta increments project version once');
select is((select count(*)::int from public.requirements where project_id='02000000-0000-4000-8000-000000000001' and status='proposed'),1,'delta creates proposed requirement');
select is((select count(*)::int from public.decisions where project_id='02000000-0000-4000-8000-000000000001' and status='proposed'),1,'delta creates proposed decision');
select is((select count(*)::int from public.milestones where project_id='02000000-0000-4000-8000-000000000001' and suggested_status='pending' and confirmed_status is null),1,'delta creates suggested milestone only');
select is((select count(*)::int from public.project_delta_applications where generation_run_id=(select run_id from tmp_phase6_claim)),1,'apply receipt is unique');
select is((select (public.apply_validated_project_delta_v1('02000000-0000-4000-8000-000000000001',(select run_id from tmp_phase6_claim),1)->>'replayed')::boolean),true,'duplicate delta apply replays receipt');
select ok((select e.event_type='project.delta_proposed' and e.actor_type='user' and e.actor_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid
  and e.payload ?& array['schemaVersion','generationRunId','createdRequirementIds','updatedRequirementIds','createdDecisionIds','updatedDecisionIds','createdMilestoneIds','updatedMilestoneIds']
  and (select count(*) from jsonb_object_keys(e.payload))=8 and e.payload->>'schemaVersion'='1'
  from public.project_events e where e.project_id='02000000-0000-4000-8000-000000000001' and e.sequence_number=2),'delta event has exact versioned payload and actor');

select is((public.execute_project_command_v1('02000000-0000-4000-8000-000000000001',2,'phase6-stage-key',repeat('b',64),'{"type":"transition_stage","to":"brief_confirmation"}'::jsonb)->>'state_version')::bigint,3::bigint,'stage transition commits one version');
select is((public.execute_project_command_v1('02000000-0000-4000-8000-000000000001',3,'phase6-confirm-key',repeat('c',64),jsonb_build_object('type','confirm_requirement','requirementId',(select id from public.requirements where project_id='02000000-0000-4000-8000-000000000001' limit 1),'category','functional'))->>'state_version')::bigint,4::bigint,'requirement confirmation commits');
select is((select status from public.requirements where project_id='02000000-0000-4000-8000-000000000001'),'confirmed','confirmation creates confirmed truth');
select is((public.execute_project_command_v1('02000000-0000-4000-8000-000000000001',4,'phase6-ready-key',repeat('d',64),'{"type":"transition_stage","to":"ready_for_prompt"}'::jsonb)->>'state_version')::bigint,5::bigint,'brief readiness requires confirmed requirement');
select throws_ok($$select public.execute_project_command_v1('02000000-0000-4000-8000-000000000001',3,'phase6-stale-key',repeat('e',64),'{"type":"change_mode","mode":"feature"}'::jsonb)$$,'P0001','stale_state_version','stale command is rejected');
select is((select state_version from public.projects where id='02000000-0000-4000-8000-000000000001'),5::bigint,'stale command leaves projection unchanged');
select is((select (public.execute_project_command_v1('02000000-0000-4000-8000-000000000001',5,'phase6-ready-key',repeat('d',64),'{"type":"transition_stage","to":"ready_for_prompt"}'::jsonb)->>'replayed')::boolean),true,'same command key replays original event');
select throws_ok($$select public.execute_project_command_v1('02000000-0000-4000-8000-000000000001',5,'phase6-ready-key',repeat('f',64),'{"type":"transition_stage","to":"ready_for_prompt"}'::jsonb)$$,'P0001','idempotency_conflict','same key different fingerprint is rejected');
select throws_ok($$select public.execute_project_command_v1('02000000-0000-4000-8000-000000000001',5,'phase6-hostile-key',repeat('1',64),'{"type":"change_mode","mode":"feature","actorType":"system"}'::jsonb)$$,'P0001','validation_failed','caller actor spoof field is rejected');

select set_config('request.jwt.claim.sub','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',true);
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claims','{"sub":"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb","role":"authenticated"}',true);
select throws_ok($$select public.execute_project_command_v1('02000000-0000-4000-8000-000000000001',5,'phase6-cross-user-key',repeat('2',64),'{"type":"change_mode","mode":"feature"}'::jsonb)$$,'P0001','project_not_found','cross-user project is not disclosed');
select is((select count(*)::int from public.projects where owner_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),'1','cross-user project remains owned by A');

reset role;
create or replace function public.__phase6_fail_project_update() returns trigger language plpgsql as $$begin if new.state_version = 6 then raise exception 'phase6_forced_failure' using errcode='P0001'; end if; return new; end;$$;
create trigger __phase6_fail_project_update before update on public.projects for each row execute function public.__phase6_fail_project_update();
select set_config('request.jwt.claim.sub','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',true);
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claims','{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}',true);
set local role authenticated;
select throws_ok($$select public.execute_project_command_v1('02000000-0000-4000-8000-000000000001',5,'phase6-rollback-key',repeat('3',64),'{"type":"change_mode","mode":"feature"}'::jsonb)$$,'P0001','phase6_forced_failure','forced projection failure rolls back command');
reset role;
drop trigger if exists __phase6_fail_project_update on public.projects;
drop function if exists public.__phase6_fail_project_update();
select is((select state_version from public.projects where id='02000000-0000-4000-8000-000000000001'),5::bigint,'forced failure leaves version unchanged');
select is((select count(*)::int from public.project_events where project_id='02000000-0000-4000-8000-000000000001' and sequence_number=6),0,'forced failure leaves no event');
select is((select count(*)::int from public.idempotency_records where idempotency_key='phase6-rollback-key'),0,'forced failure leaves no idempotency receipt');

-- Exercise the complete user command family from a non-interrupted ready state.
select set_config('request.jwt.claim.sub','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',true);
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claims','{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}',true);
set local role authenticated;

create temporary table tmp_phase6_block as
select public.execute_project_command_v1(
  '02000000-0000-4000-8000-000000000001',5,'phase6-block-key',repeat('4',64),
  '{"type":"block_project","blockerSummary":"Waiting for user confirmation."}'::jsonb
) as result;
select is((select (result->>'state_version')::bigint from tmp_phase6_block),6::bigint,'block commits one version');
select is((select stage from public.projects where id='02000000-0000-4000-8000-000000000001'),'blocked','block enters blocked stage');
select is((select blocked_from_stage from public.projects where id='02000000-0000-4000-8000-000000000001'),'ready_for_prompt','block records resume stage');
select is((select blocker_summary from public.projects where id='02000000-0000-4000-8000-000000000001'),'Waiting for user confirmation.','block records blocker summary');
select ok((select e.actor_type='user' and e.actor_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid
  and e.payload ?& array['schemaVersion','from','to'] and (select count(*) from jsonb_object_keys(e.payload))=3
  from public.project_events e where e.project_id='02000000-0000-4000-8000-000000000001' and e.sequence_number=6),'block event is user-attributed with exact payload');

create temporary table tmp_phase6_unblock as
select public.execute_project_command_v1(
  '02000000-0000-4000-8000-000000000001',6,'phase6-unblock-key',repeat('5',64),
  '{"type":"unblock_project"}'::jsonb
) as result;
select is((select (result->>'state_version')::bigint from tmp_phase6_unblock),7::bigint,'unblock commits one version');
select is((select stage from public.projects where id='02000000-0000-4000-8000-000000000001'),'ready_for_prompt','unblock resumes recorded stage');
select ok((select blocked_from_stage is null and blocker_summary is null from public.projects where id='02000000-0000-4000-8000-000000000001'),'unblock clears interruption fields');
select ok((select payload ?& array['schemaVersion','from','to'] and payload->>'from'='blocked' and payload->>'to'='ready_for_prompt'
  from public.project_events where project_id='02000000-0000-4000-8000-000000000001' and sequence_number=7),'unblock payload records resume target');

create temporary table tmp_phase6_archived_claim as
select * from public.claim_generation_run_v2(
  '02000000-0000-4000-8000-000000000001',7,'phase6-archived-proposal-key',repeat('6',64),'project_delta',
  'unseenprompt.model-gateway-request.v1','unseenprompt.model-output.project_delta.v1'
);
select lives_ok($$select * from public.complete_generation_run_v2(
  (select run_id from tmp_phase6_archived_claim),'succeeded','openai','model-phase6',10,1,2,0,3,'passed',null,
  '{"summary":"Archived proposal","requirementProposals":[],"decisionProposals":[],"milestoneProposals":[{"action":"add","reference":"","title":"Archived milestone","rationale":"Wait for resume."}],"unresolvedConflicts":[]}'
)$$,'unapplied delta persists before archive');

create temporary table tmp_phase6_archive as
select public.execute_project_command_v1(
  '02000000-0000-4000-8000-000000000001',7,'phase6-archive-key',repeat('6',64),
  '{"type":"archive_project"}'::jsonb
) as result;
select is((select (result->>'state_version')::bigint from tmp_phase6_archive),8::bigint,'archive commits one version');
select is((select stage from public.projects where id='02000000-0000-4000-8000-000000000001'),'archived','archive enters archived stage');
select is((select archived_from_stage from public.projects where id='02000000-0000-4000-8000-000000000001'),'ready_for_prompt','archive records resume stage');
select is((select (public.apply_validated_project_delta_v1('02000000-0000-4000-8000-000000000001',(select run_id from tmp_phase6_claim),8)->>'replayed')::boolean),true,'already-applied delta replays after archive');
select throws_ok($$select public.apply_validated_project_delta_v1('02000000-0000-4000-8000-000000000001',(select run_id from tmp_phase6_archived_claim),7)$$,'P0001','invalid_transition','unapplied delta cannot mutate archived project');
select is((select state_version from public.projects where id='02000000-0000-4000-8000-000000000001'),8::bigint,'archived delta rejection leaves projection unchanged');
select is((select count(*)::int from public.project_delta_applications where generation_run_id=(select run_id from tmp_phase6_archived_claim)),0,'archived delta rejection leaves no apply receipt');
select throws_ok($$select public.execute_project_command_v1('02000000-0000-4000-8000-000000000001',8,'phase6-archived-change-key',repeat('7',64),'{"type":"change_mode","mode":"feature"}'::jsonb)$$,'P0001','invalid_transition','archived project rejects non-restore commands');

create temporary table tmp_phase6_restore as
select public.execute_project_command_v1(
  '02000000-0000-4000-8000-000000000001',8,'phase6-restore-key',repeat('8',64),
  '{"type":"restore_project"}'::jsonb
) as result;
select is((select (result->>'state_version')::bigint from tmp_phase6_restore),9::bigint,'restore commits one version');
select is((select stage from public.projects where id='02000000-0000-4000-8000-000000000001'),'ready_for_prompt','restore resumes archived stage');
select ok((select archived_from_stage is null and archived_at is null from public.projects where id='02000000-0000-4000-8000-000000000001'),'restore clears archive fields');
select ok((select payload ?& array['schemaVersion','from','to'] and payload->>'from'='archived' and payload->>'to'='ready_for_prompt'
  from public.project_events where project_id='02000000-0000-4000-8000-000000000001' and sequence_number=9),'restore payload records resume target');

create temporary table tmp_phase6_milestone_confirm as
select public.execute_project_command_v1(
  '02000000-0000-4000-8000-000000000001',9,'phase6-milestone-confirm-key',repeat('9',64),
  jsonb_build_object('type','confirm_milestone_status','milestoneId',(select id from public.milestones where project_id='02000000-0000-4000-8000-000000000001' limit 1),'status','completed')
) as result;
select is((select (result->>'state_version')::bigint from tmp_phase6_milestone_confirm),10::bigint,'milestone confirmation commits one version');
select is((select suggested_status from public.milestones where project_id='02000000-0000-4000-8000-000000000001' limit 1),'pending','milestone suggestion remains unchanged');
select is((select confirmed_status from public.milestones where project_id='02000000-0000-4000-8000-000000000001' limit 1),'completed','milestone confirmation is user-owned truth');
select ok((select confirmation_event_id is not null from public.milestones where project_id='02000000-0000-4000-8000-000000000001' limit 1),'milestone stores confirmation event');
select ok((select e.event_type='milestone.status_confirmed' and e.actor_type='user' and e.actor_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid
  and e.payload ?& array['schemaVersion','previousMilestoneId','milestoneId','beforeStatus','afterStatus']
  and (select count(*) from jsonb_object_keys(e.payload))=5 and e.payload->>'afterStatus'='completed'
  from public.project_events e where e.project_id='02000000-0000-4000-8000-000000000001' and e.sequence_number=10),'milestone event keeps suggestion and confirmation distinct');

create temporary table tmp_phase6_summary_v1 as
select public.execute_project_command_v1(
  '02000000-0000-4000-8000-000000000001',10,'phase6-summary-v1-key',repeat('a',64),
  '{"type":"replace_summary","summaryKind":"state","summaryText":"Initial state summary.","structuredFacts":{"version":1}}'::jsonb
) as result;
create temporary table tmp_phase6_summary_v2 as
select public.execute_project_command_v1(
  '02000000-0000-4000-8000-000000000001',11,'phase6-summary-v2-key',repeat('b',64),
  '{"type":"replace_summary","summaryKind":"state","summaryText":"Updated state summary.","structuredFacts":{"version":2}}'::jsonb
) as result;
select is((select (result->>'state_version')::bigint from tmp_phase6_summary_v1),11::bigint,'first summary commits one version');
select is((select (result->>'state_version')::bigint from tmp_phase6_summary_v2),12::bigint,'summary replacement commits one version');
select is((select count(*)::int from public.project_summaries where project_id='02000000-0000-4000-8000-000000000001' and summary_kind='state' and status='current'),1,'one current summary remains');
select is((select version from public.project_summaries where project_id='02000000-0000-4000-8000-000000000001' and summary_kind='state' and status='current'),2,'summary versions increase monotonically');
select is((select count(*)::int from public.project_summaries where project_id='02000000-0000-4000-8000-000000000001' and summary_kind='state' and status='superseded'),1,'previous summary is superseded');
select ok((select e.payload ?& array['schemaVersion','summaryId','summaryKind','version'] and (select count(*) from jsonb_object_keys(e.payload))=4 and (e.payload->>'version')::int=2
  from public.project_events e where e.project_id='02000000-0000-4000-8000-000000000001' and e.sequence_number=12),'summary event has versioned payload');

create temporary table tmp_phase6_req_direct as
select public.execute_project_command_v1(
  '02000000-0000-4000-8000-000000000001',12,'phase6-req-direct-key',repeat('c',64),
  jsonb_build_object('type','supersede_requirement','predecessorId',(select id from public.requirements where project_id='02000000-0000-4000-8000-000000000001' and status='confirmed' and supersedes_requirement_id is null limit 1),'category','security','statement','Use an owner-scoped state command.','rationale','Every write must be attributable to the owner.')
) as result;
select is((select (result->>'state_version')::bigint from tmp_phase6_req_direct),13::bigint,'direct requirement supersession commits one version');
select is((select status from public.requirements where project_id='02000000-0000-4000-8000-000000000001' and status='superseded' and supersedes_requirement_id is null limit 1),'superseded','requirement predecessor is superseded');
select ok((select confirmed_at is null from public.requirements where project_id='02000000-0000-4000-8000-000000000001' and status='superseded' and supersedes_requirement_id is null limit 1),'superseded requirement clears confirmed timestamp');
select ok((select r.status='confirmed' and r.confirmed_at is not null and r.supersedes_requirement_id is not null
  from public.requirements r where r.source_event_id=(select (result->>'event_id')::uuid from tmp_phase6_req_direct)),'direct requirement successor is confirmed');
select ok((select e.event_type='requirement.superseded' and e.payload ?& array['schemaVersion','entityId','predecessorId','beforeStatus','afterStatus']
  and (select count(*) from jsonb_object_keys(e.payload))=5 and e.payload->>'beforeStatus'='confirmed' and e.payload->>'afterStatus'='superseded'
  from public.project_events e where e.project_id='02000000-0000-4000-8000-000000000001' and e.sequence_number=13),'requirement supersession event is exact and immutable');

create temporary table tmp_phase6_decision_confirm as
select public.execute_project_command_v1(
  '02000000-0000-4000-8000-000000000001',13,'phase6-decision-confirm-key',repeat('d',64),
  jsonb_build_object('type','confirm_decision','decisionId',(select id from public.decisions where project_id='02000000-0000-4000-8000-000000000001' and status='proposed' limit 1),'decisionKey','architecture')
) as result;
select is((select (result->>'state_version')::bigint from tmp_phase6_decision_confirm),14::bigint,'decision confirmation commits one version');
select is((select status from public.decisions where project_id='02000000-0000-4000-8000-000000000001' and decision_key='architecture'),'confirmed','decision confirmation creates confirmed truth');

create temporary table tmp_phase6_decision_direct as
select public.execute_project_command_v1(
  '02000000-0000-4000-8000-000000000001',14,'phase6-decision-direct-key',repeat('e',64),
  jsonb_build_object('type','supersede_decision','predecessorId',(select id from public.decisions where project_id='02000000-0000-4000-8000-000000000001' and decision_key='architecture' and status='confirmed' limit 1),'decision','Use a versioned architecture decision.','rationale','Successors preserve confirmed history.')
) as result;
select is((select (result->>'state_version')::bigint from tmp_phase6_decision_direct),15::bigint,'direct decision supersession commits one version');
select ok((select confirmed_at is null from public.decisions where project_id='02000000-0000-4000-8000-000000000001' and decision_key='architecture' and status='superseded'),'superseded decision clears confirmed timestamp');
select ok((select d.status='confirmed' and d.confirmed_at is not null and d.supersedes_decision_id is not null
  from public.decisions d where d.source_event_id=(select (result->>'event_id')::uuid from tmp_phase6_decision_direct)),'direct decision successor is confirmed');
select ok((select e.event_type='decision.superseded' and e.payload ?& array['schemaVersion','entityId','predecessorId','beforeStatus','afterStatus']
  and (select count(*) from jsonb_object_keys(e.payload))=5 and e.payload->>'beforeStatus'='confirmed' and e.payload->>'afterStatus'='superseded'
  from public.project_events e where e.project_id='02000000-0000-4000-8000-000000000001' and e.sequence_number=15),'decision supersession event is exact and immutable');

reset role;
insert into public.requirements (id,project_id,category,statement,rationale,status,supersedes_requirement_id)
select '04000000-0000-4000-8000-000000000001','02000000-0000-4000-8000-000000000001','security','A proposed requirement successor.','Needs owner confirmation.','proposed',r.id
from public.requirements r where r.project_id='02000000-0000-4000-8000-000000000001' and r.status='confirmed' limit 1;
insert into public.decisions (id,project_id,decision_key,decision,rationale,status,supersedes_decision_id)
select '04000000-0000-4000-8000-000000000002','02000000-0000-4000-8000-000000000001','architecture','A proposed decision successor.','Needs owner confirmation.','proposed',d.id
from public.decisions d where d.project_id='02000000-0000-4000-8000-000000000001' and d.status='confirmed' limit 1;
select set_config('request.jwt.claim.sub','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',true);
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claims','{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}',true);
set local role authenticated;

create temporary table tmp_phase6_req_confirm_successor as
select public.execute_project_command_v1(
  '02000000-0000-4000-8000-000000000001',15,'phase6-req-successor-key',repeat('f',64),
  jsonb_build_object('type','confirm_requirement','requirementId','04000000-0000-4000-8000-000000000001','category','security')
) as result;
select is((select (result->>'state_version')::bigint from tmp_phase6_req_confirm_successor),16::bigint,'proposed requirement successor confirmation commits');
select is((select status from public.requirements where id='04000000-0000-4000-8000-000000000001'),'confirmed','requirement successor becomes confirmed');
select ok((select confirmed_at is null from public.requirements where id=(select supersedes_requirement_id from public.requirements where id='04000000-0000-4000-8000-000000000001')),'confirming successor clears predecessor timestamp');
select ok((select (payload ? 'predecessorId') and payload->>'predecessorId'=(select supersedes_requirement_id::text from public.requirements where id='04000000-0000-4000-8000-000000000001')
  from public.project_events where id=(select (result->>'event_id')::uuid from tmp_phase6_req_confirm_successor)),'requirement confirmation payload records predecessor');

create temporary table tmp_phase6_decision_confirm_successor as
select public.execute_project_command_v1(
  '02000000-0000-4000-8000-000000000001',16,'phase6-decision-successor-key',repeat('0',64),
  jsonb_build_object('type','confirm_decision','decisionId','04000000-0000-4000-8000-000000000002','decisionKey','architecture')
) as result;
select is((select (result->>'state_version')::bigint from tmp_phase6_decision_confirm_successor),17::bigint,'proposed decision successor confirmation commits');
select is((select status from public.decisions where id='04000000-0000-4000-8000-000000000002'),'confirmed','decision successor becomes confirmed');
select ok((select confirmed_at is null from public.decisions where id=(select supersedes_decision_id from public.decisions where id='04000000-0000-4000-8000-000000000002')),'confirming decision successor clears predecessor timestamp');
select ok((select (payload ? 'predecessorId') and payload->>'predecessorId'=(select supersedes_decision_id::text from public.decisions where id='04000000-0000-4000-8000-000000000002')
  from public.project_events where id=(select (result->>'event_id')::uuid from tmp_phase6_decision_confirm_successor)),'decision confirmation payload records predecessor');

select ok((select max(e.sequence_number)=p.state_version
  from public.projects p join public.project_events e on e.project_id=p.id
  where p.id='02000000-0000-4000-8000-000000000001'
  group by p.id,p.state_version),'event sequence and projection version remain aligned');
select ok((select bool_and(e.event_schema_version=1 and e.payload->>'schemaVersion'='1' and e.actor_type='user' and e.actor_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid)
  from public.project_events e where e.project_id='02000000-0000-4000-8000-000000000001' and e.sequence_number > 1),'all Phase 6 events use versioned payloads and authenticated actor attribution');

-- A failure after proposal children and the delta event are attempted must roll the entire apply
-- statement back, including the projection and apply-once receipt.
reset role;
insert into public.projects (id,owner_id,title,mode,stage,state_version)
values ('02000000-0000-4000-8000-000000000003','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','Phase 6 apply rollback','new_build','discovery',1);
select set_config('request.jwt.claim.sub','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',true);
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claims','{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}',true);
set local role authenticated;
create temporary table tmp_phase6_apply_rollback_claim as
select * from public.claim_generation_run_v2(
  '02000000-0000-4000-8000-000000000003',1,'phase6-apply-rollback-key',repeat('a',64),'project_delta',
  'unseenprompt.model-gateway-request.v1','unseenprompt.model-output.project_delta.v1'
);
select lives_ok($$select * from public.complete_generation_run_v2(
  (select run_id from tmp_phase6_apply_rollback_claim),'succeeded','openai','model-phase6',10,1,2,0,3,'passed',null,
  '{"summary":"Apply rollback proposal","requirementProposals":[{"action":"add","reference":"","statement":"Rollback requirement.","rationale":"Atomicity test."}],"decisionProposals":[{"action":"add","reference":"","statement":"Rollback decision.","rationale":"Atomicity test."}],"milestoneProposals":[{"action":"add","reference":"","title":"Rollback milestone","rationale":"Atomicity test."}],"unresolvedConflicts":[]}'
)$$,'rollback proposal persists before forced apply failure');
reset role;
create or replace function public.__phase6_fail_delta_projection() returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if new.id = '02000000-0000-4000-8000-000000000003'::uuid and new.state_version = 2 then
    raise exception 'phase6_delta_forced_failure' using errcode='P0001';
  end if;
  return new;
end;
$$;
create trigger __phase6_fail_delta_projection
before update on public.projects
for each row execute function public.__phase6_fail_delta_projection();
select set_config('request.jwt.claim.sub','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',true);
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claims','{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}',true);
set local role authenticated;
select throws_ok($$select public.apply_validated_project_delta_v1('02000000-0000-4000-8000-000000000003',(select run_id from tmp_phase6_apply_rollback_claim),1)$$,'P0001','phase6_delta_forced_failure','apply rollback removes normalized children and event');
reset role;
drop trigger if exists __phase6_fail_delta_projection on public.projects;
drop function if exists public.__phase6_fail_delta_projection();
select is((select state_version from public.projects where id='02000000-0000-4000-8000-000000000003'),1::bigint,'forced apply failure leaves project version unchanged');
select is((select count(*)::int from public.requirements where project_id='02000000-0000-4000-8000-000000000003'),0,'forced apply failure leaves no requirement');
select is((select count(*)::int from public.decisions where project_id='02000000-0000-4000-8000-000000000003'),0,'forced apply failure leaves no decision');
select is((select count(*)::int from public.milestones where project_id='02000000-0000-4000-8000-000000000003'),0,'forced apply failure leaves no milestone');
select is((select count(*)::int from public.project_events where project_id='02000000-0000-4000-8000-000000000003'),0,'forced apply failure leaves no target event');
select is((select count(*)::int from public.project_delta_applications where project_id='02000000-0000-4000-8000-000000000003'),0,'forced apply failure leaves no apply receipt');

-- Source-version and current-projection mismatches fail before any proposal child/event mutation.
insert into public.projects (id,owner_id,title,mode,stage,state_version)
values ('02000000-0000-4000-8000-000000000004','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','Phase 6 version mismatch','new_build','discovery',1);
select set_config('request.jwt.claim.sub','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',true);
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claims','{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}',true);
set local role authenticated;
create temporary table tmp_phase6_version_claim as
select * from public.claim_generation_run_v2(
  '02000000-0000-4000-8000-000000000004',1,'phase6-version-mismatch-key',repeat('b',64),'project_delta',
  'unseenprompt.model-gateway-request.v1','unseenprompt.model-output.project_delta.v1'
);
select lives_ok($$select * from public.complete_generation_run_v2(
  (select run_id from tmp_phase6_version_claim),'succeeded','openai','model-phase6',10,1,2,0,3,'passed',null,
  '{"summary":"Version mismatch proposal","requirementProposals":[{"action":"add","reference":"","statement":"Version requirement.","rationale":"Mismatch test."}],"decisionProposals":[{"action":"add","reference":"","statement":"Version decision.","rationale":"Mismatch test."}],"milestoneProposals":[{"action":"add","reference":"","title":"Version milestone","rationale":"Mismatch test."}],"unresolvedConflicts":[]}'
)$$,'version mismatch proposal persists before apply checks');
select throws_ok($$select public.apply_validated_project_delta_v1('02000000-0000-4000-8000-000000000004',(select run_id from tmp_phase6_version_claim),2)$$,'P0001','proposal_conflict','source version mismatch is rejected');
select is((select state_version from public.projects where id='02000000-0000-4000-8000-000000000004'),1::bigint,'source mismatch leaves project version unchanged');
select is((select count(*)::int from public.requirements where project_id='02000000-0000-4000-8000-000000000004'),0,'source mismatch leaves no requirement');
select is((select count(*)::int from public.decisions where project_id='02000000-0000-4000-8000-000000000004'),0,'source mismatch leaves no decision');
select is((select count(*)::int from public.milestones where project_id='02000000-0000-4000-8000-000000000004'),0,'source mismatch leaves no milestone');
select is((select count(*)::int from public.project_events where project_id='02000000-0000-4000-8000-000000000004'),0,'source mismatch leaves no event');
select is((select count(*)::int from public.project_delta_applications where project_id='02000000-0000-4000-8000-000000000004'),0,'source mismatch leaves no apply receipt');
select is((public.execute_project_command_v1('02000000-0000-4000-8000-000000000004',1,'phase6-version-advance-key',repeat('c',64),'{"type":"change_mode","mode":"feature"}'::jsonb)->>'state_version')::bigint,2::bigint,'version mismatch fixture advances project independently');
select throws_ok($$select public.apply_validated_project_delta_v1('02000000-0000-4000-8000-000000000004',(select run_id from tmp_phase6_version_claim),1)$$,'P0001','stale_state_version','current project mismatch is rejected');
select is((select state_version from public.projects where id='02000000-0000-4000-8000-000000000004'),2::bigint,'current mismatch leaves project version unchanged');
select is((select count(*)::int from public.requirements where project_id='02000000-0000-4000-8000-000000000004'),0,'current mismatch leaves no requirement');
select is((select count(*)::int from public.decisions where project_id='02000000-0000-4000-8000-000000000004'),0,'current mismatch leaves no decision');
select is((select count(*)::int from public.milestones where project_id='02000000-0000-4000-8000-000000000004'),0,'current mismatch leaves no milestone');
select is((select count(*)::int from public.project_events where project_id='02000000-0000-4000-8000-000000000004' and event_type='project.delta_proposed'),0,'current mismatch leaves no delta event');
select is((select count(*)::int from public.project_delta_applications where project_id='02000000-0000-4000-8000-000000000004'),0,'current mismatch leaves no apply receipt');

-- Archiving a blocked project preserves the original interruption so restore returns blocked and
-- unblock can resume the exact normal stage while clearing interruption fields.
reset role;
insert into public.projects (id,owner_id,title,mode,stage,state_version)
values ('02000000-0000-4000-8000-000000000005','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','Phase 6 blocked archive','new_build','result_review',1);
select set_config('request.jwt.claim.sub','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',true);
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claims','{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}',true);
set local role authenticated;
select is((public.execute_project_command_v1('02000000-0000-4000-8000-000000000005',1,'phase6-blocked-archive-block-key',repeat('d',64),'{"type":"block_project","blockerSummary":"Waiting on the owner."}'::jsonb)->>'state_version')::bigint,2::bigint,'blocked archive fixture enters blocked');
select is((select stage from public.projects where id='02000000-0000-4000-8000-000000000005'),'blocked','blocked archive fixture is blocked');
select is((select blocked_from_stage from public.projects where id='02000000-0000-4000-8000-000000000005'),'result_review','blocked archive fixture stores original stage');
select is((select blocker_summary from public.projects where id='02000000-0000-4000-8000-000000000005'),'Waiting on the owner.','blocked archive fixture stores blocker');
select is((public.execute_project_command_v1('02000000-0000-4000-8000-000000000005',2,'phase6-blocked-archive-archive-key',repeat('e',64),'{"type":"archive_project"}'::jsonb)->>'state_version')::bigint,3::bigint,'archive while blocked commits');
select is((select stage from public.projects where id='02000000-0000-4000-8000-000000000005'),'archived','archive while blocked enters archived');
select is((select archived_from_stage from public.projects where id='02000000-0000-4000-8000-000000000005'),'blocked','archive records blocked resume stage');
select is((select blocked_from_stage from public.projects where id='02000000-0000-4000-8000-000000000005'),'result_review','archive preserves blocked resume target');
select is((select blocker_summary from public.projects where id='02000000-0000-4000-8000-000000000005'),'Waiting on the owner.','archive preserves blocker summary');
select is((public.execute_project_command_v1('02000000-0000-4000-8000-000000000005',3,'phase6-blocked-archive-restore-key',repeat('f',64),'{"type":"restore_project"}'::jsonb)->>'state_version')::bigint,4::bigint,'restore from blocked archive commits');
select is((select stage from public.projects where id='02000000-0000-4000-8000-000000000005'),'blocked','restore returns exactly to blocked');
select is((select archived_from_stage from public.projects where id='02000000-0000-4000-8000-000000000005'),null,'restore clears archived resume field');
select is((select blocked_from_stage from public.projects where id='02000000-0000-4000-8000-000000000005'),'result_review','restore preserves original normal stage');
select is((select blocker_summary from public.projects where id='02000000-0000-4000-8000-000000000005'),'Waiting on the owner.','restore preserves blocker summary');
select is((public.execute_project_command_v1('02000000-0000-4000-8000-000000000005',4,'phase6-blocked-archive-unblock-key',repeat('0',64),'{"type":"unblock_project"}'::jsonb)->>'state_version')::bigint,5::bigint,'unblock after restore commits');
select is((select stage from public.projects where id='02000000-0000-4000-8000-000000000005'),'result_review','unblock resumes original normal stage');
select is((select blocked_from_stage from public.projects where id='02000000-0000-4000-8000-000000000005'),null,'unblock clears blocked resume field');
select is((select blocker_summary from public.projects where id='02000000-0000-4000-8000-000000000005'),null,'unblock clears blocker summary');
select is((select archived_from_stage from public.projects where id='02000000-0000-4000-8000-000000000005'),null,'unblock keeps archived resume field clear');

-- Confirming a proposed decision and superseding a confirmed predecessor both reject an active
-- decision-key collision without changing version, events, or decision entities.
reset role;
insert into public.projects (id,owner_id,title,mode,stage,state_version)
values ('02000000-0000-4000-8000-000000000006','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','Phase 6 decision conflict','new_build','discovery',1);
insert into public.decisions (id,project_id,decision_key,decision,rationale,status,confirmed_at)
values
  ('05000000-0000-4000-8000-000000000001','02000000-0000-4000-8000-000000000006','conflict-key','Existing active decision','Existing key.','confirmed',timezone('utc',now())),
  ('05000000-0000-4000-8000-000000000002','02000000-0000-4000-8000-000000000006','candidate-key','Proposed conflicting decision','Awaiting confirmation.','proposed',null),
  ('05000000-0000-4000-8000-000000000003','02000000-0000-4000-8000-000000000006','other-key','Confirmed predecessor','Eligible for supersession.','confirmed',timezone('utc',now()));
select set_config('request.jwt.claim.sub','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',true);
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claims','{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}',true);
set local role authenticated;
select throws_ok($$select public.execute_project_command_v1('02000000-0000-4000-8000-000000000006',1,'phase6-decision-conflict-confirm-key',repeat('1',64),jsonb_build_object('type','confirm_decision','decisionId','05000000-0000-4000-8000-000000000002','decisionKey','conflict-key'))$$,'P0001','decision_key_conflict','confirming a proposed decision rejects active key collision');
select is((select state_version from public.projects where id='02000000-0000-4000-8000-000000000006'),1::bigint,'confirm key conflict leaves project version unchanged');
select is((select count(*)::int from public.project_events where project_id='02000000-0000-4000-8000-000000000006'),0,'confirm key conflict leaves no event');
select ok((select d.status='confirmed' and d.decision_key='conflict-key' from public.decisions d where d.id='05000000-0000-4000-8000-000000000001'),'existing confirmed decision remains unchanged');
select ok((select d.status='proposed' and d.decision_key='candidate-key' and d.confirmed_at is null from public.decisions d where d.id='05000000-0000-4000-8000-000000000002'),'proposed decision remains unchanged');
select throws_ok($$select public.execute_project_command_v1('02000000-0000-4000-8000-000000000006',1,'phase6-decision-conflict-supersede-key',repeat('2',64),jsonb_build_object('type','supersede_decision','predecessorId','05000000-0000-4000-8000-000000000003','decisionKey','conflict-key','decision','Conflicting successor','rationale','Must fail closed.'))$$,'P0001','decision_key_conflict','superseding a decision rejects active key collision');
select is((select state_version from public.projects where id='02000000-0000-4000-8000-000000000006'),1::bigint,'supersede key conflict leaves project version unchanged');
select is((select count(*)::int from public.project_events where project_id='02000000-0000-4000-8000-000000000006'),0,'supersede key conflict leaves no event');
select is((select count(*)::int from public.decisions where project_id='02000000-0000-4000-8000-000000000006'),3,'supersede key conflict creates no successor');
select ok((select d.status='confirmed' and d.decision_key='other-key' and d.confirmed_at is not null from public.decisions d where d.id='05000000-0000-4000-8000-000000000003'),'supersede predecessor remains unchanged');

-- A valid Unicode proposal is retained for replay, but applying it fails closed when the
-- normalized milestone byte ceiling would be exceeded; no projection/event/receipt is partial.
create temporary table tmp_phase6_unicode_claim as
select * from public.claim_generation_run_v2(
  '02000000-0000-4000-8000-000000000001',17,'phase6-unicode-key',repeat('1',64),'project_delta',
  'unseenprompt.model-gateway-request.v1','unseenprompt.model-output.project_delta.v1'
);
select lives_ok($$select * from public.complete_generation_run_v2(
  (select run_id from tmp_phase6_unicode_claim),'succeeded','openai','model-phase6',10,1,2,0,3,'passed',null,
  jsonb_build_object('summary','Unicode proposal','requirementProposals','[]'::jsonb,'decisionProposals','[]'::jsonb,'milestoneProposals',jsonb_build_array(jsonb_build_object('action','add','reference','','title',repeat('😀',240),'rationale','Unicode title')),'unresolvedConflicts','[]'::jsonb)::text
)$$,'Unicode validated output persists for replay');
select is((select char_length((validated_project_delta_text::jsonb->'milestoneProposals'->0->>'title')) from public.generation_runs where id=(select run_id from tmp_phase6_unicode_claim)),240,'Unicode character length remains bounded');
select throws_ok($$select public.apply_validated_project_delta_v1('02000000-0000-4000-8000-000000000001',(select run_id from tmp_phase6_unicode_claim),17)$$,'P0001','proposal_conflict','oversized UTF-8 normalized content fails closed');
select is((select state_version from public.projects where id='02000000-0000-4000-8000-000000000001'),17::bigint,'Unicode conflict leaves projection unchanged');
select is((select count(*)::int from public.project_delta_applications where generation_run_id=(select run_id from tmp_phase6_unicode_claim)),0,'Unicode conflict leaves no apply receipt');

create temporary table tmp_phase6_duplicate_claim as
select * from public.claim_generation_run_v2(
  '02000000-0000-4000-8000-000000000001',17,'phase6-duplicate-key',repeat('2',64),'project_delta',
  'unseenprompt.model-gateway-request.v1','unseenprompt.model-output.project_delta.v1'
);
select lives_ok($$select * from public.complete_generation_run_v2(
  (select run_id from tmp_phase6_duplicate_claim),'succeeded','openai','model-phase6',10,1,2,0,3,'passed',null,
  jsonb_build_object('summary','Duplicate proposal','requirementProposals',jsonb_build_array(
    jsonb_build_object('action','revise','reference',(select id::text from public.requirements where project_id='02000000-0000-4000-8000-000000000001' and status='confirmed' limit 1),'statement','First revision','rationale','Conflict test'),
    jsonb_build_object('action','revise','reference',(select id::text from public.requirements where project_id='02000000-0000-4000-8000-000000000001' and status='confirmed' limit 1),'statement','Second revision','rationale','Conflict test')
  ),'decisionProposals','[]'::jsonb,'milestoneProposals','[]'::jsonb,'unresolvedConflicts','[]'::jsonb)::text
)$$,'duplicate revise proposal persists for deterministic conflict checking');
select throws_ok($$select public.apply_validated_project_delta_v1('02000000-0000-4000-8000-000000000001',(select run_id from tmp_phase6_duplicate_claim),17)$$,'P0001','proposal_conflict','duplicate revise references fail closed');
select is((select state_version from public.projects where id='02000000-0000-4000-8000-000000000001'),17::bigint,'duplicate conflict leaves projection unchanged');

create temporary table tmp_phase6_remove_claim as
select * from public.claim_generation_run_v2(
  '02000000-0000-4000-8000-000000000001',17,'phase6-remove-key',repeat('3',64),'project_delta',
  'unseenprompt.model-gateway-request.v1','unseenprompt.model-output.project_delta.v1'
);
select lives_ok($$select * from public.complete_generation_run_v2(
  (select run_id from tmp_phase6_remove_claim),'succeeded','openai','model-phase6',10,1,2,0,3,'passed',null,
  jsonb_build_object('summary','Remove proposal','requirementProposals',jsonb_build_array(jsonb_build_object('action','remove','reference',(select id::text from public.requirements where project_id='02000000-0000-4000-8000-000000000001' and status='confirmed' limit 1),'statement','Remove proposal','rationale','Requires confirmation')),'decisionProposals','[]'::jsonb,'milestoneProposals','[]'::jsonb,'unresolvedConflicts','[]'::jsonb)::text
)$$,'remove proposal persists for conflict checking');
select throws_ok($$select public.apply_validated_project_delta_v1('02000000-0000-4000-8000-000000000001',(select run_id from tmp_phase6_remove_claim),17)$$,'P0001','proposal_conflict','remove proposal never deletes confirmed truth');
select is((select count(*)::int from public.project_delta_applications where generation_run_id=(select run_id from tmp_phase6_remove_claim)),0,'remove conflict leaves no apply receipt');

-- Missing and foreign generation runs intentionally share the same non-disclosing replay error.
reset role;
select set_config('request.jwt.claim.sub','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',true);
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claims','{"sub":"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb","role":"authenticated"}',true);
set local role authenticated;
create temporary table tmp_phase6_foreign_claim as
select * from public.claim_generation_run_v2(
  '02000000-0000-4000-8000-000000000002',1,'phase6-foreign-run-key',repeat('4',64),'project_delta',
  'unseenprompt.model-gateway-request.v1','unseenprompt.model-output.project_delta.v1'
) limit 1;
select throws_ok($$select public.get_project_state_snapshot_v1('02000000-0000-4000-8000-000000000001')$$,'P0001','project_not_found','cross-owner snapshot is not disclosed');
select throws_ok($$select public.get_project_state_snapshot_v1('ffffffff-ffff-4fff-8fff-ffffffffffff')$$,'P0001','project_not_found','missing snapshot is not disclosed');
reset role;
select set_config('request.jwt.claim.sub','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',true);
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claims','{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}',true);
set local role authenticated;
select throws_ok($$select public.apply_validated_project_delta_v1('02000000-0000-4000-8000-000000000001',(select run_id from tmp_phase6_foreign_claim),1)$$,'P0001','proposal_not_replayable','foreign proposal is not disclosed');
select throws_ok($$select public.apply_validated_project_delta_v1('02000000-0000-4000-8000-000000000001','ffffffff-ffff-4fff-8fff-ffffffffffff',1)$$,'P0001','proposal_not_replayable','missing proposal is not disclosed');

reset role;
select throws_ok($$update public.milestones set confirmed_status=null where id=(select id from public.milestones where project_id='02000000-0000-4000-8000-000000000001' limit 1)$$,'23514',null,'confirmed milestone requires confirmation event');
select throws_ok($$update public.milestones set confirmation_event_id=null where id=(select id from public.milestones where project_id='02000000-0000-4000-8000-000000000001' limit 1)$$,'23514',null,'confirmation event requires confirmed milestone');
select throws_ok($$update public.milestones set confirmed_status='blocked', blocked_reason=null where id=(select id from public.milestones where project_id='02000000-0000-4000-8000-000000000001' limit 1)$$,'23514',null,'blocked milestone requires blocker reason');
select throws_ok($$update public.milestones set confirmed_status='completed', blocked_reason='orphan blocker' where id=(select id from public.milestones where project_id='02000000-0000-4000-8000-000000000001' limit 1)$$,'23514',null,'non-blocked milestone rejects blocker reason');
select throws_ok($$insert into public.projects(owner_id,title,mode,stage,state_version) values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','bad blocked','new_build','blocked',1)$$,'23514',null,'blocked rows require explicit resume fields');

select * from finish();
rollback;
