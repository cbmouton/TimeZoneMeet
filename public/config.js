/**
 * API base URL.
 * - "" = same origin (recommended when the HTML is served by this Express app).
 * - For Capacitor / another host: full URL with scheme, e.g. "https://your-app.up.railway.app"
 *   (host-only strings are auto-fixed to https:// in apiBase.js).
 */
window.__API_BASE__ = "";

/**
 * Google AdSense (web only). Leave empty until AdSense approves your site.
 * Example client: ca-pub-xxxxxxxxxxxxxxxx
 */
window.__ADSENSE_CLIENT__ = "";

/**
 * Ad unit slot id from AdSense (required with client to show a display unit).
 */
window.__ADSENSE_SLOT__ = "";
