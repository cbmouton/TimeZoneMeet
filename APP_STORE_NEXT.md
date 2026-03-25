# Next: Deploy to the App Store

Ordered steps from where you are now to a live app on the App Store.

---

## 1. Host the API

The iOS app needs a public API URL. If you haven’t already:

1. Push **meeting-time-finder** to GitHub (see [HOSTING.md](HOSTING.md) Step 1).
2. Deploy on **Railway** (or Fly.io/Render): connect repo → use Dockerfile → generate domain.
3. Copy the HTTPS URL (e.g. `https://your-app.up.railway.app`).
4. In **meeting-time-finder/public/config.js** set:
   ```js
   window.__API_BASE__ = 'https://your-app.up.railway.app';
   ```
5. Confirm: open `https://your-app.up.railway.app/health` in a browser → should show `{"status":"ok"}`.

---

## 2. Apple Developer account and App Store Connect

- **Apple Developer Program**: Enroll at [developer.apple.com](https://developer.apple.com) ($99/year) if you haven’t.
- **App Store Connect**: Go to [appstoreconnect.apple.com](https://appstoreconnect.apple.com) → **My Apps** → **+** → **New App**.
  - Platform: iOS.
  - Name: **TimeZoneMeet** (or your chosen name).
  - Primary language, bundle ID: **com.timezonemeet.app** (must match `capacitor.config.json`).
  - SKU: any unique string (e.g. `timezonemeet001`).
  - Create the app. You’ll add metadata and build later.

---

## 3. Build the iOS app on a Mac

**Requirements**: Mac with **Xcode** (from Mac App Store) and **CocoaPods** (`sudo gem install cocoapods`).

```bash
cd /Users/cedricbrown/dev/TimeZoneMeet/meeting-time-finder
npm run cap:sync
npm run ios
```

In **Xcode**:

1. Select the **App** project in the sidebar → **Signing & Capabilities**.
2. Choose your **Team** (Apple Developer account).
3. Set **Bundle Identifier** to `com.timezonemeet.app` (should already be set).
4. Under **Signing**, enable **Automatically manage signing** (or set a distribution provisioning profile for App Store).
5. Pick a **simulator** or a **connected device** and run (▶) to test. Try the city lookup and confirm it hits your hosted API.

---

## 4. App icon and launch screen

- **App icon**: Add a **1024×1024** PNG to  
  `ios/App/App/Assets.xcassets/AppIcon.appiconset/`  
  as `AppIcon-512@2x.png` (Xcode will use it for all sizes). Replace the default/placeholder.
- **Launch screen**: Default is in `ios/App/App/Base.lproj/LaunchScreen.storyboard`. You can keep it or customize later.

---

## 5. Version and archive

In Xcode:

1. Select the **App** target → **General**.
2. Set **Version** (e.g. `1.0.0`) and **Build** (e.g. `1`). Build must increase for each App Store upload.
3. Menu: **Product** → **Archive**.
4. When the archive is done, the **Organizer** window opens. Select the archive → **Distribute App** → **App Store Connect** → **Upload**. Follow the prompts (e.g. automatic signing, upload).

---

## 6. Submit in App Store Connect

1. In [App Store Connect](https://appstoreconnect.apple.com) → your app → **TestFlight** tab: wait until the build appears (can take 5–15 minutes).
2. Go to the **App Store** tab → create or edit the **iOS App** version (e.g. 1.0.0).
3. Fill in **What’s New**, **Description**, **Keywords**, **Support URL**, **Privacy Policy URL** (required), **Category**, and **Screenshots** (per device size).
4. In **Build**, select the build you uploaded.
5. Submit for **Review**. Apple typically reviews within 24–48 hours.

---

## 7. Privacy and data

Your app sends city names to your API and shows time/timezone. In App Store Connect:

- **Privacy Policy URL**: Required. This repo ships [public/privacy.html](public/privacy.html); on your deployed site use `https://<your-domain>/privacy.html` as the URL after you deploy.
- **App Privacy**: Declare what you collect (city search text sent to your API). If you add **Google AdSense** on web only, note that; for the **native iOS** build, either disable AdSense in `config.js` for the Capacitor bundle or declare advertising data per Apple’s questionnaire.
- **Premium / Stripe**: If users can purchase premium on the **website**, describe payment processing (Stripe) in the privacy policy; in-app purchases on iOS would use Apple’s IAP flow separately.

## 8. Ads (web vs iOS)

- **AdSense** targets the **web** app. WKWebView / Capacitor behavior and Google policies differ; many apps use **AdMob** for iOS instead.
- For App Store review, ensure metadata matches what the app does (ads or no ads in the native build).

---

## Quick checklist

| Step | Done |
|------|------|
| API hosted, URL in `public/config.js` | ☐ |
| Apple Developer account | ☐ |
| App created in App Store Connect (bundle ID `com.timezonemeet.app`) | ☐ |
| Xcode: signing team, run on device/simulator | ☐ |
| 1024×1024 app icon added | ☐ |
| Version/build set, Product → Archive, upload to App Store Connect | ☐ |
| App Store tab: metadata, screenshots, build selected | ☐ |
| Privacy policy URL and App Privacy filled | ☐ |
| Submitted for review | ☐ |

After submission, check **App Store Connect** for status and any reviewer messages.
