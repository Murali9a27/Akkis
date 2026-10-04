import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

/** /admin pages reachable without a session. */
const PUBLIC_ADMIN_PATHS = new Set(["/admin/login", "/admin/forgot-password"]);

/**
 * Session refresh + early redirect for the admin area. Matched only on /admin and /auth so
 * public pages stay static and cookie-free. This is a UX layer, not the security boundary:
 * pages and Server Actions call requireAdmin(), and RLS enforces access in the database.
 */
export async function proxy(request: NextRequest) {
  const { response, userId } = await updateSession(request);
  const { pathname, search } = request.nextUrl;

  let result: NextResponse = response;
  if (pathname.startsWith("/admin") && !PUBLIC_ADMIN_PATHS.has(pathname) && !userId) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/admin/login";
    loginUrl.search = "";
    loginUrl.searchParams.set("next", `${pathname}${search}`);
    result = NextResponse.redirect(loginUrl);
    // Keep any cookie changes (e.g. a cleared expired session) on the redirect.
    for (const cookie of response.cookies.getAll()) {
      result.cookies.set(cookie);
    }
  }

  result.headers.set("Cache-Control", "private, no-store");
  result.headers.set("X-Robots-Tag", "noindex, nofollow");
  return result;
}

export const config = {
  matcher: ["/admin/:path*", "/auth/:path*"],
};
