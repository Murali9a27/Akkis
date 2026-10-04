-- Public write path. Anonymous visitors have no table privileges on orders, requests or
-- enquiries; these SECURITY DEFINER functions are the only way to create those rows.
-- Every business rule lives here (not only in the app), so calling them directly with
-- the public key grants nothing extra.
--
-- Errors are raised with a stable code in the message, mapped to copy by the app:
--   INVALID_INPUT · PRODUCT_UNAVAILABLE · NOT_SHIPPABLE · INVALID_DATE · RATE_LIMITED
-- For INVALID_INPUT the violated constraint (when known) is returned in DETAIL.
--
-- Design: docs/DATABASE-DESIGN.md §6

-- ─────────────────────────────────────────────────────────────────────────────────────
-- place_order
-- ─────────────────────────────────────────────────────────────────────────────────────
create function public.place_order(
  p_customer_name    text,
  p_mobile           text,
  p_whatsapp         text,
  p_address_line     text,
  p_area             text,
  p_city             text,
  p_pincode          text,
  p_location_url     text,
  p_region           public.delivery_region,
  p_delivery_type    public.delivery_type,
  p_delivery_date    date,
  p_delivery_slot    public.delivery_slot,
  p_shipping_rate_id uuid,
  p_customer_notes   text,
  p_items            jsonb
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_lines           jsonb;
  v_line_count      integer;
  v_found_count     integer;
  v_has_local_only  boolean;
  v_subtotal        bigint;
  v_shipping_label  text;
  v_shipping_charge integer := 0;
  v_order           public.orders%rowtype;
  v_constraint      text;
begin
  -- 1. Throttle (site-wide flood guard + per-customer).
  if (select count(*) from public.orders where created_at > now() - interval '1 minute') >= 20
     or (select count(*) from public.orders
         where mobile = p_mobile and created_at > now() - interval '10 minutes') >= 3 then
    raise exception 'RATE_LIMITED';
  end if;

  -- 2. Parse and merge cart lines: [{ "product_id": uuid, "quantity": int }, …]
  if p_items is null or jsonb_typeof(p_items) <> 'array'
     or jsonb_array_length(p_items) not between 1 and 30 then
    raise exception 'INVALID_INPUT' using detail = 'items';
  end if;

  begin
    if exists (
      select 1 from jsonb_array_elements(p_items) as item
      where jsonb_typeof(item) <> 'object'
         or jsonb_typeof(item -> 'quantity') <> 'number'
         or (item ->> 'product_id') is null
         or (item ->> 'quantity')::integer < 1
    ) then
      raise exception 'INVALID_INPUT' using detail = 'items';
    end if;

    select jsonb_agg(jsonb_build_object('product_id', merged.product_id, 'quantity', merged.quantity)),
           count(*)
      into v_lines, v_line_count
      from (
        select (item ->> 'product_id')::uuid as product_id,
               sum((item ->> 'quantity')::integer) as quantity
          from jsonb_array_elements(p_items) as item
         group by 1
      ) as merged;
  exception
    when invalid_text_representation or numeric_value_out_of_range then
      raise exception 'INVALID_INPUT' using detail = 'items';
  end;

  if exists (select 1 from jsonb_array_elements(v_lines) as l where (l ->> 'quantity')::integer > 50) then
    raise exception 'INVALID_INPUT' using detail = 'items';
  end if;

  -- 3–4. Prices always come from the catalog; the client never sends prices.
  select count(*),
         coalesce(bool_or(not c.ships_statewide), false),
         sum(p.price_paise::bigint * (l ->> 'quantity')::integer)
    into v_found_count, v_has_local_only, v_subtotal
    from jsonb_array_elements(v_lines) as l
    join public.products as p on p.id = (l ->> 'product_id')::uuid and p.is_active
    join public.product_categories as c on c.id = p.category_id;

  if v_found_count <> v_line_count then
    raise exception 'PRODUCT_UNAVAILABLE';
  end if;
  if v_subtotal > 100000000 then  -- ₹10 lakh sanity cap
    raise exception 'INVALID_INPUT' using detail = 'items';
  end if;

  -- 5. Region rules.
  if p_region = 'pune' then
    if p_delivery_type is null or p_shipping_rate_id is not null then
      raise exception 'INVALID_INPUT' using detail = 'delivery';
    end if;
    if p_delivery_type = 'scheduled' then
      if p_delivery_date is null or p_delivery_slot is null then
        raise exception 'INVALID_INPUT' using detail = 'delivery';
      end if;
      if p_delivery_date < private.india_today() + 1 then
        raise exception 'INVALID_DATE';
      end if;
    elsif p_delivery_date is not null or p_delivery_slot is not null then
      raise exception 'INVALID_INPUT' using detail = 'delivery';
    end if;
  elsif p_region = 'maharashtra' then
    if v_has_local_only then
      raise exception 'NOT_SHIPPABLE';
    end if;
    if p_delivery_type is not null or p_delivery_date is not null or p_delivery_slot is not null then
      raise exception 'INVALID_INPUT' using detail = 'delivery';
    end if;
    select sr.label, sr.charge_paise
      into v_shipping_label, v_shipping_charge
      from public.shipping_rates as sr
     where sr.id = p_shipping_rate_id;
    if not found then
      raise exception 'INVALID_INPUT' using detail = 'shipping_rate';
    end if;
  else
    raise exception 'INVALID_INPUT' using detail = 'region';
  end if;

  -- 6. Insert order + snapshot lines atomically (table CHECKs re-validate every field).
  begin
    insert into public.orders (
      customer_name, mobile, whatsapp, address_line, area, city, pincode, location_url,
      region, delivery_type, delivery_date, delivery_slot,
      shipping_rate_id, shipping_label, shipping_charge_paise,
      subtotal_paise, total_paise, customer_notes
    ) values (
      p_customer_name, p_mobile, p_whatsapp, p_address_line, p_area, p_city, p_pincode, p_location_url,
      p_region, p_delivery_type, p_delivery_date, p_delivery_slot,
      case when p_region = 'maharashtra' then p_shipping_rate_id end, v_shipping_label, v_shipping_charge,
      v_subtotal::integer, v_subtotal::integer + v_shipping_charge, p_customer_notes
    )
    returning * into v_order;
  exception
    when check_violation or not_null_violation then
      get stacked diagnostics v_constraint = constraint_name;
      raise exception 'INVALID_INPUT' using detail = coalesce(v_constraint, '');
  end;

  insert into public.order_items (order_id, product_id, product_name, weight_label, unit_price_paise, quantity)
  select v_order.id, p.id, p.name, p.weight_label, p.price_paise, (l ->> 'quantity')::smallint
    from jsonb_array_elements(v_lines) as l
    join public.products as p on p.id = (l ->> 'product_id')::uuid;

  -- 7. Server-computed summary for the confirmation screen and the WhatsApp message.
  return jsonb_build_object(
    'order_number', v_order.order_number,
    'subtotal_paise', v_order.subtotal_paise,
    'shipping_charge_paise', v_order.shipping_charge_paise,
    'total_paise', v_order.total_paise,
    'region', v_order.region,
    'delivery_type', v_order.delivery_type,
    'delivery_date', v_order.delivery_date,
    'delivery_slot', v_order.delivery_slot,
    'shipping_label', v_order.shipping_label,
    'lines', (
      select jsonb_agg(jsonb_build_object(
               'product_name', oi.product_name,
               'weight_label', oi.weight_label,
               'unit_price_paise', oi.unit_price_paise,
               'quantity', oi.quantity,
               'line_total_paise', oi.line_total_paise
             ) order by oi.product_name)
        from public.order_items as oi
       where oi.order_id = v_order.id
    )
  );
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────────────
-- submit_custom_cake_request
-- ─────────────────────────────────────────────────────────────────────────────────────
create function public.submit_custom_cake_request(p_request jsonb)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_whatsapp      text;
  v_delivery_date date;
  v_number        text;
  v_constraint    text;
begin
  if p_request is null or jsonb_typeof(p_request) <> 'object' then
    raise exception 'INVALID_INPUT' using detail = 'request';
  end if;

  v_whatsapp := p_request ->> 'whatsapp';

  if (select count(*) from public.custom_cake_requests where created_at > now() - interval '1 minute') >= 20
     or (select count(*) from public.custom_cake_requests
         where whatsapp = v_whatsapp and created_at > now() - interval '10 minutes') >= 3 then
    raise exception 'RATE_LIMITED';
  end if;

  begin
    v_delivery_date := (p_request ->> 'delivery_date')::date;
  exception
    when invalid_datetime_format or datetime_field_overflow then
      raise exception 'INVALID_INPUT' using detail = 'delivery_date';
  end;
  if v_delivery_date is null then
    raise exception 'INVALID_INPUT' using detail = 'delivery_date';
  end if;
  if v_delivery_date < private.india_today() + 2 then
    raise exception 'INVALID_DATE';
  end if;

  -- Explicit allow-list: unknown keys in p_request are ignored (no mass assignment);
  -- status, admin_notes, request_number and timestamps can never be supplied.
  begin
    insert into public.custom_cake_requests (
      occasion, name_on_cake, age_or_number, number_candle, anniversary_details, cake_knife,
      size, tiers, flavour, finish, theme, topper, guests_adults, guests_kids,
      design_description, colour_preference, reference_url,
      delivery_date, delivery_slot, address, location_url,
      customer_name, whatsapp, instagram_handle, allergies_notes
    ) values (
      p_request ->> 'occasion',
      p_request ->> 'name_on_cake',
      p_request ->> 'age_or_number',
      coalesce((p_request ->> 'number_candle')::boolean, false),
      p_request ->> 'anniversary_details',
      coalesce((p_request ->> 'cake_knife')::boolean, false),
      (p_request ->> 'size')::public.cake_size,
      coalesce((p_request ->> 'tiers')::smallint, 1),
      p_request ->> 'flavour',
      p_request ->> 'finish',
      p_request ->> 'theme',
      p_request ->> 'topper',
      (p_request ->> 'guests_adults')::smallint,
      (p_request ->> 'guests_kids')::smallint,
      p_request ->> 'design_description',
      p_request ->> 'colour_preference',
      p_request ->> 'reference_url',
      v_delivery_date,
      (p_request ->> 'delivery_slot')::public.delivery_slot,
      p_request ->> 'address',
      p_request ->> 'location_url',
      p_request ->> 'customer_name',
      v_whatsapp,
      p_request ->> 'instagram_handle',
      p_request ->> 'allergies_notes'
    )
    returning request_number into v_number;
  exception
    when check_violation or not_null_violation then
      get stacked diagnostics v_constraint = constraint_name;
      raise exception 'INVALID_INPUT' using detail = coalesce(v_constraint, '');
    when invalid_text_representation or numeric_value_out_of_range then
      raise exception 'INVALID_INPUT' using detail = 'request';
  end;

  return v_number;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────────────
-- submit_enquiry
-- ─────────────────────────────────────────────────────────────────────────────────────
create function public.submit_enquiry(
  p_type       public.enquiry_type,
  p_name       text,
  p_phone      text,
  p_email      text,
  p_subject    text,
  p_message    text,
  p_heard_from text
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_id         uuid;
  v_constraint text;
begin
  if (select count(*) from public.enquiries where created_at > now() - interval '1 minute') >= 20
     or (select count(*) from public.enquiries
         where phone = p_phone and created_at > now() - interval '10 minutes') >= 5 then
    raise exception 'RATE_LIMITED';
  end if;

  begin
    insert into public.enquiries (type, name, phone, email, subject, message, heard_from)
    values (p_type, p_name, p_phone, p_email, p_subject, p_message, p_heard_from)
    returning id into v_id;
  exception
    when check_violation or not_null_violation then
      get stacked diagnostics v_constraint = constraint_name;
      raise exception 'INVALID_INPUT' using detail = coalesce(v_constraint, '');
  end;

  return v_id;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────────────
-- Privileges: callable by visitors; nothing else is granted.
-- ─────────────────────────────────────────────────────────────────────────────────────
revoke all on function public.place_order(
  text, text, text, text, text, text, text, text, public.delivery_region, public.delivery_type,
  date, public.delivery_slot, uuid, text, jsonb
) from public;
revoke all on function public.submit_custom_cake_request(jsonb) from public;
revoke all on function public.submit_enquiry(public.enquiry_type, text, text, text, text, text, text) from public;

grant execute on function public.place_order(
  text, text, text, text, text, text, text, text, public.delivery_region, public.delivery_type,
  date, public.delivery_slot, uuid, text, jsonb
) to anon, authenticated;
grant execute on function public.submit_custom_cake_request(jsonb) to anon, authenticated;
grant execute on function public.submit_enquiry(public.enquiry_type, text, text, text, text, text, text)
  to anon, authenticated;

-- private.india_today() is only called from inside these definer functions.
revoke all on function private.india_today() from public, anon, authenticated;
