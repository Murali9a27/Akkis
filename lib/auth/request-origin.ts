export type OriginHeaders = Readonly<{
  origin: string | null;
  host: string | null;
  forwardedHost: string | null;
  forwardedProto: string | null;
}>;

const HOST = /^(?:[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*|\[[0-9A-Fa-f:]+\])(?::\d{1,5})?$/;

function normaliseOrigin(value: string | null): string | null {
  if (!value || value === "null") return null;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? url.origin : null;
  } catch {
    return null;
  }
}

/**
 * The origin (scheme + host + port, no path) of the app instance handling this request,
 * used as the `redirectTo` for Supabase auth emails so links return to the same
 * deployment (localhost, a Vercel Preview, or production).
 *
 * Order: the browser's `Origin` header (sent on every Server Action POST, and already
 * checked against Host by Next.js's Server Action CSRF protection) → forwarded/Host
 * headers → the configured site URL. The result is NOT trusted on its own: Supabase only
 * honours it when it matches the project's Redirect URL allow-list and otherwise falls
 * back to the project's Site URL.
 */
export function resolveRequestOrigin(headers: OriginHeaders, fallback: string): string {
  const fromOrigin = normaliseOrigin(headers.origin);
  if (fromOrigin) return fromOrigin;

  const host = headers.forwardedHost?.split(",")[0]?.trim() || headers.host?.trim() || "";
  if (HOST.test(host)) {
    const forwardedProto = headers.forwardedProto?.split(",")[0]?.trim();
    const isLocal = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(host);
    const proto =
      forwardedProto === "http" || forwardedProto === "https"
        ? forwardedProto
        : isLocal
          ? "http"
          : "https";
    const fromHost = normaliseOrigin(`${proto}://${host}`);
    if (fromHost) return fromHost;
  }

  return normaliseOrigin(fallback) ?? fallback;
}
