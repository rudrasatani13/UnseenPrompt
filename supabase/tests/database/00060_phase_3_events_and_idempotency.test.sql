begin;

select plan(22);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change
) values (
  '00000000-0000-0000-0000-000000000000',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  'authenticated', 'authenticated', 'atomic@users.invalid',
  extensions.crypt('x', extensions.gen_salt('bf')),
  timezone('utc', now()), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
  timezone('utc', now()), timezone('utc', now()), '', '', '', ''
);

insert into public.profiles (id, display_name)
values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Atomic User');

-- Authenticated create_project
select set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}', true);
set local role authenticated;

select lives_ok(
  $$select public.create_project(
      'create-key-1',
      'fp-create-1',
      'Atomic Project',
      'new_build',
      'cursor'
    )$$,
  'create_project succeeds'
);

select is(
  (
    select (public.create_project(
      'create-key-1',
      'fp-create-1',
      'Atomic Project',
      'new_build',
      'cursor'
    ) ->> 'replayed')::boolean
  ),
  true,
  'create_project retry replays original'
);

select is(
  (select count(*)::int from public.projects),
  1,
  'retry creates no duplicate project'
);

select throws_ok(
  $$select public.create_project(
      'create-key-1',
      'fp-create-DIFFERENT',
      'Atomic Project',
      'new_build',
      'cursor'
    )$$,
  'P0001',
  'idempotency_fingerprint_conflict',
  'same key different fingerprint fails'
);

-- In-progress claim from another session blocks; after rollback a later claim wins.
reset role;
insert into public.idempotency_records (
  owner_id, scope, idempotency_key, request_fingerprint, status
) values (
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  'lifecycle',
  'create-key-in-progress',
  'fp-in-progress',
  'in_progress'
);

select set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}', true);
set local role authenticated;

select throws_ok(
  $$select public.create_project(
      'create-key-in-progress',
      'fp-in-progress',
      'Blocked Project',
      'review',
      null
    )$$,
  'P0001',
  'idempotency_in_progress',
  'in-progress claim rejects concurrent create'
);

reset role;
delete from public.idempotency_records where idempotency_key = 'create-key-in-progress';

select set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}', true);
set local role authenticated;

select lives_ok(
  $$select public.create_project(
      'create-key-in-progress',
      'fp-in-progress',
      'Recovered After Rollback',
      'review',
      null
    )$$,
  'after in-progress claim is cleared, create succeeds'
);

-- Capture project id for commit tests (original atomic project)
create temporary table tmp_project as
select id, state_version, title, mode, stage, selected_tool
from public.projects
where title = 'Atomic Project'
limit 1;

select is(
  (select count(*)::int from public.project_events pe
   join tmp_project tp on tp.id = pe.project_id
   where pe.sequence_number = 1 and pe.event_type = 'project.created'),
  1,
  'creation event sequence 1 present'
);

select lives_ok(
  $$select public.commit_project_change(
      (select id from tmp_project),
      (select state_version from tmp_project),
      'commit-key-1',
      'fp-commit-1',
      'project.stage_changed',
      '{"from":"discovery","to":"brief_confirmation"}'::jsonb,
      (select title from tmp_project),
      (select mode from tmp_project),
      'brief_confirmation',
      (select selected_tool from tmp_project),
      null,
      null,
      null
    )$$,
  'commit_project_change succeeds'
);

select is(
  (select state_version from public.projects where id = (select id from tmp_project)),
  2::bigint,
  'state_version advanced to 2'
);

select is(
  (
    select max(sequence_number) from public.project_events
    where project_id = (select id from tmp_project)
  ),
  2::bigint,
  'event sequence matches state_version'
);

-- Creation-key replay after projection advanced still returns original version 1.
select is(
  (
    select (public.create_project(
      'create-key-1',
      'fp-create-1',
      'Atomic Project',
      'new_build',
      'cursor'
    ) ->> 'state_version')::bigint
  ),
  1::bigint,
  'create replay after commit returns original state_version 1'
);

select is(
  (select state_version from public.projects where id = (select id from tmp_project)),
  2::bigint,
  'create replay does not rewrite current projection version'
);

