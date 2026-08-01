import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SITE_URL,
  buildRobotsTxt,
  buildSitemapXml,
  normalizeSiteUrl,
} from './siteUrl';

describe('normalizeSiteUrl', () => {
  it('defaults when empty or missing', () => {
    expect(normalizeSiteUrl(undefined)).toBe(DEFAULT_SITE_URL);
    expect(normalizeSiteUrl('')).toBe(DEFAULT_SITE_URL);
    expect(normalizeSiteUrl('   ')).toBe(DEFAULT_SITE_URL);
  });

  it('strips trailing slashes', () => {
    expect(normalizeSiteUrl('https://quill.example/')).toBe('https://quill.example');
    expect(normalizeSiteUrl('https://quill.example///')).toBe('https://quill.example');
  });
});

describe('buildSitemapXml', () => {
  it('emits a single homepage loc without double slash', () => {
    const xml = buildSitemapXml('https://quill.example/');
    expect(xml).toContain('<loc>https://quill.example/</loc>');
    expect(xml).not.toContain('https://quill.example//');
  });
});

describe('buildRobotsTxt', () => {
  it('points Sitemap at absolute URL', () => {
    const txt = buildRobotsTxt('https://quill.example');
    expect(txt).toContain('Sitemap: https://quill.example/sitemap.xml');
    expect(txt).toContain('Allow: /');
  });
});
