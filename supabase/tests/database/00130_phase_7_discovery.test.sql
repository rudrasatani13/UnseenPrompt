begin;

-- Phase 7 database tests run in an isolated Supabase CI database.  Every assertion is
-- intentionally deterministic: the fixed plan below fails if a new contract check is
-- added without updating this acceptance suite.
select plan(155);

insert into auth.users (
  instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,
  raw_app_meta_data,raw_user_meta_data,created_at,updated_at,
  confirmation_token,recovery_token,email_change_token_new,email_change
) values
  ('00000000-0000-0000-0000-000000000000','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','authenticated','authenticated','phase7-a@users.invalid',extensions.crypt('x',extensions.gen_salt('bf')),timezone('utc',now()),'{}','{}',timezone('utc',now()),timezone('utc',now()),'','','',''),
  ('00000000-0000-0000-0000-000000000000','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','authenticated','authenticated','phase7-b@users.invalid',extensions.crypt('x',extensions.gen_salt('bf')),timezone('utc',now()),'{}','{}',timezone('utc',now()),timezone('utc',now()),'','','','');
insert into public.profiles(id,display_name) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','Phase 7 A'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','Phase 7 B');

-- Static contract surface and privilege boundary.
select has_table('public','composer_drafts','composer draft table exists');
select has_table('public','generation_outputs','validated output table exists');
select has_table('public','discovery_inputs','promoted input evidence table exists');
select has_table('public','discovery_sessions','discovery session table exists');
select has_table('public','discovery_assessments','discovery assessment table exists');
select has_table('public','discovery_questions','discovery question table exists');
select has_table('public','discovery_answers','discovery answer table exists');
select has_column('public','generation_runs','subject_kind','generation subject kind exists');
select has_column('public','generation_runs','composer_draft_id','draft generation target exists');
select ok((select is_nullable='YES' from information_schema.columns where table_schema='public' and table_name='generation_runs' and column_name='project_id'),'generation project target is nullable after subject migration');
select ok(exists(select 1 from pg_constraint where conname='generation_runs_subject_xor_chk'),'generation subject xor is constrained');
select ok(exists(select 1 from pg_constraint where conname='generation_runs_intent_subject_chk'),'intent detection is draft-only');
select ok(exists(select 1 from pg_constraint where conname='generation_runs_project_delta_subject_chk'),'project delta is project-only');
select ok(exists(select 1 from pg_indexes where indexname='discovery_questions_one_active_uidx'),'one active question index exists');
select ok(exists(select 1 from pg_indexes where indexname='discovery_answers_one_current_question_uidx'),'one current answer index exists');
select ok(exists(select 1 from pg_indexes where indexname='discovery_answers_one_successor_uidx'),'one answer successor index exists');
select ok((select relrowsecurity from pg_class where oid='public.composer_drafts'::regclass),'draft RLS enabled');
select ok((select relrowsecurity from pg_class where oid='public.discovery_inputs'::regclass),'input evidence RLS enabled');
select ok((select relrowsecurity from pg_class where oid='public.discovery_sessions'::regclass),'session RLS enabled');
select has_function('public','claim_generation_run_v3',array['text','uuid','bigint','text','text','text','text','text'],'v3 generation claim signature exists');
select has_function('public','complete_generation_run_v3',array['uuid','text','text','text','integer','integer','integer','integer','bigint','text','text','text','text'],'v3 generation complete signature exists');
select has_function('public','claim_generation_run_v3_server',array['uuid','text','uuid','bigint','text','text','text','text','text'],'server-only v3 generation claim signature exists');
select has_function('public','complete_generation_run_v3_server',array['uuid','uuid','text','text','text','integer','integer','integer','integer','bigint','text','text','text','text'],'server-only v3 generation complete signature exists');
select has_function('public','claim_generation_run_v2_server',array['uuid','uuid','bigint','text','text','text','text','text'],'server-only v2 generation claim signature exists');
select has_function('public','complete_generation_run_v2_server',array['uuid','uuid','text','text','text','integer','integer','integer','integer','bigint','text','text','text'],'server-only v2 generation complete signature exists');
select has_function('public','create_composer_draft_v1',array['text','text','text'],'draft create signature exists');
select has_function('public','execute_composer_draft_command_v1',array['uuid','bigint','text','text','jsonb'],'draft command signature exists');
select has_function('public','get_discovery_snapshot_v1',array['uuid'],'discovery snapshot signature exists');
select has_function('public','apply_discovery_assessment_v1',array['uuid','uuid','bigint','text','text'],'assessment apply signature exists');
select has_function('public','apply_discovery_question_v1',array['uuid','uuid','bigint','text','text'],'question apply signature exists');
select has_function('public','execute_discovery_command_v1',array['uuid','bigint','text','text','jsonb'],'discovery command signature exists');
select has_function('public','complete_discovery_v1',array['uuid','uuid','bigint','text','text'],'discovery completion signature exists');
select ok(not has_function_privilege('authenticated','public.claim_generation_run_v3(text,uuid,bigint,text,text,text,text,text)','EXECUTE'),'authenticated cannot execute legacy v3 claim');
select ok(not has_function_privilege('authenticated','public.complete_generation_run_v3(uuid,text,text,text,integer,integer,integer,integer,bigint,text,text,text,text)','EXECUTE'),'authenticated cannot execute legacy v3 completion');
select ok(not has_function_privilege('authenticated','public.claim_generation_run_v2(uuid,bigint,text,text,text,text,text)','EXECUTE'),'authenticated cannot execute legacy v2 claim');
select ok(not has_function_privilege('authenticated','public.complete_generation_run_v2(uuid,text,text,text,integer,integer,integer,integer,bigint,text,text,text)','EXECUTE'),'authenticated cannot execute legacy v2 completion');
select ok(has_function_privilege('service_role','public.claim_generation_run_v3_server(uuid,text,uuid,bigint,text,text,text,text,text)','EXECUTE'),'service role can execute server-only v3 claim');
select ok(has_function_privilege('service_role','public.complete_generation_run_v3_server(uuid,uuid,text,text,text,integer,integer,integer,integer,bigint,text,text,text,text)','EXECUTE'),'service role can execute server-only v3 completion');
select ok(has_function_privilege('service_role','public.claim_generation_run_v2_server(uuid,uuid,bigint,text,text,text,text,text)','EXECUTE'),'service role can execute server-only v2 claim');
select ok(has_function_privilege('service_role','public.complete_generation_run_v2_server(uuid,uuid,text,text,text,integer,integer,integer,integer,bigint,text,text,text)','EXECUTE'),'service role can execute server-only v2 completion');
select ok(not has_function_privilege('anon','public.claim_generation_run_v3(text,uuid,bigint,text,text,text,text,text)','EXECUTE'),'anon cannot execute v3 claim');
select ok(has_function_privilege('authenticated','public.create_composer_draft_v1(text,text,text)','EXECUTE'),'authenticated can create drafts');
select ok(not has_function_privilege('anon','public.execute_discovery_command_v1(uuid,bigint,text,text,jsonb)','EXECUTE'),'anon cannot execute discovery commands');
select ok(has_table_privilege('authenticated','public.discovery_inputs','SELECT') and not has_table_privilege('authenticated','public.discovery_inputs','INSERT'),'inputs are select-only to authenticated');
select ok(has_table_privilege('authenticated','public.discovery_answers','SELECT') and not has_table_privilege('authenticated','public.discovery_answers','INSERT'),'answers are select-only to authenticated');
select ok(has_table_privilege('authenticated','public.generation_outputs','SELECT') and not has_table_privilege('authenticated','public.generation_outputs','INSERT'),'outputs are select-only to authenticated');
select ok((select prosecdef from pg_proc where oid='public.claim_generation_run_v3(text,uuid,bigint,text,text,text,text,text)'::regprocedure),'v3 claim is security definer');
select ok((select prosecdef from pg_proc where oid='public.complete_generation_run_v3(uuid,text,text,text,integer,integer,integer,integer,bigint,text,text,text,text)'::regprocedure),'v3 completion is security definer');
select ok((select prosecdef from pg_proc where oid='public.claim_generation_run_v3_server(uuid,text,uuid,bigint,text,text,text,text,text)'::regprocedure),'server v3 claim is security definer');
select ok((select prosecdef from pg_proc where oid='public.complete_generation_run_v3_server(uuid,uuid,text,text,text,integer,integer,integer,integer,bigint,text,text,text,text)'::regprocedure),'server v3 completion is security definer');
select ok((select proconfig @> array['search_path=pg_catalog, public, private'] from pg_proc where oid='public.complete_discovery_v1(uuid,uuid,bigint,text,text)'::regprocedure),'completion pins a safe search path');