select is(
  (
    select (public.commit_project_change(
      (select id from tmp_project),
      2,
      'commit-key-1',
      'fp-commit-1',
      'project.stage_changed',
      '{"from":"discovery","to":"brief_confirmation"}'::jsonb,
      (select title from tmp_project),
      (select mode from tmp_project),
      'brief_confirmation',
      (select selected_tool from tmp_project),
      null,
      null,
      null
    ) ->> 'replayed')::boolean
  ),
  true,
  'commit retry returns original result'
);

select is(
  (select count(*)::int from public.project_events where project_id = (select id from tmp_project)),
  2,
  'commit retry creates no extra event'
);

select throws_ok(
  $$select public.commit_project_change(
      (select id from tmp_project),
      1,
      'commit-key-stale',
      'fp-stale',
      'project.stage_changed',
      '{}'::jsonb,
      (select title from tmp_project),
      (select mode from tmp_project),
      'ready_for_prompt',
      null,
      null,
      null,
      null
    )$$,
  'P0001',
  'stale_state_version',
  'stale expected version rejected'
);

select throws_ok(
  $$select public.commit_project_change(
      (select id from tmp_project),
      2,
      'commit-key-1',
      'fp-commit-OTHER',
      'project.stage_changed',
      '{}'::jsonb,
      (select title from tmp_project),
      (select mode from tmp_project),
      'ready_for_prompt',
      null,
      null,
      null,
      null
    )$$,
  'P0001',
  'idempotency_fingerprint_conflict',
  'commit fingerprint conflict rejected'
);

-- Reusing a create_project success key for commit is a resource mismatch, not a null replay.
select throws_ok(
  $$select public.commit_project_change(
      (select id from tmp_project),
      2,
      'create-key-1',
      'fp-create-1',
      'project.stage_changed',
      '{}'::jsonb,
      (select title from tmp_project),
      (select mode from tmp_project),
      'ready_for_prompt',
      null,
      null,
      null,
      null
    )$$,
  'P0001',
  'idempotency_resource_mismatch',
  'create key cannot be replayed as commit'
);

reset role;

-- Corrupt resource linkage must not return replayed success with null identifiers.
update public.idempotency_records
set resource_id = '99999999-9999-4999-8999-999999999999'
where idempotency_key = 'commit-key-1';

select set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}', true);
set local role authenticated;

select throws_ok(
  $$select public.commit_project_change(
      (select id from tmp_project),
      2,
      'commit-key-1',
      'fp-commit-1',
      'project.stage_changed',
      '{"from":"discovery","to":"brief_confirmation"}'::jsonb,
      (select title from tmp_project),
      (select mode from tmp_project),
      'brief_confirmation',
      (select selected_tool from tmp_project),
      null,
      null,
      null
    )$$,
  'P0001',
  'idempotency_event_missing',
  'missing replay event is an error, not null success'
);

reset role;

-- Restore linkage for later forced-failure assertions
update public.idempotency_records ir
set resource_id = pe.id
from public.project_events pe
where ir.idempotency_key = 'commit-key-1'
  and pe.project_id = (select id from tmp_project)
  and pe.sequence_number = 2;

-- Forced failure after event insert rolls back projection + event + success claim
create or replace function public.__test_fail_project_update()
returns trigger
language plpgsql
as $$
begin
  if new.state_version > 2 then
    raise exception 'forced_test_failure' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger __test_fail_project_update
before update on public.projects
for each row
execute function public.__test_fail_project_update();

select set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}', true);
set local role authenticated;

select throws_ok(
  $$select public.commit_project_change(
      (select id from tmp_project),
      2,
      'commit-key-fail',
      'fp-fail',
      'project.stage_changed',
      '{}'::jsonb,
      (select title from tmp_project),
      (select mode from tmp_project),
      'ready_for_prompt',
      null,
      null,
      null,
      null
    )$$,
  'P0001',
  'forced_test_failure',
  'forced failure raises'
);

reset role;

select is(
  (select state_version from public.projects where id = (select id from tmp_project)),
  2::bigint,
  'failed commit left state_version unchanged'
);

select is(
  (select count(*)::int from public.project_events where project_id = (select id from tmp_project)),
  2,
  'failed commit left no partial event'
);

select is(
  (
    select count(*)::int from public.idempotency_records
    where idempotency_key = 'commit-key-fail' and status = 'succeeded'
  ),
  0,
  'failed commit did not mark idempotency succeeded'
);

drop trigger if exists __test_fail_project_update on public.projects;
drop function if exists public.__test_fail_project_update();

select * from finish();
rollback;
