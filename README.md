# TimeZoneMeet (meeting-time-finder)

City timezone lookup: type a city name, get local time and timezone. One codebase for **iOS (App Store), Android, macOS, Windows, and Web**.

## Quick start

```bash
npm install
npm run build-db   # first time: build db/cities.db from data/cities15000.txt
npm start         # API + web at http://localhost:8080
```

## Docs

- **Deploy to App Store**: [APP_STORE_NEXT.md](APP_STORE_NEXT.md) — next steps in order.
- **Host the API**: [HOSTING.md](HOSTING.md)
- **All platforms (iOS → Web)**: [../PLATFORMS.md](../PLATFORMS.md) (in full TimeZoneMeet tree)
- **Code review & design**: [../REVIEW.md](../REVIEW.md), [../DESIGN_AND_PERFORMANCE.md](../DESIGN_AND_PERFORMANCE.md) (in full tree)

## Platforms (iOS first, then others)

See **[../PLATFORMS.md](../PLATFORMS.md)** for:

- **Step 1 – Apple App Store (iOS)**: Capacitor iOS project in `ios/`. Host the API, set `public/config.js` API base, then build in Xcode and submit.
- **Step 2–5**: Android, macOS, Windows, Web using the same frontend and API.

## iOS (Step 1)

- **Requires**: Mac with Xcode and CocoaPods (`sudo gem install cocoapods`).
- **API**: For the app to work on device/simulator without your laptop, deploy this server (e.g. Railway, Fly.io) and set `window.__API_BASE__` in `public/config.js` to that URL before syncing.
- **Commands**:
  ```bash
  npm run cap:sync    # copy public/ into ios/ and update native deps
  npm run ios         # open Xcode (then Run or Archive for App Store)
  ```
- Bundle ID: `com.timezonemeet.app`. Configure signing and provisioning in Xcode for App Store distribution.

## Config

- **public/config.js**: Sets `window.__API_BASE__`. Empty = same-origin (web). For native builds, set to your hosted API URL (e.g. `https://api.timezonemeet.com`).

---

## API (server)

| Endpoint | Method | Description |
|---------|--------|--------------|
| `/health` | GET | Returns `{ "status": "ok" }`. Use for uptime checks. |
| `/api/suggest` | GET | Query params: `q` (search string), `limit` (1–25, default 10). Returns `{ "suggestions": [ { "name", "country" }, ... ] }`. |
| `/api/timezone` | GET | Query params: `city`, optional `country`. Returns `{ "city", "country", "timezone", "time" }` or 400/404. |
| `/api/timezone` | POST | Body: `{ "city", "country" }` (country optional). Same response as GET. Used by the UI. |

All responses are JSON. CORS is enabled for native and cross-origin web clients.

---

## Data and build

- **Cities DB**: Built by `npm run build-db` from **GeoNames** [cities15000](https://download.geonames.org/export/dump/) (cities with population > 15,000).
  - **Local**: Put `data/cities15000.txt` in place (e.g. download [cities15000.zip](https://download.geonames.org/export/dump/cities15000.zip) and extract the `.txt` into `data/`), then run `npm run build-db`.
  - **Deploy**: The Dockerfile downloads the zip and runs the build; no need to commit the data file.
- **Script**: `scripts/build_cities_db.js` creates `db/cities.db` (read-only at runtime).
