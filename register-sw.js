// Service Worker 登録。CSP（script-src 'self'）と両立させるため、
// 以前は各HTML末尾にあったインラインスクリプトを外部ファイルへ切り出したもの。
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(() => {
      // オフライン化に失敗しても通常のWebページとして動作する
    });
  });
}
