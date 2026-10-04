-- Custom-cake and enquiry submission rules, enforced in the database (requirement 5).
begin;
\ir helpers/fixtures.psql
select plan(16);

select tests.anon_claims();
set local role anon;

-- Custom cake requests
select matches(public.submit_custom_cake_request(tests.cake_request()), '^CC-[0-9]{5}$',
  'a valid request returns a request number');
select lives_ok($$ select public.submit_custom_cake_request(tests.cake_request(
                   '{"size":"two_kg","tiers":2,"whatsapp":"+919844444402","status":"completed","admin_notes":"hacked","request_number":"CC-99999"}')) $$,
  'unknown/protected keys are ignored rather than applied');
select throws_ok($$ select public.submit_custom_cake_request(tests.cake_request('{"size":"half_kg","tiers":2,"whatsapp":"+919844444403"}')) $$,
  'P0001', 'INVALID_INPUT', '500 g cakes cannot have 2 tiers');
select throws_ok($$ select public.submit_custom_cake_request(tests.cake_request('{"size":"two_kg","tiers":3,"whatsapp":"+919844444403"}')) $$,
  'P0001', 'INVALID_INPUT', '2 kg cakes allow at most 2 tiers');
select lives_ok($$ select public.submit_custom_cake_request(tests.cake_request('{"size":"custom","tiers":3,"whatsapp":"+919844444404"}')) $$,
  'custom size allows 3 tiers');
select throws_ok(format($$ select public.submit_custom_cake_request(tests.cake_request(%L)) $$,
                   jsonb_build_object('delivery_date', ((now() at time zone 'Asia/Kolkata')::date + 1)::text,
                                      'whatsapp', '+919844444405')),
  'P0001', 'INVALID_DATE', 'custom cakes need 2 days notice');
select throws_ok($$ select public.submit_custom_cake_request(tests.cake_request('{"size":"giant","whatsapp":"+919844444406"}')) $$,
  'P0001', 'INVALID_INPUT', 'unknown sizes are rejected');
select throws_ok($$ select public.submit_custom_cake_request(tests.cake_request('{"reference_url":"javascript:alert(1)","whatsapp":"+919844444407"}')) $$,
  'P0001', 'INVALID_INPUT', 'reference links must be https');
select throws_ok($$ select public.submit_custom_cake_request('[]'::jsonb) $$,
  'P0001', 'INVALID_INPUT', 'non-object payloads are rejected');

select public.submit_custom_cake_request(tests.cake_request('{"whatsapp":"+919844444499"}'));
select public.submit_custom_cake_request(tests.cake_request('{"whatsapp":"+919844444499"}'));
select public.submit_custom_cake_request(tests.cake_request('{"whatsapp":"+919844444499"}'));
select throws_ok($$ select public.submit_custom_cake_request(tests.cake_request('{"whatsapp":"+919844444499"}')) $$,
  'P0001', 'RATE_LIMITED', 'custom-cake requests are throttled per WhatsApp number');

-- Enquiries
select lives_ok($$ select public.submit_enquiry('bulk', 'Test', '+919844444501', 'owner@example.com', 'Office order', 'Need 40 jars', 'Instagram') $$,
  'a valid enquiry is accepted');
select throws_ok($$ select public.submit_enquiry('general', 'Test', '+919844444502', 'Not@Lower.com', 'S', 'M', null) $$,
  'P0001', 'INVALID_INPUT', 'emails must be normalised');
select throws_ok($$ select public.submit_enquiry('general', '', '+919844444502', null, 'S', 'M', null) $$,
  'P0001', 'INVALID_INPUT', 'a name is required');
select throws_ok($$ select public.submit_enquiry('general', 'Test', '+919844444502', null, 'S', repeat('x', 3001), null) $$,
  'P0001', 'INVALID_INPUT', 'messages are length-limited');

reset role;
select is((select status::text || '/' || coalesce(admin_notes, '-')
             from public.custom_cake_requests where whatsapp = '+919844444402'),
  'pending/-', 'status and admin notes cannot be set by customers');
select is((select tiers from public.custom_cake_requests where whatsapp = '+919844444402'), 2::smallint,
  'allowed fields from the payload are stored');

select * from finish();
rollback;
