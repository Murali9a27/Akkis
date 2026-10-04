const DEFAULT_ADMIN_PATH = "/admin";

/**
 * Allow-list for post-auth redirects taken from user-controlled input (`?next=`).
 * Only same-origin paths inside /admin are accepted, which prevents open redirects such as
 * `//evil.example`, `/\evil.example`, `https://evil.example` or `javascript:` URLs.
 */
export function safeAdminRedirect(next: unknown, fallback: string = DEFAULT_ADMIN_PATH): string {
  if (typeof next !== "string" || next.length === 0 || next.length > 512) return fallback;
  if (!next.startsWith("/") || next.startsWith("//") || next.includes("\\")) return fallback;
  if (/[\u0000-\u001f\u007f]/.test(next)) return fallback;

  let parsed: URL;
  try {
    parsed = new URL(next, "http://internal.invalid");
  } catch {
    return fallback;
  }
  if (parsed.origin !== "http://internal.invalid") return fallback;
  if (parsed.pathname !== "/admin" && !parsed.pathname.startsWith("/admin/")) return fallback;

  return `${parsed.pathname}${parsed.search}${parsed.hash}`;
}
