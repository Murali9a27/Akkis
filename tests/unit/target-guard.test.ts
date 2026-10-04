import { describe, expect, it } from "vitest";
import {
  assertBrowserSafeKey,
  deploymentContextFrom,
  parseSupabaseTarget,
  resolveSupabasePublicConfig,
  SupabaseConfigError,
  type ProjectRefs,
} from "@/lib/supabase/target-guard";

const STAGING = "stagingref0000000000";
const PRODUCTION = "productionref0000000";
const refs: ProjectRefs = { staging: STAGING, production: PRODUCTION };
const url = (ref: string) => `https://${ref}.supabase.co`;
const KEY = "sb_publishable_abc123";

/** Builds an unsigned JWT-shaped token with the given payload (signature is irrelevant here). */
function jwt(payload: Record<string, unknown>): string {
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${encode({ alg: "HS256", typ: "JWT" })}.${encode(payload)}.signature`;
}

describe("deploymentContextFrom", () => {
  it("maps VERCEL_ENV values", () => {
    expect(deploymentContextFrom("production")).toBe("vercel-production");
    expect(deploymentContextFrom("preview")).toBe("vercel-preview");
    expect(deploymentContextFrom("development")).toBe("vercel-development");
    expect(deploymentContextFrom(undefined)).toBe("local");
  });
  it("rejects unknown values", () => {
    expect(() => deploymentContextFrom("prod")).toThrow(SupabaseConfigError);
  });
});

describe("parseSupabaseTarget", () => {
  it("recognises hosted projects and the local stack", () => {
    expect(parseSupabaseTarget(url(STAGING))).toEqual({ kind: "hosted", ref: STAGING });
    expect(parseSupabaseTarget("http://127.0.0.1:54321")).toEqual({ kind: "local" });
  });
  it("rejects other hosts and plain http for hosted projects", () => {
    expect(() => parseSupabaseTarget("https://evil.example.com")).toThrow(SupabaseConfigError);
    expect(() => parseSupabaseTarget(`http://${STAGING}.supabase.co`)).toThrow(SupabaseConfigError);
    expect(() => parseSupabaseTarget("not a url")).toThrow(SupabaseConfigError);
  });
});

describe("assertBrowserSafeKey", () => {
  const hosted = { kind: "hosted", ref: STAGING } as const;
  it("accepts publishable keys and anon JWTs", () => {
    expect(() => assertBrowserSafeKey(KEY, hosted)).not.toThrow();
    expect(() => assertBrowserSafeKey(jwt({ role: "anon", ref: STAGING }), hosted)).not.toThrow();
  });
  it("rejects secret keys and service-role JWTs", () => {
    expect(() => assertBrowserSafeKey("sb_secret_abc", hosted)).toThrow(/SECRET/);
    expect(() => assertBrowserSafeKey(jwt({ role: "service_role", ref: STAGING }), hosted)).toThrow(
      /anon key/,
    );
  });
  it("rejects an anon key from another project and unknown formats", () => {
    expect(() => assertBrowserSafeKey(jwt({ role: "anon", ref: PRODUCTION }), hosted)).toThrow(
      /different project/,
    );
    expect(() => assertBrowserSafeKey("garbage", hosted)).toThrow(SupabaseConfigError);
  });
});

describe("environment mapping", () => {
  const resolve = (
    ref: string,
    context: Parameters<typeof resolveSupabasePublicConfig>[0]["context"],
    r = refs,
  ) => resolveSupabasePublicConfig({ url: url(ref), publishableKey: KEY, context, refs: r });

  it("Preview cannot connect to production", () => {
    expect(() => resolve(PRODUCTION, "vercel-preview")).toThrow(/PRODUCTION/);
  });
  it("local development and Vercel development cannot connect to production", () => {
    expect(() => resolve(PRODUCTION, "local")).toThrow(/PRODUCTION/);
    expect(() => resolve(PRODUCTION, "vercel-development")).toThrow(/PRODUCTION/);
  });
  it("Production cannot use staging credentials", () => {
    expect(() => resolve(STAGING, "vercel-production")).toThrow(/production Supabase project/);
  });
  it("allows the intended mappings", () => {
    expect(resolve(STAGING, "vercel-preview").target).toEqual({ kind: "hosted", ref: STAGING });
    expect(resolve(STAGING, "local").target).toEqual({ kind: "hosted", ref: STAGING });
    expect(resolve(PRODUCTION, "vercel-production").target).toEqual({
      kind: "hosted",
      ref: PRODUCTION,
    });
  });
  it("rejects unknown projects everywhere", () => {
    expect(() => resolve("unknownref0000000000", "vercel-preview")).toThrow(/staging/);
    expect(() => resolve("unknownref0000000000", "vercel-production")).toThrow(/production/);
  });
  it("fails closed while project refs are not configured", () => {
    const unset: ProjectRefs = { staging: null, production: null };
    expect(() => resolve(STAGING, "vercel-production", unset)).toThrow(/not configured/);
    expect(() => resolve(STAGING, "vercel-preview", unset)).toThrow(/not configured/);
  });
  it("allows the local test stack only off Vercel", () => {
    const local = (context: Parameters<typeof resolve>[1]) =>
      resolveSupabasePublicConfig({
        url: "http://127.0.0.1:54321",
        publishableKey: KEY,
        context,
        refs,
      });
    expect(local("local").target).toEqual({ kind: "local" });
    expect(() => local("vercel-preview")).toThrow(/local Supabase test stack/);
    expect(() => local("vercel-production")).toThrow(/local Supabase test stack/);
  });
  it("requires both variables", () => {
    expect(() =>
      resolveSupabasePublicConfig({
        url: url(STAGING),
        publishableKey: "",
        context: "local",
        refs,
      }),
    ).toThrow(/must both be set/);
  });
});
