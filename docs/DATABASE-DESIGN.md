# Database Design — Supabase (Postgres)

> Status: **design only**. Nothing here has been created yet. All objects will be created through Supabase CLI migrations (`supabase/migrations/*.sql`), never by hand in the dashboard.
> Companion docs: [`PROJECT-AUDIT.md`](./PROJECT-AUDIT.md) · [`PRODUCTION-ARCHITECTURE.md`](./PRODUCTION-ARCHITECTURE.md) · [`MIGRATION-PLAN.md`](./MIGRATION-PLAN.md)

## Design principles

1. **Only tables the business actually uses.** Each table maps to data that exists in the current site or to a record the owner needs (orders, requests, enquiries). Testimonials, FAQ, store hours, and custom-cake option lists stay in typed code config (`lib/config/*`) until the owner needs to edit them without a deploy.
2. **Money is stored as integer paise** (`₹749` → `74900`). There are no floats, and it is ready for Razorpay if online payment is added later.
3. **Snapshots on orders.** Order lines copy the product name, weight, and unit price at purchase time, so later catalog edits never rewrite history.
4. **RLS on every table, deny by default.** Anonymous users can only read published catalog/content rows. Customer submissions go through narrow `SECURITY DEFINER` functions that validate and compute prices. Anonymous users have **no** direct `INSERT`, `UPDATE`, or `DELETE` on any table. The service-role key is never used by the running application.
5. **Constraints in the database, not only in Zod.** Zod gives good error messages at the edge, and `CHECK` constraints and functions are the final backstop.
6. **Explicit grants.** `REVOKE ALL` from `anon`/`authenticated`, then grant only what each role needs. RLS then filters rows.

---

## 1. Entity relationships

```
auth.users (Supabase)
   │ 1
   │
   │ 0..1
admin_users ───────────────┐ (author_id)
                           │
product_categories 1 ──< products 1 ──< order_items >── 1 orders >── 0..1 shipping_rates
       (ships_statewide)      (is_featured,                (snapshot      (region, delivery,
                               price_paise)                 of price)      totals, status)

blog_posts >── 0..1 auth.users (author)

gallery_items            (standalone)
custom_cake_requests     (standalone — a quote request, no catalog FK)
enquiries                (standalone)
[newsletter_subscribers] (only if the owner decides to keep the newsletter)
```

Relationship notes:
- A **category** has many **products**. The category's `ships_statewide` flag encodes the current rule "cakes are Pune-only; cookies, loaves, and desserts can be couriered across Maharashtra" (legacy `CAKE_CATS` / `COOKIE_CATS`).
- An **order** has 1..n **order_items**. Each item references a product (nullable, `ON DELETE SET NULL`) **and** keeps snapshot columns.
- An **order** references a **shipping_rate** only for Maharashtra courier delivery.
- **Custom-cake requests** are not catalog orders. The price is quoted by the owner later (`quoted_price_paise`).
- **admin_users** is a 1:1 extension of `auth.users` for staff who can access `/admin`.

---

## 2. Enum types

| Type | Values | Used by |
|---|---|---|
| `product_badge` | `new`, `popular` | products.badge |
| `card_theme` | `honey`, `green`, `lilac`, `rose`, `blue`, `brown` | products / blog cover backgrounds (replaces raw CSS gradients; no CSS stored in the DB) |
| `delivery_region` | `pune`, `maharashtra` | orders |
| `delivery_type` | `quick`, `scheduled` | orders |
| `delivery_slot` | `morning`, `afternoon`, `evening` | orders, custom_cake_requests |
| `order_status` | `pending`, `confirmed`, `preparing`, `out_for_delivery`, `delivered`, `cancelled` | orders |
| `request_status` | `new`, `quoted`, `confirmed`, `completed`, `cancelled` | custom_cake_requests |
| `enquiry_type` | `custom_cake`, `product`, `delivery`, `general`, `bulk` | enquiries |
| `enquiry_status` | `new`, `in_progress`, `closed` | enquiries |
| `media_type` | `image`, `video` | gallery_items |
| `gallery_tag` | `custom`, `kids`, `celebration`, `healthy`, `store` | gallery_items.tags |
| `post_status` | `draft`, `published` | blog_posts |

