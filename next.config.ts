import type { NextConfig } from "next";
import { SUPABASE_PROJECT_REFS } from "./lib/config/supabase-projects";
import { deploymentContextFrom, resolveSupabasePublicConfig } from "./lib/supabase/target-guard";

/**
 * Build-time environment safeguard (docs/SUPABASE-ARCHITECTURE.md §H). Fails `next build`
 * / `next dev` when Supabase credentials don't match the deployment: Preview can never be
 * built against production, and Production can never be built against staging. On Vercel
 * the credentials are mandatory; locally/CI they are optional until a page needs them.
 */
function assertSupabaseEnvironment(): void {
  const context = deploymentContextFrom(process.env.VERCEL_ENV);
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (context === "local" && !url && !publishableKey) return;
  resolveSupabasePublicConfig({ url, publishableKey, context, refs: SUPABASE_PROJECT_REFS });
}

assertSupabaseEnvironment();

/**
 * Legacy static-site URLs. Vercel's `cleanUrls` used to serve each page at both
 * `/page` and `/page.html`; keep the `.html` variants alive as permanent redirects
 * so existing links, bookmarks and search results don't break.
 */
const legacyHtmlRedirects: Array<{ source: string; destination: string }> = [
  { source: "/index.html", destination: "/" },
  { source: "/products.html", destination: "/products" },
  { source: "/custom-cake.html", destination: "/custom-cake" },
  { source: "/gallery.html", destination: "/gallery" },
  { source: "/about.html", destination: "/about" },
  { source: "/blog.html", destination: "/blog" },
  { source: "/contact.html", destination: "/contact" },
  // menu.html was removed from the legacy site; its content lives on /products.
  { source: "/menu.html", destination: "/products" },
];

const nextConfig: NextConfig = {
  reactCompiler: true,
  poweredByHeader: false,
  async redirects() {
    return legacyHtmlRedirects.map((r) => ({ ...r, permanent: true }));
  },
};

export default nextConfig;
