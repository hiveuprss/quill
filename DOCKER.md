# Quill — Docker workflow

All `npm install` / build / test work runs **inside Docker**. The host does not need a local `node_modules`.

Canonical site URL for OG/sitemap defaults to `https://example.com`. Override at build time with `VITE_SITE_URL` (see `.env.example`).

## Dev server

```bash
cd ~/Code/hivequill
docker compose up --build
```

Open [http://localhost:5188](http://localhost:5188).

Source is bind-mounted; dependencies live in the named volume `hivequill_node_modules`.

## Production build

```bash
docker compose run --rm app npm run build
```

Output: `dist/` on the host.

## Unit + component tests (80% coverage gate)

```bash
docker compose run --rm app npm run test:coverage
```

Faster (no coverage):

```bash
docker compose run --rm app npm test
```

Markdown parity (subset):

```bash
docker compose run --rm app npm run test:parity
```

## Playwright functional / E2E

Uses the official Playwright image (browsers included). Builds preview via Playwright `webServer` unless `BASE_URL` is set.

```bash
docker compose --profile e2e run --rm e2e
```

## Notes

- Vite binds `0.0.0.0:5188` so the host can reach it (avoids common 5173 clashes).
- Posting keys never leave the browser; there is no backend in this compose file.
- Hive API + `images.hive.blog` are called from the browser (CSP `connect-src` allowlist).
- Tests use disposable `PrivateKey.fromSeed(...)` keys only — never real WIFs.
