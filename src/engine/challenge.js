// 도전 모드: 과제를 알고 분석하므로 동작 판별 없이 그 과제 규칙으로 세고, 단계 통과를 판정한다.

import { clean } from './clean.js';
import { measure, viewOf } from './measure.js';
import { findEvents } from './events.js';
import { calibrate } from './calib.js';
import { idxRange, isNum } from './util.js';
import { masteryPrims } from '../motions/mastery.js';
import { jugglePrims } from '../motions/juggle.js';
import { ENGINE_VER } from './index.js';

const OPS = { '>=': (a, b) => a >= b, '<=': (a, b) => a <= b };

// 내 1단계 최고 기록(빠르기 등): 같은 과제에서 1단계를 통과한 기록 중 가장 좋은 값
export function bestAtLevel(history, taskId, level, m) {
  let best = null;
  for (const h of history) {
    const t = h.task; if (!t || t.id !== taskId || t.level !== level || !t.passed) continue;
    const v = t.prims?.[m]; if (isNum(v) && (best == null || v > best)) best = v;
  }
  return best;
}

export function checkLevel(task, taskId, level, prims, history, metrics) {
  const lv = task.levels.find(l => l.n === level); if (!lv) return null;
  const checks = [];
  for (const r of lv.rules) {
    const md = metrics[r.m] || { name: r.m, unit: '' };
    const have = prims[r.m];
    let need, op = r.op || '>=', note = '';
    if (r.rel) {
      const base = bestAtLevel(history, taskId, r.rel, r.m);
      if (base == null) { checks.push({ m: r.m, name: md.name, ok: false, have, need: null, text: `${r.rel}단계를 먼저 통과해 주세요(내 ${r.rel}단계 ${md.name} 기록이 기준)` }); continue; }
      need = base * r.k; note = ` (내 ${r.rel}단계 최고 ${base.toFixed(md.dp ?? 2)} × ${r.k})`;
    } else need = r.v;
    const ok = isNum(have) && OPS[op](have, need);
    const f = v => isNum(v) ? (+v).toFixed(md.dp ?? 2) : '—';
    checks.push({ m: r.m, name: md.name, ok, have: isNum(have) ? +f(have) : null, need: +f(need), op, text: `${md.name} ${f(have)} ${op === '>=' ? '≥' : '≤'} ${f(need)}${md.unit ? ' ' + md.unit : ''}${note}` });
  }
  return { level, name: lv.name, passed: checks.length > 0 && checks.every(c => c.ok), checks };
}

export function analyzeTask(raw, { taskId, level, heightCm, fps, criteria, history = [], profile }) {
  const ch = criteria.challenge, task = ch.tasks[taskId];
  const cfg = { ...criteria.dribble.engine, ...ch.engine };
  const c = clean(raw, cfg);
  const m = measure(c, cfg, heightCm);
  const ev = findEvents(m, cfg);
  const calib = calibrate(c, m, heightCm, cfg);
  let out;
  if (task.motion === 'juggle') out = jugglePrims(c, m, cfg, profile);
  else out = masteryPrims(m, ev, task, cfg);
  const { p } = out;
  let view = viewOf(m, c.joints, 0, m.ts.length, cfg);
  if (isNum(out.t0) && isNum(out.t1) && out.t1 > out.t0) { const [a, b] = idxRange(m.ts, out.t0, out.t1); view = viewOf(m, c.joints, a, b, cfg); }
  const lv = checkLevel(task, taskId, level, p, history, ch.metrics);
  // 보여 줄 지표(과제의 show 순서). 개인 비교: 같은 과제 앞 기록 3개 평균
  const past = history.filter(h => h.task?.id === taskId).slice(-3);
  const rows = task.show.map(k => {
    const md = ch.metrics[k] || {}, v = p[k];
    const prev = past.map(h => h.task.prims?.[k]).filter(isNum);
    const base = prev.length ? prev.reduce((a, b) => a + b, 0) / prev.length : null;
    const row = { id: k, name: md.name || k, unit: md.unit || '', note: md.note, value: isNum(v) ? +(+v).toFixed(md.dp ?? 2) : null, why: isNum(v) ? null : (p._why?.[k] || '잴 수 없음') };
    if (row.value != null && base != null) { row.base = +base.toFixed(md.dp ?? 2); row.delta = +(v - base).toFixed(md.dp ?? 2); if (md.better && row.delta !== 0) row.better = md.better === 'low' ? row.delta < 0 : row.delta > 0; }
    return row;
  });
  const marks = task.motion === 'juggle'
    ? out.contacts.map(x => ({ t: +x.t.toFixed(3), foot: x.part === 'foot_l' ? 'l' : x.part === 'foot_r' ? 'r' : null, part: x.part }))
    : out.touches.map(x => ({ t: +x.t.toFixed(3), foot: x.foot, kind: x.kind }));
  const { _why, parts, ...keep } = p;
  return {
    engine: ENGINE_VER, criteriaVer: ch.ver, fps, heightCm,
    dur: m.ts.length ? +(m.ts[m.ts.length - 1] - m.ts[0]).toFixed(2) : 0, frames: m.ts.length,
    poseSeen: +(c.joints[23].filter(Boolean).length / Math.max(1, m.ts.length)).toFixed(2),
    ballSeen: +(c.ball.filter(Boolean).length / Math.max(1, m.ts.length)).toFixed(2),
    swaps: c.swaps, view, calib,
    task: { id: taskId, name: task.name, level, passed: !!lv?.passed, check: lv, prims: roundAll(keep), parts: parts || null, t0: out.t0 ?? null, t1: out.t1 ?? null, camView: task.cam.view },
    rows, marks, segs: [], events: { steps: [], touches: [], impacts: [], plants: [], cuts: [], stops: [] },
    drops: out.drops ? out.drops.map(d => +d.t.toFixed(3)) : [],
  };
}

function roundAll(o) { const r = {}; for (const k in o) r[k] = isNum(o[k]) ? +(+o[k]).toFixed(4) : o[k]; return r; }

// 단계 진행: 과제마다 단계별 통과 횟수와 지금 도전할 단계
export function progress(history, ch) {
  const out = {};
  for (const id in ch.tasks) {
    const lv = ch.tasks[id].levels.map(l => ({ n: l.n, name: l.name, passes: 0, tries: 0 }));
    for (const h of history) { const t = h.task; if (!t || t.id !== id) continue; const x = lv.find(l => l.n === t.level); if (!x) continue; x.tries++; if (t.passed) x.passes++; }
    for (const x of lv) x.done = x.passes >= ch.pass_need;
    const cur = (lv.find(x => !x.done) || lv[lv.length - 1]).n;
    out[id] = { levels: lv, current: cur, doneCount: lv.filter(x => x.done).length };
  }
  return out;
}
