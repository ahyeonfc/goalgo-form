// 영상 속도 알아내기(슬로모션 보정): 공중에 뜬 공은 중력 가속도(9.8m/s²)로 떨어진다.
// 화면 속 공의 세로 가속도(키/초²)를 재서 실제 값(9.8 ÷ 키 m)과 비교하면, 영상이 실제보다 몇 배 느린지(k) 나온다.
//   잰 가속도 a = g / k²  →  k = √(g / a)
// 공이 몸에서 떨어져 날아가는 구간(발·무릎·머리에서 키의 0.12배 넘게)만 쓴다.

import { isNum, median } from './util.js';
import { J } from './measure.js';

const PARTS = [J.toeL, J.toeR, J.ankL, J.ankR, J.kneeL, J.kneeR, J.nose, J.wrL, J.wrR];

// 점들에 y = a t² + b t + c 를 맞춘다(최소 제곱). 맞춘 정도(r2)도 돌려준다
function fitQuad(ts, ys) {
  const n = ts.length, t0 = ts[0];
  let S = [0, 0, 0, 0, 0], T = [0, 0, 0];
  for (let i = 0; i < n; i++) { const t = ts[i] - t0, y = ys[i]; let p = 1; for (let k = 0; k < 5; k++) { S[k] += p; if (k < 3) T[k] += p * y; p *= t; } }
  // [S0 S1 S2; S1 S2 S3; S2 S3 S4] [c b a]ᵀ = [T0 T1 T2]ᵀ
  const M = [[S[0], S[1], S[2]], [S[1], S[2], S[3]], [S[2], S[3], S[4]]];
  const det = m => m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
  const D = det(M); if (Math.abs(D) < 1e-12) return null;
  const col = (k) => M.map((row, i) => row.map((v, j) => j === k ? T[i] : v));
  const c = det(col(0)) / D, b = det(col(1)) / D, a = det(col(2)) / D;
  const mean = ys.reduce((x, y) => x + y, 0) / n;
  let ssr = 0, sst = 0;
  for (let i = 0; i < n; i++) { const t = ts[i] - t0, f = a * t * t + b * t + c; ssr += (ys[i] - f) ** 2; sst += (ys[i] - mean) ** 2; }
  return { a, b, c, r2: sst > 0 ? 1 - ssr / sst : 0 };
}

export function estimateTimeScale(c, m, heightCm, cfg) {
  const { ts, ball, Hpx } = m, n = ts.length;
  // 날아가는 장면 표시
  const free = new Array(n).fill(false);
  for (let i = 0; i < n; i++) {
    const b = ball[i], H = Hpx[i]; if (!b || !H || c.ballFilled[i]) continue;
    let near = Infinity;
    for (const j of PARTS) { const p = c.joints[j][i]; if (p) near = Math.min(near, Math.hypot(p.x - b.x, p.y - b.y) / H); }
    free[i] = near > cfg.ts_free_dist;
  }
  // 이어진 날아가는 구간마다 포물선 맞추기
  const ks = [];
  let s = -1;
  for (let i = 0; i <= n; i++) {
    if (i < n && free[i]) { if (s < 0) s = i; continue; }
    if (s >= 0 && i - s >= cfg.ts_min_pts) {
      const T = ts.slice(s, i), Y = [];
      for (let k = s; k < i; k++) Y.push(ball[k].y / Hpx[k]); // 화면 아래쪽 +, 키 단위
      const f = fitQuad(T, Y);
      const g = 9.8 / (heightCm / 100);                 // 실제 중력 가속도(키/초²)
      if (f && f.r2 >= cfg.ts_min_r2 && f.a > 0) {      // 아래로 가속(화면 y 증가)
        const k = Math.sqrt(g / (2 * f.a));
        if (isFinite(k) && k > 0.5 && k < 12) ks.push(k);
      }
    }
    s = -1;
  }
  const k = median(ks);
  return { k: isNum(k) ? k : null, n: ks.length, ks: ks.map(x => +x.toFixed(2)) };
}