select set_config('request.jwt.claim.sub','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',true);
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claims','{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}',true);
set local role authenticated;

select throws_ok($$insert into public.composer_drafts(owner_id,initial_request_text) values('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','direct insert')$$,'42501',null,'authenticated cannot insert drafts directly');
select throws_ok($$select * from public.claim_generation_run_v3('project','00000000-0000-4000-8000-000000000001',1,'unauthenticated-key',repeat('a',64),'intent_detection','unseenprompt.model-gateway-request.v3','unseenprompt.model-output.intent_detection.v1')$$,'42501',null,'authenticated cannot execute legacy v3 claim');
select throws_ok($$select * from public.complete_generation_run_v3('00000000-0000-4000-8000-000000000001','failed','openai','model-phase7',10,4,5,0,1,'failed','provider_error',null,null)$$,'42501',null,'authenticated cannot execute legacy v3 completion');
select throws_ok($$select * from public.claim_generation_run_v2('00000000-0000-4000-8000-000000000001',1,'unauthenticated-v2-key',repeat('a',64),'project_delta','unseenprompt.model-gateway-request.v1','unseenprompt.model-output.project_delta.v1')$$,'42501',null,'authenticated cannot execute legacy v2 claim');
select throws_ok($$select * from public.complete_generation_run_v2('00000000-0000-4000-8000-000000000001','failed','openai','model-phase7',10,4,5,0,1,'failed','provider_error',null)$$,'42501',null,'authenticated cannot execute legacy v2 completion');

