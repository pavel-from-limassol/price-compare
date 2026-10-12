# Limassol Prices

Pilot price-comparison API for Cyprus-style demo stores.

**Language rule:** project code, UI, API messages, and docs in this repo are **English only**.

## Stack

- **Firebase Hosting** — landing page + OpenAPI YAML (`public/`)
- **Cloud Functions** (`europe-west1`) — HTTP API, **no authentication**
- Demo catalog in `functions/catalog.json`

## URLs (after deploy)

- Site: `https://limassol-prices.web.app/`
- OpenAPI: `https://limassol-prices.web.app/openapi.yaml`
- Example: `https://limassol-prices.web.app/api/cheapest?q=milk`

## Local

```bash
cd functions && npm install
cd ..
firebase use limassol-prices --account p.dershevich@gmail.com
firebase deploy --only hosting,functions --account p.dershevich@gmail.com
```

## Git

Remote: `git@pasha:pavel-from-limassol/price-compare.git`  
Author in this clone: `pasha` / `341332371+pavel-from-limassol@users.noreply.github.com`
