export const DEFAULT_SITE_URL = 'https://example.com';

/** Strip trailing slashes; fall back to placeholder when unset/empty. */
export function normalizeSiteUrl(raw: string | undefined | null): string {
  const trimmed = (raw ?? '').trim();
  const base = trimmed || DEFAULT_SITE_URL;
  return base.replace(/\/+$/, '');
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