-- Generation writes use a service-role client, while the owner identity remains the revalidated
-- request subject. The test transaction grants existing owner-scoped lifecycle helpers to the
-- service role so these assertions exercise the same server-only path end to end.
select set_config('request.jwt.claim.role','service_role',true);
select set_config('request.jwt.claims','{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"service_role"}',true);
reset role;
grant execute on function public.create_composer_draft_v1(text,text,text) to service_role;
grant execute on function public.execute_composer_draft_command_v1(uuid,bigint,text,text,jsonb) to service_role;
grant execute on function public.get_discovery_snapshot_v1(uuid) to service_role;
grant execute on function public.execute_discovery_command_v1(uuid,bigint,text,text,jsonb) to service_role;
grant execute on function public.apply_validated_project_delta_v1(uuid,uuid,bigint) to service_role;
set local role service_role;

-- A failed intent moves the draft into an explicit retry state; retry returns it to routing.
create temporary table tmp_failed_draft as
select public.create_composer_draft_v1('phase7-failed-draft-key',repeat('a',64),'Retry this intent.') as result;
create temporary table tmp_failed_claim as
select * from public.claim_generation_run_v3('composer_draft',(select (result->>'draftId')::uuid from tmp_failed_draft),1,'phase7-failed-intent-key',repeat('b',64),'intent_detection','unseenprompt.model-gateway-request.v3','unseenprompt.model-output.intent_detection.v1');
select lives_ok($$select * from public.complete_generation_run_v3((select run_id from tmp_failed_claim),'failed','openai','model-phase7',10,4,5,0,1,'failed','provider_error',null,null)$$,'failed intent completion is durable');
select is((select status from public.composer_drafts where id=(select (result->>'draftId')::uuid from tmp_failed_draft)),'retry_required','failed intent requires retry');
select is((select version from public.composer_drafts where id=(select (result->>'draftId')::uuid from tmp_failed_draft)),2::bigint,'failed intent advances draft version');
create temporary table tmp_failed_create_replay as
select public.create_composer_draft_v1('phase7-failed-draft-key',repeat('a',64),'Retry this intent.') as result;
select is((select result->>'status' from tmp_failed_create_replay),'retry_required','failed draft create replay preserves retry status');
select is((select result->>'lastErrorCode' from tmp_failed_create_replay),'provider_error','failed draft create replay carries the safe error code');
select is((select result->>'initialRequestText' from tmp_failed_create_replay),'Retry this intent.','failed draft create replay carries internal retry text');
select is((public.execute_composer_draft_command_v1((select (result->>'draftId')::uuid from tmp_failed_draft),2,'phase7-failed-retry-key',repeat('c',64),'{"type":"retry_intent"}'::jsonb)->>'status'),'routing','retry command returns draft to routing');
select is((public.execute_composer_draft_command_v1((select (result->>'draftId')::uuid from tmp_failed_draft),2,'phase7-failed-retry-key',repeat('c',64),'{"type":"retry_intent"}'::jsonb)->>'initialRequestText'),'Retry this intent.','retry receipt carries the original request text');
select is((public.execute_composer_draft_command_v1((select (result->>'draftId')::uuid from tmp_failed_draft),2,'phase7-failed-retry-key',repeat('c',64),'{"type":"retry_intent"}'::jsonb)->>'replayed')::boolean,true,'retry receipt replays the original request text');

