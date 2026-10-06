# Production Architecture — Next.js + Supabase

> Status: **target design**, not yet implemented. Companion docs: [`PROJECT-AUDIT.md`](./PROJECT-AUDIT.md) · [`DATABASE-DESIGN.md`](./DATABASE-DESIGN.md) · [`MIGRATION-PLAN.md`](./MIGRATION-PLAN.md)
> Versions: target the latest stable **Next.js (16.x at time of writing)**, React 19, TypeScript 5 (strict), `@supabase/supabase-js` 2 + `@supabase/ssr`, Zod 4. Exact framework APIs (caching, `proxy.ts`) are verified against the installed version's docs in Phase 1.

---

## 1. Shape of the system

```
                 ┌──────────────────────── Vercel ────────────────────────────┐
Browser ──HTTPS──▶ proxy.ts (session refresh, /admin gate)                     │
                 │      │                                                      │
                 │      ▼                                                      │
                 │  App Router                                                 │
                 │  ├─ (site) pages — Server Components, statically rendered,  │
                 │  │   revalidated on demand when admin edits content         │
                 │  │   └─ client islands: cart, checkout, filters, forms,     │
                 │  │      lightbox, mobile nav                                │
                 │  ├─ Server Actions — placeOrder, submitCustomCake,          │
                 │  │   submitEnquiry, admin CRUD, auth                        │
                 │  ├─ admin pages — dynamic, per-request, admin-only          │
                 │  └─ Route Handler — /auth/confirm only                      │
                 └──────────┬──────────────────────────────────────────────────┘
                            │ anon/publishable key + user JWT (RLS applies)
                            ▼
                 ┌──────────────────── Supabase ───────────────────┐
                 │ Postgres (RLS on every table, definer functions)│
                 │ Auth (admins only, invite-only)                 │
                 │ Storage (one public bucket: media)              │
                 └─────────────────────────────────────────────────┘
                            │
Customer ◀── wa.me deep link (order number + summary) ── WhatsApp ──▶ Owner
```

The business keeps its WhatsApp workflow. The change is that **every order, custom-cake request, and enquiry is validated, priced, and stored server-side first**, and the WhatsApp message carries the stored reference number.

---

## 2. Next.js architecture

### 2.1 Route map

| Route | Rendering | Data | Notes |
|---|---|---|---|
| `/` | Static + on-demand revalidation | featured products, 3 latest posts, 3 gallery items | Hero video served from `public/` with a poster |
| `/products` | Static + revalidation | active categories and products | Filters, search, and sort run client-side over the server-provided list (32 rows). Optional `?category=` for shareable links |
| `/custom-cake` | Static | options from `lib/config` | Form is a client island that submits through a Server Action |
| `/gallery` | Static + revalidation | published gallery items | Lightbox client island |
| `/about` | Static | config | Map iframe lazy-loaded |
| `/blog` | Static + revalidation | published posts | Topic filter via `?topic=` (server-side) |
| `/blog/[slug]` | **SSG** (`generateStaticParams`) + revalidation | one post | New URLs, `BlogPosting` JSON-LD, 404 for drafts |
| `/contact` | Static | config | Form is a client island. FAQ uses `<details>` (no JS) |
| `/privacy` | Static | — | New, required (audit H-8) |
| `/admin/login`, `/admin/forgot-password`, `/admin/update-password` | Dynamic | — | Public auth pages |
| `/admin/**` | Dynamic, `noindex` | admin queries | Guarded by `proxy.ts` **and** `requireAdmin()` in the layout **and** RLS |
| `/auth/confirm` | Route Handler | — | Exchanges the email token hash (invite / recovery) for a session |
| `/sitemap.xml`, `/robots.txt`, `/manifest.webmanifest` | file conventions | posts for the sitemap | |

**Legacy URL redirects** (`next.config.ts` `redirects()`, permanent): `/index.html → /`, `/products.html → /products`, `/custom-cake.html → /custom-cake`, `/gallery.html → /gallery`, `/about.html → /about`, `/blog.html → /blog`, `/contact.html → /contact`, `/menu.html → /products`. Non-`www` → `www` is handled by the Vercel domain configuration.

