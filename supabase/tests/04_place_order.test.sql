-- place_order(): server-side pricing and business rules cannot be bypassed (requirement 5).
begin;
\ir helpers/fixtures.psql
select plan(22);

select tests.anon_claims();
set local role anon;

-- Pricing comes from the catalogue; client-supplied prices are ignored.
select is(
  (tests.pune_order(
     '[{"product_id":"b0000000-0000-4000-8000-000000000001","quantity":2,"unit_price_paise":1,"price":1}]',
     '+919833333301') ->> 'total_paise')::int,
  149800, 'totals are computed from catalogue prices, ignoring client prices');

-- Duplicate lines are merged.
select is(
  jsonb_array_length(tests.pune_order(
    '[{"product_id":"b0000000-0000-4000-8000-000000000002","quantity":1},
      {"product_id":"b0000000-0000-4000-8000-000000000002","quantity":2}]', '+919833333302') -> 'lines'),
  1, 'duplicate product lines are merged');

select matches(
  tests.pune_order('[{"product_id":"b0000000-0000-4000-8000-000000000002","quantity":1}]', '+919833333303') ->> 'order_number',
  '^AHB-[0-9]{6}$', 'a human-friendly order number is returned');

-- Product availability
select throws_ok($$ select tests.pune_order('[{"product_id":"b0000000-0000-4000-8000-000000000003","quantity":1}]', '+919833333304') $$,
  'P0001', 'PRODUCT_UNAVAILABLE', 'inactive products cannot be ordered');
select throws_ok($$ select tests.pune_order('[{"product_id":"b0000000-0000-4000-8000-0000000000ff","quantity":1}]', '+919833333304') $$,
  'P0001', 'PRODUCT_UNAVAILABLE', 'unknown products cannot be ordered');

-- Line validation
select throws_ok($$ select tests.pune_order('[]', '+919833333305') $$, 'P0001', 'INVALID_INPUT', 'an empty cart is rejected');
select throws_ok($$ select tests.pune_order('[{"product_id":"b0000000-0000-4000-8000-000000000002","quantity":0}]', '+919833333305') $$,
  'P0001', 'INVALID_INPUT', 'zero quantity is rejected');
select throws_ok($$ select tests.pune_order('[{"product_id":"b0000000-0000-4000-8000-000000000002","quantity":-3}]', '+919833333305') $$,
  'P0001', 'INVALID_INPUT', 'negative quantity is rejected');
select throws_ok($$ select tests.pune_order('[{"product_id":"b0000000-0000-4000-8000-000000000002","quantity":1.5}]', '+919833333305') $$,
  'P0001', 'INVALID_INPUT', 'fractional quantity is rejected');
select throws_ok($$ select tests.pune_order('[{"product_id":"b0000000-0000-4000-8000-000000000002","quantity":30},
                                              {"product_id":"b0000000-0000-4000-8000-000000000002","quantity":30}]', '+919833333305') $$,
  'P0001', 'INVALID_INPUT', 'merged quantity above 50 is rejected');
select throws_ok($$ select tests.pune_order('[{"product_id":"not-a-uuid","quantity":1}]', '+919833333305') $$,
  'P0001', 'INVALID_INPUT', 'malformed product ids are rejected');

-- Customer field validation (table constraints surface as INVALID_INPUT)
select throws_ok($$ select tests.pune_order('[{"product_id":"b0000000-0000-4000-8000-000000000002","quantity":1}]', '9876543210') $$,
  'P0001', 'INVALID_INPUT', 'a non-E.164 mobile number is rejected');

-- Region rules
select throws_ok($$ select public.place_order('T', '+919833333306', null, 'Flat 1, Test Road', null, 'Mumbai', '400001', null,
                    'maharashtra', null, null, null, 'c0000000-0000-4000-8000-000000000001', null,
                    '[{"product_id":"b0000000-0000-4000-8000-000000000001","quantity":1}]') $$,
  'P0001', 'NOT_SHIPPABLE', 'cakes cannot be couriered across Maharashtra');
select is(
  (public.place_order('T', '+919833333307', null, 'Flat 1, Test Road', null, 'Mumbai', '400001', null,
     'maharashtra', null, null, null, 'c0000000-0000-4000-8000-000000000001', null,
     '[{"product_id":"b0000000-0000-4000-8000-000000000002","quantity":1}]') ->> 'total_paise')::int,
  40400 + 9900, 'Maharashtra courier shipping is priced from shipping_rates');
select throws_ok($$ select public.place_order('T', '+919833333308', null, 'Flat 1, Test Road', null, 'Mumbai', '400001', null,
                    'maharashtra', null, null, null, null, null,
                    '[{"product_id":"b0000000-0000-4000-8000-000000000002","quantity":1}]') $$,
  'P0001', 'INVALID_INPUT', 'Maharashtra orders require a shipping slab');
select throws_ok($$ select public.place_order('T', '+919833333308', null, 'Flat 1, Test Road', null, 'Pune', '411057', null,
                    'pune', null, null, null, null, null,
                    '[{"product_id":"b0000000-0000-4000-8000-000000000002","quantity":1}]') $$,
  'P0001', 'INVALID_INPUT', 'Pune orders require a delivery type');

-- Scheduled delivery lead time (IST)
select throws_ok(format($$ select public.place_order('T', '+919833333309', null, 'Flat 1, Test Road', null, 'Pune', '411057', null,
                    'pune', 'scheduled', %L::date, 'morning', null, null,
                    '[{"product_id":"b0000000-0000-4000-8000-000000000002","quantity":1}]') $$,
                    (now() at time zone 'Asia/Kolkata')::date),
  'P0001', 'INVALID_DATE', 'same-day scheduled delivery is rejected');
select lives_ok(format($$ select public.place_order('T', '+919833333309', null, 'Flat 1, Test Road', null, 'Pune', '411057', null,
                    'pune', 'scheduled', %L::date, 'evening', null, null,
                    '[{"product_id":"b0000000-0000-4000-8000-000000000002","quantity":1}]') $$,
                    (now() at time zone 'Asia/Kolkata')::date + 1),
  'next-day scheduled delivery is accepted');
select throws_ok(format($$ select public.place_order('T', '+919833333310', null, 'Flat 1, Test Road', null, 'Pune', '411057', null,
                    'pune', 'scheduled', %L::date, null, null, null,
                    '[{"product_id":"b0000000-0000-4000-8000-000000000002","quantity":1}]') $$,
                    (now() at time zone 'Asia/Kolkata')::date + 2),
  'P0001', 'INVALID_INPUT', 'scheduled delivery requires a time slot');

-- Throttling: 3 orders per mobile per 10 minutes
select tests.pune_order('[{"product_id":"b0000000-0000-4000-8000-000000000002","quantity":1}]', '+919833333399');
select tests.pune_order('[{"product_id":"b0000000-0000-4000-8000-000000000002","quantity":1}]', '+919833333399');
select tests.pune_order('[{"product_id":"b0000000-0000-4000-8000-000000000002","quantity":1}]', '+919833333399');
select throws_ok($$ select tests.pune_order('[{"product_id":"b0000000-0000-4000-8000-000000000002","quantity":1}]', '+919833333399') $$,
  'P0001', 'RATE_LIMITED', 'a fourth order from the same mobile within 10 minutes is throttled');

-- Stored data is consistent (checked as the table owner).
reset role;
select is(
  (select count(*)::int from public.orders o
    where o.subtotal_paise <> (select sum(line_total_paise) from public.order_items where order_id = o.id)),
  0, 'every stored subtotal equals the sum of its snapshot lines');
select is(
  (select count(*)::int from public.orders where status <> 'pending' or admin_notes is not null),
  0, 'customers cannot set status or admin notes');

select * from finish();
rollback;
