// 【アプリ終了用】Service Worker を登録せず、残っている登録とキャッシュを片付ける。
// sw.js 側の自己解除が何らかの理由で動かなかった端末向けの保険。
// 端末内の記録データ（localStorage）には触れない。
if ("serviceWorker" in navigator) {
  navigator.serviceWorker
    .getRegistrations()
    .then((registrations) => Promise.all(registrations.map((registration) => registration.unregister())))
    .catch(() => {});
}
if ("caches" in window) {
  caches
    .keys()
    .then((keys) => Promise.all(keys.map((key) => caches.delete(key))))
    .catch(() => {});
}