-- Main composer request and intent output validation.
create temporary table tmp_draft as
select public.create_composer_draft_v1('phase7-draft-key',repeat('d',64),'Build a multilingual field research notebook.') as result;
select ok((select (result->>'draftId') is not null and result->>'status'='routing' and (result->>'version')::bigint=1 from tmp_draft),'draft is created at version one');
select is((select count(*)::int from public.composer_drafts),2,'owner sees both drafts');
select is((select (public.create_composer_draft_v1('phase7-draft-key',repeat('d',64),'Build a multilingual field research notebook.')->>'replayed')::boolean),true,'draft create replay is idempotent');
select throws_ok($$select public.create_composer_draft_v1('phase7-draft-key',repeat('e',64),'Different request')$$,'P0001','idempotency_conflict','draft idempotency fingerprint conflict is closed');
create temporary table tmp_intent_claim as
select * from public.claim_generation_run_v3('composer_draft',(select (result->>'draftId')::uuid from tmp_draft),1,'phase7-intent-key',repeat('f',64),'intent_detection','unseenprompt.model-gateway-request.v3','unseenprompt.model-output.intent_detection.v1');
select is((select claim_status from tmp_intent_claim),'running','draft intent claim is running');
select is((select subject_kind from tmp_intent_claim),'composer_draft','claim echoes draft subject kind');
select is((select status from public.generation_runs where id=(select run_id from tmp_intent_claim)),'running','draft generation run is persisted');
select throws_ok($$select * from public.complete_generation_run_v3((select run_id from tmp_intent_claim),'succeeded','openai','model-phase7',10,4,5,0,1,'passed',null,null,'{"mode":"new_build","confidence":0.93,"rationale":"bad extra key","detectedLanguage":"en","__proto__":{}}')$$,'P0001','invalid_generation_output','exact intent schema rejects prototype keys');
select is((select status from public.generation_runs where id=(select run_id from tmp_intent_claim)),'running','invalid intent completion leaves run retryable');
create temporary table tmp_intent_complete as
select * from public.complete_generation_run_v3((select run_id from tmp_intent_claim),'succeeded','openai','model-phase7',10,4,5,0,1,'passed',null,null,'{"mode":"new_build","confidence":0.93,"rationale":"The request describes a new product build.","detectedLanguage":"en"}');
select is((select status from tmp_intent_complete),'succeeded','validated intent completion succeeds');
select is((select octet_length(validated_output_text)::int from public.generation_outputs where generation_run_id=(select run_id from tmp_intent_claim)),119,'validated output is bounded and retained');
select is((select validated_output_hash=encode(extensions.digest(convert_to(validated_output_text,'UTF8'),'sha256'),'hex') from public.generation_outputs where generation_run_id=(select run_id from tmp_intent_claim)),true,'output hash is database computed');
create temporary table tmp_intent_replay as
select * from public.claim_generation_run_v3('composer_draft',(select (result->>'draftId')::uuid from tmp_draft),1,'phase7-intent-key',repeat('f',64),'intent_detection','unseenprompt.model-gateway-request.v3','unseenprompt.model-output.intent_detection.v1');
select is((select claim_status from tmp_intent_replay),'replayed','successful intent claim replays durable output');
select is((select validated_output_hash from tmp_intent_replay),(select validated_output_hash from public.generation_outputs where generation_run_id=(select run_id from tmp_intent_claim)),'intent replay echoes hash');
select is((public.execute_composer_draft_command_v1((select (result->>'draftId')::uuid from tmp_draft),1,'phase7-apply-intent',repeat('1',64),jsonb_build_object('type','apply_intent','generationRunId',(select run_id from tmp_intent_claim)))->>'status'),'awaiting_confirmation','intent result enters confirmation');
select is((select detected_mode from public.composer_drafts where id=(select (result->>'draftId')::uuid from tmp_draft)),'new_build','intent mode is persisted');
create temporary table tmp_awaiting_create_replay as
select public.create_composer_draft_v1('phase7-draft-key',repeat('d',64),'Build a multilingual field research notebook.') as result;
select is((select result->>'status' from tmp_awaiting_create_replay),'awaiting_confirmation','awaiting draft create replay preserves confirmation status');
select is((select result->'intent'->>'mode' from tmp_awaiting_create_replay),'new_build','awaiting draft create replay carries the detected intent');
select is((public.execute_composer_draft_command_v1((select (result->>'draftId')::uuid from tmp_draft),2,'phase7-promote',repeat('2',64),jsonb_build_object('type','confirm_and_promote','confirmedMode','new_build','confirmedTitle','Field Notebook'))->>'status'),'promoted','draft promotion succeeds');
create temporary table tmp_project as select project_id::uuid as project_id from public.composer_drafts where id=(select (result->>'draftId')::uuid from tmp_draft);
select is((select stage from public.projects where id=(select project_id from tmp_project)),'discovery','promoted project starts in discovery');
select is((select state_version from public.projects where id=(select project_id from tmp_project)),2::bigint,'promotion appends discovery.started at version two');
select is((select count(*)::int from public.discovery_sessions where project_id=(select project_id from tmp_project)),1,'promotion creates one discovery session');
select is((select count(*)::int from public.discovery_inputs where project_id=(select project_id from tmp_project) and source='initial_request'),1,'promotion persists the initial request as evidence');
select ok((select input_text='Build a multilingual field research notebook.' from public.discovery_inputs where project_id=(select project_id from tmp_project)),'input evidence retains source text');
select ok((select payload ?& array['schemaVersion','sessionId','sourceDraftId','appliedStateVersion'] and not (payload ? 'initialRequestText') from public.project_events where project_id=(select project_id from tmp_project) and event_type='discovery.started'),'started event is metadata-only');
select is((public.execute_composer_draft_command_v1((select (result->>'draftId')::uuid from tmp_draft),2,'phase7-promote',repeat('2',64),jsonb_build_object('type','confirm_and_promote','confirmedMode','new_build','confirmedTitle','Field Notebook'))->>'replayed')::boolean,true,'promotion replay ignores the advanced draft version');

-- The legacy V2 project-delta path remains available to the server gateway only.
create temporary table tmp_v2_server_claim as
select * from public.claim_generation_run_v2_server(
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  (select project_id from tmp_project),
  2,
  'phase7-v2-server-key',
  repeat('2',64),
  'project_delta',
  'unseenprompt.model-gateway-request.v1',
  'unseenprompt.model-output.project_delta.v1'
);
select is((select claim_status from tmp_v2_server_claim),'running','server-only v2 claim is running');
select lives_ok($$select * from public.complete_generation_run_v2_server(
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  (select run_id from tmp_v2_server_claim),
  'succeeded','openai','model-phase7',10,4,5,0,1,'passed',null,
  '{"summary":"Server-only proposal","requirementProposals":[],"decisionProposals":[],"milestoneProposals":[],"unresolvedConflicts":[]}'
)$$,'server-only v2 completion persists a validated project delta');
select is((select status from public.generation_runs where id=(select run_id from tmp_v2_server_claim)),'succeeded','server-only v2 completion is durable');

