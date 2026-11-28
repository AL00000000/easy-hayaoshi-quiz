// オフラインでも「ひとりで練習」ができるように、サイトのファイルを端末に保存しておく。
// 問題の追加がすぐ届くよう、ネットにつながるときは常に最新を取りに行き（network-first）、失敗したときだけ保存分を使う。
const CACHE = "ehq-v10";
const FILES = ["./", "index.html", "style.css", "app.js", "cloud.js", "questions.js", "questions2.js", "questions3.js", "manifest.json", "pokemon/", "pokemon/index.html", "pokemon/manifest.json", "stock/", "stock/index.html", "stock/manifest.json", "icons/icon-192.png", "icons/icon-512.png"];
self.addEventListener("install", (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting())); });
self.addEventListener("activate", (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  const same = url.origin === location.origin, peerjs = url.hostname === "unpkg.com";
  if (!same && !peerjs) return; // Googleフォームなどはそのまま通す
  // GitHub Pages はブラウザに最大10分ためさせる（max-age=600）ので、自サイトのファイルは毎回サーバーに新しいか確かめる（no-cache）
  // ページを開く要求（mode: navigate）は RequestInit を付けて作り直せないので、URL から作り直す
  e.respondWith(fetch(same ? new Request(req.url, { cache: "no-cache" }) : req).then((res) => {
    if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
    return res;
  }).catch(() => caches.match(req, { ignoreSearch: true }).then((r) => r || caches.match("index.html"))));
});
