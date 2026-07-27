begin;

select plan(2);

select has_schema('auth', 'Supabase auth schema is available');
select has_column('auth', 'users', 'id', 'auth.users has its UUID identity column');

select * from finish();

rollback;
