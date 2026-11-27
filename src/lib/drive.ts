// 구글 드라이브 동기화: 내 드라이브 "골고폼" 폴더에 기록을 하나씩(rec_….json.gz) 두고 폰끼리 맞춘다.
// 권한은 drive.file(이 앱이 만든 파일만). 로그인 토큰은 1시간짜리라 저장하지 않고, 동기화할 때마다 조용히 다시 받는다.
// 규칙: 같은 기록이면 더 늦게 고친 쪽(updatedAt = 분석·메모 시각)을 남김. 지운 기록은 kv 'deleted' 에 남겨 드라이브에서도 지움.
import * as S from '../store.js';
import { GOOGLE_CLIENT_ID } from '../config';
import { recToPlain, plainToRec, gzipText, gunzipText } from './backup';
import type { Rec } from './types';

const SCOPE = 'https://www.googleapis.com/auth/drive.file';
const FOLDER = '골고폼';
const API = 'https://www.googleapis.com/drive/v3', UP = 'https://www.googleapis.com/upload/drive/v3';

export const driveReady = () => !!GOOGLE_CLIENT_ID;
export const stamp = (r: Rec) => Math.max(r.analyzedAt || 0, r.editedAt || 0);

let gis: Promise<any> | null = null;
function loadGis() {
  if (!gis) gis = new Promise((ok, bad) => {
    const s = document.createElement('script'); s.src = 'https://accounts.google.com/gsi/client'; s.async = true;
    s.onload = () => ok((window as any).google); s.onerror = () => { gis = null; bad(new Error('구글 로그인을 불러오지 못했어요(인터넷 확인)')); };
    document.head.appendChild(s);
  });
  return gis;
}

let token: { v: string; exp: number } | null = null;
/** interactive=false 면 이미 허락한 사람만 창 없이 받는다 */
export async function getToken(interactive: boolean): Promise<string> {
  if (token && token.exp > Date.now() + 60000) return token.v;
  const g = await loadGis();
  const hint = await S.kvGet('driveUser');
  return new Promise((ok, bad) => {
    const c = g.accounts.oauth2.initTokenClient({
      client_id: GOOGLE_CLIENT_ID, scope: SCOPE, prompt: interactive ? '' : 'none', hint: hint || undefined,
      callback: (r: any) => { if (r.error) return bad(new Error(r.error === 'access_denied' ? '구글 연결을 허락하지 않았어요' : '구글 로그인이 필요해요')); token = { v: r.access_token, exp: Date.now() + (r.expires_in || 3600) * 1000 }; ok(token.v); },
      error_callback: (e: any) => bad(new Error(e?.type === 'popup_closed' ? '로그인 창을 닫았어요' : '구글 로그인이 필요해요')),
    });
    c.requestAccessToken();
  });
}

async function call(path: string, init: RequestInit = {}, base = API) {
  const t = await getToken(false);
  const r = await fetch(base + path, { ...init, headers: { Authorization: 'Bearer ' + t, ...(init.headers || {}) } });
  if (r.status === 401) { token = null; throw new Error('구글 로그인이 끝났어요. 다시 연결해 주세요'); }
  if (!r.ok) throw new Error(`드라이브 오류 ${r.status}`);
  return r;
}

async function folderId(): Promise<string> {
  const saved = await S.kvGet('driveFolder');
  if (saved) { const r = await call(`/files/${saved}?fields=id,trashed`).then(r => r.json()).catch(() => null); if (r && !r.trashed) return saved; }
  const q = encodeURIComponent(`name='${FOLDER}' and mimeType='application/vnd.google-apps.folder' and trashed=false`);
  const l = await call(`/files?q=${q}&fields=files(id)&spaces=drive`).then(r => r.json());
  const id = l.files?.[0]?.id || (await call('/files?fields=id', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: FOLDER, mimeType: 'application/vnd.google-apps.folder' }) }).then(r => r.json())).id;
  await S.kvSet('driveFolder', id);
  return id;
}

interface RemoteFile { id: string; name: string; appProperties?: { recId?: string; stamp?: string } }
async function listRemote(folder: string): Promise<RemoteFile[]> {
  const out: RemoteFile[] = []; let page = '';
  do {
    const q = encodeURIComponent(`'${folder}' in parents and trashed=false`);
    const r = await call(`/files?q=${q}&fields=nextPageToken,files(id,name,appProperties)&pageSize=1000${page ? '&pageToken=' + page : ''}`).then(r => r.json());
    out.push(...(r.files || [])); page = r.nextPageToken || '';
  } while (page);
  return out;
}

