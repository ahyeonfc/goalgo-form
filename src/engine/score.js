// ⑤ 점수 (lesson-criteria.md ⑤ "점수 계산 처음 버전")
// 지표 점수: 좋은 범위 [lo, hi] 안이면 100, 벗어난 거리 d 면 100 × max(0, 1 − d/t)
// 축 점수: 믿음도 높음 1배, 보통 0.5배, 참고는 빼고 가중 평균. 동작 점수(total): 잰 축의 평균.

import { isNum } from './util.js';

export const TRUST_W = { high: 1, mid: 0.5, ref: 0 };
export const AXES = [['speed', '속도'], ['perf', '퍼포먼스'], ['pose', '자세']];

export function metricScore(v, s) {
  if (!isNum(v) || !s) return null;
  const lo = isNum(s.lo) ? s.lo : -Infinity, hi = isNum(s.hi) ? s.hi : Infinity;
  const d = v < lo ? lo - v : v > hi ? v - hi : 0;
  return Math.round(100 * Math.max(0, 1 - d / s.t));
}

// calc 칸: 동작 모듈이 낸 기본값(prims) 몇 개의 조합. 새 계산이 필요하면 여기에 op 를 더한다.
export function evalCalc(calc, prims) {
  const g = k => (k in prims ? prims[k] : null);
  switch (calc.op) {
    case 'val': return g(calc.a);
    case 'sub': { const a = g(calc.a), b = g(calc.b); return isNum(a) && isNum(b) ? a - b : null; }
    case 'div': { const a = g(calc.a), b = g(calc.b); return isNum(a) && isNum(b) && b ? a / b : null; }
    case 'mul': { const a = g(calc.a); return isNum(a) ? a * calc.k : null; }
    default: throw new Error('모르는 계산: ' + calc.op);
  }
}

// 기준표 + 기본값 → 지표 목록, 축 점수, 동작 점수, 고칠 말
// ctx: { view, fps, course } — 지표의 cam(찍는 각도)·fps_min·course 조건이 안 맞으면 "안 보임"으로 비운다
export function scoreAll(criteria, prims, ctx, baseline = null) {
  const rows = [];
  for (const md of criteria.metrics) {
    const row = { id: md.id, name: md.name, axis: md.axis, unit: md.unit, trust: md.trust, value: null, score: null, why: null };
    if (md.cam && !md.cam.includes(ctx.view)) row.why = '이 각도에서는 안 보임';
    else if (md.fps_min && ctx.fps < md.fps_min) row.why = `${md.fps_min}fps 이상 영상에서만`;
    else if (md.course && !ctx.course) row.why = '정해진 코스를 알아챘을 때만';
    else {
      const v = evalCalc(md.calc, prims);
      if (!isNum(v)) row.why = prims._why?.[md.calc.a] || '잴 수 없음';
      else {
        row.value = +v.toFixed(md.dp ?? 2);
        if (md.score && TRUST_W[md.trust] > 0) row.score = metricScore(v, md.score);
        // 기준이 없으면 개인 비교: 첫 3회 평균(baseline)과의 차이
        if (!md.score && baseline && isNum(baseline[md.id])) {
          row.base = +baseline[md.id].toFixed(md.dp ?? 2);
          row.delta = +(v - baseline[md.id]).toFixed(md.dp ?? 2);
          if (md.better) row.better = md.better === 'low' ? row.delta < 0 : row.delta > 0;
        }
        const f = md.fix;
        if (f && md.score && row.score != null && row.score < 100) {
          const lo = isNum(md.score.lo) ? md.score.lo : -Infinity;
          row.fix = (v < lo ? f.below : f.above) || f.any || null;
        }
      }
    }
    if (md.note) row.note = md.note;
    if (md.ref) row.ref = md.ref;
    rows.push(row);
  }
  const axes = {};
  for (const [ax] of AXES) {
    let s = 0, w = 0, n = 0, cnt = 0;
    for (const r of rows.filter(r => r.axis === ax)) {
      cnt++;
      if (r.value != null) n++;
      if (r.score == null) continue;
      const k = TRUST_W[r.trust] ?? 0; s += r.score * k; w += k;
    }
    axes[ax] = { score: w ? Math.round(s / w) : null, measured: n, total: cnt };
  }
  const got = AXES.map(([a]) => axes[a].score).filter(isNum);
  const total = got.length ? Math.round(got.reduce((x, y) => x + y, 0) / got.length) : null;
  // 고칠 점: 점수 낮은 순 2~3개(고칠 말이 있는 것만)
  const fixes = rows.filter(r => r.fix).sort((a, b) => a.score - b.score).slice(0, 3).map(r => ({ id: r.id, name: r.name, score: r.score, text: r.fix }));
  return { rows, axes, total, fixes, axesUsed: got.length };
}
