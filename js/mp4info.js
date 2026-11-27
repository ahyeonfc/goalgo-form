// MP4 파일 안의 정보를 재생 없이 읽는다(bench/index.html 에서 옮김 + 촬영 시각).
// moov > mvhd: 촬영 시각, moov > trak(영상) > mdhd: 시간 단위, stts: 장면 간격(슬로모션 저장 방식 확인)

export async function mp4Info(f) {
  const rd = async (o, n) => new DataView(await f.slice(o, o + n).arrayBuffer());
  const typ = (dv, o) => String.fromCharCode(dv.getUint8(o), dv.getUint8(o + 1), dv.getUint8(o + 2), dv.getUint8(o + 3));
  let off = 0, moov = null;
  while (off + 8 <= f.size) {
    const h = await rd(off, 16); let size = h.getUint32(0), t = typ(h, 4);
    if (size === 1) size = Number(h.getBigUint64(8)); else if (size === 0) size = f.size - off;
    if (t === 'moov') { moov = await rd(off, size); break; }
    if (size < 8) break; off += size;
  }
  if (!moov) return null;
  const kids = (dv, s, e) => { const out = []; let o = s; while (o + 8 <= e) { let sz = dv.getUint32(o), hd = 8; if (sz === 1) { sz = Number(dv.getBigUint64(o + 8)); hd = 16; } if (sz < 8) break; out.push({ t: typ(dv, o + 4), s: o + hd, e: o + sz }); o += sz; } return out; };
  const find = (dv, s, e, path) => { let cur = [{ s, e }]; for (const p of path) { const n = []; for (const c of cur) for (const k of kids(dv, c.s, c.e)) if (k.t === p) n.push(k); cur = n; } return cur; };
  const out = {};
  // 촬영 시각: 1904-01-01 부터 초. 0 이면 없음
  const mv = find(moov, 8, moov.byteLength, ['mvhd'])[0];
  if (mv) {
    const v = moov.getUint8(mv.s);
    const sec = v === 1 ? Number(moov.getBigUint64(mv.s + 4)) : moov.getUint32(mv.s + 4);
    if (sec > 2082844800) out.createdMs = (sec - 2082844800) * 1000;
  }
  for (const trak of find(moov, 8, moov.byteLength, ['trak'])) {
    const hd = find(moov, trak.s, trak.e, ['mdia', 'hdlr'])[0];
    if (!hd || typ(moov, hd.s + 8) !== 'vide') continue;
    const md = find(moov, trak.s, trak.e, ['mdia', 'mdhd'])[0];
    const v = moov.getUint8(md.s);
    const scale = v === 1 ? moov.getUint32(md.s + 20) : moov.getUint32(md.s + 12);
    const dur = v === 1 ? Number(moov.getBigUint64(md.s + 24)) : moov.getUint32(md.s + 16);
    const st = find(moov, trak.s, trak.e, ['mdia', 'minf', 'stbl', 'stts'])[0];
    const n = moov.getUint32(st.s + 4); const ent = [];
    for (let i = 0; i < n; i++) ent.push({ c: moov.getUint32(st.s + 8 + i * 8), d: moov.getUint32(st.s + 12 + i * 8) });
    const samples = ent.reduce((a, x) => a + x.c, 0);
    const top = [...ent].sort((a, b) => b.c - a.c)[0];
    const minD = Math.min(...ent.map(x => x.d).filter(x => x > 0));
    Object.assign(out, { scale, durSec: dur / scale, samples, mainFps: scale / top.d, maxFps: scale / minD, avgFps: samples / (dur / scale), mixed: new Set(ent.map(x => x.d)).size > 2 });
    break;
  }
  return out;
}
