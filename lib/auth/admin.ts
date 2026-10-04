import "server-only";

import { redirect } from "next/navigation";
import { cache } from "react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database.types";

export type AppRole = Database["public"]["Enums"]["app_role"];

export type AdminSession = Readonly<{
  userId: string;
  email: string | null;
  role: AppRole;
  /**
   * Authenticator assurance level from the verified JWT ("aal1" = password, "aal2" = MFA).
   * Not enforced yet; Phase 9 (admin 2FA) will require "aal2" in requireRole().
   */
  aal: string | null;
}>;

export type AuthState =
  | { kind: "anonymous" }
  | { kind: "signed-in-without-role"; userId: string; email: string | null }
  | { kind: "authorized"; session: AdminSession };

/**
 * Resolves the current request's identity and application role.
 *
 * Identity comes from getClaims(), which verifies the JWT signature (never getSession(),
 * which trusts the cookie). The role comes from public.admin_users, read under RLS
 * (users can only see their own row). Memoised per request.
 */
export const getAuthState = cache(async (): Promise<AuthState> => {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (error || !claims || typeof claims.sub !== "string") {
    return { kind: "anonymous" };
  }

  const email = typeof claims.email === "string" ? claims.email : null;
  const { data: membership, error: membershipError } = await supabase
    .from("admin_users")
    .select("role")
    .eq("user_id", claims.sub)
    .maybeSingle();

  if (membershipError || !membership) {
    return { kind: "signed-in-without-role", userId: claims.sub, email };
  }

  return {
    kind: "authorized",
    session: {
      userId: claims.sub,
      email,
      role: membership.role,
      aal: typeof claims.aal === "string" ? claims.aal : null,
    },
  };
});

/**
 * Server-side gate for admin pages, layouts and Server Actions. Redirects (throws) when
 * the caller lacks one of the allowed roles; returns the session otherwise.
 * Call it in every admin page AND at the top of every admin Server Action — layouts alone
 * are not a sufficient boundary, and actions are directly callable endpoints.
 */
export async function requireRole(allowed: readonly AppRole[]): Promise<AdminSession> {
  const state = await getAuthState();
  if (state.kind === "anonymous") {
    redirect("/admin/login");
  }
  if (state.kind === "signed-in-without-role" || !allowed.includes(state.session.role)) {
    redirect("/admin/login?error=not-authorized");
  }
  return state.session;
}

/** Today every admin capability requires the single "admin" role. */
export function requireAdmin(): Promise<AdminSession> {
  return requireRole(["admin"]);
}
