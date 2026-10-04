-- Admins can perform permitted operations, but cannot alter protected pricing (requirements 3, 4).
begin;
\ir helpers/fixtures.psql
select plan(16);

select tests.pune_order('[{"product_id":"b0000000-0000-4000-8000-000000000001","quantity":2}]', '+919822222221');
select public.submit_custom_cake_request(tests.cake_request());
select public.submit_enquiry('general', 'Test', '+919822222222', null, 'Hello', 'Message', null);

select tests.claims_for(tests.admin_id());
set local role authenticated;

select is(private.is_admin(), true, 'admin: is_admin() is true');
select results_eq($$ select user_id from public.admin_users $$, $$ values (tests.admin_id()) $$,
  'admin: can read own membership only');

-- Catalogue management
select lives_ok($$ insert into public.products (slug, category_id, name, price_paise, weight_label)
                   values ('admin-new', 'a0000000-0000-4000-8000-000000000001', 'Admin New', 50000, '300 G') $$,
  'admin: can create a product');
select lives_ok($$ update public.products set price_paise = 79900 where slug = 'test-cake' $$,
  'admin: can change a catalogue price');
select lives_ok($$ delete from public.products where slug = 'admin-new' $$, 'admin: can delete a product');
select lives_ok($$ update public.shipping_rates set charge_paise = 10900 where label = 'Test slab' $$,
  'admin: can edit shipping rates');
select lives_ok($$ update public.blog_posts set status = 'published', published_at = now() where slug = 'test-draft' $$,
  'admin: can publish a post');
select lives_ok($$ update public.gallery_items set is_published = true where title = 'Unpublished item' $$,
  'admin: can publish a gallery item');

-- Customer submissions: read + workflow updates
select is((select count(*)::int from public.orders where mobile = '+919822222221'), 1, 'admin: can read orders');
select is((select count(*)::int from public.order_items oi join public.orders o on o.id = oi.order_id
            where o.mobile = '+919822222221'), 1, 'admin: can read order items');
select lives_ok($$ update public.orders set status = 'confirmed', admin_notes = 'Porter 2.5 km'
                   where mobile = '+919822222221' $$, 'admin: can update order status and notes');
select lives_ok($$ update public.custom_cake_requests set status = 'confirmed' $$, 'admin: can update request status');
select lives_ok($$ update public.enquiries set status = 'closed' $$, 'admin: can close enquiries');

-- Protected pricing and snapshots (requirement 4)
select throws_ok($$ update public.orders set total_paise = 1 $$, '42501', null,
  'admin: cannot change an order total');
select throws_ok($$ update public.order_items set unit_price_paise = 1 $$, '42501', null,
  'admin: cannot change a line price snapshot');

-- Catalogue price change does not rewrite history
reset role;
select is((select oi.unit_price_paise from public.order_items oi join public.orders o on o.id = oi.order_id
            where o.mobile = '+919822222221'), 74900,
  'existing order keeps the price it was placed at after the catalogue price changes');

select * from finish();
rollback;
