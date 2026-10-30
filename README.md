# Heaven Cafe & Banquet

The website for a cafe-and-banquet venue in Mulpani, Kathmandu: a quiet cafe by day, three event
spaces by night. Bilingual (English / Nepali), fully static, with one small API for booking enquiries.

**Live:** https://site-be89af870951464090c3884b578cdafa.freebuff.page

## What's in it

- **Bilingual without duplication.** Every translatable string lives in the HTML as English text plus a
  `data-ne` attribute. The toggle swaps text in place, so English stays the crawlable default and there
  is no second URL to maintain. The choice is remembered in `localStorage`.
- **A real Bikram Sambat date picker.** Nepali venues quote dates in BS, so the booking form shows a BS
  calendar with the AD equivalent beside it. The conversion table for BS 2075–2089 is generated into
  [`public/assets/js/bs-data.js`](public/assets/js/bs-data.js); past dates are disabled and the range is
  capped at one year ahead. No external API call.
- **Booking enquiries that survive.** The form posts JSON to `/api/bookings`, which validates and stores
  the request in Cloudflare D1. Honeypot field, same-origin check, per-IP rate limit (5 per 10 minutes,
  stored as a salted hash), and a branded 404.
- **Photography bundled locally.** Ten WebP images (~1.4 MB total for the whole site) served from the
  same origin — no hotlinking, no layout shift, no third-party requests except Google Fonts.

## Layout

```
public/            static site: index.html, 404.html, robots.txt, sitemap.xml
  assets/css       one stylesheet
  assets/js        app.js (behaviour) and bs-data.js (generated BS↔AD table)
  assets/img       optimised WebP photography
worker/index.js    Worker: serves assets, handles /api/bookings
test/api.test.mjs  API contract tests against a stub D1 binding
sites.json         Freebuff Sites deployment manifest
wrangler.jsonc     local dev configuration
```

## Running it

```bash
npm install
npm run dev      # http://127.0.0.1:8787 with a local D1
npm test         # API validation, rate limit and honeypot checks
```

`npm run dev` runs [`scripts/dev.mjs`](scripts/dev.mjs), which keeps the local D1 file in the OS temp
directory (`heaven-cafe-banquet-dev`). Wrangler's default in-project path overruns the Windows
260-character MAX_PATH limit when the checkout sits in a long directory, and the database then fails
to open.

The API creates its own schema on first request. To inspect local rows, point Wrangler at the same
state directory:

```bash
npx wrangler d1 execute heaven-bookings --local \
  --persist-to "$(node -e 'console.log(require("node:path").join(require("node:os").tmpdir(),"heaven-cafe-banquet-dev"))')" \
  --command "SELECT * FROM bookings ORDER BY id DESC"
```

## Deploying

Deployed to Freebuff Sites as a Worker with static assets and a D1 binding named `DB`
(`sites.json`). `sites_add_storage` provisions the database; the binding attaches on the next deploy.
Update `canonical`, `og:url`, `og:image` and the JSON-LD `url` in `public/index.html` plus
`robots.txt`/`sitemap.xml` if the site moves to a custom domain.

## Editing content

Menu items, packages, testimonials and opening hours are plain HTML in `public/index.html`. For a
string to appear in Nepali, give it `data-ne="…"`; for a placeholder, `data-ne-placeholder`. Prices and
the phone number appear in several places — search for `9768 545 542` to keep them consistent.

## Notes

- The site was rebuilt from scratch after the original Vercel deployment (`heaven-cafe-banquet.vercel.app`)
  went missing. Venue details — address, phone, hours, capacity, menu and packages — are placeholders
  modelled on a real venue of this type and should be confirmed before the site is used commercially.
- Photography is free-licence stock (Pexels), not photographs of the actual venue. Replace
  `public/assets/img/*.webp` with real photos when available, keeping the same filenames.
