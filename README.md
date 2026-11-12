# Quill

[![Powered By Hive](https://img.shields.io/static/v1?label=Hive&message=Powered%20By%20Hive&color=E31337&labelColor=212529&logo=hive_blockchain&logoColor=white&style=flat)](https://hive.io/)

Distraction-free Hive blog composition PWA (repo: hivequill).

- Offline drafts (IndexedDB)
- PeakD/Ecency-portable Markdown preview (sandboxed; static video cards)
- Passphrase-encrypted posting key in a signing Web Worker
- Optional Hive Keychain signing (no local private key storage)
- Publish via `comment` + `comment_options` only

## Develop (Docker only)

```bash
docker compose up --build
```

Open http://localhost:5188

See [DOCKER.md](DOCKER.md).

## Build

```bash
docker compose run --rm app npm run build
```

Set `VITE_SITE_URL` (no trailing slash) for production OG tags and `sitemap.xml` / `robots.txt`.  
Default local placeholder is `https://example.com`. GitHub Pages builds use  
`https://hiveuprss.github.io/quill` (see `.env.example` and the deploy workflow).

## Tests / CI (Docker)

```bash
# Typecheck + production build
docker compose run --rm app npm run build

# Unit + component tests with 80% coverage gate
docker compose run --rm app npm run test:coverage

# Playwright functional / E2E
docker compose --profile e2e run --rm e2e
```

Markdown parity (Vitest subset):

```bash
docker compose run --rm app npm run test:parity
```

## Production checklist

1. Production host is **GitHub Pages**: https://hiveuprss.github.io/quill/  
   (`VITE_SITE_URL` + `VITE_BASE=/quill/` set in `.github/workflows/deploy-pages.yml`).
2. Serve over **HTTPS** (GitHub Pages enforces this).
3. Confirm service worker updates (`registerType: autoUpdate` via `vite-plugin-pwa`).
4. Keep CSP compatible with Hive APIs + `images.hive.blog` (see `vite.config.ts`).
5. Smoke: enroll → compose → publish (dry) → install-to-homescreen icons.
6. Never commit `.env` or real WIFs — tests use disposable `PrivateKey.fromSeed` only.

Deploys automatically on push to `main` (Actions → Deploy to GitHub Pages).
