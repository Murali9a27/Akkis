# Migration Plan — static HTML + MongoDB API → Next.js + Supabase

> Status: **plan only**. Implementation starts when the owner says "Proceed with Phase 1."
> Companion docs: [`PROJECT-AUDIT.md`](./PROJECT-AUDIT.md) · [`DATABASE-DESIGN.md`](./DATABASE-DESIGN.md) · [`PRODUCTION-ARCHITECTURE.md`](./PRODUCTION-ARCHITECTURE.md)

## Ground rules

- **The live site keeps running unchanged on `main` until cutover (Phase 12).** All work happens on an integration branch (`next-app`) with Vercel Preview deployments. Each phase is one or more PRs into `next-app`.
- **Nothing is deleted.** The legacy site is moved (with `git mv`) into `legacy/` on the integration branch so it stays available for side-by-side comparison. It is removed only after the owner signs off post-cutover.
- Each phase ends with its verification steps passing and a short demo or review before the next phase starts.
- Complexity scale: **S** ≈ ½–1 day · **M** ≈ 2–3 days · **L** ≈ 4–6 days (single developer, excluding owner review time).

## Phase overview

| # | Phase | Complexity | Depends on |
|---|---|---|---|
| 1 | Foundation | **S** | decisions D-1, D-2, D-11 |
| 2 | Supabase setup | **S** | 1, D-3, D-4 |
| 3 | Database schema, RLS, functions, storage | **M–L** | 2 |
| 4 | Admin authentication | **M** | 3, D-6 |
| 5 | Public website — design system and content pages | **L** | 1 (static parts), 3 (data reads) |
| 6 | Commerce flows — cart, checkout, custom cake, contact | **L** | 3, 5 |
| 7 | Admin dashboard | **L** | 4, 6 |
| 8 | Data and media migration | **M** | 3, D-5 (content decisions) |
| 9 | Security hardening and privacy | **M** | 6, 7 |
| 10 | SEO, performance, accessibility | **M** | 5, 6, 8 |
| 11 | Testing | **M** (ongoing; consolidated here) | all |
| 12 | Production deployment and cutover | **M** | all |

Phases 5 and 8 can overlap: the content import can run as soon as Phase 3 is merged.

---

## Phase 1 — Foundation

