# Database Design — Supabase (Postgres)

> **Status: implemented in Phase 2** as migrations in [`supabase/migrations/`](../supabase/migrations/). Verified on the local test stack (127 pgTAP checks). **Not yet applied to staging or production**, because those projects don't exist yet.
> The migrations are the source of truth for exact SQL. This document describes the design, and any change starts as a new migration.
> Environment, auth, roles, env vars, and deployment are in [`SUPABASE-ARCHITECTURE.md`](./SUPABASE-ARCHITECTURE.md).

---

## 1. Scope (approved minimal schema)

| Table | Why it exists (evidence in the legacy site) |
|---|---|
| `admin_users` | Admin access (legacy `api/auth` + `admin/` intent), replacing the insecure env-password login |
| `product_categories` | Category filters on `legacy/products.html`. Carries the "cakes are Pune-only" rule (`CAKE_CATS` / `COOKIE_CATS`) |
| `products` | 32 hardcoded products + Home bestsellers. Single source of truth for prices |
| `shipping_rates` | `MH_SHIPPING_SLABS` ("edit these freely") |
| `orders`, `order_items` | Both legacy carts. Orders were never persisted |
| `custom_cake_requests` | Custom-cake form (replaces the Google Sheet and `localStorage`) |
| `enquiries` | Contact form |
| `gallery_items` | 12 gallery items |
| `blog_posts` | 10 articles (modal-only in the legacy site) |

**Not created:** `newsletter_subscribers` (decision pending). Fields removed during the audit are not reintroduced: product description, weight in grams, veg flag, alt text, order extra charges, quoted price, extra order statuses, blog tags/SEO/author/cover image/read time.

**One addition beyond the v2 proposal:** `admin_users.role` (enum `app_role` with the single value `admin`), so more roles can be added later without restructuring (owner instruction). See §5.

---

## 2. Relationships

```
auth.users ─1──0..1─ admin_users (role)

product_categories ─1──n─ products ─1──n─ order_items ─n──1─ orders ─n──0..1─ shipping_rates
  ships_statewide            price_paise    snapshots           totals, status

gallery_items · blog_posts · custom_cake_requests · enquiries   (standalone)
```

| FK | On delete | Reason |
|---|---|---|
| `admin_users.user_id → auth.users.id` | CASCADE | deleting an Auth user removes the admin grant |
| `products.category_id → product_categories.id` | RESTRICT | a category can't be deleted while it has products |
| `order_items.order_id → orders.id` | CASCADE | lines belong to their order |
| `order_items.product_id → products.id` | SET NULL | history survives product deletion (snapshot columns keep the name and price) |
| `orders.shipping_rate_id → shipping_rates.id` | SET NULL | `shipping_label` and `shipping_charge_paise` are snapshotted |

---

## 3. Conventions

- PK `id uuid default gen_random_uuid()` (except `admin_users`: PK `user_id`).
- `created_at` / `updated_at timestamptz not null default now()`. `updated_at` is maintained by an `extensions.moddatetime` trigger on every table that has it.
- **Money is integer paise.** Orders keep **snapshots** (product name, weight label, unit price, shipping label, shipping charge) that are never recomputed.
- Phones are E.164: `^\+[1-9][0-9]{7,14}$`. Pincodes: `^[1-9][0-9]{5}$`. Slugs: `^[a-z0-9]+(-[a-z0-9]+)*$`. Location links: `https://maps.google.com/?q=<lat>,<lng>` only.
- Every free-text column has a length CHECK, mirrored by the app's Zod schemas.

### Enums

| Enum | Values |
|---|---|
| `app_role` | `admin` |
| `card_theme` | `honey`, `green`, `lilac`, `rose`, `blue`, `brown` |
| `product_badge` | `new`, `popular` |
| `delivery_region` | `pune`, `maharashtra` |
| `delivery_type` | `quick`, `scheduled` |
| `delivery_slot` | `morning`, `afternoon`, `evening` |
| `request_status` | `pending`, `confirmed`, `completed`, `cancelled` (orders and custom-cake requests) |
| `enquiry_type` | `custom_cake`, `product`, `delivery`, `general`, `bulk` |
| `enquiry_status` | `open`, `closed` |
| `cake_size` | `bento_300g`, `half_kg`, `one_kg`, `one_and_half_kg`, `two_kg`, `custom` |
| `media_type` | `image`, `video` |
| `gallery_tag` | `custom`, `kids`, `celebration`, `healthy`, `store` |
| `post_status` | `draft`, `published` |

---

## 4. Tables

Legend: **PK** primary key · **U** unique · **FK** foreign key · NN = not null.

### `admin_users` (migration `…0200`)
| Column | Type | Constraints |
|---|---|---|
| user_id | uuid | **PK**, **FK** auth.users CASCADE |
| role | app_role | NN, default `admin` |
| created_at | timestamptz | NN |

