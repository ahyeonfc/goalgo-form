// 분석 흐름: 영상 → 두 번 훑기(원재료) → 자유 분석 엔진 → 장면 사진 → 폰 저장. 화면과 떼어 둔다.
import * as S from '../store.js';
import { mp4Info } from '../mp4info.js';
import { Scanner, grid, denseTimes } from '../scan.js';
import { analyzeFree } from '../engine/free.js';
import { MOTION_KO as MK0 } from '../engine/coach.js';
const MOTION_KO = MK0 as Record<string, string>;
import { drawSkeleton } from './draw';
import { APP_VER, type Profile, type Settings } from '../config';
import { dateKey, fmtT } from './fmt';
import type { FreeResult, RawFrame, Rec, Shot } from './types';

export interface Criteria { dribble: any; challenge: any }
export async function loadCriteria(): Promise<Criteria> {
  const get = (f: string) => fetch('criteria/' + f, { cache: 'no-cache' }).then(r => r.json());
  const [dribble, challenge] = await Promise.all([get('dribble.json'), get('challenge.json')]);
  return { dribble, challenge };
}

export interface Progress { step: 0 | 1 | 2 | 3; pct: number; text: string; frame?: RawFrame }
export interface Job { stop: boolean }

// 분석용 영상 요소: 화면 구조에 붙어 있어야 장면을 제대로 그린다(거의 안 보이게)
let video: HTMLVideoElement | null = null;
function getVideo() {
  if (video) return video;
  video = document.createElement('video');
  video.muted = true; video.playsInline = true; video.preload = 'auto';
  video.style.cssText = 'position:fixed;left:0;bottom:0;width:2px;height:2px;opacity:0.01;pointer-events:none';
  document.body.appendChild(video);
  return video;
}

export async function runAnalysis(opt: {
  blob: Blob; name: string; lastMod?: number; profile: Profile; settings: Settings; criteria: Criteria;
  canvas: HTMLCanvasElement; job: Job; onProgress: (p: Progress) => void;
}): Promise<Rec> {
  const { blob, name, profile, settings, criteria, canvas, job, onProgress } = opt;
  const v = getVideo(), url = URL.createObjectURL(blob);
  let scanner: any = null;
  try {
    onProgress({ step: 0, pct: 0, text: '영상 읽는 중…' });
    v.src = url;
    await new Promise<void>((ok, bad) => { v.onloadedmetadata = () => ok(); v.onerror = () => bad(new Error('이 영상을 열 수 없어요(형식이 맞지 않을 수 있음)')); });
    const info: any = (await mp4Info(blob).catch(() => null)) || {};
    const srcFps: number = info.mainFps && isFinite(info.mainFps) ? info.mainFps : 30;
    const dur = v.duration;
    const takenAt: number = info.createdMs || opt.lastMod || (blob as File).lastModified || Date.now();
    const notes: { kind: 'info'; text: string }[] = [];
    if (info.mixed) notes.push({ kind: 'info', text: `장면 간격이 섞인 영상이에요(슬로모션 구간이 있을 수 있음, 가장 촘촘한 곳 ${Math.round(info.maxFps)}fps). 시간 지표는 확인이 필요해요.` });

    scanner = new Scanner(v, canvas, settings);
    await scanner.init((t: string) => onProgress({ step: 0, pct: 0, text: t }));
    if (scanner.m.delegate !== settings.delegate) notes.push({ kind: 'info', text: '그래픽(GPU) 계산이 안 돼 CPU 로 분석했어요.' });
    const step = Math.min(+settings.step, srcFps);
    const t0 = performance.now();
    const ctx = canvas.getContext('2d')!;
    const onFrame = (base: number, span: number) => async (f: RawFrame, p: number) => {
      if (job.stop) scanner.stop = true; // 멈추기
      drawSkeleton(ctx, f, 1);
      const el = (performance.now() - t0) / 1000;
      onProgress({ step: 1, pct: base + p * span, text: `영상 ${fmtT(f.t)} / ${fmtT(dur)} · ${el.toFixed(0)}초 지남`, frame: f });
      await new Promise(r => setTimeout(r, 0));
    };
    const dense = srcFps > step * 1.5;
    let raw: RawFrame[] = await scanner.scanTimes(grid(0, dur - 0.001, step), onFrame(0, dense ? 0.7 : 0.95));
    if (job.stop || scanner.stop) throw new Error('멈췄어요');
    const past = (await S.resList()).filter((r: Rec) => r.takenAt < takenAt && r.result.free).map((r: Rec) => r.result);
    const frame = { w: scanner.W, h: scanner.H };
    const engine = (rw: RawFrame[]): FreeResult => analyzeFree(rw, { heightCm: profile.heightCm, fps: srcFps, criteria, history: past, profile, frame }) as unknown as FreeResult;
    onProgress({ step: 2, pct: dense ? 0.7 : 0.95, text: '동작 알아채는 중…' });
    let result = engine(raw);
    // 2차: 슬로모션이면 찾은 사건 앞뒤만 모든 장면
    if (dense && !job.stop) {
      const evT = [...result.segs.flatMap(x => x.marks.map(e => e.t)), ...(result.general?.marks || []).map(e => e.t)];
      const more = denseTimes(evT, srcFps, dur, raw.map(f => f.t));
      if (more.length) {
        scanner.stop = false;
        const add: RawFrame[] = await scanner.scanTimes(more, onFrame(0.7, 0.25));
        raw = [...raw, ...add].sort((a, b) => a.t - b.t);
        result = engine(raw);
      }
    }
    onProgress({ step: 3, pct: 0.97, text: '코칭과 장면 사진 만드는 중…' });
    const shots = await makeShots(v, scanner.W, raw, result);
    result.notes = [...notes, ...result.notes];
    result.scan = { frame, srcFps: +srcFps.toFixed(2), step, frames: raw.length, wallSec: +((performance.now() - t0) / 1000).toFixed(1), w: v.videoWidth, h: v.videoHeight, set: { ...settings, delegate: scanner.m.delegate }, mp4: info };
    const rec: Rec = { id: `v_${takenAt}_${blob.size}`, name, size: blob.size, takenAt, lesson: dateKey(takenAt), analyzedAt: Date.now(), appVer: APP_VER, result, rawGz: await S.gz(raw), shots };
    await S.resPut(rec);
    S.persist();
    return rec;
  } finally {
    if (scanner) scanner.close();
    URL.revokeObjectURL(url); v.removeAttribute('src'); v.load();
  }
}