**What changes**
- Create the `next-app` branch. `git mv` all legacy files (`*.html`, `admin/`, `api/`, `images/`, `vercel.json`, `package.json`, `robots.txt`, `sitemap.xml`) into `legacy/`.
- Scaffold Next.js (App Router, TypeScript strict, ESLint flat config, no `src/` dir) at the repo root. Add Prettier.
- `tsconfig.json`: `strict`, `noUncheckedIndexedAccess`, `@/*` path alias.
- ESLint rules: `no-explicit-any: error`, `no-restricted-imports` (server-only modules), `jsx-a11y` (included with `eslint-config-next`).
- `lib/env.ts` (Zod-validated env), `.env.example`, `.gitignore` (`.env*`, `.next`, `node_modules`, `supabase/.temp`), `README.md` (setup and scripts), `engines: { node: "24.x" }` (current LTS, matches local dev), lockfile.
- Directories from [`PROJECT-AUDIT.md` §5](./PROJECT-AUDIT.md#5-recommended-nextjs-architecture-summary) are created by the phase that first needs them (git does not track empty folders; no placeholder files).
- GitHub Actions CI: install → typecheck → lint → build.
- `next.config.ts`: legacy `.html` → clean-URL permanent redirects (ported from `vercel.json` `cleanUrls` and rewrites).

**Files affected:** new `package.json`, `package-lock.json`, `tsconfig.json`, `eslint.config.mjs`, `.prettierrc`, `next.config.ts`, `app/layout.tsx`, `app/(site)/page.tsx` (placeholder), `lib/env.ts`, `.env.example`, `.gitignore`, `README.md`, `.github/workflows/ci.yml`. Moved: everything legacy → `legacy/`.

**Dependencies:** decisions D-1 (repo layout), D-2 (styling approach), D-11 (package manager).

**Risks:** Vercel project settings change from "Other" to "Next.js". This must only affect Previews until cutover, so the production branch settings stay pinned to `main`. *Mitigation:* confirm in the Vercel dashboard that Production deploys only from `main`.

**Verification:** `npm run build`, `npm run lint`, and `npx tsc --noEmit` pass. The Preview URL renders the placeholder. `main` production is unchanged (spot-check `/products`). Visiting `/products.html` on the preview 301-redirects to `/products`.

---

## Phase 2 — Supabase setup

**What changes**
- Create Supabase projects: **staging** and **production** (region closest to users: `ap-south-1` Mumbai). Disable public sign-ups. Set Site URL and redirect allow-list per environment. Configure custom SMTP (D-6).
- `supabase init` → `supabase/config.toml`. Link local CLI to staging.
- `lib/supabase/{public,server,browser,proxy}.ts` factories. `proxy.ts` with session refresh (matcher limited to `/admin/:path*` and `/auth/:path*`).
- `npm` scripts: `db:start`, `db:reset`, `db:types`, `db:test`, `db:push:staging`.
- Vercel env vars: Preview → staging keys. Production → prod keys (set now, unused until cutover).

**Files affected:** `supabase/config.toml`, `lib/supabase/*.ts`, `proxy.ts`, `package.json` scripts, `.env.example`, `README.md`.

**Dependencies:** Phase 1. D-3 (Supabase plan). D-4 (staging project).

**Risks:** Docker is required for the local Supabase stack on Windows (Docker Desktop with WSL2). The free tier pauses inactive projects (mitigated by D-3). Mis-set redirect URLs break auth emails.

**Verification:** `supabase start` works locally. A trivial query from a Server Component succeeds against local and staging. The publishable key appears in the client bundle only if it is intentionally imported. The secret key does not appear anywhere in the repo or Vercel (`git grep` and a Vercel env review).

---

## Phase 3 — Database: schema, RLS, functions, storage

**What changes**
- Migrations 1–9 from [`DATABASE-DESIGN.md` §7.2](./DATABASE-DESIGN.md#72-planned-migration-files-order): extensions, enums, `admin_users` + `private.is_admin()`, catalog, content, orders, requests/enquiries, the three submission functions, storage buckets and policies.
- `supabase/seed.sql` (local only) with the **real** legacy categories and shipping slabs (the catalog itself comes in Phase 8).
- pgTAP tests in `supabase/tests/` covering the RLS matrix and the function guarantees.
- Generated `types/database.types.ts`.

**Files affected:** `supabase/migrations/*.sql`, `supabase/seed.sql`, `supabase/tests/*.sql`, `types/database.types.ts`.

**Dependencies:** Phase 2.

**Risks:** RLS mistakes (exposing PII or blocking the site) are the highest-impact risk in the project. *Mitigation:* deny-by-default grants, a test for every cell of the policy matrix, and review of `supabase db lint` / Security Advisor output. Definer-function bugs are mitigated by `search_path = ''`, fully qualified names, and tests for tampered prices, wrong regions, past dates, and throttling.

**Verification:** `supabase db reset && supabase test db` is green. The Supabase Security Advisor and Performance Advisor show no errors. Manual check with the anon key: `select` on `orders` returns nothing, `insert` is denied, and `rpc('place_order')` with a tampered price stores the DB price. Push to staging succeeds.

---

## Phase 4 — Admin authentication

**What changes**
- `/admin/login`, `/admin/forgot-password`, `/admin/update-password` pages (accessible forms).
- `/auth/confirm` Route Handler (invite and recovery token exchange, allow-listed `next`).
- Server Actions `signIn`, `signOut`, `requestPasswordReset`, `updatePassword` with Zod.
- `lib/auth/require-admin.ts`. `app/admin/(dashboard)/layout.tsx` gate. `proxy.ts` redirect for unauthenticated `/admin/**`.
- Branded Supabase email templates (invite, recovery). Optional TOTP MFA enrolment page (D-6).
- Owner's admin account invited on staging. `admin_users` row added via a reviewed SQL snippet.

**Files affected:** `app/admin/(auth)/**`, `app/admin/(dashboard)/layout.tsx`, `app/auth/confirm/route.ts`, `server/actions/auth.ts`, `lib/auth/require-admin.ts`, `lib/validations/auth.ts`, `proxy.ts`, `supabase/templates/*.html` (email templates via `config.toml`).

**Dependencies:** Phase 3 (`admin_users`, `is_admin`). D-6 (SMTP, MFA, staff roles).

**Risks:** an open redirect via `next` (mitigated by the allow-list). Session refresh issues with static pages (mitigated by limiting the proxy matcher to admin and auth paths). Email deliverability (mitigated by custom SMTP).

**Verification:** a non-admin authenticated user is redirected and gets empty results from admin queries. Sign-in, sign-out, forgot password, and invite acceptance all work end-to-end on staging. Calling an admin Server Action without a session returns unauthorised. Repeated bad logins are rate-limited.

---

## Phase 5 — Public website: design system and content pages

**What changes**
- `styles/tokens.css` ported **exactly** from the legacy `:root` tokens (unifying `--radius`/`--r` drift and defining the missing `--green`). Base styles. `next/font` for Playfair Display and DM Sans.
- UI kit (`components/ui/*`): Button/LinkButton (pill styles), ChipRadioGroup (native radios styled as the legacy chips), Field/Select/Textarea, Dialog, Drawer, Badge, Toast.
- Layout: SiteHeader (desktop nav and CTA), MobileNav (one implementation, `aria-expanded`), SiteFooter (unified, including the Privacy link), PageHero (gradient and curved edge), Breadcrumbs, ExternalLink.
- Pages: Home sections, About, Gallery (grid and lightbox from DB), Blog list, Blog post (`/blog/[slug]`), Contact (static parts: quick strip, info, hours, map, FAQ via `<details>`), Privacy (copy from owner, D-9), `not-found`, `error`.
- `lib/config/site.ts`: NAP, hours, socials, WhatsApp number, testimonials, FAQ, stats, with the **owner-approved** values (D-5).
- `Reveal` progressive enhancement and `prefers-reduced-motion` handling.

**Files affected:** `styles/*`, `app/globals.css`, `app/(site)/**/page.tsx`, `app/(site)/layout.tsx`, `components/{ui,layout,home,gallery,blog,contact,seo}/**`, `server/queries/{products,categories,gallery,blog}.ts`, `lib/config/*`.

**Dependencies:** Phase 1 (can start on static pages immediately). Phase 3 for DB reads (use local seed data). D-2 (styling). D-5 (content conflicts).

**Risks:** visual drift from the current design, mitigated by side-by-side screenshot comparison against `legacy/` at 360, 768, and 1280 px for every page. Scope creep into redesign: changes to the look are limited to bug fixes (contrast, broken images) unless the owner approves.

**Verification:** each page matches its legacy counterpart visually (screenshot review signed off by the owner). Pages are statically rendered (build output shows ○/●). The JS payload for `/about` and `/blog/[slug]` contains no Supabase client. Keyboard-only navigation works across header, menu, lightbox, and FAQ. `axe` shows no critical violations.

---

## Phase 6 — Commerce flows: cart, checkout, custom cake, contact

**What changes**
- `CartProvider` (one cart for the whole site, persisted as `{productId, qty}[]` in `localStorage`, re-validated against current products), CartButton (FAB with badge), CartDrawer, AddToCartButton (the "In Cart (n)" state).
- `ProductCatalog`: category chips (desktop sidebar and mobile scroller), search, sort, price range, with counts **derived from data**.
- `CheckoutDialog`: one form with the union of the legacy fields (name, mobile, WhatsApp optional, address, area, city, pincode, location button, instructions), region (Pune / Maharashtra), delivery type and schedule (IST dates), Maharashtra slab select from `shipping_rates`, a cake warning that disables submission for Maharashtra, and a live summary.
- `placeOrder` action → `place_order` RPC → success panel with order number and **"Send on WhatsApp"** link (message from `lib/whatsapp/order-message.ts`).
- `CustomCakeForm` (sections, birthday/anniversary panels shown correctly on first render (fixes M-5), size→tier rules, live summary, geolocation) → `submitCustomCakeRequest` → request number → WhatsApp link → success modal.
- `ContactForm` → `submitEnquiry` → WhatsApp link (properly encoded, fixes C-7) **or** `mailto:` (encoded).
- Newsletter: implemented or removed per D-8.

**Files affected:** `components/{cart,products,custom-cake,contact}/**`, `server/actions/{place-order,submit-custom-cake,submit-enquiry}.ts`, `lib/validations/{order,custom-cake,enquiry}.ts`, `lib/whatsapp/*.ts`, `lib/{money,dates,errors}.ts`, `lib/config/{custom-cake-options,delivery}.ts`.

**Dependencies:** Phases 3 and 5. D-7 (bot protection). D-8 (newsletter). D-10 (online payment, which only affects whether a payment step is planned).

**Risks:** WhatsApp handoff UX on iOS and Android (mitigated by a user-tapped link instead of `window.open`, tested on real devices). A changed message format could confuse the owner's workflow (mitigated by keeping the legacy format plus the order number, with the owner approving a sample message). Cart data from old products after catalog edits (mitigated by re-validation on hydrate).

**Verification:** an order placed on staging appears in `orders` with **DB-computed** totals. A tampered client price has no effect. A cake + Maharashtra order is blocked in the UI and in the DB. A scheduled date earlier than tomorrow (IST) is rejected. The WhatsApp message opens prefilled on Android and iOS. A contact message containing `&`, `#`, `%`, and emoji arrives intact. The custom-cake request is stored and no PII is written to `localStorage`.

---

## Phase 7 — Admin dashboard

**What changes**
- `AdminShell` (sidebar nav, sign-out, noindex).
- **Overview:** today's and upcoming deliveries, new orders, new custom-cake requests, new enquiries.
- **Orders:** list (filter by status and date, search by number or phone), detail view, status updates, extra charges (Porter), admin notes, "Message customer on WhatsApp" link, CSV export (formula-safe).
- **Custom cakes:** list and detail, status, quoted price, notes, WhatsApp link, CSV export (replaces the Google Sheet).
- **Enquiries:** list, status, notes.
- **Products:** list (drag or number sort order), create/edit (Zod), image upload to Storage, activate/deactivate, featured flag.
- **Categories**, **Gallery** (upload image or video with poster, tags, order, publish), **Blog** (Markdown editor with preview, draft/publish, SEO fields, cover), **Shipping rates**.
- Each mutation invalidates the relevant cache tags.

**Files affected:** `app/admin/(dashboard)/**`, `components/admin/**`, `server/actions/admin/*.ts`, `server/queries/admin/*.ts`, `lib/validations/{product,category,gallery,blog,shipping}.ts`, `lib/csv.ts`.

**Dependencies:** Phases 4 and 6. D-6 (staff roles).

**Risks:** this is the largest UI surface. *Mitigation:* plain tables and forms with no heavy UI library, built and reviewed one entity at a time. Storage orphans on image replace (mitigated by deleting the old path in the same action, plus a periodic orphan-check script). Accidental deletes (mitigated by preferring deactivate and confirm dialogs for destructive actions).

**Verification:** editing a product price shows on `/products` and `/` within seconds (tag invalidation) **without** a redeploy. Uploads reject non-images and files over 5 MB. All admin pages are inaccessible when logged out, and a non-admin account sees empty data. CSV export opens cleanly in Excel and Sheets, with formula-like values neutralised.

---

## Phase 8 — Data and media migration

**What changes**
- Owner resolves the content conflicts (D-5): prices and names for loaves and Hot Choco Lava, hours, stats, egg/eggless statement, origin story, "100% Organic" claim, Vanilla Cream Cake tags.
- `scripts/import-legacy-catalog.ts`: parse `legacy/products.html` / `legacy/index.html` / `legacy/blog.html` / `legacy/gallery.html`, then generate a reviewed `supabase/data/legacy-content.sql` (upserts by slug). Blog HTML is converted to Markdown and proofread.
- `scripts/upload-legacy-media.ts`: resize and convert to WebP, upload to Storage, write paths. Re-encode brand assets for `public/`. Transcode the hero and gallery videos (ffmpeg, run locally).
- MongoDB: connect read-only, count documents. Export and map if non-empty (D-12).
- Google Sheet: archive, or import CSV (D-12).

**Files affected:** `scripts/*.ts`, `supabase/data/legacy-content.sql`, `public/brand/*`, `public/media/*`.

**Dependencies:** Phase 3 (schema). D-5 and D-12.

**Risks:** content errors carried over (mitigated by owner review of a generated product table before import). Large media blowing Storage or Vercel quotas (mitigated by optimising before upload; the target total is under 30 MB versus 38 MB raw today). Slugs for blog posts become permanent URLs (mitigated by the owner approving the slug list).

**Verification:** 32 products (or the owner-approved count) present with correct prices. Category counts match. Every product with a legacy photo shows it. 10 posts are reachable at `/blog/<slug>`. 12 gallery items are present. Hero video is under 2 MB. Total `public/` size is reported. Running the import twice makes no changes (idempotent).

---

## Phase 9 — Security hardening and privacy

**What changes**
- Security headers and CSP in `next.config.ts`. Verify that GA, fonts, Supabase, the Maps iframe, and video all work under the CSP.
- Vercel Firewall rules (rate limit on `/admin/login` and on POSTs to public pages). Turnstile, if chosen (D-7).
- `/privacy` content, form consent notices, GA consent approach (D-9), data retention job or manual procedure for old orders and enquiries (D-9).
- Review the Supabase Security Advisor, rotate staging keys if they were ever shared, and confirm the service key is absent from Vercel.
- Owner action: disable or redeploy the Google Apps Script web app so the old public URL stops accepting writes. Remove legacy Vercel env vars after cutover.
- `npm audit` and Renovate/Dependabot configuration.

**Files affected:** `next.config.ts`, `app/(site)/privacy/page.tsx`, form components (notices), `.github/dependabot.yml` (or `renovate.json`), `docs/SECURITY.md` (runbook).

**Dependencies:** Phases 6 and 7. D-7 and D-9.

**Risks:** a CSP that is too strict breaks GA or the Maps embed (mitigated by shipping it as `Report-Only` on Preview first). Legal copy accuracy, which the owner must approve (this is not legal advice).

**Verification:** securityheaders.com and Mozilla Observatory grade A or better on the Preview. The CSP has no violations in the console across all pages. Burst-posting the checkout is throttled. The anon key cannot read PII (re-run the pgTAP suite against staging).

---

## Phase 10 — SEO, performance, accessibility

**What changes**
- Metadata for every route, absolute OG images (a new `og-default.jpg` 1200×630 replacing the missing `store.jpg`), canonicals, Twitter cards.
- JSON-LD: `Bakery`, `Product`/`Offer`, `BlogPosting`, `BreadcrumbList`, `FAQPage`.
- `app/sitemap.ts` (correct namespace, blog posts) and `app/robots.ts` (disallow `/admin`, `/auth`).
- Performance budgets: LCP < 2.5 s on 4G mobile, CLS < 0.1, INP < 200 ms, home page transfer < 1.5 MB on mobile.
- Accessibility pass: contrast-adjusted small-text token, focus styles, labels, dialog semantics, skip link, reduced motion.

**Files affected:** `app/**/page.tsx` (metadata), `app/sitemap.ts`, `app/robots.ts`, `components/seo/JsonLd.tsx`, `lib/seo.ts`, `public/og-default.jpg`, styles.

**Dependencies:** Phases 5, 6, and 8.

**Risks:** URL or title changes affecting rankings. *Mitigation:* keep existing URLs and titles, add 301s for `.html`, and submit the new sitemap in Google Search Console right after cutover.

**Verification:** Lighthouse (mobile) ≥ 90 for Performance, Accessibility, Best Practices, and SEO on `/`, `/products`, `/custom-cake`, and `/blog/<slug>`. Google Rich Results Test passes for Bakery, Product, FAQ, and BlogPosting. The sitemap validates. `axe` shows zero serious or critical issues. A keyboard-only checkout succeeds.

---

## Phase 11 — Testing (consolidation)

Tests are written alongside each phase. This phase fills gaps and wires everything into CI.

**What changes**
- **Unit (Vitest):** Zod schemas (phones, pincodes, IST date rules, tier rules), `lib/money`, `lib/dates`, WhatsApp message builders (snapshot of the legacy format plus the order number, and encoding of `& # % +` and emoji), CSV escaping.
- **DB (pgTAP):** full RLS matrix and submission function cases (already from Phase 3, extended).
- **Component (Testing Library):** ChipRadioGroup keyboard behaviour, CartProvider persistence and re-validation, CheckoutDialog validation display.
- **E2E (Playwright, against local Supabase):** browse → cart → checkout → order row created → WhatsApp link correct. Custom-cake submission. Contact submission. Admin login → edit price → public page updated. Logged-out admin access denied. Mobile viewport run.

**Files affected:** `**/*.test.ts(x)`, `supabase/tests/*`, `e2e/*.spec.ts`, `vitest.config.ts`, `playwright.config.ts`, `.github/workflows/ci.yml`.

**Dependencies:** all feature phases.

**Risks:** flaky E2E tests caused by WhatsApp navigation (mitigated by asserting the `href` instead of following it). Docker in CI (GitHub runners support it).

**Verification:** CI is green on a clean clone. Coverage of `lib/` business logic is at least 90%. Each critical audit item (C-1 … C-8) has at least one test that would fail if it regressed.

---

## Phase 12 — Production deployment and cutover

**What changes**
1. **Pre-flight (T-2 days):** `supabase db push` to production. Run the content import on production. Invite the owner admin account in production and add the `admin_users` row. Run the full E2E suite against a Preview pointed at the **production** DB (read-only checks plus one test order, which is then deleted).
2. **Freeze:** pause edits to the legacy site. Final content diff check against legacy.
3. **Cutover:** merge `next-app` → `main`. Vercel Production deploys the Next.js app with production env vars. The domain stays the same.
4. **Post-deploy smoke test (≤ 15 min):** all 7 legacy URLs and their `.html` variants. Place a real test order and confirm it on WhatsApp. Custom cake and contact submissions. Admin login, edit, and revert.
5. **Search:** submit the sitemap in Google Search Console. Monitor coverage and 404s for 2 weeks.
6. **Cleanup (after owner sign-off, ~2 weeks):** remove legacy Vercel env vars (`MONGODB_URI`, `JWT_SECRET`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`) and rotate them at their sources. Decommission the MongoDB cluster if unused. Disable the Apps Script endpoint. Delete the stale `patch-*` branches. Remove `legacy/` in a dedicated PR.

**Files affected:** none new. Vercel and Supabase configuration, GitHub branch settings (protect `main`, require CI).

**Dependencies:** everything above.

**Risks:** a cutover regression on a live business site. *Mitigation:* Vercel instant rollback to the last legacy deployment (keep its deployment id noted), cutover at a low-traffic time (not on a weekend morning, when cake orders peak), and the owner on standby to watch WhatsApp. Customers holding old carts in the legacy page: the legacy cart was in-memory only, so nothing is lost.

**Verification:** smoke checklist passes. Error rate in Vercel Logs is around zero for 24 h. The first real orders appear in the admin with correct totals. Search Console shows no new crawl errors after 7 days.

---

## Risk register (top items)

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| RLS misconfiguration exposes customer PII | Low (with tests) | **High** | Deny-by-default, a pgTAP matrix, Security Advisor, and no anon table access |
| Cutover disrupts orders | Medium | High | Preview against the prod DB, low-traffic window, instant rollback, WhatsApp fallback copy on every error |
| Content disputes (prices, claims) carried into the new site | **High** (already present) | Medium | D-5 resolved before Phase 8 import, with owner sign-off on the product table |
| Owner workflow change (admin dashboard is new) | Medium | Medium | Keep WhatsApp as the primary channel. The admin dashboard adds history without replacing WhatsApp. Short walkthrough at handover |
| Free-tier limits (Supabase pausing, Vercel image quotas) | Medium | Medium | D-3 plan choice, optimised media, `next/image` caching |
| Bot spam on public forms | Medium | Low–Medium | DB throttles, Vercel Firewall, optional Turnstile |
| Supabase auth emails not delivered | Medium (default SMTP) | Medium | Custom SMTP (D-6) |
| Visual regressions vs the current design | Medium | Medium | Screenshot comparisons per page and breakpoint, with owner sign-off in Phase 5 |

---

## Decisions needed before or during implementation

| ID | Decision | Needed by | Recommendation |
|---|---|---|---|
| D-1 | Repo layout during migration: `legacy/` folder on the `next-app` branch, **or** the Next app in a `web/` subfolder | Phase 1 | `legacy/` on a branch (clean root, nothing lost) |
| D-2 | Styling: **CSS Modules + tokens** (faithful port, no new dependency) **or** Tailwind CSS | Phase 1 | CSS Modules |
| D-3 | Supabase plan for production: Free (pauses after inactivity, limited backups) **or** Pro (~US$25/mo) | Phase 2 | Pro for production, Free for staging |
| D-4 | Separate staging Supabase project for Vercel Previews | Phase 2 | Yes |
| D-5 | Content conflicts: loaf and Hot Choco Lava prices and weights, store hours, customer stats, eggs vs eggless, which origin story, "100% Organic" wording, testimonials authenticity, use of children's names in gallery captions | Phase 5 / 8 | Owner provides the single truth |
| D-6 | Admin setup: who the admins are, whether restricted staff roles are needed, MFA on or off, SMTP provider (e.g. Resend, Brevo, Google Workspace) | Phase 4 | Owner-only admin to start, MFA on, Resend |
| D-7 | Bot protection: DB throttles only, or add Cloudflare Turnstile (free) to public forms | Phase 6 / 9 | Throttles first; Turnstile if spam appears |
| D-8 | Newsletter: implement (subscribers table + email provider + double opt-in) or remove | Phase 6 | Remove for launch unless the owner will actually send emails |
| D-9 | Privacy: policy text owner, GA consent banner (yes/no), retention period for orders and enquiries | Phase 9 | Simple notice + policy; retain orders 3 years, enquiries 1 year |
| D-10 | Online payment (Razorpay) now or later. Today payment is UPI/cash off-site with a 50% advance for custom cakes | Phase 6 planning | Later (a separate phase). Keep the WhatsApp confirmation flow |
| D-11 | Package manager: npm (current) or pnpm | Phase 1 | npm |
| D-12 | Legacy data: does the production MongoDB contain real data? Keep or import the Google Sheet custom-cake history? | Phase 8 | Inspect Mongo (likely empty). Archive the sheet, don't import |
| D-13 | Customer reference-image upload on the custom-cake form (never worked in legacy) | Phase 6 | Not in v1 (customers send photos on WhatsApp) |
