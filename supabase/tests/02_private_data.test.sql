-- Private and admin data is not reachable by the public or by ordinary users (requirements 1, 2, 11).
begin;
\ir helpers/fixtures.psql
select plan(19);

-- One real row in each private table, created through the public write path.
select tests.pune_order('[{"product_id":"b0000000-0000-4000-8000-000000000001","quantity":1}]', '+919811111111');
select public.submit_custom_cake_request(tests.cake_request());
select public.submit_enquiry('general', 'Test', '+919811111112', null, 'Hello', 'Message', null);

-- ── Anonymous ──────────────────────────────────────────────────────────────────────────────
select tests.anon_claims();
set local role anon;

select throws_ok($$ select * from public.orders $$, '42501', null, 'anon: orders are not queryable');
select throws_ok($$ select * from public.order_items $$, '42501', null, 'anon: order_items are not queryable');
select throws_ok($$ select * from public.custom_cake_requests $$, '42501', null, 'anon: custom-cake requests are not queryable');
select throws_ok($$ select * from public.enquiries $$, '42501', null, 'anon: enquiries are not queryable');
select throws_ok($$ select * from public.admin_users $$, '42501', null, 'anon: admin_users is not queryable');
select throws_ok($$ update public.orders set status = 'cancelled' $$, '42501', null, 'anon: cannot update orders');
select throws_ok($$ delete from public.enquiries $$, '42501', null, 'anon: cannot delete enquiries');
select throws_ok($$ insert into public.products (slug, category_id, name, price_paise, weight_label)
                    values ('x', 'a0000000-0000-4000-8000-000000000001', 'X', 100, '1 G') $$,
  '42501', null, 'anon: cannot insert products');
select throws_ok($$ select private.is_admin() $$, '42501', null, 'anon: cannot call private helpers');

-- ── Ordinary authenticated user ───────────────────────────────────────────────────────────
reset role;
select tests.claims_for(tests.user_id());
set local role authenticated;

select is_empty($$ select 1 from public.orders $$, 'non-admin: sees no orders');
select is_empty($$ select 1 from public.order_items $$, 'non-admin: sees no order items');
select is_empty($$ select 1 from public.custom_cake_requests $$, 'non-admin: sees no custom-cake requests');
select is_empty($$ select 1 from public.enquiries $$, 'non-admin: sees no enquiries');
select is_empty($$ select 1 from public.admin_users $$, 'non-admin: sees no admin memberships');
select is(private.is_admin(), false, 'non-admin: is_admin() is false');
select throws_ok($$ insert into public.products (slug, category_id, name, price_paise, weight_label)
                    values ('x', 'a0000000-0000-4000-8000-000000000001', 'X', 100, '1 G') $$,
  '42501', null, 'non-admin: cannot insert products (RLS)');
select throws_ok($$ insert into public.admin_users (user_id) values (tests.user_id()) $$,
  '42501', null, 'non-admin: cannot make themselves admin');

update public.orders set status = 'cancelled';
update public.products set price_paise = 1 where slug = 'test-cake';
delete from public.enquiries;

reset role;
select is((select status::text from public.orders where mobile = '+919811111111'), 'pending',
  'non-admin: update on orders affected nothing');
select is((select price_paise from public.products where slug = 'test-cake'), 74900,
  'non-admin: update on products affected nothing');

select * from finish();
rollback;