-- First sufficiency assessment and question.
create temporary table tmp_suff_claim as
select * from public.claim_generation_run_v3('project',(select project_id from tmp_project),2,'phase7-suff-key',repeat('3',64),'discovery_sufficiency','unseenprompt.model-gateway-request.v3','unseenprompt.model-output.discovery_sufficiency.v1');
select throws_ok($$select * from public.complete_generation_run_v3((select run_id from tmp_suff_claim),'succeeded','openai','model-phase7',10,4,5,0,1,'passed',null,null,'{"isSufficient":true,"confidence":0.95,"missingFacts":["audience"],"rationale":"bad policy shape","extra":true}')$$,'P0001','invalid_generation_output','sufficiency output shape is validated before persistence');
select lives_ok($$select * from public.complete_generation_run_v3((select run_id from tmp_suff_claim),'succeeded','openai','model-phase7',10,4,5,0,1,'passed',null,null,'{"isSufficient":false,"confidence":0.4,"missingFacts":["audience","problem"],"rationale":"The audience and problem need clarification."}')$$,'insufficient assessment completion succeeds');
select is((public.apply_discovery_assessment_v1((select project_id from tmp_project),(select run_id from tmp_suff_claim),2,'phase7-assess-key',repeat('4',64))->>'status'),'active','insufficient assessment keeps discovery active');
select is((select state_version from public.projects where id=(select project_id from tmp_project)),3::bigint,'assessment increments project state');
select is((public.apply_discovery_assessment_v1((select project_id from tmp_project),(select run_id from tmp_suff_claim),2,'phase7-assess-key',repeat('4',64))->>'replayed')::boolean,true,'assessment replay ignores the advanced project version');
create temporary table tmp_question_claim as
select * from public.claim_generation_run_v3('project',(select project_id from tmp_project),3,'phase7-question-key',repeat('5',64),'clarification_question','unseenprompt.model-gateway-request.v3','unseenprompt.model-output.clarification_question.v1');
select lives_ok($$select * from public.complete_generation_run_v3((select run_id from tmp_question_claim),'succeeded','openai','model-phase7',10,4,5,0,1,'passed',null,null,'{"question":"Who will use this notebook?","rationale":"The audience determines the first workflow.","suggestedAnswers":[{"label":"Field researchers","value":"field researchers"}],"allowsFreeText":true}')$$,'question completion succeeds');
select is((public.apply_discovery_question_v1((select project_id from tmp_project),(select run_id from tmp_question_claim),3,'phase7-question-apply-key',repeat('6',64))->>'stateVersion')::bigint,4::bigint,'question application increments state');
select is((select count(*)::int from public.discovery_questions where project_id=(select project_id from tmp_project) and status='active'),1,'one active question is persisted');
select is((select question_fingerprint from public.discovery_questions where project_id=(select project_id from tmp_project)),encode(extensions.digest(convert_to('who will use this notebook?','UTF8'),'sha256'),'hex'),'question fingerprint follows canonical lowercase text');
select is((public.apply_discovery_question_v1((select project_id from tmp_project),(select run_id from tmp_question_claim),3,'phase7-question-apply-key',repeat('6',64))->>'replayed')::boolean,true,'question replay ignores the advanced project version');

-- Confirm, then revise the answer after a later question has been derived.  Revision must free
-- the old current-answer index first and invalidate all newer derived questions/assessments.
create temporary table tmp_answer_command as
select public.execute_discovery_command_v1((select project_id from tmp_project),4,'phase7-answer-key',repeat('7',64),jsonb_build_object('type','confirm_answer','questionId',(select id from public.discovery_questions where project_id=(select project_id from tmp_project) and status='active'),'source','suggested','answerText','field researchers')) as result;
select is(((select result from tmp_answer_command)->>'stateVersion')::bigint,5::bigint,'answer confirmation increments state');
select is((select count(*)::int from public.discovery_answers where project_id=(select project_id from tmp_project) and status='confirmed'),1,'confirmed answer is immutable evidence');
select is((select status from public.discovery_questions where project_id=(select project_id from tmp_project) and basis_state_version=3),'answered','answered question is no longer active');
select is((public.execute_discovery_command_v1((select project_id from tmp_project),4,'phase7-answer-key',repeat('7',64),jsonb_build_object('type','confirm_answer','questionId',(select id from public.discovery_questions where project_id=(select project_id from tmp_project) and status='answered'),'source','suggested','answerText','field researchers'))->>'replayed')::boolean,true,'answer replay ignores the advanced project version');
select throws_ok($$select public.execute_discovery_command_v1((select project_id from tmp_project),4,'phase7-stale-answer',repeat('8',64),jsonb_build_object('type','advance_discovery'))$$,'P0001','stale_state_version','stale discovery command is rejected');

