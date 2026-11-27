// 골고 폼 엔진 공통 계산 도구. 브라우저와 Node(시험) 모두에서 돈다(DOM 없음).

export const isNum = v => typeof v === 'number' && isFinite(v);
export const nums = a => a.filter(isNum);

export function mean(a) { const b = nums(a); return b.length ? b.reduce((x, y) => x + y, 0) / b.length : null; }
export function median(a) { return percentile(a, 50); }
export function std(a) {
  const b = nums(a); if (b.length < 2) return null;
  const m = mean(b); return Math.sqrt(b.reduce((s, x) => s + (x - m) ** 2, 0) / (b.length - 1));
}
// p: 0~100, 선형 보간
export function percentile(a, p) {
  const b = nums(a).sort((x, y) => x - y); if (!b.length) return null;
  const k = (b.length - 1) * p / 100, lo = Math.floor(k), hi = Math.ceil(k);
  return b[lo] + (b[hi] - b[lo]) * (k - lo);
}
export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
export const dist = (a, b) => (a && b) ? Math.hypot(a.x - b.x, a.y - b.y) : null;
export const mid = (a, b) => (a && b) ? { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } : null;
export const deg = r => r * 180 / Math.PI;

// 세 점 a-b-c 에서 b 의 끼인각(°)
export function angleAt(a, b, c) {
  if (!a || !b || !c) return null;
  const v1x = a.x - b.x, v1y = a.y - b.y, v2x = c.x - b.x, v2y = c.y - b.y;
  const n = Math.hypot(v1x, v1y) * Math.hypot(v2x, v2y); if (!n) return null;
  return deg(Math.acos(clamp((v1x * v2x + v1y * v2y) / n, -1, 1)));
}
// 두 방향(라디안) 사이 각 차이(°, 0~180)
export function dirDiff(a, b) {
  let d = Math.abs(a - b) % (2 * Math.PI); if (d > Math.PI) d = 2 * Math.PI - d; return deg(d);
}

// 시각 배열 ts 에서 [t0, t1] 안 인덱스 범위
export function idxRange(ts, t0, t1) {
  let i0 = 0; while (i0 < ts.length && ts[i0] < t0) i0++;
  let i1 = i0; while (i1 < ts.length && ts[i1] <= t1) i1++;
  return [i0, i1]; // [i0, i1)
}

// 이동 창(초) 안의 값으로 계산. fn(창 안 값 배열) → 값
export function rolling(ts, vals, halfSec, fn) {
  const out = new Array(vals.length).fill(null);
  let lo = 0, hi = 0;
  for (let i = 0; i < ts.length; i++) {
    while (ts[lo] < ts[i] - halfSec) lo++;
    while (hi < ts.length && ts[hi] <= ts[i] + halfSec) hi++;
    out[i] = fn(vals.slice(lo, hi));
  }
  return out;
}

// 수치 미분(중앙 차분). 빈칸이 끼면 빈칸.
export function deriv(ts, vals) {
  const n = vals.length, out = new Array(n).fill(null);
  for (let i = 0; i < n; i++) {
    const a = Math.max(0, i - 1), b = Math.min(n - 1, i + 1);
    if (a === b || !isNum(vals[a]) || !isNum(vals[b])) continue;
    out[i] = (vals[b] - vals[a]) / (ts[b] - ts[a]);
  }
  return out;
}

// 국소 최소 찾기: 값이 thr 아래이고 앞뒤 halfSec 초 안에서 가장 작은 장면.
// 드리블은 공이 발 근처에 계속 머물러 "가까운 구간"이 길게 이어지므로 구간마다 하나가 아니라 국소 최소마다 찾는다.
export function minimaBelow(vals, thr, ts = null, halfSec = 0) {
  const out = [];
  for (let i = 0; i < vals.length; i++) {
    const v = vals[i]; if (!isNum(v) || v >= thr) continue;
    let ok = true;
    for (let k = i - 1; k >= 0 && (ts ? ts[i] - ts[k] <= halfSec : k >= i - 1); k--) if (isNum(vals[k]) && vals[k] < v) { ok = false; break; }
    if (ok) for (let k = i + 1; k < vals.length && (ts ? ts[k] - ts[i] <= halfSec : k <= i + 1); k++) if (isNum(vals[k]) && vals[k] <= v) { ok = false; break; }
    if (ok) out.push(i);
  }
  return out;
}