Postgres enums can gain values with `ALTER TYPE … ADD VALUE` in a migration. They are used here because they produce precise TypeScript unions through `supabase gen types`. Custom-cake option lists (occasions, flavours, finishes, themes, toppers, sizes) are **not** enums: they change often and include free-text "Other". They are validated by Zod against `lib/config/custom-cake-options.ts` and stored as length-limited text.

---

## 3. Tables

Conventions:
- `id uuid primary key default gen_random_uuid()`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`, maintained by the `moddatetime` trigger
- Slug check: `slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'`

### 3.1 `admin_users`

Who may use the admin dashboard.

| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| `user_id` | uuid | no | — | **PK**, FK → `auth.users(id)` `ON DELETE CASCADE` |
| `display_name` | text | no | — | 1–80 chars |
| `created_at` | timestamptz | no | now() | |

- Rows are created only by a migration or SQL run by the project owner. There is no API path to grant admin.
- *(If the owner wants restricted staff accounts, add `role text check (role in ('owner','staff'))`. This is not added now; see decisions.)*

### 3.2 `product_categories`

Seeded from the legacy categories: Cakes, Pastries, Loaves, Desserts, Jars & Bowls, Cake Balls.

| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| `id` | uuid | no | gen_random_uuid() | PK |
| `slug` | text | no | — | **UNIQUE**, slug check (`cakes`, `pastries`, …) |
| `name` | text | no | — | 1–60 chars |
| `emoji` | text | yes | — | ≤ 8 chars (filter-chip icon) |
| `ships_statewide` | boolean | no | false | `false` for cakes (Pune only) |
| `sort_order` | integer | no | 0 | |
| `is_active` | boolean | no | true | |
| `created_at` / `updated_at` | timestamptz | no | now() | |

Indexes: `unique(slug)`, `(is_active, sort_order)`.

### 3.3 `products`

| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| `id` | uuid | no | gen_random_uuid() | PK |
| `slug` | text | no | — | **UNIQUE**, slug check |
| `category_id` | uuid | no | — | FK → `product_categories(id)` `ON DELETE RESTRICT` |
| `name` | text | no | — | 1–120 chars |
| `description` | text | yes | — | ≤ 2,000 chars (new; optional) |
| `price_paise` | integer | no | — | `CHECK (price_paise > 0 AND price_paise <= 10000000)` |
| `weight_label` | text | no | — | e.g. `500 G`, `1 KG` (display, as today) |
| `weight_grams` | integer | yes | — | `CHECK (weight_grams > 0)`. Enables an automatic courier slab suggestion later |
| `tags` | text[] | no | `'{}'` | `CHECK (cardinality(tags) <= 8)` |
| `badge` | product_badge | yes | — | NEW / Best Seller |
| `emoji` | text | yes | — | fallback when there is no photo (8 legacy products have none) |
| `card_theme` | card_theme | no | `'honey'` | fallback background |
| `image_path` | text | yes | — | object path in Storage bucket `images` |
| `image_alt` | text | yes | — | ≤ 200 chars |
| `is_vegetarian` | boolean | no | true | the "Veg" marker on cards |
| `is_featured` | boolean | no | false | Home "Bestsellers" and loaf highlight |
| `is_active` | boolean | no | true | soft-hide instead of delete |
| `sort_order` | integer | no | 0 | "Default" sort |
| `created_at` / `updated_at` | timestamptz | no | now() | |

Indexes: `unique(slug)`, `(category_id)`, `(is_active, sort_order)`, partial `(sort_order) WHERE is_featured AND is_active`.
Search over 32 rows is done in memory on the client. No full-text index is needed now.

### 3.4 `shipping_rates`

Maharashtra courier slabs (legacy `MH_SHIPPING_SLABS`; the code comment says "edit these freely").

| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| `id` | uuid | no | gen_random_uuid() | PK |
| `label` | text | no | — | `Up to 500g` |
| `max_grams` | integer | yes | — | `NULL` = "Above 5 kg" (open-ended) |
| `charge_paise` | integer | no | — | `CHECK (charge_paise >= 0)` |
| `sort_order` | integer | no | 0 | |
| `is_active` | boolean | no | true | |
| `created_at` / `updated_at` | timestamptz | no | now() | |

Index: `(is_active, sort_order)`. Unique constraint `unique(max_grams)` with `NULLS NOT DISTINCT` (only one open-ended slab).

### 3.5 `orders`

Cart checkouts. Created **only** through `public.place_order(...)`.

| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| `id` | uuid | no | gen_random_uuid() | PK |
| `order_number` | text | no | `'AHB-' \|\| lpad(nextval('order_number_seq')::text, 6, '0')` | **UNIQUE**. Shown to the customer and in the WhatsApp message |
| `customer_name` | text | no | — | 1–100 chars |
| `mobile` | text | no | — | E.164 normalised, `CHECK (mobile ~ '^\+[1-9][0-9]{7,14}$')` |
| `whatsapp` | text | yes | — | same check. `NULL` = same as mobile |
| `address_line` | text | no | — | 5–300 chars |
| `area` | text | yes | — | ≤ 100 |
| `city` | text | no | — | 2–60 |
| `pincode` | text | no | — | `CHECK (pincode ~ '^[1-9][0-9]{5}$')` |
| `location_url` | text | yes | — | `CHECK (location_url ~ '^https://maps\.google\.com/\?q=-?[0-9.]+,-?[0-9.]+$')` |
| `region` | delivery_region | no | — | |
| `delivery_type` | delivery_type | yes | — | required when `region = 'pune'` |
| `delivery_date` | date | yes | — | required when `delivery_type = 'scheduled'` |
| `delivery_slot` | delivery_slot | yes | — | required when `delivery_type = 'scheduled'` |
| `shipping_rate_id` | uuid | yes | — | FK → `shipping_rates(id)` `ON DELETE SET NULL`. Required when `region = 'maharashtra'` |
| `shipping_label` | text | yes | — | snapshot of the slab label |
| `shipping_charge_paise` | integer | no | 0 | `>= 0` |
| `subtotal_paise` | integer | no | — | computed **in the DB function** from product prices |
| `extra_charges_paise` | integer | no | 0 | admin-entered (e.g. Porter 50% share for > 2 km) |
| `total_paise` | integer | no | — | `subtotal + shipping` at creation |
| `customer_notes` | text | yes | — | ≤ 1,000 |
| `status` | order_status | no | `'pending'` | |
| `admin_notes` | text | yes | — | ≤ 2,000, admin only |
| `created_at` / `updated_at` | timestamptz | no | now() | |

Table-level checks:
- `(region = 'pune') = (delivery_type IS NOT NULL)`
- `(delivery_type = 'scheduled') = (delivery_date IS NOT NULL AND delivery_slot IS NOT NULL)`
- `(region = 'maharashtra') = (shipping_rate_id IS NOT NULL OR shipping_label IS NOT NULL)`
- `total_paise = subtotal_paise + shipping_charge_paise`

Indexes: `unique(order_number)`, `(status, created_at DESC)` (admin list), `(created_at DESC)`, `(mobile, created_at DESC)` (throttle and customer lookup), `(delivery_date) WHERE delivery_date IS NOT NULL` (production planning).

### 3.6 `order_items`

| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| `id` | uuid | no | gen_random_uuid() | PK |
| `order_id` | uuid | no | — | FK → `orders(id)` `ON DELETE CASCADE` |
| `product_id` | uuid | yes | — | FK → `products(id)` `ON DELETE SET NULL` |
| `product_name` | text | no | — | snapshot |
| `weight_label` | text | no | — | snapshot |
| `unit_price_paise` | integer | no | — | snapshot, `> 0` |
| `quantity` | smallint | no | — | `CHECK (quantity BETWEEN 1 AND 50)` |
| `line_total_paise` | integer | no | generated | `GENERATED ALWAYS AS (unit_price_paise * quantity) STORED` |

