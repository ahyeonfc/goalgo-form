// 폰 저장(IndexedDB). 화면(app.js)과 공유 받기(sw.js) 둘 다 쓴다.
// kv: 프로필·설정, inbox: 갤러리 "공유"로 받은 영상(분석 전), results: 분석 결과(+ 원재료 gzip, 장면 사진)

const DB = 'goalgo-form', VER = 1;
let dbp = null;

export function db() {
  if (dbp) return dbp;
  dbp = new Promise((ok, bad) => {
    const r = indexedDB.open(DB, VER);
    r.onupgradeneeded = () => {
      const d = r.result;
      if (!d.objectStoreNames.contains('kv')) d.createObjectStore('kv');
      if (!d.objectStoreNames.contains('inbox')) d.createObjectStore('inbox', { keyPath: 'id', autoIncrement: true });
      if (!d.objectStoreNames.contains('results')) {
        const s = d.createObjectStore('results', { keyPath: 'id' });
        s.createIndex('lesson', 'lesson');
      }
    };
    r.onsuccess = () => ok(r.result);
    r.onerror = () => bad(r.error);
  });
  return dbp;
}

function tx(store, mode, fn) {
  return db().then(d => new Promise((ok, bad) => {
    const t = d.transaction(store, mode), s = t.objectStore(store);
    let out; const r = fn(s);
    if (r) r.onsuccess = () => { out = r.result; };
    t.oncomplete = () => ok(out);
    t.onerror = () => bad(t.error);
    t.onabort = () => bad(t.error || new Error('저장 취소됨(저장 공간이 부족할 수 있음)'));
  }));
}

export const kvGet = k => tx('kv', 'readonly', s => s.get(k));
export const kvSet = (k, v) => tx('kv', 'readwrite', s => s.put(v, k));

export const inboxAdd = item => tx('inbox', 'readwrite', s => s.add(item));
export const inboxAll = () => tx('inbox', 'readonly', s => s.getAll());
export const inboxDel = id => tx('inbox', 'readwrite', s => s.delete(id));

export const resPut = r => tx('results', 'readwrite', s => s.put(r));
export const resGet = id => tx('results', 'readonly', s => s.get(id));
export const resDel = id => tx('results', 'readwrite', s => s.delete(id));
// 목록용: 무거운 칸(원재료·사진)은 빼고 돌려준다
export async function resList() {
  const all = await tx('results', 'readonly', s => s.getAll());
  return all.map(({ rawGz, shots, ...rest }) => ({ ...rest, nShots: shots ? shots.length : 0 }))
    .sort((a, b) => (a.takenAt || 0) - (b.takenAt || 0));
}

// 원재료 압축(gzip). CompressionStream 이 없으면 그냥 JSON 글자로 둔다.
export async function gz(obj) {
  const s = JSON.stringify(obj);
  if (typeof CompressionStream === 'undefined') return new Blob([s], { type: 'application/json' });
  return new Response(new Blob([s]).stream().pipeThrough(new CompressionStream('gzip'))).blob();
}
export async function gunzip(blob) {
  if (!blob) return null;
  if (blob.type === 'application/json' || typeof DecompressionStream === 'undefined') return JSON.parse(await blob.text());
  return JSON.parse(await new Response(blob.stream().pipeThrough(new DecompressionStream('gzip'))).text());
}

// 브라우저가 저장 공간을 마음대로 비우지 않게 요청(설치한 웹 앱이면 대개 허락됨)
export async function persist() {
  try { return navigator.storage && navigator.storage.persist ? await navigator.storage.persist() : false; } catch (e) { return false; }
}
export async function usage() {
  try { const e = await navigator.storage.estimate(); return { used: e.usage, quota: e.quota }; } catch (e) { return null; }
}
