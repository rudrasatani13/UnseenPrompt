-- Deterministic synthetic seed for non-production realms only.
-- Never run against production. No real emails, secrets, passwords, or waitlist rows.

-- Synthetic auth identities without password credentials (reserved .invalid domain).
insert into auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at,
  confirmation_token,
  recovery_token,
  email_change_token_new,
  email_change,
  is_sso_user
)
values
  (
    '00000000-0000-0000-0000-000000000000',
    '11111111-1111-1111-1111-111111111111',
    'authenticated',
    'authenticated',
    'beginner@users.invalid',
    null,
    timezone('utc', now()),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{}'::jsonb,
    timezone('utc', now()),
    timezone('utc', now()),
    '',
    '',
    '',
    '',
    false
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '22222222-2222-2222-2222-222222222222',
    'authenticated',
    'authenticated',
    'intermediate@users.invalid',
    null,
    timezone('utc', now()),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{}'::jsonb,
    timezone('utc', now()),
    timezone('utc', now()),
    '',
    '',
    '',
    '',
    false
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '33333333-3333-3333-3333-333333333333',
    'authenticated',
    'authenticated',
    'advanced@users.invalid',
    null,
    timezone('utc', now()),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{}'::jsonb,
    timezone('utc', now()),
    timezone('utc', now()),
    '',
    '',
    '',
    '',
    false
  )
on conflict (id) do nothing;

insert into public.profiles (id, display_name, locale, time_zone, onboarding_completed_at)
values
  (
    '11111111-1111-1111-1111-111111111111',
    'Seed Beginner',
    'en',
    'UTC',
    timezone('utc', now())
  ),
  (
    '22222222-2222-2222-2222-222222222222',
    'Seed Intermediate',
    'en',
    'UTC',
    timezone('utc', now())
  ),
  (
    '33333333-3333-3333-3333-333333333333',
    'Seed Advanced',
    'en',
    'UTC',
    timezone('utc', now())
  )
on conflict (id) do nothing;

insert into public.preferences (
  id,
  owner_id,
  skill_level,
  preferred_stack_behavior
)
values
  (
    'a1111111-1111-1111-1111-111111111111',
    '11111111-1111-1111-1111-111111111111',
    'beginner',
    'recommend'
  ),
  (
    'a2222222-2222-2222-2222-222222222222',
    '22222222-2222-2222-2222-222222222222',
    'intermediate',
    'prefer_saved'
  ),
  (
    'a3333333-3333-3333-3333-333333333333',
    '33333333-3333-3333-3333-333333333333',
    'advanced',
    'ask'
  )
on conflict (owner_id) do nothing;

-- Seven projects covering every lifecycle mode. Projection remains discovery at
-- state_version 1 so it matches the mandatory project.created event only.
with project_defs (
  id,
  title,
  mode
) as (
  values
    (
      'b1000000-0000-4000-8000-000000000001'::uuid,
      'Seed New Build Project',
      'new_build'
    ),
    (
      'b1000000-0000-4000-8000-000000000002'::uuid,
      'Seed Feature Project',
      'feature'
    ),
    (
      'b1000000-0000-4000-8000-000000000003'::uuid,
      'Seed Bug Project',
      'bug'
    ),
    (
      'b1000000-0000-4000-8000-000000000004'::uuid,
      'Seed Review Project',
      'review'
    ),
    (
      'b1000000-0000-4000-8000-000000000005'::uuid,
      'Seed Test Project',
      'test'
    ),
    (
      'b1000000-0000-4000-8000-000000000006'::uuid,
      'Seed Deploy Project',
      'deploy'
    ),
    (
      'b1000000-0000-4000-8000-000000000007'::uuid,
      'Seed Improve Project',
      'improve'
    )
)
insert into public.projects (id, owner_id, title, mode, stage, state_version, selected_tool)
select
  d.id,
  '22222222-2222-2222-2222-222222222222',
  d.title,
  d.mode,
  'discovery',
  1,
  case when d.mode in ('feature', 'bug') then 'cursor' else null end
from project_defs d
where not exists (select 1 from public.projects p where p.id = d.id);

-- One requirement, decision, and milestone per seeded project.
insert into public.requirements (id, project_id, category, statement, status)
select
  ('c1000000-0000-4000-8000-00000000000' || right(p.id::text, 1))::uuid,
  p.id,
  'functional',
  'Seed requirement for ' || p.title,
  'proposed'
from public.projects p
where p.owner_id = '22222222-2222-2222-2222-222222222222'
  and p.id in (
    'b1000000-0000-4000-8000-000000000001',
    'b1000000-0000-4000-8000-000000000002',
    'b1000000-0000-4000-8000-000000000003',
    'b1000000-0000-4000-8000-000000000004',
    'b1000000-0000-4000-8000-000000000005',
    'b1000000-0000-4000-8000-000000000006',
    'b1000000-0000-4000-8000-000000000007'
  )
on conflict do nothing;

insert into public.decisions (id, project_id, decision_key, decision, status)
select
  ('d1000000-0000-4000-8000-00000000000' || right(p.id::text, 1))::uuid,
  p.id,
  'stack',
  'Use TypeScript for ' || p.title,
  'proposed'
from public.projects p
where p.owner_id = '22222222-2222-2222-2222-222222222222'
  and p.id in (
    'b1000000-0000-4000-8000-000000000001',
    'b1000000-0000-4000-8000-000000000002',
    'b1000000-0000-4000-8000-000000000003',
    'b1000000-0000-4000-8000-000000000004',
    'b1000000-0000-4000-8000-000000000005',
    'b1000000-0000-4000-8000-000000000006',
    'b1000000-0000-4000-8000-000000000007'
  )
on conflict do nothing;

insert into public.milestones (id, project_id, position, title, suggested_status)
select
  ('e1000000-0000-4000-8000-00000000000' || right(p.id::text, 1))::uuid,
  p.id,
  1,
  'First milestone for ' || p.title,
  'pending'
from public.projects p
where p.owner_id = '22222222-2222-2222-2222-222222222222'
  and p.id in (
    'b1000000-0000-4000-8000-000000000001',
    'b1000000-0000-4000-8000-000000000002',
    'b1000000-0000-4000-8000-000000000003',
    'b1000000-0000-4000-8000-000000000004',
    'b1000000-0000-4000-8000-000000000005',
    'b1000000-0000-4000-8000-000000000006',
    'b1000000-0000-4000-8000-000000000007'
  )
on conflict do nothing;
