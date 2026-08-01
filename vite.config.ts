import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { buildRobotsTxt, buildSitemapXml, normalizeSiteUrl } from './src/seo/siteUrl';

const PORT = 5188;

const HIVE_APIS = [
  'https://api.hive.blog',
  'https://api.deathwing.me',
  'https://api.openhive.network',
];

function buildCsp(dev: boolean): string {
  // 'unsafe-eval' is required by @hiveio/dhive (secp256k1) inside the signing worker.
  const scriptSrc = dev
    ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'"
    : "script-src 'self' 'unsafe-eval'";
  const connectSrc = [
    "connect-src 'self'",
    ...HIVE_APIS,
    'https://images.hive.blog',
    ...(dev ? ['ws:', 'wss:'] : []),
  ].join(' ');

  return [
    "default-src 'self'",
    scriptSrc,
    "worker-src 'self' blob:",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' https: data: blob:",
    "font-src 'self'",
    "object-src 'none'",
    "base-uri 'none'",
    "frame-ancestors 'none'",
    "frame-src 'self' blob:",
    connectSrc,
  ].join('; ');
}

function quillSeoPlugin(siteUrl: string): Plugin {
  const writeSeo = (outDir: string) => {
    writeFileSync(path.join(outDir, 'sitemap.xml'), buildSitemapXml(siteUrl));
    writeFileSync(path.join(outDir, 'robots.txt'), buildRobotsTxt(siteUrl));
  };

  return {
    name: 'quill-seo',
    transformIndexHtml(html) {
      return html.replaceAll('%VITE_SITE_URL%', siteUrl);
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url === '/sitemap.xml') {
          res.setHeader('Content-Type', 'application/xml');
          res.end(buildSitemapXml(siteUrl));
          return;
        }
        if (req.url === '/robots.txt') {
          res.setHeader('Content-Type', 'text/plain');
          res.end(buildRobotsTxt(siteUrl));
          return;
        }
        next();
      });
    },
    closeBundle() {
      writeSeo(path.resolve('dist'));
    },
  };
}

export default defineConfig(({ command, mode }) => {
  const dev = command === 'serve';
  const csp = buildCsp(dev);
  const env = loadEnv(mode, process.cwd(), '');
  const siteUrl = normalizeSiteUrl(env.VITE_SITE_URL || process.env.VITE_SITE_URL);

  return {
    plugins: [
      react(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['favicon.svg', 'logo.svg', 'og.png', 'icons/*.png'],
        manifest: {
          name: 'Quill',
          short_name: 'Quill',
          description: 'Distraction-free Hive blog composition',
          theme_color: '#1a1f1c',
          background_color: '#f4f0e6',
          display: 'standalone',
          start_url: '/',
          icons: [
            {
              src: 'icons/icon-192.png',
              sizes: '192x192',
              type: 'image/png',
            },
            {
              src: 'icons/icon-512.png',
              sizes: '512x512',
              type: 'image/png',
            },
            {
              src: 'icons/icon-512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable',
            },
          ],
        },
        workbox: {
          navigateFallback: '/index.html',
          globPatterns: ['**/*.{js,css,html,ico,svg,png,woff2,xml,txt,webmanifest}'],
          runtimeCaching: [],
        },
        devOptions: {
          enabled: false,
        },
      }),
      quillSeoPlugin(siteUrl),
      {
        name: 'hivequill-csp',
        configureServer(server) {
          server.middlewares.use((_req, res, next) => {
            res.setHeader('Content-Security-Policy', csp);
            next();
          });
        },
        configurePreviewServer(server) {
          server.middlewares.use((_req, res, next) => {
            res.setHeader('Content-Security-Policy', buildCsp(false));
            next();
          });
        },
        transformIndexHtml(html) {
          // Production builds get strict CSP meta; Vite dev needs inline scripts for HMR
          if (dev) return html;
          return html.replace(
            '<head>',
            `<head>\n    <meta http-equiv="Content-Security-Policy" content="${buildCsp(false)}" />`,
          );
        },
      },
    ],
    server: {
      host: '0.0.0.0',
      port: PORT,
      strictPort: true,
    },
    preview: {
      host: '0.0.0.0',
      port: PORT,
    },
    worker: {
      format: 'es',
    },
  };
});