### 2.2 Layout composition

```
app/layout.tsx                      <html lang="en-IN">, fonts, GA, metadataBase, global CSS
└─ app/(site)/layout.tsx            <SiteHeader/> <CartProvider> {children} <CartDrawer/> </CartProvider> <SiteFooter/>
└─ app/admin/(auth)/layout.tsx      minimal centred card
└─ app/admin/(dashboard)/layout.tsx await requireAdmin(); <AdminShell>{children}</AdminShell>
```

### 2.3 Code organisation rules

- `app/**`: routing, metadata, and page composition only. Pages are thin and call `server/queries/*`.
- `components/**`: presentational and interactive UI. Components never import Supabase directly.
- `server/queries/*`: **read** functions (`import 'server-only'`). One file per domain. They return typed DTOs, not raw rows.
- `server/actions/*`: **write** functions (`'use server'`). Each one validates input with Zod, then authorises, then calls the DB, then revalidates, and returns a typed `ActionResult`.
- `lib/**`: framework-agnostic pure code (validation schemas, money, dates, WhatsApp message builders, config). This is where business rules shared by client and server live, written once.
- Component size guideline: about 150 lines. Large forms are split into sections (`CustomCakeForm` → `OccasionSection`, `CakeDetailsSection`, `ThemeSection`, `DeliverySection`, `ContactSection`, `LiveSummary`).

---

## 3. Server vs Client Components

**Default: Server Component.** A component becomes a Client Component only when it needs state, effects, browser APIs, or event handlers. The `'use client'` boundary is pushed as far down the tree as possible.

| Client Component (justified) | Why |
|---|---|
| `CartProvider`, `CartButton`, `CartDrawer`, `AddToCartButton` | Cart state + `localStorage` |
| `CheckoutDialog` | Form state, `useActionState`, dialog focus management |
| `ProductCatalog` (filters/search/sort) | Instant filtering over the server-provided list |
| `CustomCakeForm` | Conditional sections, live summary, geolocation |
| `ContactForm` | Form state, `useActionState` |
| `Lightbox` | Keyboard navigation, focus trap |
| `MobileNav` | Open/close state, `aria-expanded` |
| `Reveal` | `IntersectionObserver`. Content stays **visible without JS** (progressive enhancement) and respects `prefers-reduced-motion` |
| `ImageUpload`, admin forms | File input, previews, pending states |

**Stays on the server:** header and footer markup (only the toggle is client-side), product cards, the gallery grid, blog content (Markdown rendered on the server), the FAQ (`<details>`), the marquee (pure CSS), testimonials, page heroes, JSON-LD, and every data fetch.

Data crosses into client islands as **plain serialisable props** (e.g. `ProductCatalog` receives `ProductCardDTO[]`). Supabase clients are never passed to the client.

---

## 4. Data fetching strategy

- Public pages fetch in Server Components through `server/queries/*` using the **cookieless public Supabase client**, so the routes can be statically rendered and cached. Using the cookie-based client would force dynamic rendering.
- Every public query is tagged for invalidation: `products`, `categories`, `gallery`, `blog`, `blog:<slug>`, `shipping`.
- Admin pages use the **cookie-session server client** (RLS evaluates as the logged-in admin) and are always dynamic.
- Independent queries on a page run in parallel (`Promise.all`). Slow sections can stream behind `<Suspense>` with skeletons that match the existing card shapes.
- Reads select **explicit columns** (no `select('*')`) and map rows to DTOs, so admin-only columns can never leak into public payloads.

---

## 5. Server Actions

Every mutation is a Server Action. There are **no REST endpoints** for app data.