Indexes: `(order_id)`, `(product_id)` (FK index; supports "top sellers" reports). Unique `(order_id, product_id)`: duplicate lines are merged by the function.

### 3.7 `custom_cake_requests`

Replaces the Google Sheet. It captures every field of the legacy form. Created **only** through `public.submit_custom_cake_request(...)`.

| Column | Type | Null | Notes |
|---|---|---|---|
| `id` | uuid | no | PK |
| `request_number` | text | no | **UNIQUE**, `'CC-' \|\| lpad(nextval('cake_request_seq')::text, 5, '0')` |
| `occasion` | text | no | ≤ 40, validated against config |
| `name_on_cake` | text | yes | ≤ 60 (birthday) |
| `age_or_number` | text | yes | ≤ 10 (birthday) |
| `number_candle` | boolean | no, default false | |
| `anniversary_details` | text | yes | ≤ 80 |
| `cake_knife` | boolean | no, default false | (birthday or anniversary) |
| `size` | text | no | ≤ 60, validated against config |
| `tiers` | smallint | no, default 1 | `CHECK (tiers BETWEEN 1 AND 3)`. The size→tier rule is enforced in the function |
| `flavour` | text | no | ≤ 40 |
| `finish` | text | no | ≤ 60 |
| `theme` | text | no | ≤ 60 |
| `topper` | text | no | ≤ 40 |
| `guests_adults` / `guests_kids` | smallint | yes | `0–1000` |
| `design_description` | text | yes | ≤ 2,000 |
| `colour_preference` | text | yes | ≤ 120 |
| `reference_url` | text | yes | ≤ 500, `CHECK (reference_url ~ '^https://')` |
| `delivery_date` | date | no | function enforces ≥ today (IST) + 2 |
| `delivery_slot` | delivery_slot | no | |
| `address` | text | no | 5–500 |
| `location_url` | text | yes | same check as orders |
| `customer_name` | text | no | 1–100 |
| `whatsapp` | text | no | E.164 check |
| `instagram_handle` | text | yes | `CHECK (instagram_handle ~ '^@?[A-Za-z0-9._]{1,30}$')` |
| `allergies_notes` | text | yes | ≤ 1,000 |
| `status` | request_status | no, default `'new'` | |
| `quoted_price_paise` | integer | yes | admin, `>= 0` |
| `admin_notes` | text | yes | ≤ 2,000 |
| `created_at` / `updated_at` | timestamptz | no | |

Indexes: `unique(request_number)`, `(status, created_at DESC)`, `(delivery_date)`, `(whatsapp, created_at DESC)`.

### 3.8 `enquiries`

Contact-page messages. Created **only** through `public.submit_enquiry(...)`.

| Column | Type | Null | Notes |
|---|---|---|---|
| `id` | uuid | no | PK |
| `type` | enquiry_type | no | the five legacy tabs |
| `name` | text | no | 1–100 |
| `phone` | text | no | E.164 check |
| `email` | text | yes | ≤ 254, basic format check, stored lower-case |
| `subject` | text | no | 1–150 |
| `message` | text | no | 1–3,000 |
| `heard_from` | text | yes | ≤ 40 (the legacy "How did you hear about us?" options) |
| `status` | enquiry_status | no, default `'new'` | |
| `admin_notes` | text | yes | ≤ 2,000 |
| `created_at` / `updated_at` | timestamptz | no | |

Indexes: `(status, created_at DESC)`, `(phone, created_at DESC)`.

### 3.9 `gallery_items`