create temporary table tmp_suff_claim_2 as
select * from public.claim_generation_run_v3('project',(select project_id from tmp_project),5,'phase7-suff-key-2',repeat('9',64),'discovery_sufficiency','unseenprompt.model-gateway-request.v3','unseenprompt.model-output.discovery_sufficiency.v1');
select lives_ok($$select * from public.complete_generation_run_v3((select run_id from tmp_suff_claim_2),'succeeded','openai','model-phase7',10,4,5,0,1,'passed',null,null,'{"isSufficient":false,"confidence":0.7,"missingFacts":["constraints"],"rationale":"Constraints still need clarification."}')$$,'second insufficient assessment completion succeeds');
select is((public.apply_discovery_assessment_v1((select project_id from tmp_project),(select run_id from tmp_suff_claim_2),5,'phase7-assess-key-2',repeat('a',64))->>'status'),'active','second insufficient assessment keeps discovery active');
select is((select state_version from public.projects where id=(select project_id from tmp_project)),6::bigint,'second assessment increments state');
create temporary table tmp_question_claim_2 as
select * from public.claim_generation_run_v3('project',(select project_id from tmp_project),6,'phase7-question-key-2',repeat('b',64),'clarification_question','unseenprompt.model-gateway-request.v3','unseenprompt.model-output.clarification_question.v1');
select lives_ok($$select * from public.complete_generation_run_v3((select run_id from tmp_question_claim_2),'succeeded','openai','model-phase7',10,4,5,0,1,'passed',null,null,'{"question":"Which constraints should the first release respect?","rationale":"The implementation boundary is still open.","suggestedAnswers":[{"label":"Offline first","value":"offline"}],"allowsFreeText":true}')$$,'second question completion succeeds');
select is((public.apply_discovery_question_v1((select project_id from tmp_project),(select run_id from tmp_question_claim_2),6,'phase7-question-apply-key-2',repeat('c',64))->>'stateVersion')::bigint,7::bigint,'second question application increments state');
create temporary table tmp_revision_command as
select public.execute_discovery_command_v1((select project_id from tmp_project),7,'phase7-revise-key',repeat('d',64),jsonb_build_object('type','revise_answer','questionId',(select id from public.discovery_questions where project_id=(select project_id from tmp_project) and basis_state_version=3),'predecessorAnswerId',(select id from public.discovery_answers where project_id=(select project_id from tmp_project) and status='confirmed'),'source','free_text','answerText','field researchers working offline')) as result;
select is(((select result from tmp_revision_command)->>'stateVersion')::bigint,8::bigint,'answer revision increments state');
select is((select count(*)::int from public.discovery_answers where project_id=(select project_id from tmp_project) and status='confirmed'),1,'revision leaves exactly one current answer');
select is((select count(*)::int from public.discovery_answers where project_id=(select project_id from tmp_project) and status='superseded'),1,'revision supersedes the predecessor answer');
select is((select status from public.discovery_questions where project_id=(select project_id from tmp_project) and basis_state_version=6),'superseded','revision invalidates a newer derived question');
select is((select status from public.discovery_sessions where project_id=(select project_id from tmp_project)),'active','revision reactivates discovery');
select is((select latest_assessment_id from public.discovery_sessions where project_id=(select project_id from tmp_project)),null::uuid,'revision clears stale latest assessment pointer');
select is((public.execute_discovery_command_v1((select project_id from tmp_project),7,'phase7-revise-key',repeat('d',64),jsonb_build_object('type','revise_answer','questionId',(select id from public.discovery_questions where project_id=(select project_id from tmp_project) and basis_state_version=3),'predecessorAnswerId',(select id from public.discovery_answers where project_id=(select project_id from tmp_project) and status='superseded'),'source','free_text','answerText','field researchers working offline'))->>'replayed')::boolean,true,'revision replay ignores the advanced project version');

-- A correction is not a generated question turn. At the ceiling it remains a valid immutable
-- successor operation rather than overflowing the bounded session counter.
savepoint phase7_max_correction;
update public.discovery_sessions set status='sufficient',confirmed_turn_count=12 where project_id=(select project_id from tmp_project);
select lives_ok($$select public.execute_discovery_command_v1((select project_id from tmp_project),8,'phase7-max-revise-key',repeat('e',64),jsonb_build_object('type','revise_answer','questionId',(select id from public.discovery_questions where project_id=(select project_id from tmp_project) and basis_state_version=3),'predecessorAnswerId',(select id from public.discovery_answers where project_id=(select project_id from tmp_project) and status='confirmed'),'source','free_text','answerText','field researchers on the move'))$$,'correction succeeds at the generated-question ceiling');
rollback to savepoint phase7_max_correction;
select is((select confirmed_turn_count from public.discovery_sessions where project_id=(select project_id from tmp_project)),2,'correction does not consume a generated-question turn');

