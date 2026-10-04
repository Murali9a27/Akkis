import { SUPABASE_PROJECT_REFS } from "@/lib/config/supabase-projects";
import {
  deploymentContextFrom,
  resolveSupabasePublicConfig,
  type SupabasePublicConfig,
} from "@/lib/supabase/target-guard";

let cached: SupabasePublicConfig | undefined;

/**
 * Browser-safe Supabase settings, validated on first use (not at import) so pages that
 * never touch Supabase don't require it.
 *
 * On the server the environment mapping is enforced too (Preview → staging only,
 * Production → production only). In the browser only the key shape is re-checked: the
 * values were inlined at build time, and the build itself runs the full guard
 * (see next.config.ts).
 */
export function getSupabaseConfig(): SupabasePublicConfig {
  cached ??= resolveSupabasePublicConfig({
    // Literal references so Next.js inlines them into the browser bundle.
    url: process.env.NEXT_PUBLIC_SUPABASE_URL,
    publishableKey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    context:
      typeof window === "undefined" ? deploymentContextFrom(process.env.VERCEL_ENV) : undefined,
    refs: SUPABASE_PROJECT_REFS,
  });
  return cached;
}
