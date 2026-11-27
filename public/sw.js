// 골고 폼 서비스 워커. ① 갤러리 "공유"로 받은 영상을 폰 저장소(IndexedDB inbox)에 넣기 ② 오프라인에서도 열리게 저장
// 빌드된 파일(assets/*)은 이름에 내용 해시가 붙어 있어 한 번 받으면 그대로 써도 된다(옛 파일 섞임이 생기지 않음).
const SHELL = 'gf-shell-v6', LIB = 'gf-lib-v1', ASSETS = 'gf-assets-v1';

self.addEventListener('install', e => {
  e.waitUntil(caches.open(SHELL).then(c => c.addAll(['./', './index.html', './manifest.webmanifest', './icons/icon-192.png'].map(u => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => ![SHELL, LIB, ASSETS].includes(k)).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

// store.js 와 같은 저장소 구조(이름·버전·칸)를 쓴다. 바꿀 때는 둘을 함께 바꿀 것
function inboxAdd(item) {
  return new Promise((ok, bad) => {
    const r = indexedDB.open('goalgo-form', 1);
    r.onupgradeneeded = () => {
      const d = r.result;
      if (!d.objectStoreNames.contains('kv')) d.createObjectStore('kv');
      if (!d.objectStoreNames.contains('inbox')) d.createObjectStore('inbox', { keyPath: 'id', autoIncrement: true });
      if (!d.objectStoreNames.contains('results')) d.createObjectStore('results', { keyPath: 'id' }).createIndex('lesson', 'lesson');
    };
    r.onerror = () => bad(r.error);
    r.onsuccess = () => { const t = r.result.transaction('inbox', 'readwrite'); t.objectStore('inbox').add(item); t.oncomplete = () => ok(); t.onerror = () => bad(t.error); };
  });
}

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method === 'POST' && url.pathname.endsWith('/share-target')) {
    e.respondWith((async () => {
      try {
        const fd = await e.request.formData();
        const files = fd.getAll('video').filter(f => f && f.size);
        for (const f of files) await inboxAdd({ name: f.name || '공유한 영상.mp4', blob: f, lastModified: f.lastModified || Date.now(), at: Date.now() });
        return Response.redirect(`./?shared=${files.length}`, 303);
      } catch (err) { return Response.redirect('./?shared=0', 303); }
    })());
    return;
  }
  if (e.request.method !== 'GET') return;
  // MediaPipe 프로그램·모델: 한 번 받으면 저장해 두고 씀
  if (url.hostname === 'cdn.jsdelivr.net' || url.hostname === 'storage.googleapis.com') {
    e.respondWith(caches.open(LIB).then(async c => { const hit = await c.match(e.request); if (hit) return hit; const res = await fetch(e.request); if (res.ok) await c.put(e.request, res.clone()); return res; }));
    return;
  }
  if (url.origin !== location.origin) return;
  // 해시가 붙은 빌드 파일: 저장본 먼저
  if (url.pathname.includes('/assets/')) {
    e.respondWith(caches.open(ASSETS).then(async c => { const hit = await c.match(e.request); if (hit) return hit; const res = await fetch(e.request); if (res.ok) await c.put(e.request, res.clone()); return res; }));
    return;
  }
  // 나머지(index.html, 기준표 json 등): 늘 서버에 확인, 안 되면 저장본
  e.respondWith(fetch(e.request, { cache: 'no-cache' }).then(res => {
    if (res.ok) { const copy = res.clone(); caches.open(SHELL).then(c => c.put(e.request, copy)); }
    return res;
  }).catch(() => caches.match(e.request, { ignoreSearch: true })));
});
