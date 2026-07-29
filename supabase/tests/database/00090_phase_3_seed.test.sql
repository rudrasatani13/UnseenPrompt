begin;

select plan(12);

select is(
  (select count(*)::int from public.profiles where id in (
    '11111111-1111-1111-1111-111111111111',
    '22222222-2222-2222-2222-222222222222',
    '33333333-3333-3333-3333-333333333333'
  )),
  3,
  'three synthetic skill profiles seeded'
);

select is(
  (select count(*)::int from public.preferences where skill_level = 'beginner'),
  1,
  'beginner preference present'
);

select is(
  (select count(*)::int from public.preferences where skill_level = 'intermediate'),
  1,
  'intermediate preference present'
);

select is(
  (select count(*)::int from public.preferences where skill_level = 'advanced'),
  1,
  'advanced preference present'
);

select is(
  (
    select count(distinct mode)::int
    from public.projects
    where owner_id = '22222222-2222-2222-2222-222222222222'
  ),
  7,
  'all seven project modes seeded'
);

select ok(
  (
    select bool_and(exists (
      select 1 from public.project_events pe
      where pe.project_id = p.id
        and pe.sequence_number = 1
        and pe.event_type = 'project.created'
    ))
    from public.projects p
    where p.owner_id = '22222222-2222-2222-2222-222222222222'
  ),
  'each seeded project has creation event sequence 1'
);

select ok(
  (
    select bool_and(p.state_version = 1)
    from public.projects p
    where p.owner_id = '22222222-2222-2222-2222-222222222222'
  ),
  'seeded projects have matching initial state_version'
);

select ok(
  (
    select bool_and(exists (
      select 1 from public.requirements r where r.project_id = p.id
    ))
    from public.projects p
    where p.owner_id = '22222222-2222-2222-2222-222222222222'
  ),
  'each seeded project has a requirement'
);

select ok(
  (
    select bool_and(exists (
      select 1 from public.decisions d where d.project_id = p.id
    ))
    from public.projects p
    where p.owner_id = '22222222-2222-2222-2222-222222222222'
  ),
  'each seeded project has a decision'
);

select ok(
  (
    select bool_and(exists (
      select 1 from public.milestones m where m.project_id = p.id
    ))
    from public.projects p
    where p.owner_id = '22222222-2222-2222-2222-222222222222'
  ),
  'each seeded project has a milestone'
);

select is(
  (select count(*)::int from public.waitlist_entries),
  0,
  'seed does not insert waitlist rows'
);

select ok(
  not exists (
    select 1 from auth.users
    where email not like '%@users.invalid'
      and email not like '%@email.com'
      and id in (
        '11111111-1111-1111-1111-111111111111',
        '22222222-2222-2222-2222-222222222222',
        '33333333-3333-3333-3333-333333333333'
      )
  ),
  'seed users use reserved invalid domain'
);

select * from finish();
rollback;
