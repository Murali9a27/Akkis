import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getSupabaseConfig } from "@/lib/supabase/config";
import type { Database } from "@/types/database.types";

/**
 * Cookie-session Supabase client for Server Components, Server Actions and Route Handlers.
 * Uses the publishable key; every query runs as the signed-in user, so RLS applies.
 * Create one per request — never share an instance across requests.
 */
export async function createSupabaseServerClient() {
  // Read cookies first: it marks the route as per-request (never prerendered at build), so
  // configuration problems surface at request time instead of breaking unrelated builds.
  const cookieStore = await cookies();
  const { url, publishableKey } = getSupabaseConfig();

  return createServerClient<Database>(url, publishableKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Called from a Server Component, where cookies are read-only. Safe to ignore:
          // proxy.ts refreshes the session on every /admin and /auth request.
        }
      },
    },
  });
}