-- Final sufficient assessment and delta handoff.  Completion rejects both un-applied deltas and
-- proposals outside the Phase 8 requirement-only boundary.
create temporary table tmp_suff_claim_3 as
select * from public.claim_generation_run_v3('project',(select project_id from tmp_project),8,'phase7-suff-key-3',repeat('e',64),'discovery_sufficiency','unseenprompt.model-gateway-request.v3','unseenprompt.model-output.discovery_sufficiency.v1');
select lives_ok($$select * from public.complete_generation_run_v3((select run_id from tmp_suff_claim_3),'succeeded','openai','model-phase7',10,4,5,0,1,'passed',null,null,'{"isSufficient":true,"confidence":0.950000000000000001,"missingFacts":[],"rationale":"The request and corrected answer provide sufficient initial context."}')$$,'final sufficient assessment completion preserves high precision confidence');
select is((public.apply_discovery_assessment_v1((select project_id from tmp_project),(select run_id from tmp_suff_claim_3),8,'phase7-assess-key-3',repeat('f',64))->>'status'),'sufficient','deterministic sufficiency gate passes');
select is((select state_version from public.projects where id=(select project_id from tmp_project)),9::bigint,'final assessment increments state');
create temporary table tmp_delta_claim as
select * from public.claim_generation_run_v2_server('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',(select project_id from tmp_project),9,'phase7-delta-key',repeat('1',64),'project_delta','unseenprompt.model-gateway-request.v1','unseenprompt.model-output.project_delta.v1');
select lives_ok($$select * from public.complete_generation_run_v2_server('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',(select run_id from tmp_delta_claim),'succeeded','openai','model-phase7',10,4,5,0,1,'passed',null,'{"summary":"English discovery proposal","requirementProposals":[{"action":"add","reference":"","statement":"The notebook supports field researchers working offline.","rationale":"The confirmed discovery context identifies the audience and constraint."}],"decisionProposals":[],"milestoneProposals":[],"unresolvedConflicts":[]}')$$,'project delta remains on the existing validated path');
select lives_ok($$select public.apply_validated_project_delta_v1((select project_id from tmp_project),(select run_id from tmp_delta_claim),9)$$,'validated project delta applies once');
select is((select state_version from public.projects where id=(select project_id from tmp_project)),10::bigint,'delta application increments state');
select is((select count(*)::int from public.project_delta_applications where project_id=(select project_id from tmp_project) and generation_run_id=(select run_id from tmp_delta_claim)),1,'delta application receipt is durable');
create temporary table tmp_delta_bad as
select * from public.claim_generation_run_v2_server('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',(select project_id from tmp_project),10,'phase7-delta-bad-key',repeat('2',64),'project_delta','unseenprompt.model-gateway-request.v1','unseenprompt.model-output.project_delta.v1');
select lives_ok($$select * from public.complete_generation_run_v2_server('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',(select run_id from tmp_delta_bad),'succeeded','openai','model-phase7',10,4,5,0,1,'passed',null,'{"summary":"Boundary test","requirementProposals":[{"action":"add","reference":"","statement":"A requirement.","rationale":"Evidence."}],"decisionProposals":[{"action":"add","reference":"","statement":"A decision must not cross the boundary.","rationale":"Boundary test."}],"milestoneProposals":[],"unresolvedConflicts":[]}')$$,'boundary-test delta is valid Phase 6 output');
select throws_ok($$select public.complete_discovery_v1((select project_id from tmp_project),(select run_id from tmp_delta_bad),10,'phase7-complete-bad-key',repeat('3',64))$$,'P0001','proposal_incomplete','completion rejects decision proposals at the Phase 8 boundary');
create temporary table tmp_delta_unapplied as
select * from public.claim_generation_run_v2_server('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',(select project_id from tmp_project),10,'phase7-delta-unapplied-key',repeat('4',64),'project_delta','unseenprompt.model-gateway-request.v1','unseenprompt.model-output.project_delta.v1');
select lives_ok($$select * from public.complete_generation_run_v2_server('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',(select run_id from tmp_delta_unapplied),'succeeded','openai','model-phase7',10,4,5,0,1,'passed',null,'{"summary":"English discovery proposal","requirementProposals":[{"action":"add","reference":"","statement":"The notebook supports field researchers working offline.","rationale":"The confirmed discovery context identifies the audience and constraint."}],"decisionProposals":[],"milestoneProposals":[],"unresolvedConflicts":[]}')$$,'unapplied delta completion is valid');
select throws_ok($$select public.complete_discovery_v1((select project_id from tmp_project),(select run_id from tmp_delta_unapplied),10,'phase7-complete-unapplied-key',repeat('5',64))$$,'P0001','proposal_not_applied','completion requires a matching Phase 6 apply receipt');
select lives_ok($$select public.apply_validated_project_delta_v1((select project_id from tmp_project),(select run_id from tmp_delta_unapplied),10)$$,'matching delta applies before handoff');
select is((public.complete_discovery_v1((select project_id from tmp_project),(select run_id from tmp_delta_unapplied),11,'phase7-complete-key',repeat('6',64))->>'stateVersion')::bigint,12::bigint,'completion appends one event/version');
select is((public.complete_discovery_v1((select project_id from tmp_project),(select run_id from tmp_delta_unapplied),11,'phase7-complete-key',repeat('6',64))->>'replayed')::boolean,true,'completion replay ignores the advanced stage/version');
select is((select stage from public.projects where id=(select project_id from tmp_project)),'brief_confirmation','discovery hands off to Phase 8');
select is((select status from public.discovery_sessions where project_id=(select project_id from tmp_project)),'completed','session is completed');
select is((select count(*)::int from public.project_events where project_id=(select project_id from tmp_project) and event_type like 'discovery.%' and actor_type='user'),9,'all discovery transitions have user actor events');

