-- Orders (cart checkout) with immutable price snapshots.
-- Rows are created only by public.place_order(); see 20261004000700_submission_functions.sql.
-- Design: docs/DATABASE-DESIGN.md §4.5, §5

create sequence public.order_number_seq;

create table public.orders (
  id                    uuid primary key default gen_random_uuid(),
  order_number          text not null unique
                        default 'AHB-' || lpad(nextval('public.order_number_seq')::text, 6, '0'),
  customer_name         text not null check (char_length(customer_name) between 1 and 100),
  mobile                text not null check (mobile ~ '^\+[1-9][0-9]{7,14}$'),
  whatsapp              text check (whatsapp ~ '^\+[1-9][0-9]{7,14}$'),
  address_line          text not null check (char_length(address_line) between 5 and 300),
  area                  text check (char_length(area) <= 100),
  city                  text not null check (char_length(city) between 2 and 60),
  pincode               text not null check (pincode ~ '^[1-9][0-9]{5}$'),
  location_url          text check (
                          location_url ~ '^https://maps\.google\.com/\?q=-?[0-9]{1,3}\.[0-9]+,-?[0-9]{1,3}\.[0-9]+$'
                        ),
  region                public.delivery_region not null,
  delivery_type         public.delivery_type,
  delivery_date         date,
  delivery_slot         public.delivery_slot,
  shipping_rate_id      uuid references public.shipping_rates (id) on delete set null,
  shipping_label        text check (char_length(shipping_label) <= 40),
  shipping_charge_paise integer not null default 0 check (shipping_charge_paise >= 0),
  subtotal_paise        integer not null check (subtotal_paise > 0),
  total_paise           integer not null,
  customer_notes        text check (char_length(customer_notes) <= 1000),
  status                public.request_status not null default 'pending',
  admin_notes           text check (char_length(admin_notes) <= 2000),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  constraint orders_total_matches check (total_paise = subtotal_paise + shipping_charge_paise),
  constraint orders_pune_has_type check ((region = 'pune') = (delivery_type is not null)),
  constraint orders_schedule_fields check (
    (delivery_type = 'scheduled' and delivery_date is not null and delivery_slot is not null)
    or (delivery_type is distinct from 'scheduled' and delivery_date is null and delivery_slot is null)
  ),
  constraint orders_mh_has_shipping check ((region = 'maharashtra') = (shipping_label is not null))
);
create index orders_status_created_idx on public.orders (status, created_at desc);
create index orders_created_idx on public.orders (created_at desc);
create index orders_mobile_created_idx on public.orders (mobile, created_at desc);
create index orders_delivery_date_idx on public.orders (delivery_date) where delivery_date is not null;
create index orders_shipping_rate_idx on public.orders (shipping_rate_id);

create table public.order_items (
  id               uuid primary key default gen_random_uuid(),
  order_id         uuid not null references public.orders (id) on delete cascade,
  product_id       uuid references public.products (id) on delete set null,
  product_name     text not null,
  weight_label     text not null,
  unit_price_paise integer not null check (unit_price_paise > 0),
  quantity         smallint not null check (quantity between 1 and 50),
  line_total_paise integer generated always as (unit_price_paise * quantity) stored,
  constraint order_items_unique_product unique (order_id, product_id)
);
comment on table public.order_items is
  'Immutable line snapshots: name, weight and unit price as charged at order time.';
create index order_items_product_id_idx on public.order_items (product_id);

create trigger orders_set_updated_at before update on public.orders
  for each row execute function extensions.moddatetime (updated_at);

alter table public.orders enable row level security;
alter table public.order_items enable row level security;

-- Admin workflow only. No anon grants at all; updates limited to workflow columns so
-- pricing, customer details and snapshots can never be changed through the API.
grant select, delete on public.orders to authenticated;
grant update (status, admin_notes) on public.orders to authenticated;
grant select on public.order_items to authenticated;

create policy "orders: admin read" on public.orders
  for select to authenticated using ((select private.is_admin()));
create policy "orders: admin update" on public.orders
  for update to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));
create policy "orders: admin delete" on public.orders
  for delete to authenticated using ((select private.is_admin()));

create policy "order_items: admin read" on public.order_items
  for select to authenticated using ((select private.is_admin()));
