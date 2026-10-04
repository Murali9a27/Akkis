/**
 * Environment safeguard for Supabase credentials.
 *
 * Decides whether a Supabase URL + browser key may be used in the current deployment
 * context. Pure and dependency-free so it can run in `next.config.ts` (failing the build),
 * in server code at runtime, and in unit tests.
 *
 * Rules (docs/SUPABASE-ARCHITECTURE.md §H):
 *   - Vercel Production must use the production project, and nothing else.
 *   - Every other context (Vercel Preview/Development, local dev, CI) must use the staging
 *     project or the local test stack, and can never use the production project.
 *   - The local test stack is only allowed off Vercel.
 *   - The browser key must be a publishable/anon key, never a secret/service-role key.
 */

export type DeploymentContext =
  "vercel-production" | "vercel-preview" | "vercel-development" | "local";

export type SupabaseTarget = { kind: "local" } | { kind: "hosted"; ref: string };

export type ProjectRefs = Readonly<{ staging: string | null; production: string | null }>;

export class SupabaseConfigError extends Error {
  constructor(message: string) {
    super(`[supabase config] ${message}`);
    this.name = "SupabaseConfigError";
  }
}

export function deploymentContextFrom(vercelEnv: string | undefined): DeploymentContext {
  switch (vercelEnv) {
    case "production":
      return "vercel-production";
    case "preview":
      return "vercel-preview";
    case "development":
      return "vercel-development";
    case undefined:
    case "":
      return "local";
    default:
      throw new SupabaseConfigError(`Unknown VERCEL_ENV "${vercelEnv}".`);
  }
}

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);
const HOSTED_SUFFIX = ".supabase.co";
const PROJECT_REF = /^[a-z0-9]{20}$/;

export function parseSupabaseTarget(supabaseUrl: string): SupabaseTarget {
  let url: URL;
  try {
    url = new URL(supabaseUrl);
  } catch {
    throw new SupabaseConfigError("NEXT_PUBLIC_SUPABASE_URL is not a valid URL.");
  }
  if (LOCAL_HOSTS.has(url.hostname)) {
    return { kind: "local" };
  }
  if (url.protocol !== "https:" || !url.hostname.endsWith(HOSTED_SUFFIX)) {
    throw new SupabaseConfigError(
      "NEXT_PUBLIC_SUPABASE_URL must be https://<project-ref>.supabase.co or the local test stack.",
    );
  }
  const ref = url.hostname.slice(0, -HOSTED_SUFFIX.length);
  if (!PROJECT_REF.test(ref)) {
    throw new SupabaseConfigError(`"${ref}" is not a valid Supabase project ref.`);
  }
  return { kind: "hosted", ref };
}

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const parts = token.split(".");
  if (parts.length !== 3 || !parts[1]) return null;
  try {
    const json = atob(parts[1].replace(/-/g, "+").replace(/_/g, "/"));
    const payload: unknown = JSON.parse(json);
    return typeof payload === "object" && payload !== null
      ? (payload as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

/**
 * Accepts `sb_publishable_…` keys and legacy anon JWTs. Rejects secret keys, service-role
 * JWTs and anything unrecognised, so a secret can never be shipped as a NEXT_PUBLIC_ value.
 */
export function assertBrowserSafeKey(key: string, target: SupabaseTarget): void {
  if (key.startsWith("sb_secret_")) {
    throw new SupabaseConfigError(
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY contains a SECRET key. Use the publishable key; " +
        "secret keys must never be exposed to the browser.",
    );
  }
  if (key.startsWith("sb_publishable_")) return;

  const payload = decodeJwtPayload(key);
  if (!payload) {
    throw new SupabaseConfigError(
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY is not a recognised Supabase key.",
    );
  }
  if (payload.role !== "anon") {
    throw new SupabaseConfigError(
      `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY has role "${String(payload.role)}"; only the anon key ` +
        "may be exposed to the browser.",
    );
  }
  if (target.kind === "hosted" && typeof payload.ref === "string" && payload.ref !== target.ref) {
    throw new SupabaseConfigError(
      "The anon key belongs to a different project than NEXT_PUBLIC_SUPABASE_URL.",
    );
  }
}

export function assertTargetAllowed(
  target: SupabaseTarget,
  context: DeploymentContext,
  refs: ProjectRefs,
): void {
  if (target.kind === "local") {
    if (context !== "local") {
      throw new SupabaseConfigError(
        "The local Supabase test stack cannot be used from a Vercel deployment.",
      );
    }
    return;
  }

  if (context === "vercel-production") {
    if (!refs.production) {
      throw new SupabaseConfigError(
        "SUPABASE_PROJECT_REFS.production is not configured; refusing to start production.",
      );
    }
    if (target.ref !== refs.production) {
      throw new SupabaseConfigError(
        "Vercel Production must use the production Supabase project; the configured URL points elsewhere " +
          "(staging credentials in production?).",
      );
    }
    return;
  }

  // Preview, Vercel development, local development and CI.
  if (refs.production && target.ref === refs.production) {
    throw new SupabaseConfigError(
      `The ${context} environment is configured with the PRODUCTION Supabase project. ` +
        "Only Vercel Production may use it; use the staging project instead.",
    );
  }
  if (!refs.staging) {
    throw new SupabaseConfigError("SUPABASE_PROJECT_REFS.staging is not configured.");
  }
  if (target.ref !== refs.staging) {
    throw new SupabaseConfigError(
      `The ${context} environment must use the staging Supabase project.`,
    );
  }
}

export type SupabasePublicConfig = Readonly<{
  url: string;
  publishableKey: string;
  target: SupabaseTarget;
}>;

/**
 * Validates the browser-safe Supabase settings and throws `SupabaseConfigError` on any
 * problem. When `context` is given (server side), also enforces the environment mapping.
 */
export function resolveSupabasePublicConfig(input: {
  url: string | undefined;
  publishableKey: string | undefined;
  context?: DeploymentContext;
  refs: ProjectRefs;
}): SupabasePublicConfig {
  const url = input.url?.trim();
  const publishableKey = input.publishableKey?.trim();
  if (!url || !publishableKey) {
    throw new SupabaseConfigError(
      "NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY must both be set.",
    );
  }
  const target = parseSupabaseTarget(url);
  assertBrowserSafeKey(publishableKey, target);
  if (input.context) {
    assertTargetAllowed(target, input.context, input.refs);
  }
  return { url: url.replace(/\/+$/, ""), publishableKey, target };
}