| Column | Type | Null | Notes |
|---|---|---|---|
| `id` | uuid | no | PK |
| `title` | text | no | 1–120 |
| `caption_tag` | text | yes | ≤ 40 (display tag: "Custom Cake", "Kids Cake", …) |
| `media_type` | media_type | no | |
| `storage_path` | text | no | in bucket `images` or `videos` |
| `poster_path` | text | yes | required for videos: `CHECK (media_type = 'image' OR poster_path IS NOT NULL)` |
| `alt_text` | text | no | 1–200 (accessibility) |
| `tags` | gallery_tag[] | no, default `'{}'` | filter chips. The "Videos" chip is derived from `media_type` |
| `width` / `height` | integer | yes | intrinsic size for layout (avoids CLS in masonry) |
| `sort_order` | integer | no, default 0 | |
| `is_published` | boolean | no, default true | |
| `created_at` / `updated_at` | timestamptz | no | |

Index: `(is_published, sort_order)`. No GIN index: there are ~12 rows, and filtering happens in memory.

### 3.10 `blog_posts`

| Column | Type | Null | Notes |
|---|---|---|---|
| `id` | uuid | no | PK |
| `slug` | text | no | **UNIQUE**, slug check |
| `title` | text | no | 1–160 |
| `excerpt` | text | no | 1–400 (cards and meta description fallback) |
| `content_md` | text | no | Markdown (≤ 50,000). Rendered server-side **without raw HTML** |
| `topic` | text | no | ≤ 40 (`Our Story`, `Millets`, `Sweeteners`, `Baking Tips`, `Ingredients`, `Nutrition`, `Celebrations`) |
| `tags` | text[] | no, default `'{}'` | ≤ 10 |
| `cover_emoji` | text | yes | legacy visual style |
| `cover_theme` | card_theme | no, default `'honey'` | |
| `cover_image_path` | text | yes | optional photo cover |
| `reading_minutes` | smallint | no | 1–60. Computed on save in the admin action |
| `status` | post_status | no, default `'draft'` | |
| `is_featured` | boolean | no, default false | the "featured post" slot |
| `published_at` | timestamptz | yes | `CHECK (status = 'draft' OR published_at IS NOT NULL)` |
| `seo_title` | text | yes | ≤ 70 |
| `seo_description` | text | yes | ≤ 170 |
| `author_id` | uuid | yes | FK → `auth.users(id)` `ON DELETE SET NULL` |
| `created_at` / `updated_at` | timestamptz | no | |

Indexes: `unique(slug)`, `(status, published_at DESC)`, `(topic)`.

### 3.11 *(conditional)* `newsletter_subscribers`

Created **only if** the owner decides to keep the newsletter (see decisions). Columns: `id`, `email` (unique, lower-case), `status` (`pending`/`confirmed`/`unsubscribed`), `consent_text`, `confirmed_at`, `created_at`. Insert happens only through `public.subscribe_newsletter(email)`, with double opt-in if emails are sent.

### 3.12 Sequences and helpers

- `order_number_seq`, `cake_request_seq`: human-friendly reference numbers (UUIDs remain the PKs).
- `moddatetime` extension (in schema `extensions`) for `updated_at` triggers.
- Schema `private` (**not** exposed through the Data API) for helper functions.

---

## 4. Authentication relationship

```
auth.users ──1:0..1──> public.admin_users
```

- **There are no customer accounts.** Checkout, custom-cake, and contact are guest flows (the current UX). This avoids storing passwords for customers and keeps the scope small.
- **Admins** are Supabase Auth users with email + password who also have a row in `admin_users`. Public sign-up is **disabled** in Auth settings. Admins are invited from the Supabase dashboard (or `supabase.auth.admin.inviteUserByEmail` from a local script), and the `admin_users` row is inserted by a reviewed SQL migration or snippet.
- **Authorization helper**:

```sql
create schema if not exists private;

create or replace function private.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.admin_users au
    where au.user_id = (select auth.uid())
  );
$$;

revoke all on function private.is_admin() from public;
grant usage on schema private to authenticated;
grant execute on function private.is_admin() to authenticated;
```

Policies call `(select private.is_admin())` so that Postgres evaluates it once per statement rather than once per row (the Supabase-recommended RLS performance pattern).

