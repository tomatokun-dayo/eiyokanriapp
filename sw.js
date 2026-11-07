// 【アプリ終了用】自己解除する Service Worker。
//
// このアプリは提供を終了した。旧バージョンの Service Worker はアプリ一式を
// 端末にキャッシュしているため、GitHub Pages を止めてもホーム画面から動き続けてしまう。
// ブラウザが sw.js の更新を検知するとこのファイルに入れ替わり、
//   1. 保存済みのキャッシュをすべて削除
//   2. Service Worker 自身の登録を解除
//   3. 開いている画面を再読み込み（ネットワークから「終了のお知らせ」を表示）
// を行う。fetch ハンドラは持たないので、以降の通信はすべて素通しになる。
// 端末内の記録データ（localStorage）には触れない。

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.map((key) => caches.delete(key)));
      await self.registration.unregister();
      const clients = await self.clients.matchAll({ type: "window" });
      await Promise.all(clients.map((client) => client.navigate(client.url).catch(() => {})));
    })(),
  );
});