// 장면 사진: 고칠 점이 가리키는 순간 + 구간 가운데 터치. 영상이 없어도 장면을 볼 수 있게 JPEG 로 남긴다
async function makeShots(v: HTMLVideoElement, scanW: number, raw: RawFrame[], result: FreeResult): Promise<Shot[]> {
  const want: { t: number; cap: string; seg: number; fix?: string }[] = [];
  // 전체 코칭의 고칠 점 장면(seg = -1)
  for (const f of result.general?.fixes || []) if (f.t != null) want.push({ t: f.t, cap: f.title, seg: -1, fix: f.title });
  result.segs.forEach((s, k) => {
    for (const f of s.coach.fixes) if (f.t != null) want.push({ t: f.t, cap: `${MOTION_KO[s.motion]} · ${f.title}`, seg: k, fix: f.title });
    const mk = s.marks; if (mk.length) { const m = mk[Math.floor(mk.length / 2)]; want.push({ t: m.t, cap: `${MOTION_KO[s.motion]} ${fmtT(m.t)}`, seg: k }); }
  });
  const out: Shot[] = [], W = 480, cv = document.createElement('canvas');
  cv.width = W; cv.height = Math.round(W * v.videoHeight / v.videoWidth);
  const ctx = cv.getContext('2d')!, sc = W / scanW;
  for (const w of want.slice(0, 8)) {
    await new Promise<void>(ok => { const h = () => { v.removeEventListener('seeked', h); ok(); }; v.addEventListener('seeked', h); v.currentTime = w.t; });
    ctx.drawImage(v, 0, 0, cv.width, cv.height);
    const f = raw.reduce((a, b) => Math.abs(b.t - w.t) < Math.abs(a.t - w.t) ? b : a);
    drawSkeleton(ctx, f, sc);
    const blob = await new Promise<Blob | null>(r => cv.toBlob(r, 'image/jpeg', 0.72));
    if (blob) out.push({ t: w.t, cap: w.cap, blob, seg: w.seg, fix: w.fix });
  }
  return out;
}

// 다시 계산: 원재료만으로 최신 엔진·기준표를 다시 돌린다
export async function recompute(rec: Rec, profile: Profile, criteria: Criteria): Promise<Rec> {
  const raw = await S.gunzip(rec.rawGz); if (!raw) throw new Error('원재료가 없어요');
  const past = (await S.resList()).filter((x: Rec) => x.takenAt < rec.takenAt && x.result.free).map((x: Rec) => x.result);
  const r = rec.result;
  const nr = analyzeFree(raw, { heightCm: profile.heightCm, fps: r.fps, criteria, history: past, profile, frame: r.scan?.frame }) as unknown as FreeResult;
  nr.scan = r.scan; nr.notes = [...(r.notes || []).filter(n => n.kind === 'info' && /CPU|섞인/.test(n.text)), ...nr.notes];
  const out = { ...rec, result: nr };
  await S.resPut(out);
  return out;
}
