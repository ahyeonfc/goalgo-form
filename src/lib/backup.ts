// 기록 옮기기: 모든 기록(결과·원재료·장면 사진·메모)과 내 정보를 파일 하나로 내보내고, 다른 폰에서 가져온다.
// 파일 = gzip 으로 줄인 JSON. 사진·원재료 같은 Blob 은 base64 로 넣는다. 영상은 넣지 않는다(갤러리에 있음).
import * as S from '../store.js';
import type { Rec } from './types';

const KIND = 'goalgo-form-backup', VER = 1;

const b64 = async (b: Blob) => { const u = new Uint8Array(await b.arrayBuffer()); let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000)); return btoa(s); };
const unb64 = (s: string, type: string) => { const bin = atob(s), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return new Blob([u], { type }); };

/** 기록 하나 → JSON 으로 옮길 수 있는 모양(드라이브 동기화도 같이 씀) */
export async function recToPlain(r: Rec) {
  const { rawGz, shots, ...rest } = r;
  return { ...rest, rawGz: rawGz ? await b64(rawGz) : undefined, shots: await Promise.all((shots || []).map(async s => ({ ...s, blob: await b64(s.blob) }))) };
}
export function plainToRec(x: any): Rec {
  return { ...x, rawGz: x.rawGz ? unb64(x.rawGz, 'application/gzip') : undefined, shots: (x.shots || []).map((s: any) => ({ ...s, blob: unb64(s.blob, 'image/jpeg') })) };
}
export const gzipText = async (t: string) => new Response(new Blob([t]).stream().pipeThrough(new CompressionStream('gzip'))).blob();
export async function gunzipText(f: Blob) { try { return await new Response(f.stream().pipeThrough(new DecompressionStream('gzip'))).text(); } catch { return await f.text(); } }

export async function exportAll(): Promise<{ blob: Blob; n: number }> {
  const list: Rec[] = await S.resList();
  const recs = [];
  for (const r of list) recs.push(await recToPlain(r));
  const json = JSON.stringify({ kind: KIND, ver: VER, at: Date.now(), profile: await S.kvGet('profile'), recs });
  return { blob: await gzipText(json), n: recs.length };
}

/** 가져오기: 같은 기록이 있으면 더 늦게 분석한 쪽을 남긴다. 반환 = 새로 들어온 수, 바뀐 수 */
export async function importFile(f: Blob): Promise<{ added: number; updated: number; profile: any }> {
  const txt = await gunzipText(f);
  let d: any; try { d = JSON.parse(txt); } catch { throw new Error('골고 폼 기록 파일이 아니에요'); }
  if (d?.kind !== KIND || !Array.isArray(d.recs)) throw new Error('골고 폼 기록 파일이 아니에요');
  const have = new Map<string, Rec>((await S.resList()).map((r: Rec) => [r.id, r]));
  let added = 0, updated = 0;
  for (const x of d.recs) {
    const old = have.get(x.id);
    if (old && (old.analyzedAt || 0) >= (x.analyzedAt || 0) && (old.memo || '') === (x.memo || '')) continue;
    const rec = plainToRec(x);
    if (old && !x.memo && old.memo) rec.memo = old.memo;
    await S.resPut(rec);
    old ? updated++ : added++;
  }
  S.persist();
  return { added, updated, profile: d.profile };
}
