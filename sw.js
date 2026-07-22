// アプリシェルのキャッシュ。ファイル更新時は CACHE_VERSION を上げると、
// activate で古いキャッシュを破棄して自動的に入れ替わる。
const CACHE_VERSION = "eiyokanri-v10";

const APP_SHELL = [
  "./",
  "index.html",
  "foods.html",
  "styles.css",
  "app.js",
  "foods.js",
  "custom-foods.js",
  "store.js",
  "sync-config.js",
  "sync.js",
  "register-sw.js",
  "vendor/supabase.js",
  "logic/units.js",
  "logic/memo.js",
  "logic/nutrition.js",
  "logic/suggestions.js",
  "data/food-master.js",
  "data/age-targets.js",
  "data/fooddb.js",
  "manifest.json",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "icons/apple-touch-icon.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_VERSION)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_VERSION).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

// 同一オリジンのGETは stale-while-revalidate:
// キャッシュがあれば即返しつつ裏で更新、なければ取得してキャッシュ。
self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  if (new URL(request.url).origin !== self.location.origin) return;

  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((response) => {
          if (response && response.ok) {
            const copy = response.clone();
            caches.open(CACHE_VERSION).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => cached);

      return cached || network;
    }),
  );
});
