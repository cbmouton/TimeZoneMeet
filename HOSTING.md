# Walkthrough: Host the TimeZoneMeet API

Your iOS app (and future Android/web clients) need a **public API URL** to call. This guide gets the API running on the internet in one place so you can set `window.__API_BASE__` to that URL.

We’ll use **Railway** (simple, free tier, works with your existing Dockerfile). Alternatives like **Fly.io** or **Render** follow the same idea.

---

## What gets hosted

- The **Node.js server** in this repo (`server.js` + Express + SQLite).
- The **cities database** is built at deploy time: the Dockerfile downloads GeoNames `cities15000` and runs `npm run build-db`, so you don’t need to commit `data/cities15000.txt` or `db/cities.db`.

The **frontend** (HTML/JS in `public/`) is not served by this host for the iOS app—the app loads those from the device and only calls this API over HTTPS.

---

## Prerequisites

- Your **GitHub** account (e.g. **cbmouton**).
- The **meeting-time-finder** code in a Git repo on GitHub (see Step 1).
- A **Railway** account: [railway.app](https://railway.app) → sign up (GitHub login is fine).

---

## Step 1: Push meeting-time-finder to GitHub

Use a **new repo that contains only meeting-time-finder** (this folder as the repo root). Create the repo on GitHub (e.g. **cbmouton/TimeZoneMeet** or **cbmouton/meeting-time-finder**), then:

```bash
cd /Users/cedricbrown/dev/TimeZoneMeet/meeting-time-finder
git init
git add .
git commit -m "TimeZoneMeet API + iOS (Capacitor)"
git remote add origin https://github.com/cbmouton/TimeZoneMeet.git
git branch -M main
git push -u origin main
```

Use your actual repo name in the `git remote add` URL (e.g. `meeting-time-finder` instead of `TimeZoneMeet` if you created that repo).

---

## Step 2: Create a new project on Railway

1. Go to [railway.app](https://railway.app) and log in (e.g. with GitHub).
2. Click **“New Project”**.
3. Choose **“Deploy from GitHub repo”**.
4. Select your GitHub account and the repo you used in Step 1 (e.g. **cbmouton/TimeZoneMeet**).
5. Pick the branch (usually `main`).
6. **Root Directory**: leave blank (the repo root is already meeting-time-finder).

---

## Step 3: Use the Dockerfile to build and run

1. In the same **service** in Railway:
   - Open **Settings** (or the service’s configure tab).
   - Ensure **Build** is set to use **Dockerfile** (Railway often auto-detects a Dockerfile; if not, choose “Dockerfile” as build type).
   - **Dockerfile path**: leave default (e.g. `Dockerfile` or `meeting-time-finder/Dockerfile` if you set root to `meeting-time-finder`).
2. **Start command**: leave empty; the Dockerfile already has `CMD ["node", "server.js"]`.
3. **Port**: the server listens on `process.env.PORT || 8080`. Railway injects `PORT`; no need to set it yourself.

---

## Step 4: Deploy

1. Trigger a deploy (e.g. **Deploy** or push a new commit).
2. Wait for the build. The first build will:
   - Install Node deps.
   - Download `cities15000.zip` from GeoNames.
   - Run `npm run build-db` to create `db/cities.db`.
   - Start `node server.js`.
3. When the build succeeds, the service will be **Running**.

---

## Step 5: Get the public URL

1. In Railway, open your **service**.
2. Go to **Settings** → **Networking** (or **Generate Domain**).
3. Click **Generate Domain** (or **Add Public URL**). Railway will assign a URL like:
   - `https://your-service-name.up.railway.app`
4. Copy that URL (e.g. `https://timezonemeet-api.up.railway.app`). No trailing slash.

This is your **API base URL**. The app will call:
- `https://your-service-name.up.railway.app/api/suggest?q=...`
- `https://your-service-name.up.railway.app/api/timezone` (POST)

---

## Step 6: Point the iOS app at the API

In your **local** project (before building the iOS app):

1. Open `meeting-time-finder/public/config.js`.
2. Set the API base to the URL you copied:

   ```js
   window.__API_BASE__ = 'https://your-service-name.up.railway.app';
   ```

3. Save, then sync and open the iOS project:

   ```bash
   cd meeting-time-finder
   npm run cap:sync
   npm run ios
   ```

4. In Xcode, run on a device or simulator. The app will use your hosted API.

---

## Optional: Environment variables

- You don’t need to set **PORT**; Railway sets it.
- If you add other secrets later (e.g. API keys), use Railway **Variables** for the service and read them in `server.js` via `process.env`.

---

## Troubleshooting

| Issue | What to check |
|--------|----------------|
| Build fails on `npm run build-db` | The Dockerfile downloads `cities15000.zip` and extracts it; if GeoNames is down, the build will fail. Retry later or ensure the Dockerfile step has network access. |
| 502 / “Application failed to respond” | Server must listen on `process.env.PORT`. Our `server.js` uses `process.env.PORT \|\| 8080`, so it’s correct. Restart the service and check **Logs** in Railway. |
| CORS errors from the app | `server.js` already uses `cors({ origin: true })`. If you restrict origins later, add your app’s scheme or domain. |
| App shows “Request failed” | Confirm `config.js` has the exact URL (no trailing slash), and that the device/simulator can reach the internet. Open the API URL in a browser: `https://your-url.up.railway.app/health` should return `{"status":"ok"}`. |

---

## Summary

1. Push the project (or `meeting-time-finder`) to GitHub.  
2. In Railway, New Project → Deploy from GitHub → select your meeting-time-finder repo (Root Directory stays blank).  
3. Use the Dockerfile for build; deploy.  
4. Generate a public domain and copy the HTTPS URL.  
5. Set `window.__API_BASE__` in `public/config.js` to that URL, run `npm run cap:sync` and `npm run ios`.  

After that, the iOS app uses the hosted API; the same URL can be used later for Android, web, or other clients.
