import type { NextConfig } from "next";

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
