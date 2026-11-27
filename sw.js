// 골고 폼 서비스 워커(모듈). ① 갤러리 "공유"로 받은 영상을 폰 저장소에 넣기 ② 오프라인에서도 열리게 저장해 두기

import { inboxAdd } from './js/store.js';

const SHELL = 'gf-shell-v2', LIB = 'gf-lib-v1';
const SHELL_FILES = ['./', './index.html', './css/app.css', './manifest.webmanifest', './criteria/dribble.json', './criteria/challenge.json',
  './js/app.js', './js/store.js', './js/mp4info.js', './js/scan.js',
  './js/engine/index.js', './js/engine/util.js', './js/engine/clean.js', './js/engine/measure.js', './js/engine/events.js', './js/engine/calib.js', './js/engine/score.js',
  './js/motions/dribble.js', './js/motions/mastery.js', './js/motions/juggle.js', './js/engine/challenge.js', './js/demo.js', './js/sim.js', './icons/icon.svg', './icons/icon-192.png'];

self.addEventListener('install', e => { e.waitUntil(caches.open(SHELL).then(c => c.addAll(SHELL_FILES)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== SHELL && k !== LIB).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  // 공유 받기: 영상을 받아 inbox 에 넣고 앱 화면으로 넘긴다
  if (e.request.method === 'POST' && url.pathname.endsWith('/share-target')) {
    e.respondWith((async () => {
      try {
        const fd = await e.request.formData();
        const files = fd.getAll('video').filter(f => f && f.size);
        for (const f of files) await inboxAdd({ name: f.name || '공유한 영상.mp4', blob: f, lastModified: f.lastModified || Date.now(), at: Date.now() });
        return Response.redirect(`./?shared=${files.length}`, 303);
      } catch (err) {
        return Response.redirect('./?shared=0', 303);
      }
    })());
    return;
  }
  if (e.request.method !== 'GET') return;
  // MediaPipe 프로그램·모델: 한 번 받으면 저장해 두고 씀(크고 잘 안 바뀜)
  if (url.hostname === 'cdn.jsdelivr.net' || url.hostname === 'storage.googleapis.com') {
    e.respondWith(caches.open(LIB).then(async c => {
      const hit = await c.match(e.request); if (hit) return hit;
      const res = await fetch(e.request); if (res.ok) await c.put(e.request, res.clone()); return res;
    }));
    return;
  }
  // 앱 파일: 인터넷이 되면 새로 받고(바로 최신), 안 되면 저장해 둔 것
  if (url.origin === location.origin) {
    e.respondWith(fetch(e.request).then(res => {
      if (res.ok) { const copy = res.clone(); caches.open(SHELL).then(c => c.put(e.request, copy)); }
      return res;
    }).catch(() => caches.match(e.request, { ignoreSearch: true })));
  }
});