### `product_categories` (`…0300`)
| Column | Type | Constraints |
|---|---|---|
| id | uuid | **PK** |
| slug | text | NN, **U**, slug format |
| name | text | NN, 1–60 |
| emoji | text | ≤ 8 |
| ships_statewide | boolean | NN, default false (false = Pune only) |
| sort_order | integer | NN, default 0 |
| created_at, updated_at | timestamptz | NN |

### `products` (`…0300`)
| Column | Type | Constraints |
|---|---|---|
| id | uuid | **PK** |
| slug | text | NN, **U**, slug format |
| category_id | uuid | NN, **FK** product_categories RESTRICT |
| name | text | NN, 1–120 |
| price_paise | integer | NN, 1 … 10,000,000 |
| weight_label | text | NN, 1–20 (`500 G`) |
| tags | text[] | NN, default `{}`, ≤ 8 |
| badge | product_badge | — |
| emoji | text | ≤ 8 (fallback when no photo) |
| card_theme | card_theme | NN, default `honey` |
| image_path | text | ≤ 300 (path in bucket `media`) |
| is_featured | boolean | NN, default false |
| is_active | boolean | NN, default true |
| sort_order | integer | NN, default 0 |
| created_at, updated_at | timestamptz | NN |

Indexes: `products_category_id_idx (category_id)`, `products_active_sort_idx (is_active, sort_order)`, plus the unique slug index.

### `shipping_rates` (`…0300`)
| Column | Type | Constraints |
|---|---|---|
| id | uuid | **PK** |
| label | text | NN, 1–40 |
| max_grams | integer | > 0. `null` = open-ended. **U** with `NULLS NOT DISTINCT` |
| charge_paise | integer | NN, ≥ 0 |
| sort_order | integer | NN |
| created_at, updated_at | timestamptz | NN |

### `orders` (`…0500`)
| Column | Type | Constraints |
|---|---|---|
| id | uuid | **PK** |
| order_number | text | NN, **U**, default `AHB-` + 6-digit sequence |
| customer_name | text | NN, 1–100 |
| mobile | text | NN, E.164 |
| whatsapp | text | E.164 (`null` = same as mobile) |
| address_line | text | NN, 5–300 |
| area | text | ≤ 100 |
| city | text | NN, 2–60 |
| pincode | text | NN, Indian pincode |
| location_url | text | Google Maps `?q=lat,lng` only |
| region | delivery_region | NN |
| delivery_type | delivery_type | required iff region = pune |
| delivery_date, delivery_slot | date, delivery_slot | required iff scheduled, otherwise null |
| shipping_rate_id | uuid | **FK** shipping_rates SET NULL |
| shipping_label | text | snapshot. Required iff region = maharashtra |
| shipping_charge_paise | integer | NN, ≥ 0 (snapshot) |
| subtotal_paise | integer | NN, > 0 |
| total_paise | integer | NN, **= subtotal + shipping** (CHECK) |
| customer_notes | text | ≤ 1000 |
| status | request_status | NN, default `pending` |
| admin_notes | text | ≤ 2000 |
| created_at, updated_at | timestamptz | NN |

Indexes: `(status, created_at desc)`, `(created_at desc)`, `(mobile, created_at desc)` (throttle and lookup), partial `(delivery_date) where not null`, `(shipping_rate_id)` (FK).

### `order_items` (`…0500`)
| Column | Type | Constraints |
|---|---|---|
| id | uuid | **PK** |
| order_id | uuid | NN, **FK** orders CASCADE |
| product_id | uuid | **FK** products SET NULL |
| product_name, weight_label | text | NN (snapshots) |
| unit_price_paise | integer | NN, > 0 (snapshot) |
| quantity | smallint | NN, 1–50 |
| line_total_paise | integer | generated: `unit_price_paise * quantity` |

Constraint `unique (order_id, product_id)`. Index `(product_id)`.

### `custom_cake_requests` (`…0600`)
Columns: `id` **PK** · `request_number` **U** (default `CC-` + 5 digits) · `occasion` NN ≤ 40 · `name_on_cake` ≤ 60 · `age_or_number` ≤ 10 · `number_candle` bool · `anniversary_details` ≤ 80 · `cake_knife` bool · `size` cake_size NN · `tiers` smallint NN · `flavour` NN ≤ 40 · `finish` NN ≤ 60 · `theme` NN ≤ 60 · `topper` NN ≤ 40 · `guests_adults`, `guests_kids` 0–1000 · `design_description` ≤ 2000 · `colour_preference` ≤ 120 · `reference_url` https only, ≤ 500 · `delivery_date` date NN · `delivery_slot` NN · `address` NN 5–500 · `location_url` (Maps only) · `customer_name` NN · `whatsapp` NN E.164 · `instagram_handle` `@?[A-Za-z0-9._]{1,30}` · `allergies_notes` ≤ 1000 · `status` request_status default `pending` · `admin_notes` ≤ 2000 · timestamps.
Constraint `cake_tiers_match_size`: bento/500 g/1 kg/1.5 kg → 1 tier. 2 kg → 1–2. custom → 1–3 (the legacy rules).
Indexes: `(status, created_at desc)`, `(delivery_date)`, `(whatsapp, created_at desc)`.