| Action | Caller | Steps |
|---|---|---|
| `placeOrder` | `CheckoutDialog` | Zod-parse → (optional Turnstile verify) → `rpc('place_order')` → map coded DB errors to field/form errors → return `{ orderNumber, lines, subtotal, shipping, total }` |
| `submitCustomCakeRequest` | `CustomCakeForm` | Zod → `rpc('submit_custom_cake_request')` → `{ requestNumber }` |
| `submitEnquiry` | `ContactForm` | Zod → `rpc('submit_enquiry')` → `{ id }` |
| `signIn` / `signOut` / `requestPasswordReset` / `updatePassword` | admin auth pages | Zod → Supabase Auth |
| `admin/products.*`, `admin/categories.*`, `admin/gallery.*`, `admin/blog.*`, `admin/shipping.*` | admin forms | `requireAdmin()` → Zod → DB (RLS as admin) → revalidate tags → result |
| `admin/orders.updateStatus`, `admin/customCakes.update`, `admin/enquiries.update` | admin tables | `requireAdmin()` → Zod → update allowed columns |

**WhatsApp handoff without popup blocking:** after `placeOrder` resolves, the dialog shows an **"Order AHB-000123 saved — Send on WhatsApp"** button (a real `<a href="https://wa.me/…">`) built by `lib/whatsapp/order-message.ts` from the **server-returned** totals. Calling `window.open` after an `await` is blocked by many mobile browsers, so a link the user taps is used instead. The message format matches today's message, plus the order number.

**`ActionResult` contract** (one shared type):

```ts
type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; formError?: string; fieldErrors?: Partial<Record<string, string[]>> };
```

Actions never throw to the client for expected failures, and they never return raw DB or exception messages.

---

## 6. Route Handlers

Only where a URL must be hit directly by something other than our own forms:

| Handler | Purpose |
|---|---|
| `app/auth/confirm/route.ts` | Target of Supabase invite and password-recovery emails. `verifyOtp({ type, token_hash })`, then redirect to `next` (allow-listed internal paths only, to prevent open redirects). |
| `app/sitemap.ts`, `app/robots.ts`, `app/manifest.ts` | Metadata file conventions (not custom APIs). |

The legacy `/api/*` functions are **not** ported. If a future integration needs a webhook (e.g. Razorpay payment confirmation), it gets its own Route Handler with signature verification.

---

## 7. Supabase client architecture

Exactly one factory per execution context, in `lib/supabase/`:

| File | Context | Key | Session | Used by |
|---|---|---|---|---|
| `public.ts` → `createPublicClient()` | Server only (`server-only`) | publishable/anon | none (cookieless) | public `server/queries/*`, cacheable |
| `server.ts` → `createServerClient()` | Server Components, Server Actions, Route Handlers | publishable/anon | cookies via `next/headers` (`@supabase/ssr`) | admin queries and actions, customer submission RPCs |
| `proxy.ts` → `updateSession()` | `proxy.ts` | publishable/anon | reads/writes request and response cookies | token refresh on every matched request |
| `browser.ts` → `createBrowserClient()` | Client Components | publishable/anon | browser cookies | **admin only**, and only where a browser client is required (e.g. direct-to-Storage upload with RLS). Public pages never ship a Supabase client |
| `scripts/` (outside `lib`) | local Node scripts | **secret / service-role** | — | legacy import and media upload, run manually. **Never imported by app code. Never set as a Vercel env var** |

- All clients are typed with `Database` from `types/database.types.ts`.
- `lib/env.ts` validates required env vars with Zod at startup, so the build fails if any are missing.
- An ESLint `no-restricted-imports` rule forbids importing `lib/supabase/server|public` from client files and forbids any app import of the scripts' admin client.

---

## 8. Authentication architecture

