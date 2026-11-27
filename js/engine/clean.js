// ② 앞 단계: 장면별 원재료 손질 (lesson-build.md 5.2)
// 입력 raw: [{t, kp:[[x,y,vis] ×33] | null, ball:{x,y,r,conf} | null}]  (화면 px, 처리 너비 기준)
// 출력: { ts, joints[33][n] = {x,y}|null (필터 후), jointsRaw(필터 전), ball[n] = {x,y,r}|null, filled 표시 }

import { isNum } from './util.js';

export const NJ = 33;
// 좌우 쌍(MediaPipe 번호). 다리 쪽 좌우 뒤바뀜을 바로잡을 때 쓴다.
const LEG_PAIRS = [[23, 24], [25, 26], [27, 28], [29, 30], [31, 32]];
const ALL_PAIRS = [[1, 4], [2, 5], [3, 6], [7, 8], [9, 10], [11, 12], [13, 14], [15, 16], [17, 18], [19, 20], [21, 22], ...LEG_PAIRS];

// One Euro 필터 (Casiez 외 2012): 느릴 땐 강하게, 빠를 땐 약하게 거른다.
class OneEuro {
  constructor(minCutoff, beta, dCutoff = 1) { this.mc = minCutoff; this.b = beta; this.dc = dCutoff; this.x = null; this.dx = 0; this.t = null; }
  static alpha(cut, dt) { const tau = 1 / (2 * Math.PI * cut); return 1 / (1 + tau / dt); }
  reset() { this.x = null; this.dx = 0; this.t = null; }
  f(v, t) {
    if (this.x === null) { this.x = v; this.t = t; return v; }
    const dt = Math.max(1e-4, t - this.t); this.t = t;
    const dx = (v - this.x) / dt;
    this.dx = this.dx + OneEuro.alpha(this.dc, dt) * (dx - this.dx);
    const cut = this.mc + this.b * Math.abs(this.dx);
    this.x = this.x + OneEuro.alpha(cut, dt) * (v - this.x);
    return this.x;
  }
}

// 짧은 빈칸(maxGap 초 이하)을 앞뒤 값으로 직선 채움. 더 길면 빈칸 그대로(지어 채우지 않음).
export function fillGaps(ts, arr, maxGap, keys = ['x', 'y']) {
  const out = arr.slice(), filled = new Array(arr.length).fill(false);
  let i = 0;
  while (i < arr.length) {
    if (arr[i]) { i++; continue; }
    let j = i; while (j < arr.length && !arr[j]) j++;
    const a = i - 1, b = j;
    if (a >= 0 && b < arr.length && ts[b] - ts[a] <= maxGap + 1e-9) {
      for (let k = i; k < j; k++) {
        const r = (ts[k] - ts[a]) / (ts[b] - ts[a]), o = {};
        for (const key of keys) o[key] = arr[a][key] + (arr[b][key] - arr[a][key]) * r;
        out[k] = o; filled[k] = true;
      }
    }
    i = j;
  }
  return { out, filled };
}

// 좌우 뒤바뀜: 쌍마다 앞 장면과 이어지는 비용이 바꿨을 때 훨씬 작으면 바꾼다.
// 옆에서 찍을 때 모델이 한 장면만 왼·오른 다리를 바꿔 내는 일이 흔하다.
export function fixSwaps(frames, pairs = LEG_PAIRS, margin = 0.6) {
  let swaps = 0, prev = null;
  for (const f of frames) {
    if (!f.kp) { prev = null; continue; }
    if (prev) {
      // 다리 전체를 한 묶음으로 판단(한 관절씩 바꾸면 무릎·발목이 엇갈림)
      let keep = 0, swap = 0, n = 0;
      for (const [l, r] of pairs) {
        const L = f.kp[l], R = f.kp[r], pL = prev[l], pR = prev[r];
        if (!L || !R || !pL || !pR) continue;
        keep += Math.hypot(L.x - pL.x, L.y - pL.y) + Math.hypot(R.x - pR.x, R.y - pR.y);
        swap += Math.hypot(L.x - pR.x, L.y - pR.y) + Math.hypot(R.x - pL.x, R.y - pL.y);
        n++;
      }
      if (n >= 2 && swap < keep * margin) {
        for (const [l, r] of pairs) { const t = f.kp[l]; f.kp[l] = f.kp[r]; f.kp[r] = t; }
        swaps++;
      }
    }
    prev = f.kp;
  }
  return swaps;
}

export function clean(raw, cfg) {
  const ts = raw.map(f => f.t);
  // 1) 신뢰도 거르기 → {x,y}|null
  const frames = raw.map(f => ({
    kp: f.kp ? f.kp.map(p => (p && isNum(p[0]) && p[2] >= cfg.vis_min) ? { x: p[0], y: p[1] } : null) : null,
  }));
  // 2) 좌우 뒤바뀜
  const swaps = fixSwaps(frames);
  // 3) 관절별 빈칸 채우기 + One Euro
  const jointsRaw = [], joints = [], filledAny = new Array(ts.length).fill(false);
  for (let j = 0; j < NJ; j++) {
    const arr = frames.map(f => f.kp ? f.kp[j] : null);
    const { out, filled } = fillGaps(ts, arr, cfg.gap_fill_sec);
    filled.forEach((v, i) => { if (v) filledAny[i] = true; });
    jointsRaw.push(out);
    const fx = new OneEuro(cfg.euro_min_cutoff, cfg.euro_beta), fy = new OneEuro(cfg.euro_min_cutoff, cfg.euro_beta);
    joints.push(out.map((p, i) => {
      if (!p) { fx.reset(); fy.reset(); return null; }
      return { x: fx.f(p.x, ts[i]), y: fy.f(p.y, ts[i]) };
    }));
  }
  // 4) 공: 짧은 끊김만 채움(필터는 하지 않음: 터치 순간 꺾임이 사라지면 안 됨)
  const ballArr = raw.map(f => (f.ball && f.ball.conf >= cfg.ball_conf_min) ? { x: f.ball.x, y: f.ball.y, r: f.ball.r } : null);
  const { out: ball, filled: ballFilled } = fillGaps(ts, ballArr, cfg.ball_gap_sec, ['x', 'y', 'r']);
  return { ts, joints, jointsRaw, ball, ballFilled, filled: filledAny, swaps };
}

export { ALL_PAIRS, LEG_PAIRS };