### `enquiries` (`…0600`)
Columns: `id` **PK** · `type` enquiry_type NN · `name` NN 1–100 · `phone` NN E.164 · `email` (format, lower-case, ≤ 254) · `subject` NN 1–150 · `message` NN 1–3000 · `heard_from` ≤ 40 · `status` enquiry_status default `open` · `admin_notes` ≤ 2000 · timestamps.
Indexes: `(status, created_at desc)`, `(phone, created_at desc)`.

### `gallery_items` (`…0400`)
Columns: `id` **PK** · `title` NN 1–120 · `caption_tag` ≤ 40 · `media_type` NN · `storage_path` NN ≤ 300 · `poster_path` ≤ 300 (**required for videos**, CHECK) · `alt_text` NN 1–200 · `tags` gallery_tag[] · `width`, `height` > 0 · `sort_order` · `is_published` default true · timestamps.
Index: `(is_published, sort_order)`.

### `blog_posts` (`…0400`)
Columns: `id` **PK** · `slug` NN **U** · `title` NN 1–160 · `excerpt` NN 1–400 · `content_md` NN 1–50,000 (Markdown) · `topic` NN 1–40 · `cover_emoji` ≤ 8 · `cover_theme` card_theme · `is_featured` bool · `status` post_status default `draft` · `published_at` (**required when published**, CHECK) · timestamps.
Indexes: `(status, published_at desc)`, partial unique `(is_featured) where is_featured` (at most one featured post).

---

## 5. Authorization model in the database

| Object | Definition |
|---|---|
| `private` schema | Holds helper functions. **Not exposed** through the Data API. `usage` is granted to `authenticated` only |
| `private.has_role(app_role)` | `SECURITY DEFINER`, `search_path = ''`: is there an `admin_users` row for `auth.uid()` with that role? |
| `private.is_admin()` | `has_role('admin')`. Every admin policy calls `(select private.is_admin())`, evaluated once per statement. Adding a role later means extending `app_role` and editing these helpers or policies, not rewriting the schema |
| `private.india_today()` | today's date in `Asia/Kolkata`, used for lead-time rules. Not callable by API roles |
| Default privileges | Migrations revoke default table, sequence, and function privileges from `anon`/`authenticated`. Every grant is explicit |

---

## 6. RLS policies and grants

RLS is **enabled on all 10 tables** (asserted by a test). "Admin" = `authenticated` + `private.is_admin()`.

### 6.1 Matrix

| Table | anon | authenticated (non-admin) | admin |
|---|---|---|---|
| `admin_users` | no grant | SELECT own row | SELECT own row. **No API path** to insert, update, or delete |
| `product_categories` | SELECT all | SELECT all | + INSERT, UPDATE, DELETE |
| `products` | SELECT `is_active` | SELECT `is_active` | SELECT all + INSERT, UPDATE, DELETE |
| `shipping_rates` | SELECT all | SELECT all | + INSERT, UPDATE, DELETE |
| `gallery_items` | SELECT `is_published` | SELECT `is_published` | SELECT all + INSERT, UPDATE, DELETE |
| `blog_posts` | SELECT `status='published' and published_at <= now()` | same | SELECT all + INSERT, UPDATE, DELETE |
| `orders` | no grant | grant exists, RLS returns nothing | SELECT, UPDATE **(status, admin_notes only)**, DELETE |
| `order_items` | no grant | RLS returns nothing | SELECT only (immutable) |
| `custom_cake_requests` | no grant | RLS returns nothing | SELECT, UPDATE (status, admin_notes), DELETE |
| `enquiries` | no grant | RLS returns nothing | SELECT, UPDATE (status, admin_notes), DELETE |

Nobody, admins included, can INSERT into `orders`, `order_items`, `custom_cake_requests`, or `enquiries` directly. Rows come only from §7.

### 6.2 Policy names (per migration)

- `admin_users: read own row`
- `categories: public read` / `admin insert` / `admin update` / `admin delete`
- `products: public read active` / `admin read all` / `admin insert` / `admin update` / `admin delete`
- `shipping_rates: public read` / `admin insert` / `admin update` / `admin delete`
- `gallery: public read published` / `admin read all` / `admin insert` / `admin update` / `admin delete`
- `blog: public read published` / `admin read all` / `admin insert` / `admin update` / `admin delete`
- `orders: admin read` / `admin update` / `admin delete`, `order_items: admin read`
- `custom_cake_requests: admin read` / `admin update` / `admin delete`
- `enquiries: admin read` / `admin update` / `admin delete`