-- The retrying draft can still be promoted later; abandon/resume are explicit, replayable
-- lifecycle transitions and do not mutate the original request evidence.
create temporary table tmp_retry_claim as
select * from public.claim_generation_run_v3('composer_draft',(select (result->>'draftId')::uuid from tmp_failed_draft),3,'phase7-retry-intent-key',repeat('8',64),'intent_detection','unseenprompt.model-gateway-request.v3','unseenprompt.model-output.intent_detection.v1');
select is((select claim_status from tmp_retry_claim),'running','retried intent claim is running');
select lives_ok($$select * from public.complete_generation_run_v3((select run_id from tmp_retry_claim),'succeeded','openai','model-phase7',10,4,5,0,1,'passed',null,null,'{"mode":"new_build","confidence":0.91,"rationale":"Retry succeeded.","detectedLanguage":"en"}')$$,'retried intent completion succeeds');
select is((public.execute_composer_draft_command_v1((select (result->>'draftId')::uuid from tmp_failed_draft),3,'phase7-retry-apply-key',repeat('9',64),jsonb_build_object('type','apply_intent','generationRunId',(select run_id from tmp_retry_claim)))->>'status'),'awaiting_confirmation','retried intent can be applied');
select is((public.execute_composer_draft_command_v1((select (result->>'draftId')::uuid from tmp_failed_draft),4,'phase7-retry-promote-key',repeat('a',64),jsonb_build_object('type','confirm_and_promote','confirmedMode','new_build','confirmedTitle','Retry Notebook'))->>'status'),'promoted','retried draft can be promoted');
create temporary table tmp_retry_project as select project_id::uuid as project_id from public.composer_drafts where id=(select (result->>'draftId')::uuid from tmp_failed_draft);
select is((public.execute_discovery_command_v1((select project_id from tmp_retry_project),2,'phase7-abandon-key',repeat('b',64),'{"type":"abandon_discovery"}'::jsonb)->>'stateVersion')::bigint,3::bigint,'abandon appends a state version');
select is((select status from public.discovery_sessions where project_id=(select project_id from tmp_retry_project)),'abandoned','abandon marks the session abandoned');
select is((public.execute_discovery_command_v1((select project_id from tmp_retry_project),3,'phase7-resume-key',repeat('c',64),'{"type":"resume_discovery"}'::jsonb)->>'stateVersion')::bigint,4::bigint,'resume appends a state version');
select is((select status from public.discovery_sessions where project_id=(select project_id from tmp_retry_project)),'active','resume returns the session to active');
select is((public.execute_discovery_command_v1((select project_id from tmp_retry_project),2,'phase7-abandon-key',repeat('b',64),'{"type":"abandon_discovery"}'::jsonb)->>'replayed')::boolean,true,'abandon replay ignores the advanced project version');

-- Unknown discovery event names are closed by the event trigger even for service-role writes.
select set_config('phase7.test_project_id',(select project_id::text from tmp_project),true);
set local role service_role;
select throws_ok($$insert into public.project_events(project_id,sequence_number,event_type,actor_type,actor_id,payload) values(current_setting('phase7.test_project_id')::uuid,999,'discovery.unknown','user','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','{}'::jsonb)$$,'P0001','invalid_discovery_event_payload','unknown discovery event names are rejected');
reset role;
set local role authenticated;

-- Cross-tenant reads and writes disclose neither records nor ownership details.
select set_config('request.jwt.claim.sub','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',true);
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claims','{"sub":"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb","role":"authenticated"}',true);
select is((select count(*)::int from public.composer_drafts),0,'foreign owner cannot see drafts');
select is((select count(*)::int from public.discovery_inputs),0,'foreign owner cannot see input evidence');
select is((select count(*)::int from public.discovery_sessions),0,'foreign owner cannot see sessions');
select throws_ok($$select public.get_discovery_snapshot_v1(current_setting('phase7.test_project_id')::uuid)$$,'P0001','discovery_not_found','foreign snapshot does not disclose project');
select throws_ok($$select public.execute_discovery_command_v1(current_setting('phase7.test_project_id')::uuid,12,'phase7-cross-owner',repeat('7',64),'{"type":"resume_discovery"}'::jsonb)$$,'P0001','project_not_found','foreign command does not disclose project');
reset role;

select * from finish();
rollback;
