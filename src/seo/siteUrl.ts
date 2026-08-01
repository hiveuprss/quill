export const DEFAULT_SITE_URL = 'https://example.com';

/** Strip trailing slashes; fall back to placeholder when unset/empty. */
export function normalizeSiteUrl(raw: string | undefined | null): string {
  const trimmed = (raw ?? '').trim();
  const base = trimmed || DEFAULT_SITE_URL;
  return base.replace(/\/+$/, '');
}

/**
 * Vite `base` path for subdirectory hosts (e.g. GitHub project Pages).
 * Prefer explicit VITE_BASE; otherwise derive from VITE_SITE_URL pathname.
 */
export function resolveViteBase(opts: {
  siteUrl?: string | null;
  baseEnv?: string | null;
}): string {
  const explicit = (opts.baseEnv ?? '').trim();
  if (explicit) {
    const withSlash = explicit.startsWith('/') ? explicit : `/${explicit}`;
    return withSlash.endsWith('/') ? withSlash : `${withSlash}/`;
  }
  try {
    const pathname = new URL(normalizeSiteUrl(opts.siteUrl)).pathname.replace(/\/+$/, '');
    if (!pathname || pathname === '/') return '/';
    return `${pathname}/`;
  } catch {
    return '/';
  }
}

/** React Router basename: leading slash, no trailing slash (undefined = site root). */
export function routerBasenameFromViteBase(viteBase: string): string | undefined {
  const trimmed = viteBase.replace(/\/+$/, '');
  if (!trimmed || trimmed === '/') return undefined;
  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
}

/** Join a `public/` asset with Vite `base` (e.g. `/logo.svg` → `/quill/logo.svg`). */
export function publicAssetUrl(assetPath: string, viteBase = '/'): string {
  const base = viteBase.endsWith('/') ? viteBase : `${viteBase}/`;
  const path = assetPath.replace(/^\//, '');
  return `${base}${path}`;
}

export function buildSitemapXml(siteUrl: string): string {
  const loc = `${normalizeSiteUrl(siteUrl)}/`;
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${loc}</loc>
    <changefreq>weekly</changefreq>
    <priority>1.0</priority>
  </url>
</urlset>
`;
}

export function buildRobotsTxt(siteUrl: string): string {
  const base = normalizeSiteUrl(siteUrl);
  return `User-agent: *
Allow: /

Sitemap: ${base}/sitemap.xml
`;
}