Update policies use both `using` and `with check` on `is_admin()`. Pricing protection comes from **column-level grants** (`grant update (status, admin_notes)`), so even an admin session cannot change totals, snapshots, or customer details through the API.

---

## 7. Database functions (public write path)

All three are `SECURITY DEFINER`, `set search_path = ''`, executable by `anon` and `authenticated`, and are the **only** SECURITY DEFINER functions in `public` (asserted by a test). They raise coded errors (`INVALID_INPUT` + violated constraint in DETAIL, `PRODUCT_UNAVAILABLE`, `NOT_SHIPPABLE`, `INVALID_DATE`, `RATE_LIMITED`).

| Function | Rules enforced inside the database |
|---|---|
| `place_order(customer…, region, delivery_type, delivery_date, delivery_slot, shipping_rate_id, notes, items jsonb) → jsonb` | Throttle: ≥ 20 orders/min site-wide or ≥ 3 per mobile per 10 min. Items: array of 1–30 objects with a uuid and an integer quantity ≥ 1, duplicates merged, ≤ 50 per product. **Prices from `products`** (client prices ignored). Inactive or unknown product → `PRODUCT_UNAVAILABLE`. Subtotal cap ₹10 lakh. Pune: delivery type required. Scheduled needs a slot and a date ≥ IST tomorrow. Quick has no date. Maharashtra: no `ships_statewide=false` categories (cakes) → `NOT_SHIPPABLE`, valid shipping slab required, snapshotted. Inserts order + snapshot lines atomically. Returns the server-computed summary and lines |
| `submit_custom_cake_request(p_request jsonb) → text` | Object only. Throttle (20/min site-wide, 3 per WhatsApp number per 10 min). Delivery date ≥ IST today + 2. **Explicit key allow-list**, so `status`, `admin_notes`, `request_number`, and timestamps can't be injected. Size/tier rule via CHECK. Returns the request number |
| `submit_enquiry(type, name, phone, email, subject, message, heard_from) → uuid` | Throttle (20/min, 5 per phone per 10 min). Table CHECKs validate fields |

---

## 8. Storage

| Bucket | Public read | Size limit | MIME allow-list |
|---|---|---|---|
| `media` (the only bucket) | yes (by URL) | 20 MiB | `image/jpeg`, `image/png`, `image/webp`, `image/avif`, `video/mp4`, `video/webm` (no HTML or SVG) |

Policies on `storage.objects` (`…0800`): `media: admin read` (list), `media: admin insert`, `media: admin update`, `media: admin delete`, all requiring `bucket_id = 'media'` and `private.is_admin()`. Anonymous and non-admin users cannot upload, modify, delete, or list objects. Public files are served by URL only.
Paths: `products/<product_id>/<uuid>.<ext>`, `gallery/<uuid>.<ext>`, `blog/<post_id>/<uuid>.<ext>`. The DB stores paths, not URLs. Deletes go through the Storage API (Supabase blocks direct SQL deletes on storage tables).

---

## 9. Tests (`supabase/tests/`, 127 checks, all passing)

| File | Covers |
|---|---|
| `00_schema.test.sql` | exact table set (no newsletter). RLS on every table. anon has no grants on private tables. No direct insert path. Column-level pricing protection. Only the 3 definer functions are public, and all pin `search_path` |
| `01_public_visibility.test.sql` | active-only catalogue, published-only blog (drafts and future posts hidden), published-only gallery, for anon / non-admin / admin. Visibility changes when admins publish or deactivate |
| `02_private_data.test.sql` | anon gets permission errors on orders, items, requests, enquiries, and admin_users. Non-admin sees nothing, can't write, can't self-grant admin, and their updates affect nothing |
| `03_admin.test.sql` | admin CRUD on catalogue and content, workflow updates. **Cannot** change order totals or line snapshots. Catalogue price changes don't rewrite history |
| `04_place_order.test.sql` | price tampering ignored, merging, availability, quantity/format validation, Maharashtra cake block, shipping pricing, lead time, slot requirement, throttling, stored-total consistency |
| `05_requests_enquiries.test.sql` | key injection ignored, tier rules, 2-day notice, https-only links, throttling, enquiry validation |
| `06_storage.test.sql` | single public bucket, safe MIME list. Anon and non-admin cannot upload, update, delete, or list. Admin can |

A mutation check during Phase 2 (temporarily adding a permissive policy and a price-column grant) made 6 checks fail as expected, and the reset restored a clean pass.
