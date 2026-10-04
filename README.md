# Akki's Healthy Baking

Website for [Akki's Healthy Baking](https://www.akkishealthybaking.com), a healthy bakery in Hinjawadi, Pune.

This branch (`next-app`) holds the in-progress rebuild on **Next.js + Supabase**. The live site is still the static HTML site on `main`; a copy of it lives in [`legacy/`](legacy/) for reference until cutover.

## Documentation

- [Project audit](docs/PROJECT-AUDIT.md): the current site, its problems, and what to preserve
- [Database design](docs/DATABASE-DESIGN.md): Supabase tables, RLS, and storage
- [Production architecture](docs/PRODUCTION-ARCHITECTURE.md): how the new app is structured
- [Migration plan](docs/MIGRATION-PLAN.md): the phased rollout and open decisions

## Requirements

- Node.js 24 (see `engines` in `package.json`)
- npm

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

Then open http://localhost:3000.

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

CI (`.github/workflows/ci.yml`) runs typecheck, lint, format check, and build on every pull request.

## Environment variables

See [`.env.example`](.env.example). Only `NEXT_PUBLIC_*` variables reach the browser, and they are validated in [`lib/env.ts`](lib/env.ts). Secrets must never be committed or given a `NEXT_PUBLIC_` prefix.

## Project layout

```
app/        routes (App Router). (site)/ holds the public pages
lib/        framework-agnostic code (env validation, and later validation, config, helpers)
docs/       audit and architecture documents
legacy/     the current static site, reference only, not built or linted
```

Further folders (`components/`, `server/`, `supabase/`, …) are added as each phase needs them; see the target tree in the [audit](docs/PROJECT-AUDIT.md#5-recommended-nextjs-architecture-summary).

## Known advisories

`npm audit` reports a high-severity advisory in `braces` (via `eslint-config-next` → `fast-glob` → `micromatch`). It affects **dev-time lint tooling only** and is never shipped to the browser. The exploit needs attacker-controlled glob patterns, and ours come from our own config. No patched `braces` release exists, and npm's suggested fix downgrades `eslint-config-next` to 14.x, so it is intentionally not applied. Revisit when a fix is published.