async function upload(folder: string, name: string, body: Blob, props: Record<string, string>, id?: string) {
  const meta: any = { name, appProperties: props }; if (!id) meta.parents = [folder];
  const fd = new FormData();
  fd.append('metadata', new Blob([JSON.stringify(meta)], { type: 'application/json' }));
  fd.append('file', body);
  await call(id ? `/files/${id}?uploadType=multipart` : '/files?uploadType=multipart', { method: id ? 'PATCH' : 'POST', body: fd }, UP);
}

const safe = (id: string) => 'rec_' + id.replace(/[^\w.-]/g, '_') + '.json.gz';

export interface SyncResult { up: number; down: number; del: number }
export async function syncNow(onStep?: (t: string) => void): Promise<SyncResult> {
  onStep?.('드라이브 폴더 확인 중…');
  const folder = await folderId();
  const remote = await listRemote(folder);
  const local: Rec[] = await S.resList();
  const deleted: string[] = (await S.kvGet('deleted')) || [];
  const rmap = new Map(remote.filter(f => f.appProperties?.recId).map(f => [f.appProperties!.recId!, f]));
  const lmap = new Map(local.map(r => [r.id, r]));
  let up = 0, down = 0, del = 0;
  // 이 폰에서 지운 기록 → 드라이브에서도 지움
  for (const id of deleted) { const f = rmap.get(id); if (f) { await call(`/files/${f.id}`, { method: 'DELETE' }).catch(() => { }); rmap.delete(id); del++; } }
  await S.kvSet('deleted', []);
  // 올리기
  for (const r of local) {
    const f = rmap.get(r.id), st = stamp(r);
    if (f && +(f.appProperties?.stamp || 0) >= st) continue;
    onStep?.(`올리는 중 ${++up}…`);
    await upload(folder, safe(r.id), await gzipText(JSON.stringify(await recToPlain(r))), { recId: r.id, stamp: String(st) }, f?.id);
  }
  // 받기
  for (const [id, f] of rmap) {
    const l = lmap.get(id);
    if (l && stamp(l) >= +(f.appProperties?.stamp || 0)) continue;
    onStep?.(`받는 중 ${++down}…`);
    const blob = await call(`/files/${f.id}?alt=media`).then(r => r.blob());
    await S.resPut(plainToRec(JSON.parse(await gunzipText(blob))));
  }
  // 내 정보(키·주발)
  const prof = remote.find(f => f.name === 'profile.json');
  const p = await S.kvGet('profile');
  if (p) await upload(folder, 'profile.json', new Blob([JSON.stringify(p)], { type: 'application/json' }), { kind: 'profile' }, prof?.id);
  await S.kvSet('driveLast', Date.now());
  S.persist();
  return { up, down, del };
}

/** 처음 연결: 창을 띄워 허락받고 바로 동기화 */
export async function connect(): Promise<SyncResult> {
  await getToken(true);
  // 계정 이메일을 기억해 다음부터 창 없이 받기(이메일은 이 폰에만 저장)
  try { const about = await call('/about?fields=user(emailAddress)').then(r => r.json()); if (about.user?.emailAddress) await S.kvSet('driveUser', about.user.emailAddress); } catch { }
  await S.kvSet('driveOn', true);
  return syncNow();
}
export async function disconnect() {
  const g = await loadGis().catch(() => null);
  if (token && g) g.accounts.oauth2.revoke(token.v, () => { });
  token = null;
  await Promise.all([S.kvSet('driveOn', false), S.kvSet('driveUser', null)]);
}

/** 기록을 지울 때 부름: 다음 동기화 때 드라이브에서도 지운다 */
export async function markDeleted(id: string) {
  if (!(await S.kvGet('driveOn'))) return;
  const d: string[] = (await S.kvGet('deleted')) || []; d.push(id); await S.kvSet('deleted', d);
}

/** 조용한 자동 동기화(분석이 끝났을 때·메모 저장). 이번에 앱을 연 뒤 로그인한 적이 있을 때만(창을 띄우지 않음). 실패해도 화면을 막지 않는다 */
export const hasToken = () => !!token && token.exp > Date.now() + 60000;
export async function autoSync(): Promise<SyncResult | null> {
  if (!driveReady() || !hasToken() || !(await S.kvGet('driveOn'))) return null;
  try { return await syncNow(); } catch { return null; }
}
