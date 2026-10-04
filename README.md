# Akki's Healthy Baking

Website for [Akki's Healthy Baking](https://www.akkishealthybaking.com), a healthy bakery in Hinjawadi, Pune.

This branch (`next-app`) holds the in-progress rebuild on **Next.js + Supabase**. The live site is still the static HTML site on `main`; a copy of it lives in [`legacy/`](legacy/) for reference until cutover.

## Documentation

- [Project audit](docs/PROJECT-AUDIT.md): the current site, its problems, and what to preserve
- [Database design](docs/DATABASE-DESIGN.md): Supabase tables, RLS, functions, and storage
- [Supabase architecture](docs/SUPABASE-ARCHITECTURE.md): environments, auth, roles, env vars, migrations, deployment
- [Production architecture](docs/PRODUCTION-ARCHITECTURE.md): how the new app is structured
- [Migration plan](docs/MIGRATION-PLAN.md): the phased rollout and open decisions

## Requirements

- Node.js 24 (see `engines` in `package.json`)
- npm
- Docker Desktop, only for the local Supabase **test** stack (migration, RLS, and auth tests)

## Getting started

```bash
npm install
```

```bash
cp .env.example .env.local
```

```bash
npm run dev
```

Then open http://localhost:3000. Local development uses the **staging** Supabase project (never production). Fill in `.env.local` from the staging dashboard.

## Scripts

| Script                 | What it does                                  |
| ---------------------- | --------------------------------------------- |
| `npm run dev`          | Start the dev server                          |
| `npm run build`        | Production build (also type-checks)           |
| `npm run start`        | Serve the production build                    |
| `npm run typecheck`    | `tsc --noEmit`                                |
| `npm run lint`         | ESLint (Next.js core-web-vitals + TypeScript) |
| `npm run format`       | Format with Prettier                          |
| `npm run format:check` | Check formatting (CI)                         |
| `npm test`             | Unit tests (Vitest)                           |
| `npm run test:e2e`     | Auth end-to-end tests against the local stack |
| `npm run db:start`     | Start the local Supabase test stack (Docker)  |
| `npm run db:reset`     | Re-apply all migrations + seed from scratch   |
| `npm run db:test`      | pgTAP tests: constraints, functions, RLS      |
| `npm run db:lint`      | Database linter                               |
| `npm run db:types`     | Regenerate `types/database.types.ts`          |
| `npm run db:stop`      | Stop the local stack                          |

CI (`.github/workflows/ci.yml`) runs typecheck, lint, format check, unit tests, and build, plus a database job: migrations from scratch, database lint, pgTAP, a generated-types drift check, and auth E2E.

## Database

Supabase migrations in `supabase/migrations/` are the source of truth. Flow: **local → test → staging → verify → production**. Never edit staging or production schemas in the dashboard. Admin access is granted with `supabase/snippets/grant-admin.sql`. See [Supabase architecture §7–8](docs/SUPABASE-ARCHITECTURE.md#7-migration-strategy).

## Environment variables

See [`.env.example`](.env.example). Only `NEXT_PUBLIC_*` variables reach the browser, and they are validated in [`lib/env.ts`](lib/env.ts). Secrets must never be committed or given a `NEXT_PUBLIC_` prefix.

## Project layout

```
app/        routes (App Router). (site)/ holds the public pages
components/ UI components (admin/auth forms so far)
lib/        shared code: env + Supabase config guards, auth, validation, email, logger
server/     Server Actions
supabase/   config, migrations, seed (local only), pgTAP tests, email templates, runbooks
types/      generated database types
tests/unit/ Vitest unit tests
e2e/        Playwright tests (local stack only)
docs/       audit and architecture documents
legacy/     the current static site, reference only, not built or linted
```

Further folders are added as each phase needs them; see the target tree in the [audit](docs/PROJECT-AUDIT.md#5-recommended-nextjs-architecture-summary).

## Known advisories

`npm audit` reports a high-severity advisory in `braces` (via `eslint-config-next` → `fast-glob` → `micromatch`). It affects **dev-time lint tooling only** and is never shipped to the browser. The exploit needs attacker-controlled glob patterns, and ours come from our own config. No patched `braces` release exists, and npm's suggested fix downgrades `eslint-config-next` to 14.x, so it is intentionally not applied. Revisit when a fix is published.
