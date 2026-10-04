# Project Audit — Akki's Healthy Baking

> Audit date: 2026-10-04 · Branch: `main` @ `53c79c6` · Auditor: Claude Code
> Scope: every tracked file in the repository was inspected (7 HTML pages, 7 API files, config, assets, git history and remote branches). No implementation changes were made.

---

## 0. Executive summary

The production website (`www.akkishealthybaking.com`) is a **static, hand-written multi-page HTML site** deployed on Vercel. Each page is a self-contained file with its own inline CSS (≈20–30 KB per page) and inline JavaScript. All business data (32 products, 10 blog articles, 12 gallery items, prices, delivery rules) is **hardcoded in HTML/JS**. Ordering works by building a text message in the browser and opening **WhatsApp** (`wa.me/917795076412`). The custom-cake form also sends data to a **public Google Apps Script → Google Sheet** endpoint.

A **MongoDB + JWT backend** (`/api/*`) was added on 2026-09-30, but it is **not used by any page** and the admin UI is a placeholder (`admin/index.html` contains only `Hello`). The backend has serious security flaws and should not be migrated; it should be replaced.

The visual design is cohesive and worth preserving. The architecture underneath it needs to be rebuilt.

---

## 1. Current architecture

### 1.1 Stack

| Layer | Current |
|---|---|
| Frontend | Static HTML5 pages, inline `<style>` and inline `<script>` (vanilla ES2017+), no build step, no framework, no bundler |
| Styling | Hand-written CSS per page, CSS custom properties (tokens duplicated in each file), Google Fonts (Playfair Display + DM Sans) |
| Backend | Vercel Node serverless functions in `api/` (ESM), **unused by the frontend** |
| Database | MongoDB (`mongodb@^6.3.0`, db `akkis-baking`, collections `products`, `orders`, `blog`) — **unused by the frontend** |
| Auth | Single admin credential from env (`ADMIN_EMAIL`/`ADMIN_PASSWORD`) → JWT (`jsonwebtoken`), 24 h — **no UI uses it** |
| Order capture | WhatsApp deep link (`wa.me`) with a prefilled message; custom-cake orders also GET-posted to a Google Apps Script web app |
| Analytics | Google Analytics 4 (`G-J376SF6XL2`) on every page |
| Hosting | Vercel (`vercel.json`: `cleanUrls`, rewrites for 6 routes) |
| Package management | `package.json` with 4 dependencies, **no lockfile**, no scripts, no dev tooling |
| Tooling | None: no TypeScript, ESLint, Prettier, tests, CI, `.gitignore`, README, or `.env.example` |

### 1.2 Directory structure (as-is)

```
akkis/
├── index.html            63 KB  Home (hero video, bestsellers, loaves, testimonials, gallery strip, blog teasers, cart + checkout modal)
├── products.html         66 KB  Catalog (32 products in a JS array), filters, cart + checkout modal (different from Home's)
├── custom-cake.html      56 KB  Custom cake builder form → WhatsApp + Google Sheet + localStorage
├── gallery.html          29 KB  Masonry gallery (11 images + 1 video), filter chips, lightbox
├── about.html            31 KB  Story, founder, values, ingredient pledge, stats, map embed
├── blog.html             58 KB  10 articles stored as HTML strings in a JS array, opened in a modal
├── contact.html          39 KB  Enquiry form → WhatsApp or mailto, store hours, FAQ
├── admin/index.html       7 B   "Hello"
├── api/
│   ├── lib/mongodb.js         Mongo client singleton (throws at import if MONGODB_URI unset)
│   ├── lib/auth.js            verifyToken(req) — Bearer JWT
│   ├── auth/login.js          POST — compares env email/password, issues JWT
│   ├── products/index.js      GET public; POST/PUT/DELETE with JWT
│   ├── orders/index.js        POST public; GET/PUT with JWT
│   ├── blog/index.js          GET public; POST/PUT/DELETE with JWT
│   └── test.js                GET health check
├── images/               38 MB  Brand images, gallery, product photos, 2 videos (23 MB + 4.8 MB)
├── package.json               mongodb, bcryptjs, jsonwebtoken, razorpay
├── vercel.json                cleanUrls + rewrites
├── robots.txt
└── sitemap.xml                7 URLs
```

### 1.3 Application flow

```
Browser ──GET──> Vercel static file (e.g. /products → products.html)
                   │
                   ├─ inline CSS renders the page
                   ├─ inline JS renders product cards from a hardcoded array (products page)
                   ├─ GA4 script loads
                   └─ user interaction → in-memory state (cart object) → DOM updates via innerHTML
```