- **Who logs in:** admins only. There are no customer accounts and public sign-up is **disabled** in Supabase Auth settings.
- **Method:** email + password (Supabase-managed bcrypt hashing, refresh-token rotation, built-in auth rate limits). Optional TOTP MFA for admins (recommended, see decisions).
- **Onboarding:** the owner invites the admin's email from the Supabase dashboard. The invite email links to `{{ .RedirectTo }}/auth/confirm?type=invite&next=/admin/update-password` (for dashboard invites `RedirectTo` is the project's Site URL), where the admin sets a password. The owner then adds an `admin_users` row through the reviewed SQL snippet.
- **Password reset:** `/admin/forgot-password` → `resetPasswordForEmail(email, { redirectTo: <requesting origin> })`. The email link is `{{ .RedirectTo }}/auth/confirm?token_hash=…&type=recovery&next=/admin/update-password`, so it returns to the deployment that requested it (localhost, a Preview, or production). Supabase accepts the origin only if it matches the project's Redirect URL allow-list; otherwise it falls back to the Site URL. `/admin/update-password` then calls `updateUser({ password })`. The response is the same whether or not the email exists (no account enumeration).
- **Email delivery:** configure **custom SMTP** (Supabase's built-in sender is rate-limited and not meant for production). See decisions.
- **Sessions:** HTTP-only cookies managed by `@supabase/ssr`. `proxy.ts` refreshes tokens on each `/admin` request. Sign-out clears the session server-side.
- **Login hardening:** generic error message, Supabase's per-IP auth rate limits, plus a small server-side delay on failure. Login is the only public admin form.

---

## 9. Authorization architecture (defence in depth)

| Layer | Check | Purpose |
|---|---|---|
| 1. `proxy.ts` | No session → redirect `/admin/**` to `/admin/login` | UX and cheap early exit. **Not** a security boundary on its own |
| 2. `requireAdmin()` in `app/admin/(dashboard)/layout.tsx` **and at the top of every admin Server Action** | Verified user (`auth.getUser()`, or `auth.getClaims()` with asymmetric JWT keys; never `getSession()` alone) **and** an `admin_users` row → otherwise `redirect('/admin/login')` / `forbidden` | Server-side gate. Actions are callable endpoints, so the check is repeated there and not only in the layout |
| 3. Postgres RLS `private.is_admin()` | Every admin read and write | Final enforcement. A bug in layers 1–2 still cannot expose or modify data |
| 4. Column grants | `orders`/`requests`/`enquiries` updatable only on workflow columns | Prevents tampering with snapshot prices even by admins |

There is no client-side `isAdmin` flag, and authorization is never inferred from a JWT custom claim the client could influence.

---

## 10. Validation architecture

- **Zod schemas in `lib/validations/*`**, one per form or entity. They are shared by the client (instant field errors with the same messages) and the server (authoritative). The server **always** re-parses: client validation is UX only.
- Normalisation happens in the schema: trim strings, collapse whitespace, normalise phone numbers to E.164 (`+91` default), lower-case emails, and coerce numbers and dates.
- Domain rules in schemas: Indian pincode `^[1-9]\d{5}$`; delivery date ≥ tomorrow (cart) or ≥ +2 days (custom cake) computed in **Asia/Kolkata** (`lib/dates.ts`); size→tier rules; region→delivery-type rules; option values must exist in `lib/config/custom-cake-options.ts`; `reference_url` must be https; quantities 1–50; max 30 lines.
- The DB repeats the critical rules (CHECKs and the definer functions). The schema and DB limits share the same constants (`lib/validations/limits.ts`).
- Admin schemas cover products (price input in ₹ is converted to paise), blog (slug format, Markdown length), gallery, and shipping rates.

---

## 11. Error handling

| Situation | Handling |
|---|---|
| Expected validation or business error | `ActionResult` with `fieldErrors` / `formError`, rendered inline with `aria-describedby`. Focus moves to the first invalid field |
| Coded DB exceptions (`RATE_LIMITED`, `PRODUCT_UNAVAILABLE`, `NOT_SHIPPABLE`, `INVALID_DATE`) | Mapped to friendly copy in `lib/errors.ts` (e.g. "One item in your cart is no longer available — we've refreshed your cart") |
| Unexpected server error | Logged with context and a correlation id. The user sees "Something went wrong — please WhatsApp us at <business WhatsApp number>" (number from `NEXT_PUBLIC_WHATSAPP_NUMBER`; the WhatsApp fallback means no lost sales) |
| Rendering errors | `error.tsx` per segment (site and admin) and `global-error.tsx`. They use the brand styling and include a retry button and the WhatsApp fallback |
| Missing content | `notFound()` → branded `not-found.tsx` (with links to Products and Custom Cake) |
| Cart contains removed products | The cart re-hydrates against current product data on open and silently drops unknown ids with a notice |

---

## 12. Logging and observability

- `lib/logger.ts`: a thin structured logger (JSON lines: `level`, `event`, `requestId`, `context`) over `console`, collected by **Vercel Logs**. It never logs PII (phone, address, message bodies). It logs ids, order numbers, and error codes.
- Events logged: order placed (number, total, region), request submitted, enquiry submitted, auth failures (no email), admin mutations (`admin_user_id`, entity, id), and every unexpected error.
- Supabase logs (Postgres, Auth, Storage) are available in the dashboard.
- **Optional (decision):** Sentry for error aggregation and alerting. It is not added unless chosen.
- Vercel Analytics / Speed Insights is optional (decision). GA4 continues for marketing analytics.

---

## 13. Caching

| Content | Strategy |
|---|---|
| Public pages | Statically rendered at build. Cached at Vercel's edge |
| Invalidation | Admin Server Actions invalidate the affected **tags** after a successful mutation (using the installed Next version's API: in Next 16, `updateTag()` for read-your-own-writes inside actions and `revalidateTag()` elsewhere). For example, a product edit invalidates `products`, which refreshes `/` and `/products` |
| Safety net | A time-based revalidation (e.g. 1 h) on public routes in case an invalidation is missed |
| Admin pages | Dynamic, never cached |
| Cart | `localStorage` stores **only** `{ productId, qty }[]`. Display data (name, price, image) always comes from the latest server-rendered product list |
| Static assets | Hashed `/_next/static/*` (immutable). `public/` media with long cache headers. Supabase Storage public URLs are cached via `next/image` |

---

## 14. Image and media handling

- **`next/image` everywhere**, with explicit `sizes`, `width`/`height` (or `fill` with an aspect-ratio container) to prevent layout shift. `priority` is set only for the LCP image (the hero poster). Formats are AVIF/WebP.
- **Storage:** exactly **one** public Supabase Storage bucket, `media` (20 MiB per file; JPEG, PNG, WebP, AVIF, MP4, WebM only — no HTML or SVG). Files are publicly readable by URL. Only admins can upload, update, delete or list objects (`storage.objects` RLS via `private.is_admin()`). Object paths: `products/<product_id>/<uuid>.<ext>`, `gallery/<uuid>.<ext>`, `blog/<post_id>/<uuid>.<ext>`. See [`DATABASE-DESIGN.md` §8](./DATABASE-DESIGN.md#8-storage).
- `next.config.ts` `images.remotePatterns` is restricted to `https://<project-ref>.supabase.co/storage/v1/object/public/media/**`.
- **Brand assets** (`public/brand/*`) are re-exported at sensible sizes (the logo becomes ~96 px @2x, ~10 KB, instead of 440 KB).
- **Hero video:** transcode `VN20260809_031934.mp4` (23 MB) to ~720p H.264 MP4 plus WebM, targeting under 2 MB, with `muted playsInline loop` and a `poster`. Render it only at ≥ 900 px (it is already hidden on mobile), use `preload="none"` until visible, and show the poster only under `prefers-reduced-motion`.
- **Gallery video:** a poster image in the grid and click-to-play in the lightbox. No autoplay in the grid.
- **Admin uploads:** the Server Action receives a `File`. It validates MIME type (sniffed from magic bytes, not trusting the extension), enforces size ≤ 5 MB for images, writes to the `media` bucket under the paths above, stores the **path** (not the URL) in the DB, and deletes the old object on replace. The upload form also downscales on the client before sending, to keep within the Server Action body limit.
- Every image requires alt text (enforced by the admin form schema).
- **Cost note:** Vercel image optimisation has plan quotas. Supabase image transformations are a paid add-on and are **not** used. Original uploads are kept reasonable (≤ 2000 px).

---

## 15. SEO

- **Metadata API** per route: `title` template `%s | Akki's Healthy Baking`, description, canonical (`alternates.canonical`), Open Graph (`og:url`, absolute `og:image` 1200×630, `og:type`, `locale: en_IN`), and Twitter card. Existing titles and descriptions are kept as the starting copy. `metadataBase = https://www.akkishealthybaking.com`.
- **Structured data** (`components/seo/JsonLd.tsx`, server-rendered):
  - `Bakery` (a `LocalBusiness` subtype) on `/` and `/contact`: name, address (Bhanuse Wasti, Marunji Rd, Hinjawadi Phase II, Pune 411057), geo (18.59943, 73.72104 from the existing Maps embed), telephone, `openingHoursSpecification` (after the hours are reconciled), `sameAs` (Instagram), `priceRange`, `servesCuisine`.
  - `Product` + `Offer` (INR) for catalog items (an `ItemList` on `/products`).
  - `BlogPosting` on `/blog/[slug]`, `BreadcrumbList` on inner pages, `FAQPage` on `/contact`.
- `app/sitemap.ts` lists all static routes plus published posts with `lastModified`, using the correct namespace. `app/robots.ts` disallows `/admin` and `/auth`.
- Admin layout: `robots: { index: false, follow: false }`.
- Semantic HTML: one `h1` per page (as today), a landmark structure, and descriptive link text (replacing generic "Read more" with visually hidden context).
- Headings and content copy stay the same to keep current rankings. Only the URL structure grows (blog posts).

---

## 16. Security

| Area | Measure |
|---|---|
| Secrets | Only `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (anon), `NEXT_PUBLIC_SITE_URL`, and `NEXT_PUBLIC_GA_ID` are public. The service-role/secret key is **not** an app env var. `.env*` is git-ignored and `.env.example` is committed. Legacy `MONGODB_URI`, `JWT_SECRET`, `ADMIN_EMAIL`, and `ADMIN_PASSWORD` are **removed from Vercel and rotated** after cutover |
| Database | RLS on all tables, explicit grants, definer functions with `search_path = ''`, column-level update grants, pgTAP tests |
| Input | Zod on every action, DB CHECKs, length limits, E.164 phones, https-only URLs |
| Output | React auto-escaping. Blog Markdown rendered **without raw HTML**. No `dangerouslySetInnerHTML` except JSON-LD (serialised with `<` escaped) |
| Spreadsheet/CSV export (admin) | Cells starting with `= + - @` are prefixed with `'` (formula-injection safe) |
| Headers (`next.config.ts`) | `Content-Security-Policy` (self, plus GA, Google Fonts if not self-hosted, Supabase, Maps iframe, `wa.me` links; nonce-based scripts if GA requires it), `Strict-Transport-Security` (2 years, includeSubDomains, preload), `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` (geolocation=self for the location button, camera/mic off), `frame-ancestors 'none'` |
| CSRF | Server Actions enforce same-origin (Origin/Host check built into Next). No custom CORS. No `Access-Control-Allow-Origin: *` |
| Abuse | DB-level throttles in submission functions. Vercel Firewall rules for `/admin/login` and POST bursts. Optional Cloudflare Turnstile on public forms (decision) |
| Redirects | `next` parameters allow-listed to internal `/admin/*` paths |
| Dependencies | Lockfile committed, Dependabot/Renovate, `npm audit` in CI, minimal dependency list |
| Privacy | `/privacy` page, a notice under each form, PII never stored client-side, no PII in URLs or logs, retention policy for orders and enquiries (decision), GA consent approach (decision) |
| Google Apps Script | The old public endpoint is disabled or redeployed by the owner so the leaked URL stops accepting writes |

---

## 17. Deployment (Vercel)

- **Project:** the existing Vercel project, switched to the Next.js framework preset. Node 24 LTS (pinned via `engines: "24.x"`).
- **Branches:** `main` → Production. Feature and migration branches → Preview deployments wired to the **staging** Supabase project (so previews never write to production).
- **Env vars per environment:** Production gets the prod Supabase URL and publishable key. Preview and Development get the staging ones. `NEXT_PUBLIC_SITE_URL` is **environment-specific** and must be set explicitly in each scope:
  - Local: `NEXT_PUBLIC_SITE_URL=http://localhost:3000`
  - Vercel Preview: `NEXT_PUBLIC_SITE_URL=<the stable Preview URL, e.g. the branch alias https://akkis-git-next-app-<team>.vercel.app>`
  - Vercel Production: `NEXT_PUBLIC_SITE_URL=https://www.akkishealthybaking.com`

  If unset it falls back to the production domain, which is wrong for Preview. Auth email links do **not** rely on it (they use the requesting origin), but metadata and any absolute links do.
- **CI (GitHub Actions)** on every PR: `npm ci` → `tsc --noEmit` → `eslint` → unit tests → `supabase db reset && supabase test db` (Docker) → `next build`. Vercel builds independently.
- **DB deploys:** `supabase db push` to staging on merge to the integration branch, and to production as an explicit, reviewed step before (or with) the app deploy. Migrations are backward-compatible with the currently running app version.
- **Domains:** `www.akkishealthybaking.com` primary. The apex redirects to `www` (current canonical).
- **Rollback:** Vercel instant rollback for the app. DB migrations are expand-only during a release, so the previous app version remains compatible.

---

## 18. Guardrails (anti-patterns explicitly avoided)

| Avoid | How it is prevented |
|---|---|
| Unnecessary client components | Server by default. `'use client'` only in the list in §3, reviewed in PRs |
| Exposing secrets | No secret key in the app. `server-only` imports. Env validation. Lint rule |
| Direct DB access from unsafe client code | Public pages ship no Supabase client. Customers write only through Server Actions and RPCs. Anon has no table writes |
| Duplicated Supabase clients | Exactly one factory per context in `lib/supabase/` |
| Duplicated business logic | Pricing and rules live in the DB function. Formatting and messages live in `lib/` pure functions shared by client and server |
| Giant components and API files | ~150-line guideline, section components, one action file per domain |
| Hardcoded credentials or contact details | None in code. Secrets live only in env vars or dashboards. The business phone, WhatsApp number and contact email are env vars too (`NEXT_PUBLIC_CONTACT_PHONE`, `NEXT_PUBLIC_WHATSAPP_NUMBER`, `NEXT_PUBLIC_CONTACT_EMAIL`), read through `lib/config/contact.ts`. They are public (shown on the site) but configured per environment. WhatsApp ordering uses `wa.me` links, so no WhatsApp API key exists. If the WhatsApp Business API is adopted later, its token is a server-only secret |
| Insecure admin checks | Three server-side layers plus RLS. No client-side role flags |
| `any` | `strict: true`, `noUncheckedIndexedAccess`, ESLint `@typescript-eslint/no-explicit-any: error` |
| Disabling TS/ESLint | `next build` runs with type-check and lint enabled. No `ignoreBuildErrors` |

---

## 19. Dependencies (proposed)

| Package | Why |
|---|---|
| `next`, `react`, `react-dom` | framework |
| `typescript`, `@types/*` | type safety |
| `@supabase/supabase-js`, `@supabase/ssr` | DB/Auth/Storage clients with cookie sessions |
| `zod` | validation |
| `react-markdown` | render blog Markdown safely as React elements (no raw HTML) |
| `eslint`, `eslint-config-next`, `prettier` (dev) | code quality |
| `supabase` CLI (dev) | migrations, types, local stack, DB tests |
| `vitest`, `@testing-library/react` (dev, Phase 10) | unit and component tests |
| `@playwright/test` (dev, Phase 10) | end-to-end tests of checkout and admin |

Removed: `mongodb`, `bcryptjs`, `jsonwebtoken`, `razorpay` (unused; re-add Razorpay only if online payment is approved).
Styling uses **CSS Modules + global design tokens** (no new dependency). Tailwind is an alternative (see decisions).
