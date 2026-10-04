-- Storage: one public bucket, writes restricted to admins (requirement 6).
begin;
\ir helpers/fixtures.psql
select plan(12);

-- Emulate the Storage API, which enables deletes for the request and then runs them as the
-- caller. Without this, the platform's protect_delete trigger would reject every delete and
-- the deny checks below would pass without exercising our RLS policies.
select set_config('storage.allow_delete_query', 'true', true);

select results_eq(
  $$ select id, public, file_size_limit from storage.buckets order by id $$,
  $$ values ('media'::text, true, 20971520::bigint) $$,
  'exactly one bucket exists: public "media" with a 20 MiB limit');
select ok(
  (select allowed_mime_types @> array['image/webp', 'video/mp4']
          and not allowed_mime_types && array['text/html', 'image/svg+xml', 'application/pdf']
     from storage.buckets where id = 'media'),
  'only image/video types are allowed (no HTML or SVG uploads)');

-- Anonymous
select tests.anon_claims();
set local role anon;
select throws_ok($$ insert into storage.objects (bucket_id, name) values ('media', 'products/anon.webp') $$,
  '42501', null, 'anon cannot upload');
select is_empty($$ select 1 from storage.objects where bucket_id = 'media' $$, 'anon cannot list objects via the API');

-- Ordinary authenticated user
reset role;
select tests.claims_for(tests.user_id());
set local role authenticated;
select throws_ok($$ insert into storage.objects (bucket_id, name) values ('media', 'products/user.webp') $$,
  '42501', null, 'non-admin cannot upload');

-- Admin
reset role;
select tests.claims_for(tests.admin_id());
set local role authenticated;
select lives_ok($$ insert into storage.objects (bucket_id, name) values ('media', 'products/admin.webp') $$,
  'admin can upload');
select isnt_empty($$ select 1 from storage.objects where name = 'products/admin.webp' $$, 'admin can list objects');
select lives_ok($$ update storage.objects set metadata = '{"mimetype":"image/webp"}' where name = 'products/admin.webp' $$,
  'admin can update objects');

-- Non-admin cannot modify or delete an admin's object
reset role;
select tests.claims_for(tests.user_id());
set local role authenticated;
do $do$ begin update storage.objects set name = 'products/renamed.webp' where name = 'products/admin.webp'; exception when insufficient_privilege then null; end $do$;
do $do$ begin delete from storage.objects where name = 'products/admin.webp'; exception when insufficient_privilege then null; end $do$;
reset role;
select isnt_empty($$ select 1 from storage.objects where name = 'products/admin.webp' $$,
  'non-admin update/delete affected nothing');

select tests.anon_claims();
set local role anon;
do $do$ begin delete from storage.objects where name = 'products/admin.webp'; exception when insufficient_privilege then null; end $do$;
reset role;
select isnt_empty($$ select 1 from storage.objects where name = 'products/admin.webp' $$,
  'anon delete affected nothing');

select tests.claims_for(tests.admin_id());
set local role authenticated;
select lives_ok($$ delete from storage.objects where name = 'products/admin.webp' $$, 'admin can delete objects');
reset role;
select is_empty($$ select 1 from storage.objects where name = 'products/admin.webp' $$, 'the object was deleted');

select * from finish();
rollback;