There is no shared layout, header, footer, or cart. Each page duplicates the nav, footer, CSS tokens, reveal animation, and hamburger logic, with small differences (see Medium issues).

### 1.4 Data flow

- **Source of truth = the HTML files.** Product names, prices, weights, images, tags, and badges live in `products.html:676-710` (`PRODUCTS` array) and separately in `index.html:788-797` (`HOME_PRODUCTS`), with **different prices** for the same items.
- Blog content lives in `blog.html:589-793` (`ARTICLES` array of HTML strings).
- Gallery items are duplicated in markup (`gallery.html:290-408`) **and** in a JS array (`gallery.html:476-489`) that drives the lightbox.
- Delivery rules: `products.html:847-859` (`MH_SHIPPING_SLABS`, `CAKE_CATS`) and duplicated as `<option>` markup in `index.html:708-716`.
- Updating any content requires editing HTML on GitHub (the commit history shows ~70 "Update products.html"–style commits made through the GitHub web UI).

### 1.5 Authentication flow (backend only, not wired to any UI)

```
POST /api/auth/login {email,password}
  → compare to process.env.ADMIN_EMAIL / ADMIN_PASSWORD with !==   (plaintext, no hashing, no rate limit)
  → jwt.sign({email, role:'admin'}, JWT_SECRET, 24h)
  → client must send Authorization: Bearer <token>
  → verifyToken() on write endpoints (no role check, no revocation)
```

### 1.6 Database flow

`api/lib/mongodb.js` creates a cached `MongoClient` promise. Handlers call `client.db('akkis-baking').collection(...)` and insert/update **`req.body` spread directly into documents** (no schema, no validation). No indexes, no migrations. Whether the production MongoDB contains any data is **unknown** (no page ever writes to it; only direct API calls could).

### 1.7 API flow

| Endpoint | Method | Auth | Behaviour |
|---|---|---|---|
| `/api/test` | GET | none | returns a message and a timestamp |
| `/api/auth/login` | POST | none | issues an admin JWT |
| `/api/products` | GET | none | all products |
| `/api/products` | POST/PUT/DELETE | JWT | insert `{...req.body}` / `$set {...data}` / delete by id |
| `/api/orders` | POST | **none** | insert `{...req.body, status:'pending'}` |
| `/api/orders` | GET/PUT | JWT | list all / set status |
| `/api/blog` | GET | none | all posts (including drafts, as there is no status field) |
| `/api/blog` | POST/PUT/DELETE | JWT | same pattern as products |

All endpoints send `Access-Control-Allow-Origin: *`.

### 1.8 Form submission flows

| Form | File | Destination | Persistence |
|---|---|---|---|
| Home cart checkout | `index.html:643-784, 991-1047` | `wa.me` prefilled message | **none** |
| Products cart checkout | `products.html:413-576, 1039-1113` | `wa.me` prefilled message | **none** |
| Custom cake | `custom-cake.html:284-553, 823-966` | `wa.me` + Google Apps Script GET (fired twice: `fetch` **and** `new Image()`) + `localStorage['akkis_orders']` | Google Sheet (probably duplicated rows) + customer's own browser |
| Contact | `contact.html:389-470, 733-767` | `wa.me` (message **not URL-encoded**) or `mailto:akkis.healthy.baking@gmail.com` | none |
| Newsletter | `blog.html:431-439, 847-856` | **nowhere** — shows "You're subscribed" and discards the email | none |

### 1.9 Admin flow

There is no functional admin. `admin/index.html` contains `Hello`. The custom-cake page contains dead "admin" helpers (`downloadOrdersExcel`, `clearOrderLog`) that read the *visitor's own* `localStorage`, plus CSS for a hidden "admin bar". The owner's real operational tools today are **WhatsApp** (orders) and **Google Sheets** (custom-cake log).

### 1.10 Other inventory

