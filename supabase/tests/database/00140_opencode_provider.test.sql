begin;

-- The OpenCode Go provider (id `opencode`) extends the closed provider allowlist enforced
-- inline by the generation completion RPCs. These assertions prove the RPCs accept the new
-- provider end to end on the live v3 path while still rejecting unknown provider ids.
select plan(13);

insert into auth.users (
  instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,
  raw_app_meta_data,raw_user_meta_data,created_at,updated_at,
  confirmation_token,recovery_token,email_change_token_new,email_change
) values
  ('00000000-0000-0000-0000-000000000000','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','authenticated','authenticated','opencode-a@users.invalid',extensions.crypt('x',extensions.gen_salt('bf')),timezone('utc',now()),'{}','{}',timezone('utc',now()),timezone('utc',now()),'','','','');
insert into public.profiles(id,display_name) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','OpenCode A');

select has_function('public','complete_generation_run',array['uuid','text','text','text','integer','integer','integer','integer','bigint','text','text'],'v1 completion signature survives provider extension');
select has_function('public','complete_generation_run_v2',array['uuid','text','text','text','integer','integer','integer','integer','bigint','text','text','text'],'v2 completion signature survives provider extension');
select has_function('public','complete_generation_run_v3_server',array['uuid','uuid','text','text','text','integer','integer','integer','integer','bigint','text','text','text','text'],'server v3 completion signature survives provider extension');

-- Live v3 path: a service-role client completes an intent detection run with the OpenCode Go
-- provider and the staging deepseek-v4-flash route.
select set_config('request.jwt.claim.sub','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',true);
select set_config('request.jwt.claim.role','service_role',true);
select set_config('request.jwt.claims','{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"service_role"}',true);
grant execute on function public.create_composer_draft_v1(text,text,text) to service_role;
set local role service_role;

create temporary table tmp_opencode_draft as
select public.create_composer_draft_v1('opencode-draft-key',repeat('a',64),'Route this intent through OpenCode Go.') as result;
create temporary table tmp_opencode_claim as
select * from public.claim_generation_run_v3('composer_draft',(select (result->>'draftId')::uuid from tmp_opencode_draft),1,'opencode-intent-key',repeat('b',64),'intent_detection','unseenprompt.model-gateway-request.v3','unseenprompt.model-output.intent_detection.v1');
select lives_ok($$select * from public.complete_generation_run_v3((select run_id from tmp_opencode_claim),'succeeded','opencode','deepseek-v4-flash',10,4,5,0,1,'passed',null,null,'{"mode":"new_build","confidence":0.93,"rationale":"The OpenCode Go provider completes intent detection.","detectedLanguage":"en"}')$$,'opencode provider completes a v3 intent run');
select is((select provider from public.generation_runs where id=(select run_id from tmp_opencode_claim)),'opencode','opencode provider is persisted on the run');
select is((select model from public.generation_runs where id=(select run_id from tmp_opencode_claim)),'deepseek-v4-flash','opencode model is persisted on the run');
select is((select status from public.generation_runs where id=(select run_id from tmp_opencode_claim)),'succeeded','opencode completion reaches the terminal state');

-- Unknown providers remain rejected before any run lookup; `opencode` passes the same gate and
-- only then fails with the stable owner-derived not-found error.
select throws_ok($$select * from public.complete_generation_run_v3('00000000-0000-4000-8000-000000000001','failed','provider-x','model-x',10,4,5,0,1,'failed','provider_error',null,null)$$,'P0001','invalid_provider','v3 completion still rejects unknown providers');
select throws_ok($$select * from public.complete_generation_run_v3('00000000-0000-4000-8000-000000000001','failed','opencode','deepseek-v4-flash',10,4,5,0,1,'failed','provider_error',null,null)$$,'P0001','generation_run_not_found_or_not_owned','v3 completion accepts opencode past the provider gate');

-- Retired v1/v2 completions share the extended allowlist; the owner session calls them as the
-- migration owner because phase 7 revoked direct EXECUTE from the API roles.
reset role;
select throws_ok($$select * from public.complete_generation_run_v2('00000000-0000-4000-8000-000000000001','failed','provider-x','model-x',10,4,5,0,1,'failed','provider_error',null)$$,'P0001','invalid_provider','v2 completion still rejects unknown providers');
select throws_ok($$select * from public.complete_generation_run_v2('00000000-0000-4000-8000-000000000001','failed','opencode','deepseek-v4-flash',10,4,5,0,1,'failed','provider_error',null)$$,'P0001','generation_run_not_found_or_not_owned','v2 completion accepts opencode past the provider gate');
select throws_ok($$select * from public.complete_generation_run('00000000-0000-4000-8000-000000000001','failed','provider-x','model-x',10,4,5,0,1,'failed','provider_error')$$,'P0001','invalid_provider','v1 completion still rejects unknown providers');
select throws_ok($$select * from public.complete_generation_run('00000000-0000-4000-8000-000000000001','failed','opencode','deepseek-v4-flash',10,4,5,0,1,'failed','provider_error')$$,'P0001','generation_run_not_found_or_not_owned','v1 completion accepts opencode past the provider gate');

select * from finish();
rollback;