---

## 5. Row Level Security

RLS is **enabled on every table** (`alter table … enable row level security`). The default is deny. Grants are explicit:

```sql
revoke all on all tables in schema public from anon, authenticated;
-- then per table, grant only what is listed below
```

### 5.1 Policy matrix

| Table | anon SELECT | anon INSERT/UPDATE/DELETE | admin SELECT | admin INSERT | admin UPDATE | admin DELETE |
|---|---|---|---|---|---|---|
| `admin_users` | ✗ | ✗ | own row only (`user_id = auth.uid()`) | ✗ (migration only) | ✗ | ✗ |
| `product_categories` | ✓ where `is_active` | ✗ | ✓ all | ✓ | ✓ | ✓ (blocked by FK while products exist) |
| `products` | ✓ where `is_active` **and** its category is active | ✗ | ✓ all | ✓ | ✓ | ✓ (UI prefers deactivate; history is kept by snapshots) |
| `shipping_rates` | ✓ where `is_active` | ✗ | ✓ all | ✓ | ✓ | ✓ |
| `gallery_items` | ✓ where `is_published` | ✗ | ✓ all | ✓ | ✓ | ✓ |
| `blog_posts` | ✓ where `status = 'published' and published_at <= now()` | ✗ | ✓ all | ✓ | ✓ | ✓ |
| `orders` | ✗ | ✗ (only via `place_order`) | ✓ | ✗ (only via function) | ✓ (`status`, `admin_notes`, `extra_charges_paise` only, via column grants) | ✓ (spam / erasure requests) |
| `order_items` | ✗ | ✗ | ✓ | ✗ | ✗ (immutable) | cascades with order |
| `custom_cake_requests` | ✗ | ✗ (only via `submit_custom_cake_request`) | ✓ | ✗ | ✓ (`status`, `quoted_price_paise`, `admin_notes` only) | ✓ |
| `enquiries` | ✗ | ✗ (only via `submit_enquiry`) | ✓ | ✗ | ✓ (`status`, `admin_notes` only) | ✓ |

"admin" means role `authenticated` **and** `private.is_admin()` is true. An authenticated user who is not in `admin_users` gets the same as anon, or less.

### 5.2 Representative policy SQL

```sql
-- Public catalog read
create policy "products: public read active"
  on public.products for select
  to anon, authenticated
  using (
    is_active
    and exists (select 1 from public.product_categories c
                where c.id = category_id and c.is_active)
  );

-- Admin full access (one policy per command keeps intent explicit)
create policy "products: admin select" on public.products
  for select to authenticated using ((select private.is_admin()));
create policy "products: admin insert" on public.products
  for insert to authenticated with check ((select private.is_admin()));
create policy "products: admin update" on public.products
  for update to authenticated using ((select private.is_admin()))
  with check ((select private.is_admin()));
create policy "products: admin delete" on public.products
  for delete to authenticated using ((select private.is_admin()));

grant select on public.products to anon, authenticated;
grant insert, update, delete on public.products to authenticated;

-- Orders: admin may only change workflow columns
grant select, delete on public.orders to authenticated;
grant update (status, admin_notes, extra_charges_paise) on public.orders to authenticated;
create policy "orders: admin select" on public.orders
  for select to authenticated using ((select private.is_admin()));
create policy "orders: admin update" on public.orders
  for update to authenticated using ((select private.is_admin()))
  with check ((select private.is_admin()));
create policy "orders: admin delete" on public.orders
  for delete to authenticated using ((select private.is_admin()));
-- no anon policies at all on orders / order_items / custom_cake_requests / enquiries
```

### 5.3 Public write path (customer submissions)

Customers never touch the tables directly. Three functions are the **only** write path for anonymous users:

| Function | Purpose | Key guarantees |
|---|---|---|
| `public.place_order(customer…, delivery…, items jsonb)` → `(order_number, subtotal_paise, shipping_charge_paise, total_paise, lines jsonb)` | Cart checkout | Rejects 0 or > 30 lines and quantities outside 1–50. Merges duplicate lines. Loads **prices from `products`** (client prices are ignored). Rejects inactive products. Rejects Maharashtra orders containing non-statewide categories (cakes). Resolves the shipping slab from `shipping_rates`. Enforces `delivery_date >= (now() at time zone 'Asia/Kolkata')::date + 1`. Throttles to ≤ 3 orders per mobile per 10 minutes. Inserts the order and items atomically. |
| `public.submit_custom_cake_request(payload jsonb)` → `(request_number)` | Custom cake form | Copies **an explicit allow-list of keys** (no mass assignment). Enforces delivery date ≥ IST today + 2 and the size→tier rule. Throttles to ≤ 3 per WhatsApp number per 10 minutes. |
| `public.submit_enquiry(type, name, phone, email, subject, message, heard_from)` → `(id)` | Contact form | Field limits come from table checks. Throttles to ≤ 5 per phone per 10 minutes. |

All three are `SECURITY DEFINER`, `SET search_path = ''`, use fully qualified names, raise **coded** exceptions (`'PRODUCT_UNAVAILABLE'`, `'NOT_SHIPPABLE'`, `'RATE_LIMITED'`, `'INVALID_DATE'`, …) that Server Actions map to friendly messages, and are granted with:

```sql
revoke all on function public.place_order(...) from public;
grant execute on function public.place_order(...) to anon, authenticated;
```

