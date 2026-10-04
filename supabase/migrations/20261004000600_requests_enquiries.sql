-- Custom-cake requests (replaces the legacy Google Sheet) and contact enquiries.
-- Rows are created only by the submission functions in 20261004000700.
-- Design: docs/DATABASE-DESIGN.md §4.6, §5

create sequence public.cake_request_seq;

create table public.custom_cake_requests (
  id                  uuid primary key default gen_random_uuid(),
  request_number      text not null unique
                      default 'CC-' || lpad(nextval('public.cake_request_seq')::text, 5, '0'),
  occasion            text not null check (char_length(occasion) between 1 and 40),
  name_on_cake        text check (char_length(name_on_cake) <= 60),
  age_or_number       text check (char_length(age_or_number) <= 10),
  number_candle       boolean not null default false,
  anniversary_details text check (char_length(anniversary_details) <= 80),
  cake_knife          boolean not null default false,
  size                public.cake_size not null,
  tiers               smallint not null default 1,
  flavour             text not null check (char_length(flavour) between 1 and 40),
  finish              text not null check (char_length(finish) between 1 and 60),
  theme               text not null check (char_length(theme) between 1 and 60),
  topper              text not null check (char_length(topper) between 1 and 40),
  guests_adults       smallint check (guests_adults between 0 and 1000),
  guests_kids         smallint check (guests_kids between 0 and 1000),
  design_description  text check (char_length(design_description) <= 2000),
  colour_preference   text check (char_length(colour_preference) <= 120),
  reference_url       text check (char_length(reference_url) <= 500 and reference_url ~ '^https://'),
  delivery_date       date not null,
  delivery_slot       public.delivery_slot not null,
  address             text not null check (char_length(address) between 5 and 500),
  location_url        text check (
                        location_url ~ '^https://maps\.google\.com/\?q=-?[0-9]{1,3}\.[0-9]+,-?[0-9]{1,3}\.[0-9]+$'
                      ),
  customer_name       text not null check (char_length(customer_name) between 1 and 100),
  whatsapp            text not null check (whatsapp ~ '^\+[1-9][0-9]{7,14}$'),
  instagram_handle    text check (instagram_handle ~ '^@?[A-Za-z0-9._]{1,30}$'),
  allergies_notes     text check (char_length(allergies_notes) <= 1000),
  status              public.request_status not null default 'pending',
  admin_notes         text check (char_length(admin_notes) <= 2000),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  -- Legacy tier rules: bento has no tiers; 500 g–1.5 kg → 1 tier; 2 kg → up to 2; custom → up to 3.
  constraint cake_tiers_match_size check (
    (size in ('bento_300g', 'half_kg', 'one_kg', 'one_and_half_kg') and tiers = 1)
    or (size = 'two_kg' and tiers between 1 and 2)
    or (size = 'custom' and tiers between 1 and 3)
  )
);
create index custom_cake_requests_status_created_idx on public.custom_cake_requests (status, created_at desc);
create index custom_cake_requests_delivery_date_idx on public.custom_cake_requests (delivery_date);
create index custom_cake_requests_whatsapp_created_idx on public.custom_cake_requests (whatsapp, created_at desc);

create table public.enquiries (
  id          uuid primary key default gen_random_uuid(),
  type        public.enquiry_type not null,
  name        text not null check (char_length(name) between 1 and 100),
  phone       text not null check (phone ~ '^\+[1-9][0-9]{7,14}$'),
  email       text check (
                char_length(email) <= 254
                and email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
                and email = lower(email)
              ),
  subject     text not null check (char_length(subject) between 1 and 150),
  message     text not null check (char_length(message) between 1 and 3000),
  heard_from  text check (char_length(heard_from) <= 40),
  status      public.enquiry_status not null default 'open',
  admin_notes text check (char_length(admin_notes) <= 2000),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index enquiries_status_created_idx on public.enquiries (status, created_at desc);
create index enquiries_phone_created_idx on public.enquiries (phone, created_at desc);

create trigger custom_cake_requests_set_updated_at before update on public.custom_cake_requests
  for each row execute function extensions.moddatetime (updated_at);
create trigger enquiries_set_updated_at before update on public.enquiries
  for each row execute function extensions.moddatetime (updated_at);

alter table public.custom_cake_requests enable row level security;
alter table public.enquiries enable row level security;

grant select, delete on public.custom_cake_requests, public.enquiries to authenticated;
grant update (status, admin_notes) on public.custom_cake_requests, public.enquiries to authenticated;

create policy "custom_cake_requests: admin read" on public.custom_cake_requests
  for select to authenticated using ((select private.is_admin()));
create policy "custom_cake_requests: admin update" on public.custom_cake_requests
  for update to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));
create policy "custom_cake_requests: admin delete" on public.custom_cake_requests
  for delete to authenticated using ((select private.is_admin()));

create policy "enquiries: admin read" on public.enquiries
  for select to authenticated using ((select private.is_admin()));
create policy "enquiries: admin update" on public.enquiries
  for update to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));
create policy "enquiries: admin delete" on public.enquiries
  for delete to authenticated using ((select private.is_admin()));