- **Third-party integrations:** GA4, Google Fonts, Google Maps embed (about page) + Maps short links, WhatsApp deep links, Instagram links, Google Apps Script web app, `mailto:`. The `razorpay` dependency is installed but **never imported**.
- **Environment variables (referenced in code):** `MONGODB_URI`, `JWT_SECRET`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `NODE_ENV`. None are documented.
- **Routing:** `/`, `/products`, `/custom-cake`, `/gallery`, `/about`, `/blog`, `/contact` (Vercel `cleanUrls` also serves and redirects the `.html` variants). `custom-cake.html` links to itself as `custom-cake.html` instead of `/custom-cake`. `menu.html` existed and was deleted (links to it are commented out).
- **SEO:** each page has `<title>`, meta description, keywords, robots, canonical (except custom-cake), og:title/description/image (except custom-cake). No `og:url`, Twitter cards, or JSON-LD structured data. `og:image` URLs are **relative** (crawlers expect absolute) and 3 pages point to the missing `images/store.jpg`.
- **Responsive behaviour:** breakpoints at 900 / 640 / 600 / 360 px. The layout works on mobile, but two different mobile-menu implementations coexist (see M-3).
- **Loading/error states:** none, apart from `onerror` handlers that hide broken images. No 404 page (Vercel default).
- **Reusable components:** none (copy-paste between files).
- **Design system:** consistent informal tokens (`--honey #D4780A`, `--honey-light #F5A623`, `--honey-pale #FEF3E2`, `--brown-dark #3B1F0A`, `--brown-mid #7A4010`, `--cream #FFFBF4`, `--text #2C1810`, `--text-muted #6B4C3B`, `--green #3B6E2A`, `--green-pale #EFF7EA`, `--border #E8D5B0`, radius 12/20 px, pill buttons, Playfair Display headings / DM Sans body, emoji iconography, scroll-reveal animation).
- **Git:** single `main` branch locally. The remote (`github.com/infoiandme-commits/akkis`) has 21 stale `infoiandme-commits-patch-*` branches. Only 2 are ahead of `main`: patch-19 edits the deleted `menu.html`, and patch-21 is a "Hello → Goodbye" test edit. No secrets were found in git history. All commits were made through the GitHub web UI.
- **Documentation:** none.

---

## 2. Current problems

Severity key: **Critical** = security, data loss, broken core functionality, auth vulnerabilities · **High** = architecture, scalability, duplication, performance · **Medium** = maintainability, code quality, UX · **Low** = cleanup.

### 2.1 Critical

| # | File | Problem | Why it matters | Recommended solution |
|---|---|---|---|---|
| C-1 | `api/orders/index.js:15-23` | Unauthenticated `POST /api/orders` inserts `{...req.body}` with **no validation, size limit, rate limit, or price check**. CORS is `*`. | If the API is deployed with `MONGODB_URI` set, anyone on the internet can write unlimited arbitrary documents (spam, storage exhaustion, fake orders with forged totals). | Do not migrate. Replace it with a Server Action + Zod + a Postgres `SECURITY DEFINER` function that recomputes prices from the DB and throttles writes. |
| C-2 | `api/products/index.js:28-46`, `api/blog/index.js:22-36` | **Mass assignment.** Authenticated writes spread `req.body` into the document (`$set: {...data}`). No schema. | Any field (including `createdAt` or arbitrary keys) can be injected. Corrupt documents break the site once the frontend reads from the DB. | Use explicit typed columns, Zod schemas, and allow-listed updates. |
| C-3 | `api/auth/login.js:14-19` | Admin login compares a **plaintext env password** with `!==` (not constant-time). No rate limiting or lockout. One shared credential. Stateless 24 h JWT with no revocation or logout. `bcryptjs` is imported in `package.json` but never used. Raw `error.message` is returned to the client. | Brute-forceable. A leaked token cannot be revoked. No audit trail of who did what. | Use Supabase Auth (hashed passwords, refresh-token rotation, built-in rate limits, optional MFA) with invite-only admin accounts and DB-enforced authorisation (RLS). |
| C-4 | `api/lib/auth.js:3-10` | `verifyToken` checks only the signature. The `role` claim is never checked, and no algorithm allow-list is set. | Any valid token for this secret grants full write access. | Enforce authorisation in the database (`is_admin()` in RLS) and re-check it server-side in every admin action. |
| C-5 | `custom-cake.html:935-954` | A **public Google Apps Script URL** is embedded in client JS. Customer PII (name, phone, address, GPS link, allergies) is sent as **GET query parameters**, and each submission fires **twice** (`fetch` + `Image`). | Anyone can write arbitrary rows to the owner's sheet. Values beginning with `=`, `+`, `-` or `@` can become **spreadsheet formulas** (formula injection). PII ends up in URL logs and browser history. Duplicate rows. | Persist requests in Postgres via a validated server-side path. Retire the Apps Script endpoint, and rotate/redeploy it so the leaked URL dies. |
| C-6 | `index.html:991-1047`, `products.html:1039-1113` | **Cart orders are never persisted.** The only record is a WhatsApp message the customer may never send. | Lost orders and no order history, reporting, or reconciliation. If the customer closes WhatsApp, the order is gone. | Save the order server-side first (returning an order number), then hand off to WhatsApp with that reference. |
| C-7 | `contact.html:742-751, 764-765` | The WhatsApp message and `mailto:` body interpolate user input **without `encodeURIComponent`** (manual `%0A` instead). | Any `&`, `#`, `%` or `+` in a name or message **truncates or corrupts** the enquiry. Core contact functionality is broken for ordinary input such as "Tom & Jerry cake". | Encode properly with a shared, unit-tested message builder, and persist enquiries. |
| C-8 | `custom-cake.html:956-962` | Every custom-cake submission (full PII) is stored indefinitely in the **visitor's** `localStorage['akkis_orders']`. | On shared or family devices the next user can read previous customers' addresses and phone numbers. It provides no value to the business. | Remove it. Never store PII client-side. |

