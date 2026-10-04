-- Structural security guarantees: RLS everywhere, deny-by-default grants, column limits.
begin;
\ir helpers/fixtures.psql
select plan(26);

select tables_are('public', array[
  'admin_users', 'product_categories', 'products', 'shipping_rates', 'orders', 'order_items',
  'custom_cake_requests', 'enquiries', 'gallery_items', 'blog_posts'
], 'exactly the approved application tables exist (no newsletter table)');

select is(
  (select count(*)::int from pg_tables where schemaname = 'public' and not rowsecurity),
  0, 'RLS is enabled on every public table');

-- Anonymous visitors: no direct access at all to private tables.
select ok(not has_table_privilege('anon', 'public.orders', 'select'), 'anon cannot select orders');
select ok(not has_table_privilege('anon', 'public.orders', 'insert'), 'anon cannot insert orders');
select ok(not has_table_privilege('anon', 'public.order_items', 'select'), 'anon cannot select order_items');
select ok(not has_table_privilege('anon', 'public.custom_cake_requests', 'select'), 'anon cannot select custom_cake_requests');
select ok(not has_table_privilege('anon', 'public.custom_cake_requests', 'insert'), 'anon cannot insert custom_cake_requests');
select ok(not has_table_privilege('anon', 'public.enquiries', 'select'), 'anon cannot select enquiries');
select ok(not has_table_privilege('anon', 'public.enquiries', 'insert'), 'anon cannot insert enquiries');
select ok(not has_table_privilege('anon', 'public.admin_users', 'select'), 'anon cannot select admin_users');
select ok(not has_table_privilege('anon', 'public.products', 'insert'), 'anon cannot insert products');
select ok(not has_table_privilege('anon', 'public.products', 'update'), 'anon cannot update products');
select ok(not has_table_privilege('anon', 'public.products', 'delete'), 'anon cannot delete products');

-- Authenticated role: never a direct insert path into customer submissions.
select ok(not has_table_privilege('authenticated', 'public.orders', 'insert'), 'authenticated cannot insert orders directly');
select ok(not has_table_privilege('authenticated', 'public.order_items', 'insert'), 'authenticated cannot insert order_items');
select ok(not has_table_privilege('authenticated', 'public.order_items', 'update'), 'order_items are immutable via the API');
select ok(not has_table_privilege('authenticated', 'public.admin_users', 'insert'), 'nobody can grant admin via the API');

-- Protected pricing: only workflow columns are updatable.
select ok(has_column_privilege('authenticated', 'public.orders', 'status', 'update'), 'orders.status is updatable (admin workflow)');
select ok(not has_column_privilege('authenticated', 'public.orders', 'total_paise', 'update'), 'orders.total_paise is not updatable');
select ok(not has_column_privilege('authenticated', 'public.orders', 'subtotal_paise', 'update'), 'orders.subtotal_paise is not updatable');
select ok(not has_column_privilege('authenticated', 'public.orders', 'mobile', 'update'), 'orders customer details are not updatable');

-- Functions: helpers are private; only the three submission functions are public.
select ok(not has_schema_privilege('anon', 'private', 'usage'), 'anon has no access to the private schema');
select ok(has_function_privilege('anon', 'public.submit_enquiry(public.enquiry_type, text, text, text, text, text, text)', 'execute'),
  'anon may call submit_enquiry');
select ok(not has_function_privilege('anon', 'private.india_today()', 'execute'), 'anon cannot call private helpers');

select is(
  (select array_agg(p.proname::text order by p.proname)
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prosecdef),
  array['place_order', 'submit_custom_cake_request', 'submit_enquiry'],
  'the only SECURITY DEFINER functions in public are the three submission functions');

select is(
  (select count(*)::int
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('public', 'private') and p.prosecdef
      and not coalesce(p.proconfig @> array['search_path=""'], false)),
  0, 'every SECURITY DEFINER function pins an empty search_path');

select * from finish();
rollback;