**Why functions instead of anon `INSERT` policies:** an `INSERT` policy cannot recompute prices, write an order and its items atomically, or return an order number without also granting `SELECT` (which would expose other customers' PII). A narrow definer function keeps every table's RLS at "anon has nothing" while still allowing one well-defined, validated operation. These functions **cannot** read or modify existing rows. They only insert and return the new reference.

**Abuse note:** the anon key is public, so these functions can be called directly, bypassing the Next.js Server Action. That is acceptable because every rule (pricing, lead time, size limits, throttle) lives *inside* the function. Stronger bot protection (Cloudflare Turnstile verified inside the Server Action, with function execution then restricted to a dedicated role) is listed as a decision.

### 5.4 RLS verification

`supabase/tests/*.sql` (pgTAP, run with `supabase test db`) asserts for each table:
- anon cannot select from `orders`, `order_items`, `custom_cake_requests`, `enquiries`, or `admin_users`
- anon sees only active or published catalog rows
- anon cannot insert, update, or delete on any table
- a non-admin authenticated user has anon-equivalent access
- an admin can perform each allowed command, and cannot update snapshot columns on `orders` or any column on `order_items`
- `place_order` ignores tampered prices, rejects cakes for Maharashtra, enforces lead time, and throttles

---

## 6. Storage buckets

| Bucket | Public | Size limit | Allowed MIME types | Contents | Path convention |
|---|---|---|---|---|---|
| `images` | **yes** (read via public URL / `next/image`) | 5 MB | `image/jpeg`, `image/png`, `image/webp`, `image/avif` | product photos, gallery images, video posters, blog covers | `products/{product_id}/{uuid}.{ext}`, `gallery/{uuid}.{ext}`, `blog/{post_id}/{uuid}.{ext}` |
| `videos` | **yes** | 30 MB | `video/mp4`, `video/webm` | gallery videos (compressed before upload) | `gallery/{uuid}.{ext}` |

Storage RLS on `storage.objects`:

```sql
create policy "media: admin insert" on storage.objects for insert to authenticated
  with check (bucket_id in ('images','videos') and (select private.is_admin()));
create policy "media: admin update" on storage.objects for update to authenticated
  using (bucket_id in ('images','videos') and (select private.is_admin()));
create policy "media: admin delete" on storage.objects for delete to authenticated
  using (bucket_id in ('images','videos') and (select private.is_admin()));
create policy "media: admin list" on storage.objects for select to authenticated
  using (bucket_id in ('images','videos') and (select private.is_admin()));
```

Public buckets serve objects by URL without a `SELECT` policy. Listing bucket contents through the API stays admin-only.

**Not in Storage:** brand assets that change with the design (logo, favicons, hero video and poster, About/founder photos, default OG image) live in `public/` and are versioned with the code.

**No customer uploads** in v1. The legacy "reference image" upload never worked, and customers paste a Pinterest/Google link or send photos on WhatsApp. If uploads are wanted later: a **private** bucket `cake-references`, uploads via a server-issued signed upload URL, a 5 MB image-only limit, and admin-only reads through signed URLs.

---

## 7. Migration strategy

### 7.1 Tooling and environments

| Environment | Supabase | Used by |
|---|---|---|
| Local | `supabase start` (Docker) | developers; `seed.sql` loaded automatically |
| Staging *(recommended)* | separate free project | Vercel Preview deployments |
| Production | dedicated project (Pro plan recommended; see decisions) | Vercel Production |

- Every schema change is a new timestamped file in `supabase/migrations/`, created with `supabase migration new <name>`, reviewed in a PR, and tested locally (`supabase db reset` + `supabase test db`).
- Apply to staging and then production with `supabase db push` (or CI on merge to `main`). **No dashboard edits** in staging or production. If someone hot-fixes in the dashboard, capture it immediately with `supabase db diff` and commit it.
- After each migration, regenerate types: `supabase gen types typescript --local > types/database.types.ts` (committed, and checked in CI).
- Migrations are forward-only. Destructive changes (drop or rename a column) follow expand → migrate code → contract across two deploys.

### 7.2 Planned migration files (order)

1. `..._extensions_and_schemas.sql`: `moddatetime`, schema `private`, default privilege revocations
2. `..._enums.sql`
3. `..._admin_users_and_is_admin.sql`
4. `..._catalog.sql`: `product_categories`, `products`, `shipping_rates` + RLS + grants + triggers
5. `..._content.sql`: `gallery_items`, `blog_posts` + RLS
6. `..._orders.sql`: sequences, `orders`, `order_items` + RLS + column grants
7. `..._requests_and_enquiries.sql`: `custom_cake_requests`, `enquiries` + RLS
8. `..._public_submission_functions.sql`: `place_order`, `submit_custom_cake_request`, `submit_enquiry`
9. `..._storage.sql`: buckets + `storage.objects` policies
10. *(conditional)* `..._newsletter.sql`

### 7.3 Data migration (legacy → Supabase)

| Source | Target | Method |
|---|---|---|
| `products.html` `PRODUCTS` array (32 items) **after owner review of price and name conflicts** (audit H-1, M-11) | `product_categories`, `products` | `scripts/import-legacy-catalog.ts` parses the legacy arrays and generates a reviewed SQL file. Local dev: `seed.sql`. Production: applied once with `psql` |
| `index.html` featured items | `products.is_featured` | same script (flag set by name match, reviewed) |
| `MH_SHIPPING_SLABS` | `shipping_rates` | same script |
| `blog.html` `ARTICLES` (10) | `blog_posts` | HTML → Markdown conversion in the script, with **manual proofreading** (slugs from titles) |
| `gallery.html` (12 items) | `gallery_items` + Storage | `scripts/upload-legacy-media.ts`: optimise (resize to ≤ 2000 px, WebP), upload, insert rows |
| `images/product-images/*` | Storage `images/products/…` | same media script |
| MongoDB `products` / `orders` / `blog` | — | **Inspect first.** The frontend never wrote to them, so they are probably empty. If they contain real orders, export them with `mongoexport` and map them into `orders` with legacy numbers |
| Google Sheet (custom-cake log) | *(optional)* `custom_cake_requests` | Owner decides: archive the sheet as-is (recommended) or import a CSV |

Scripts run **locally** with the secret key from a local `.env.local` that is never committed and never set in Vercel. They are idempotent (upsert on `slug`) and print a diff summary before writing to production.

No fake or placeholder data is created. Local `seed.sql` contains only the real legacy catalog, content, and shipping slabs.
