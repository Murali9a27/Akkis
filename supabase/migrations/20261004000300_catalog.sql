-- Catalog: categories, products, Maharashtra shipping slabs.
-- Design: docs/DATABASE-DESIGN.md §4.3, §5

create table public.product_categories (
  id              uuid primary key default gen_random_uuid(),
  slug            text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name            text not null check (char_length(name) between 1 and 60),
  emoji           text check (char_length(emoji) <= 8),
  ships_statewide boolean not null default false,
  sort_order      integer not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
comment on column public.product_categories.ships_statewide is
  'false = Pune/local delivery only (cakes); true = may be couriered across Maharashtra.';

create table public.products (
  id           uuid primary key default gen_random_uuid(),
  slug         text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  category_id  uuid not null references public.product_categories (id) on delete restrict,
  name         text not null check (char_length(name) between 1 and 120),
  price_paise  integer not null check (price_paise > 0 and price_paise <= 10000000),
  weight_label text not null check (char_length(weight_label) between 1 and 20),
  tags         text[] not null default '{}' check (cardinality(tags) <= 8),
  badge        public.product_badge,
  emoji        text check (char_length(emoji) <= 8),
  card_theme   public.card_theme not null default 'honey',
  image_path   text check (char_length(image_path) <= 300),
  is_featured  boolean not null default false,
  is_active    boolean not null default true,
  sort_order   integer not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index products_category_id_idx on public.products (category_id);
create index products_active_sort_idx on public.products (is_active, sort_order);

create table public.shipping_rates (
  id           uuid primary key default gen_random_uuid(),
  label        text not null check (char_length(label) between 1 and 40),
  max_grams    integer check (max_grams > 0),
  charge_paise integer not null check (charge_paise >= 0),
  sort_order   integer not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint shipping_rates_max_grams_key unique nulls not distinct (max_grams)
);
comment on column public.shipping_rates.max_grams is 'null = open-ended slab (e.g. "Above 5 kg").';

create trigger product_categories_set_updated_at before update on public.product_categories
  for each row execute function extensions.moddatetime (updated_at);
create trigger products_set_updated_at before update on public.products
  for each row execute function extensions.moddatetime (updated_at);
create trigger shipping_rates_set_updated_at before update on public.shipping_rates
  for each row execute function extensions.moddatetime (updated_at);

alter table public.product_categories enable row level security;
alter table public.products enable row level security;
alter table public.shipping_rates enable row level security;

grant select on public.product_categories, public.products, public.shipping_rates to anon, authenticated;
grant insert, update, delete on public.product_categories, public.products, public.shipping_rates to authenticated;

-- product_categories ------------------------------------------------------------------
create policy "categories: public read" on public.product_categories
  for select to anon, authenticated using (true);
create policy "categories: admin insert" on public.product_categories
  for insert to authenticated with check ((select private.is_admin()));
create policy "categories: admin update" on public.product_categories
  for update to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));
create policy "categories: admin delete" on public.product_categories
  for delete to authenticated using ((select private.is_admin()));

-- products ----------------------------------------------------------------------------
create policy "products: public read active" on public.products
  for select to anon, authenticated using (is_active);
create policy "products: admin read all" on public.products
  for select to authenticated using ((select private.is_admin()));
create policy "products: admin insert" on public.products
  for insert to authenticated with check ((select private.is_admin()));
create policy "products: admin update" on public.products
  for update to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));
create policy "products: admin delete" on public.products
  for delete to authenticated using ((select private.is_admin()));

-- shipping_rates ----------------------------------------------------------------------
create policy "shipping_rates: public read" on public.shipping_rates
  for select to anon, authenticated using (true);
create policy "shipping_rates: admin insert" on public.shipping_rates
  for insert to authenticated with check ((select private.is_admin()));
create policy "shipping_rates: admin update" on public.shipping_rates
  for update to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));
create policy "shipping_rates: admin delete" on public.shipping_rates
  for delete to authenticated using ((select private.is_admin()));
