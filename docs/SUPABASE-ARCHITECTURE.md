# Supabase Architecture

> **Status: Phase 2 implemented and verified locally** (2026-10-04). Hosted staging and production projects are **not created yet**, so nothing has been pushed. The database design is in [`DATABASE-DESIGN.md`](./DATABASE-DESIGN.md).
>
> Owner decisions applied:
> - two separate projects (staging = Free, production = Pro at launch), both in Mumbai `ap-south-1`
> - local dev and Vercel Preview use staging. Vercel Production uses production. Preview and staging may never reach production
> - Docker-based local stack only for automated tests
> - one admin role, structured for future roles
> - admin 2FA deferred to Phase 9 (architecture ready)
> - Resend as the email provider, behind an abstraction
> - one `media` bucket
> - no newsletter table

---

## 1. Features used

| Feature | Used | Why |
|---|---|---|
| Postgres + RLS | yes | catalogue, content, customer submissions |
| Auth | yes, admins only | email + password. No customer accounts. Public registration disabled |
| Storage | yes, one public bucket `media` | admin-managed media |
| Realtime, Edge Functions, Branching, Vault, cron, image transformations | no | no requirement. Several are Pro-only, and avoiding them keeps staging and production equivalent |

---

## 2. Environments

### 2.1 Staging

| | |
|---|---|
| Project | `akkis-staging`, **Free** plan, `ap-south-1` |
| Used by | local `npm run dev` and every Vercel **Preview** deployment |
| Data | real legacy catalogue and content (imported in Phase 8), test orders and requests |
| Auth users | developer/owner test admins |
| Email | its own Resend SMTP credentials (a separate API key). The app's email layer only delivers to `EMAIL_ALLOWED_RECIPIENTS` outside production |
| Billing | recommended in a **separate Supabase organization** that stays on Free (Supabase bills per organization) |

### 2.2 Production

| | |
|---|---|
| Project | `akkis-production`, Free while being built, **upgraded to Pro before go-live**, `ap-south-1` |
| Used by | Vercel **Production** only. Never local dev, never Preview |
| Data | real data only |
| Email | its own Resend SMTP credentials and a verified sending domain |
| Not dependent on Free-plan limits | no reliance on project pausing, default SMTP, or Free backup limits. Pro adds daily backups. PITR is optional |

### 2.3 Local test stack (ephemeral, Docker)

`supabase start` runs a throwaway stack used **only** by automated tests: migrations from scratch, pgTAP (constraints, functions, RLS, storage), and Playwright auth tests. Its keys are the CLI's well-known local demo keys, read at run time and never committed. The app refuses to use the local stack from any Vercel deployment.

### 2.4 Environment safeguards (implemented)

