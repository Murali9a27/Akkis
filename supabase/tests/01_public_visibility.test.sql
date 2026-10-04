-- Public catalogue and content visibility (requirements 7–10).
begin;
\ir helpers/fixtures.psql
select plan(16);

-- ── Anonymous visitor ──────────────────────────────────────────────────────────────────────
select tests.anon_claims();
set local role anon;

select is((select count(*)::int from public.products where slug like 'test-%'), 2,
  'anon sees active products only');
select is_empty($$ select 1 from public.products where slug = 'test-hidden' $$,
  'anon cannot see an inactive product');
select is((select count(*)::int from public.product_categories where slug like 'test-%'), 2,
  'anon can read categories');
select is((select count(*)::int from public.shipping_rates where label = 'Test slab'), 1,
  'anon can read shipping rates (needed for checkout)');

select results_eq($$ select slug from public.blog_posts where slug like 'test-%' $$,
  $$ values ('test-published') $$, 'anon sees only published, already-live blog posts');
select is_empty($$ select 1 from public.blog_posts where slug = 'test-draft' $$,
  'anon cannot read a draft post');
select is_empty($$ select 1 from public.blog_posts where slug = 'test-scheduled' $$,
  'anon cannot read a post scheduled for the future');

select results_eq($$ select title from public.gallery_items where title in ('Published item', 'Unpublished item') $$,
  $$ values ('Published item') $$, 'anon sees published gallery items only');

-- ── Ordinary authenticated user (not an admin) ─────────────────────────────────────────────
reset role;
select tests.claims_for(tests.user_id());
set local role authenticated;

select is((select count(*)::int from public.products where slug like 'test-%'), 2,
  'non-admin sees active products only');
select is_empty($$ select 1 from public.blog_posts where slug = 'test-draft' $$,
  'non-admin cannot read a draft post');
select is_empty($$ select 1 from public.gallery_items where not is_published $$,
  'non-admin cannot see unpublished gallery items');

-- ── Admin ──────────────────────────────────────────────────────────────────────────────────
reset role;
select tests.claims_for(tests.admin_id());
set local role authenticated;

select is((select count(*)::int from public.products where slug like 'test-%'), 3,
  'admin sees inactive products too');
select is((select count(*)::int from public.blog_posts where slug like 'test-%'), 3,
  'admin sees drafts and scheduled posts');
select is((select count(*)::int from public.gallery_items where title in ('Published item', 'Unpublished item')), 2,
  'admin sees unpublished gallery items');

-- ── Publishing changes visibility ──────────────────────────────────────────────────────────
update public.blog_posts set status = 'published', published_at = now() - interval '1 minute'
 where slug = 'test-draft';
reset role;
select tests.anon_claims();
set local role anon;
select isnt_empty($$ select 1 from public.blog_posts where slug = 'test-draft' $$,
  'a post becomes publicly readable once published');

reset role;
select tests.claims_for(tests.admin_id());
set local role authenticated;
update public.products set is_active = false where slug = 'test-loaf';
reset role;
select tests.anon_claims();
set local role anon;
select is_empty($$ select 1 from public.products where slug = 'test-loaf' $$,
  'a deactivated product disappears from the public catalogue');

reset role;
select * from finish();
rollback;
