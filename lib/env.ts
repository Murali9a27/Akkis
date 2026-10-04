import { z } from "zod";

/**
 * Public (browser-safe) environment variables, validated once at import time so a
 * misconfigured deployment fails the build instead of rendering broken pages.
 *
 * `NEXT_PUBLIC_*` values are inlined by Next.js at build time, which only works when
 * each one is referenced literally as `process.env.NEXT_PUBLIC_…` — hence the
 * explicit object below rather than passing `process.env` wholesale.
 *
 * Server-only secrets never belong in this file; they get their own schema in a
 * `server-only` module when the first one is introduced (Phase 2).
 */

/** Treat unset and empty-string variables the same way. */
const emptyToUndefined = (value: unknown) => (value === "" ? undefined : value);

const publicEnvSchema = z.object({
  /** Canonical origin used for metadata, canonical URLs and the sitemap. */
  NEXT_PUBLIC_SITE_URL: z.preprocess(
    emptyToUndefined,
    z
      .url({ protocol: /^https?$/ })
      .default("https://www.akkishealthybaking.com")
      .transform((url) => url.replace(/\/+$/, "")),
  ),
  /** Google Analytics 4 measurement id. Analytics is only loaded when this is set. */
  NEXT_PUBLIC_GA_ID: z.preprocess(
    emptyToUndefined,
    z
      .string()
      .regex(/^G-[A-Z0-9]+$/, "Expected a GA4 measurement id like G-XXXXXXX")
      .optional(),
  ),
});

export const publicEnv = publicEnvSchema.parse({
  NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
  NEXT_PUBLIC_GA_ID: process.env.NEXT_PUBLIC_GA_ID,
});