| Safeguard | Where | Effect |
|---|---|---|
| Committed project refs | `lib/config/supabase-projects.ts` | Project refs are public, so they're pinned in code rather than in per-deployment variables that could be mis-set. **Currently `null`**, so every Vercel deployment fails closed until the refs are filled in |
| Target guard | `lib/supabase/target-guard.ts` | Vercel Production must use the production ref. Preview, Vercel development, local dev, and CI must use the staging ref (or the local stack, off Vercel only) and can **never** use the production ref |
| Build-time enforcement | `next.config.ts` | `next build` / `next dev` fails on any mismatch. On Vercel the Supabase variables are mandatory |
| Runtime enforcement | `lib/supabase/config.ts` | Server code re-checks on first Supabase use |
| Key-type guard | target guard | rejects `sb_secret_…` keys and service-role/non-anon JWTs in `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, and an anon key belonging to a different project |
| `server-only` | server Supabase client, auth, and email modules | importing them into client code fails the build |

---

## 3. Authentication

| Aspect | Implementation |
|---|---|
| Users | admins only. **Public registration disabled** (`[auth] enable_signup = false`; verified: sign-up returns `signup_disabled`) |
| Method | email + password. Min 12 chars with letters and digits (`config.toml` + Zod). Supabase bcrypt hashing, refresh-token rotation, built-in auth rate limits |
| Sign in | `/admin/login` → Server Action `signIn`. Generic error for wrong password **and** unknown account. Users without an `admin_users` row are signed out immediately. `next` redirects are allow-listed to `/admin/*` |
| Sign out | Server Action `signOut` (local scope) → `/admin/login?signed-out=1` |
| Password reset | `/admin/forgot-password` → identical response whether or not the account exists. The action passes the **requesting origin** as `redirectTo` (`lib/auth/request-origin.ts`: the browser's `Origin` header, else the forwarded/Host headers, else `NEXT_PUBLIC_SITE_URL`). Supabase accepts it only if it matches the project's Redirect URL allow-list, otherwise it uses the Site URL. The email links to `<that origin>/auth/confirm` (token hash, one-time, 1 h) → `/admin/update-password`, so a reset requested on a Preview returns to that Preview and one requested locally returns to localhost. Recent sign-in required for password changes (`secure_password_change`). A notification email is sent after the change |
| Email verification | `enable_confirmations = true`. Invites confirm the address on acceptance, and email changes need confirmation on both addresses (`double_confirm_changes`) |
| Email link handler | `app/auth/confirm/route.ts`: `verifyOtp` for `invite`, `recovery`, `email`, `email_change` only. Invalid, expired, or reused links go to `/admin/login?error=link-invalid` |
| Sessions | HTTP-only cookies via `@supabase/ssr`. `proxy.ts` (matched on `/admin/*` and `/auth/*` only) refreshes tokens and sets `Cache-Control: private, no-store` and `X-Robots-Tag: noindex`. Public pages stay static and cookie-free |
| Identity verification | `supabase.auth.getClaims()` (verifies the JWT signature). `getSession()` is never used for authorization |
| Email templates | `supabase/templates/{invite,recovery,confirmation,password_changed_notification}.html`. Links are `{{ .RedirectTo }}/auth/confirm?token_hash={{ .TokenHash }}&type=…&next=…`. `RedirectTo` is the validated requesting origin, or the Site URL when none or a non-allow-listed one is supplied (e.g. dashboard invites). The password-changed notification has no link |
| 2FA readiness (Phase 9) | `AdminSession.aal` is already read from verified claims. Phase 9 enables TOTP in Auth settings, adds enrolment/challenge pages, and makes `requireRole()` require `aal2`. RLS can additionally check `auth.jwt()->>'aal'`. No restructuring needed |

> **Configuration trap found during testing:** in Supabase Auth settings, `[auth.email] enable_signup` (dashboard: *Email provider → enabled*) must stay **on**. Turning it off disables email+password sign-in completely. Public registration is controlled separately by `[auth] enable_signup` (dashboard: *Allow new users to sign up*), which must be **off**.

---

## 4. Authorization

```
Request ─▶ proxy.ts ─────────────▶ page / layout ─────────────▶ Server Action ─────────▶ Postgres
           (no session →           requireAdmin():               requireAdmin() again     RLS:
            /admin/login)          getClaims + admin_users       (actions are endpoints)  private.is_admin()
           UX only                 role check                                             + column grants
```

| Layer | File | Notes |
|---|---|---|
| 1. Proxy | `proxy.ts` | redirect-only. Not a security boundary |
| 2. Server gate | `lib/auth/admin.ts`: `getAuthState()`, `requireRole(roles)`, `requireAdmin()` | Called by the dashboard layout **and** each page (layouts don't re-run on every navigation), and to be called at the top of every admin Server Action |
| 3. Database | RLS + `private.is_admin()` / `has_role()` + column grants | final boundary. A bug in layers 1–2 still cannot expose or modify data |

**Roles:** a single role, `admin` (`app_role` enum + `admin_users.role`). Adding a role later means one `ALTER TYPE … ADD VALUE` migration, updated helpers or policies, and `requireRole([...])` call sites. No rewrite.

**Granting and revoking:** `supabase/snippets/grant-admin.sql` (runbook, executed manually in the intended project's SQL editor). There is no API path to become an admin (tested).

---

## 5. Email

| Kind | Path | Staging vs production |
|---|---|---|
| Auth emails (invite, reset, confirmation, password changed) | Supabase Auth → **project SMTP setting** → Resend SMTP | Each project has its own Resend API key. Staging should use a key restricted to the test domain/recipients. Production uses the verified domain |
| App emails (none yet; e.g. order notifications later) | `sendEmail()` in `lib/email/send.ts` → adapter (`lib/email/resend.ts`, REST, no SDK) | `EMAIL_PROVIDER` = `disabled` (default) / `console` / `resend`. **Outside Vercel Production, mail only reaches `EMAIL_ALLOWED_RECIPIENTS`. An empty list means nothing is sent** |

Business code depends only on `sendEmail()`. Swapping providers means adding an adapter. Resend keys live only in environment variables and dashboard SMTP settings.

---

## 6. Environment variables

| Variable | Secret | Local `.env.local` | Vercel Preview | Vercel Production |
|---|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | no | staging | staging | production |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | no (RLS protects data) | staging | staging | production |
| `NEXT_PUBLIC_SITE_URL` (**environment-specific, set in every scope**) | no | `http://localhost:3000` | the stable Preview URL, e.g. `https://akkis-git-next-app-<team>.vercel.app` | `https://www.akkishealthybaking.com` |
| `NEXT_PUBLIC_GA_ID` | no | — | — | `G-J376SF6XL2` |
| `NEXT_PUBLIC_CONTACT_PHONE` / `NEXT_PUBLIC_WHATSAPP_NUMBER` / `NEXT_PUBLIC_CONTACT_EMAIL` | no (public business details, never hardcoded) | business values | business values | business values (required on Vercel, enforced at build) |
| `EMAIL_PROVIDER` / `EMAIL_FROM` | no | optional | optional | when app emails are added |
| `RESEND_API_KEY` | **yes** | only if testing email | staging key | production key |
| `EMAIL_ALLOWED_RECIPIENTS` | no | your address | your address | not needed |
| Supabase secret/service-role key | **yes** | **never** | **never** | **never** (not used by the app at all) |
| `SUPABASE_ACCESS_TOKEN`, DB password | **yes** | your shell only (CLI) | — | — |

`.env*` is git-ignored except `.env.example`. Secrets are never committed. The service-role key is not referenced by any app code, and an automated scan confirmed no service, secret, or JWT key appears in the client bundle.

---

## 7. Migration strategy

**Source of truth:** `supabase/migrations/*.sql`.

| # | File | Contents |
|---|---|---|
| 1 | `20261004000100_foundation.sql` | moddatetime, `private` schema, default-privilege revocations, enums, `private.india_today()` |
| 2 | `20261004000200_admin_users.sql` | `admin_users`, `has_role`, `is_admin`, policy |
| 3 | `20261004000300_catalog.sql` | categories, products, shipping rates, triggers, grants, policies |
| 4 | `20261004000400_content.sql` | gallery, blog |
| 5 | `20261004000500_orders.sql` | orders, order_items, column grants |
| 6 | `20261004000600_requests_enquiries.sql` | custom-cake requests, enquiries |
| 7 | `20261004000700_submission_functions.sql` | `place_order`, `submit_custom_cake_request`, `submit_enquiry` |
| 8 | `20261004000800_storage.sql` | `media` bucket + `storage.objects` policies |

**Flow: Local → test → Staging → verify → Production**

1. **Local:** `npm run db:reset` (all migrations + seed from scratch) → `npm run db:lint` → `npm run db:test` → `npm run db:types` (committed). CI repeats all of this on a fresh runner, plus the auth E2E tests and a generated-types drift check.
2. **Staging:** `npx supabase link --project-ref <staging-ref>` → `npx supabase db push` → `npx supabase migration list` (local = remote) → `npx supabase db diff --linked` (no drift) → Security Advisor → manual auth smoke test by the owner.
3. **Production:** the same push against the production ref, as an explicitly approved step before the app release that needs it. Migrations stay backward-compatible with the running app (expand → migrate → contract).

Never create or alter tables in the dashboard on staging or production. If an emergency fix happens there, capture it immediately with `db diff` into a migration. `supabase/seed.sql` is for the local stack only. Admin grants are data, via the runbook snippet.

---

## 8. Deployment strategy

| Step | Staging | Production |
|---|---|---|
| Create project | Free org, `ap-south-1` | Pro-capable org, `ap-south-1` |
| Record ref | `SUPABASE_PROJECT_REFS.staging` (commit) | `SUPABASE_PROJECT_REFS.production` (commit) |
| Auth settings (dashboard) | Site URL `http://localhost:3000` (no trailing slash). Redirect URLs `http://localhost:3000/**` + this project's **team-scoped** Vercel preview pattern `https://*-<team-slug>.vercel.app/**` (never a bare `*.vercel.app`, which anyone's deployment could match). Verified locally: an origin allow-listed with `/**` is accepted as `redirectTo`, and a non-allow-listed one falls back to the Site URL. **Allow new users to sign up: OFF.** **Email provider: ON.** Confirm email: ON. Secure password change: ON. Min password length 12, letters + digits. Templates from `supabase/templates/` | Site URL `https://www.akkishealthybaking.com`, redirect `https://www.akkishealthybaking.com/**`, same toggles and templates |
| SMTP | Resend (staging key), sender e.g. `no-reply@<test-domain>` | Resend (production key), verified `akkishealthybaking.com` domain |
| Schema | `supabase db push` (after approval) | `supabase db push` (separate approval at go-live) |
| Admin | create user (dashboard) → grant via snippet | same, real admins only |
| Vercel env | Preview scope: staging URL + publishable key | Production scope: production URL + publishable key |
| Verify | Security Advisor clean. Sign in, sign out, reset on the preview URL | same, before switching DNS (Phase 12) |

Hosted Auth settings are applied through the dashboard checklist above rather than `supabase config push`, because `config.toml` holds local values (e.g. localhost site URL) that must not overwrite production.