### 2.2 High

| # | File | Problem | Why it matters | Recommended solution |
|---|---|---|---|---|
| H-1 | `index.html:788-797` vs `products.html:676-710` | **Same products, different data.** Home shows loaves at ₹350 while Products shows ₹404 (Mango Pistachio, Rava Mawa, Banana); Hot Choco Lava is 100 G on Home and 150 G on Products; product names differ ("Ragi Banana Walnut Loaf" vs "Ragi Jaggery Banana Bread"). | Customers see two prices for one item, which creates disputes over WhatsApp and erodes trust. | One `products` table as the single source of truth; Home features products via `is_featured`. |
| H-2 | `index.html`, `products.html` | **Two separate, non-persistent carts.** The cart lives in a page-local JS variable, so navigating from Home to Products empties it. The two checkout modals ask for different fields (Products also requires a WhatsApp number and area; Home doesn't) and apply different rules (Products blocks cakes for Maharashtra shipping; Home only warns in text). | Broken multi-page shopping and inconsistent business rules. | One `CartProvider` (persisted to `localStorage`, ids + quantities only) and one checkout component. Business rules are enforced on the server and in the DB. |
| H-3 | all pages | **Everything is hardcoded.** Content changes require editing HTML on GitHub. | Not maintainable by the business owner, and it caused H-1 and M-1. | Supabase-backed catalog, gallery, blog, and shipping rates, managed through an admin dashboard. |
| H-4 | `images/VN20260809_031934.mp4` (23 MB), `index.html:375-386` | **A 23 MB hero video autoplays** on the home page. `cake_video.mp4` (4.8 MB) also autoplays in the gallery grid. `ahb-logo.webp` is 440 KB but displayed at 44 px. PNG product photos are 0.8–1.3 MB. | Very slow LCP and heavy data use on the mobile networks most customers are on. Vercel bandwidth cost. | Transcode the hero to ≈1–2 MB (720p H.264 + WebM/AV1) with a poster image, and skip loading it on small screens. Use a click-to-play poster in the gallery. Resize the logo. Serve images through `next/image` (AVIF/WebP, responsive sizes). |
| H-5 | `blog.html:589-830` | **Blog articles are not URLs.** All 10 articles are HTML strings shown in a modal. | They cannot be indexed, shared, or linked, so the blog's SEO value is roughly zero. | `/blog/[slug]` statically generated pages with `BlogPosting` JSON-LD. |
| H-6 | `blog.html:847-856` | **Fake newsletter.** It validates `@` and then says "Thank you! You're subscribed" without storing anything. | Misleads users. Emails are silently lost. | Decision needed: implement it (`newsletter_subscribers` table plus an email provider) or remove it. |
| H-7 | `sitemap.xml:2` | The sitemap uses namespace `https://www.sitemaps.org/...`. The protocol requires **`http://www.sitemaps.org/schemas/sitemap/0.9`**. | Search engines may reject the sitemap as invalid. | Generate it with `app/sitemap.ts` (correct namespace, includes blog posts, `lastModified`). |
| H-8 | site-wide | **No privacy policy** (footer links to `#`). The site collects name, phone, address, GPS location, and allergy information, and runs GA4 with no notice. | Compliance exposure under India's DPDP Act 2023. Also a trust issue. | Add a privacy policy page, a consent/notice line on forms, a data-retention policy for orders, and a GA consent approach (decision needed). |
| H-9 | `custom-cake.html`, `index.html`, `products.html`, `contact.html`, `gallery.html`, `blog.html` | **Keyboard and screen-reader inaccessible controls.** Required choices (occasion, flavour, theme, delivery location/type, enquiry type), blog cards, and gallery items are clickable `<div>`s with `onclick`. Labels are not associated with inputs (`<label>` without `for`). Modals have no `role="dialog"`, `aria-modal`, or focus trap. Emoji-only social links have no accessible name (except on About). The hamburger has no `aria-expanded`. | The custom-cake and checkout forms **cannot be completed with a keyboard**. This fails WCAG 2.1 A. | Use native radio groups styled as chips, a `Dialog` component with a focus trap, labelled fields, `<details>` for FAQ, and `aria-label`s. |
| H-10 | `custom-cake.html:1000`, `index.html:888`, `products.html:878` | The minimum delivery date is computed with `toISOString()` (UTC). Between 00:00 and 05:30 IST this allows **one day earlier** than intended (same-day "scheduled" delivery, or custom cakes with only 1 day of notice). The rule is only enforced client-side. | Orders that violate the business's lead-time rules. | Compute dates in `Asia/Kolkata` and enforce lead time in Zod and in the DB function. |
| H-11 | `package.json` | No lockfile. Unused dependencies (`razorpay`, `bcryptjs`). No `engines`, scripts, or type `module`. | Non-reproducible builds and a larger attack surface. | The new `package.json` gets a lockfile, a pinned Node version, and only the dependencies that are used. |
| H-12 | `vercel.json` | **No security headers** (CSP, HSTS, `X-Content-Type-Options`, `Referrer-Policy`, `frame-ancestors`, `Permissions-Policy`). | Clickjacking and XSS defence-in-depth are missing. A CSP is currently impossible because of 174 inline `onclick` handlers. | Set headers in `next.config.ts`. A React rewrite removes the inline handlers, which enables a real CSP. |

### 2.3 Medium

| # | File | Problem | Why it matters | Recommended solution |
|---|---|---|---|---|
| M-1 | `products.html:371-378, 586-592` | Hardcoded category counts are wrong: "All 33" (actual 32), "Cakes 13" (14), "Pastries 5" (4), "Desserts 7" (6). `blog.html:450-457` counts are also wrong, and "Millets (1)" has no card in the grid. | Visible inaccuracies. | Derive counts from data. |
| M-2 | `blog.html:523-532` | The tag cloud opens the **wrong articles** (e.g. "Ragi" opens the Our Story article, "Alphonso" opens Celebrations, "Blueberry" opens the Alphonso article). The topic filter only dims cards. Dates in the list differ from dates in the article data. | Broken navigation and inconsistent content. | Data-driven tags/topics and real filtering (`/blog?topic=` or topic pages). |
| M-3 | all pages | **Two mobile-menu implementations.** Home, About, and Gallery inject inline styles into `.nav-links` (and the Home mobile menu has no CTA). Products, Contact, Blog, and Custom-cake use a `.mobile-menu` element. Brand text alternates between "Akkis" and "Akki's". Footers differ per page (Privacy link on some pages only). | Inconsistent UX, and every fix must be repeated in 7 files. | One `SiteHeader`/`MobileNav`/`SiteFooter` in the shared layout. |
| M-4 | all pages | ≈20–30 KB of **duplicated inline CSS per page** with drift: token names differ (`--radius` vs `--r`), and `index.html` uses `var(--green)` without defining it, so checkout info boxes and the location button lose their green colour. Several rule blocks are declared twice inside `index.html:267-322`. | Maintenance cost, no browser caching across pages, visual bugs. | Global `tokens.css` plus CSS Modules (or Tailwind — see decisions), with one definition per component. |
| M-5 | `custom-cake.html:307, 747` | "Birthday" is preselected, but the Birthday details panel (name on cake, age, candle, knife) is **hidden until the user clicks Birthday again**. | Most customers will never see these fields. | Derive panel visibility from state on first render. |
| M-6 | `gallery.html:477` | The lightbox for item 1 loads `images/store.jpg`, which **does not exist** (the grid uses `display.jpeg`). Lightbox prev/next ignores the active filter. Grid markup and the `ITEMS` array are duplicated. | Broken image and confusing navigation. | Render the grid and lightbox from one data list. |
| M-7 | `products.html:28,69`, `about.html:28`, `blog.html:28`, `index.html:29` | `og:image` is relative and/or points to the missing `store.jpg`. The Products hero background references `store.jpg`, which is missing. `custom-cake.html` has no canonical and no OG tags. | Broken social previews. | Metadata API with `metadataBase`, absolute OG images, and a canonical on every route. |
| M-8 | `custom-cake.html:760-780, 908` | Dead image-upload code (`handleImageUpload`, `removeImage`) references elements that don't exist. `refImageName` is never set. | Dead code and confusion. | Remove it. Decide whether reference-image upload is wanted (see decisions). |
| M-9 | all pages | 174 inline `onclick` attributes, inline `style=""` everywhere, `innerHTML` templating. | Blocks a CSP. `innerHTML` becomes an **XSS vector** as soon as content comes from a database or admin (e.g. blog HTML). | React rendering (auto-escaped). Blog content as Markdown rendered without raw HTML. |
| M-10 | site-wide | **Contradictory business content:** store hours (About: Mon–Sun 9–9; Contact: Sun 10–7), customer stats (1,000+ / 2,000+ / 2,500+), "100% Vegetarian … we source eggs mindfully" (About) vs the eggless origin story (Blog) and "eggless" SEO keywords, and two different founder origin stories (cancer-survivor parents on About vs Shravan-month eggless birthday on Blog). | Trust and SEO consistency. Possible food-labelling and claims risk ("100% Organic"). | Owner decision required. Then keep a single source of truth in `lib/config/site.ts` and the DB. |
| M-11 | `products.html:677` | Data errors: "Vanilla Cream Cake" is tagged `Ragi`, `Chocolate` with a 🍫 emoji. 8 of 32 products have no photo. | Misleading product data. | Clean up during the catalog import, with owner review. |
| M-12 | site-wide | Scroll-reveal content starts at `opacity:0`, so if JS fails it stays invisible. No `prefers-reduced-motion` handling for the marquee, reveal, and autoplay video. Brand orange `#D4780A` with white text is ≈3.2:1 contrast (below WCAG AA 4.5:1 for the 13–15 px button text). | Accessibility and resilience. | Progressive-enhancement reveal, reduced-motion media queries, a contrast-checked text token for small text (keeping the visual identity). |
| M-13 | `api/*` | Unknown HTTP methods produce **no response** (the request hangs until timeout). `new ObjectId(id)` throws on bad ids (unhandled 500). No `try/catch`. `mongodb.js` throws at import when env is missing, so every function returns 500. | Unreliable API. | Moot once replaced, and listed so it isn't ported. |

### 2.4 Low

| # | File | Problem | Recommended solution |
|---|---|---|---|
| L-1 | `images/` | ≈2.8 MB of unused assets: `store.png` (1.2 MB), `product-images/Mixed_fruits_cake.png` (1.3 MB), `product-images/pineapple_cake.jpeg`, `Akkis.webp`. One filename contains a space (`Akkis Founder.webp`). | Don't carry them into `public/`. Use kebab-case names. |
| L-2 | `api/test.js` | Public test endpoint. | Drop it. |
| L-3 | repo root | No `.gitignore`, README, `.env.example`, or license/notice. | Add them in Phase 1. |
| L-4 | remote | 21 stale `patch-*` branches (2 hold trivial or obsolete edits). | Owner to delete after confirming. |
| L-5 | `about.html:360-368` | The story uses newlines inside one `<p>`, so it renders as a single run-on paragraph. | Proper paragraphs. |
| L-6 | all pages | Footer says "© 2025". `target="_blank"` links lack `rel="noopener noreferrer"` (49 occurrences; modern browsers imply `noopener`). | Dynamic year and a shared `ExternalLink` component. |
| L-7 | `index.html:344`, etc. | Commented-out `menu.html` links and the hero float cards. | Remove the dead markup. |
| L-8 | `custom-cake.html:172` | Unused `.admin-btn-red` styles and an "Admin bar hidden" comment. | Remove them. |

---

## 3. What should be preserved

**Visual design and brand**
- Colour tokens (honey / brown / cream / green palette above), radii, pill buttons, card hover lifts, soft shadows, gradient page heroes with the curved bottom edge, and emoji iconography.
- Typography: Playfair Display (headings, italic `<em>` accents in honey) + DM Sans (body).
- Signature sections: home hero (video + trust items), honey marquee strip, "Why Akkis" cards, bestseller grid, loaf highlight with inline "Add" rows, testimonials, gallery strip, blog teasers, dark contact strip, four-column footer, floating cart button with a slide-in cart panel, checkout modal with a dark gradient header, custom-cake two-column form with a sticky live summary, gallery masonry and lightbox, contact quick-strip, FAQ accordion, about-page founder card, ingredient pledge, stats and store map.

**Business logic** (to be re-implemented with server-side enforcement)
- Ordering ends in WhatsApp to `+91 77950 76412` with a structured message (customer, items, delivery, pricing, notes). The current message format is preserved.
- Delivery regions: **Pune/local** (Quick ASAP, or Scheduled with a date ≥ tomorrow and slots Morning 9–12 / Afternoon 12–4 / Evening 4–8; 0–2 km free; above 2 km Porter charge split 50/50, confirmed on WhatsApp) and **Maharashtra courier** (non-cake items only; weight slabs ₹60/80/120/150/200/250 for ≤0.5/1/2/3/5/>5 kg).
- Cakes cannot be shipped outside Pune.
- Custom cake: occasion (+ birthday/anniversary extras), size options with tier rules (Bento: no tiers; 500 g–1.5 kg: 1 tier; 2 kg: up to 2; custom: up to 3), flavours, finishes, themes, toppers, guests, design description, colour, reference link, delivery date ≥ 2 days ahead, time slot, address with optional geolocation link, Instagram handle, allergies. "Exact pricing confirmed by Akki on WhatsApp."
- Payment terms (from the FAQ): UPI, bank transfer, or cash, with a 50% advance for custom cakes. Payment is offline today.
- Geolocation "Use my current location" → Google Maps link.

**Content:** 32 products (names, prices, weights, tags, badges, photos), 10 blog articles, 12 gallery items with captions, 3 testimonials, the FAQ (8 Q&As), About copy, values, the ingredient pledge, store address, phone, Instagram `@akkis.healthy.baking`, email `akkis.healthy.baking@gmail.com`, Maps link and embed. The contradictions in M-10 need to be resolved first.

**Integrations:** GA4 `G-J376SF6XL2`, WhatsApp deep links, Google Maps embed and links, Instagram, `mailto:`.

**URLs (must not break):** `/`, `/products`, `/custom-cake`, `/gallery`, `/about`, `/blog`, `/contact` and their `.html` variants (301 to clean URLs). Canonical host `https://www.akkishealthybaking.com`.

**SEO behaviour:** existing titles and descriptions (as the starting point), canonical URLs, `robots: index, follow`, `robots.txt` with sitemap reference, local keywords (Hinjawadi, Wakad, Baner, Pune).

**User flows:** browse → add to cart → checkout → WhatsApp; custom cake form → WhatsApp; contact → WhatsApp or email; gallery lightbox with keyboard navigation; FAQ accordion.

---

## 4. What should be rebuilt (not migrated)

| Area | Why it is rebuilt rather than ported |
|---|---|
| **Backend API (`api/*`) and MongoDB** | Insecure (C-1–C-4), unused, schemaless. Replace it with Supabase Postgres, RLS, and Server Actions. No REST API is needed. |
| **Admin authentication** | Replace the env-password-plus-JWT scheme with Supabase Auth, invite-only admins, and an RLS-enforced `is_admin()`. |
| **Admin UI** | Doesn't exist. Build a dashboard for orders, custom-cake requests, enquiries, products, categories, gallery, blog, and shipping rates. |
| **Data layer** | Hardcoded arrays (duplicated, inconsistent) become normalised tables with integer-paise money and slugs. |
| **Cart and checkout** | Two divergent carts become one persisted cart and one checkout. Server-side pricing, rule enforcement, and order persistence come before the WhatsApp handoff. |
| **Custom-cake persistence** | Google Sheet + `localStorage` become a `custom_cake_requests` table with an admin view (CSV export from the admin if the owner still wants spreadsheets). |
| **Contact form** | Gets proper encoding and persisted `enquiries`. |
| **Blog** | Modal plus HTML strings become routable, statically generated `/blog/[slug]` pages with Markdown content. |
| **Gallery** | Duplicated markup and arrays become a DB-driven list with Storage media and an accessible lightbox. |
| **Navigation, layout, footer** | 7 copies become 1 shared layout. |
| **Styling** | Per-page inline CSS becomes global tokens plus component-scoped styles, preserving the look pixel-close. |
| **Forms and interactive chips** | `div` + `onclick` becomes accessible native inputs, Zod validation, and server-returned field errors. |
| **Media pipeline** | Raw 23 MB video and 1 MB PNGs become optimised assets, `next/image`, and Supabase Storage for admin-managed media. |
| **Newsletter** | Fake today. Implement it or remove it (decision). |

---

## 5. Recommended Next.js architecture (summary)

Full detail lives in [`PRODUCTION-ARCHITECTURE.md`](./PRODUCTION-ARCHITECTURE.md). The directory tree, adapted to this project:

```
akkis/
├── app/
│   ├── layout.tsx                    Root: <html lang="en-IN">, next/font (Playfair Display, DM Sans), GA4, metadataBase
│   ├── globals.css                   imports styles/tokens.css + base/reset
│   ├── not-found.tsx · error.tsx · global-error.tsx
│   ├── sitemap.ts · robots.ts · manifest.ts
│   ├── (site)/                       Public site — shared header, footer, cart
│   │   ├── layout.tsx                SiteHeader, SiteFooter, CartProvider, CartDrawer
│   │   ├── page.tsx                  /
│   │   ├── products/page.tsx         /products
│   │   ├── custom-cake/page.tsx      /custom-cake
│   │   ├── gallery/page.tsx          /gallery
│   │   ├── about/page.tsx            /about
│   │   ├── blog/page.tsx             /blog
│   │   ├── blog/[slug]/page.tsx      /blog/:slug   (new, SSG)
│   │   ├── contact/page.tsx          /contact
│   │   └── privacy/page.tsx          /privacy      (new)
│   ├── admin/
│   │   ├── (auth)/login/page.tsx
│   │   ├── (auth)/forgot-password/page.tsx
│   │   ├── (auth)/update-password/page.tsx
│   │   └── (dashboard)/
│   │       ├── layout.tsx            requireAdmin() + admin shell
│   │       ├── page.tsx              overview (today's orders, pending requests, new enquiries)
│   │       ├── orders/  [id]/
│   │       ├── custom-cakes/  [id]/
│   │       ├── enquiries/
│   │       ├── products/  new/  [id]/
│   │       ├── categories/
│   │       ├── gallery/
│   │       ├── blog/  new/  [id]/
│   │       └── settings/shipping/
│   └── auth/confirm/route.ts         Supabase email-link token exchange (recovery/invite)
├── components/
│   ├── ui/                           Button, LinkButton, ChipRadioGroup, Field, Textarea, Select, Dialog, Drawer, Badge, Toast
│   ├── layout/                       SiteHeader, MobileNav (client), SiteFooter, PageHero, Breadcrumbs, ExternalLink
│   ├── home/                         Hero, Marquee, WhyUs, FeaturedProducts, LoafHighlight, Testimonials, GalleryStrip, BlogTeasers, ContactStrip
│   ├── products/                     ProductCard, ProductCatalog (client filters), CategoryFilter
│   ├── cart/                         CartProvider, CartButton, CartDrawer, AddToCartButton, CheckoutDialog, OrderSentPanel
│   ├── custom-cake/                  CustomCakeForm (client), LiveSummary, HowItWorks
│   ├── contact/                      ContactForm (client), StoreHours, Faq (<details>)
│   ├── gallery/                      GalleryGrid, Lightbox (client)
│   ├── blog/                         PostCard, PostBody (markdown), TopicFilter
│   ├── admin/                        AdminShell, DataTable, StatusSelect, ImageUpload, forms…
│   └── seo/JsonLd.tsx
├── server/                           server-only code
│   ├── queries/                      products.ts, categories.ts, gallery.ts, blog.ts, shipping.ts, orders.ts, …
│   └── actions/                      place-order.ts, submit-custom-cake.ts, submit-enquiry.ts, auth.ts, admin/*.ts
├── lib/
│   ├── supabase/                     public.ts (anon, cookieless), server.ts (cookie session), browser.ts, proxy.ts, admin-script.ts (scripts only)
│   ├── auth/require-admin.ts
│   ├── validations/                  order.ts, custom-cake.ts, enquiry.ts, product.ts, blog.ts, gallery.ts, shipping.ts, auth.ts
│   ├── config/                       site.ts (NAP, hours, socials, WhatsApp), custom-cake-options.ts, delivery.ts
│   ├── whatsapp/                     order-message.ts, custom-cake-message.ts, enquiry-message.ts (pure, unit-tested)
│   ├── money.ts · dates.ts (Asia/Kolkata) · env.ts · logger.ts · seo.ts
├── types/database.types.ts           generated by `supabase gen types`
├── styles/tokens.css
├── public/                           brand/, media/ (hero video + poster), favicons, og-default.jpg
├── supabase/
│   ├── config.toml
│   ├── migrations/                   timestamped SQL
│   ├── seed.sql                      local dev only (real catalog extracted from the legacy site)
│   └── tests/                        pgTAP RLS tests
├── scripts/                          import-legacy-catalog.ts, upload-legacy-media.ts (local, never deployed)
├── legacy/                           current static site, kept for reference until cutover (see decisions)
├── docs/
├── proxy.ts                          session refresh + /admin gate (Next 16 name for middleware)
├── next.config.ts · tsconfig.json (strict) · eslint.config.mjs · .env.example · .gitignore
```

---

## 6. Supabase needs (summary)

| Feature | Needed? | Reason |
|---|---|---|
| Database (Postgres) | **Yes** | Catalog, blog, gallery, shipping rates, orders, custom-cake requests, enquiries |
| Auth | **Yes — admins only** | Email + password, invite-only, no public sign-up, no customer accounts |
| Storage | **Yes** | Admin-uploaded product, gallery, and blog images (public bucket) plus gallery video |
| Realtime | **No** (optional later) | Could push new-order notifications to the admin; WhatsApp already notifies the owner |
| Edge Functions | **No** | Server Actions on Vercel cover all server logic; no webhooks or cron today |

See [`DATABASE-DESIGN.md`](./DATABASE-DESIGN.md), [`PRODUCTION-ARCHITECTURE.md`](./PRODUCTION-ARCHITECTURE.md), and [`MIGRATION-PLAN.md`](./MIGRATION-PLAN.md).
