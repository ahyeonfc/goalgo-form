// 골고 폼 공통 엔진 입구: 원재료(raw) → 손질 → ①측정값 → ②사건 → ③구간 → ④지표 → ⑤점수 → ⑥고칠 말
// 원재료만 있으면 영상 없이 언제든 다시 계산한다(기준표가 바뀌어도).

import { clean } from './clean.js';
import { measure, viewOf } from './measure.js';
import { findEvents } from './events.js';
import { calibrate } from './calib.js';
import { scoreAll } from './score.js';
import { idxRange, isNum, mean } from './util.js';
import { findDribbles, dribblePrims } from '../motions/dribble.js';

export const ENGINE_VER = 'e1-2026-11-27';

// criteria: { dribble: {...기준표} } — 동작별 기준표. 엔진 설정은 드리블 표의 engine 칸을 공통으로 쓴다.
export function analyze(raw, { heightCm, fps, criteria, history = [] }) {
  const cfg = criteria.dribble.engine;
  const c = clean(raw, cfg);
  const m = measure(c, cfg);
  const ev = findEvents(m, cfg);
  const calib = calibrate(c, m, heightCm, cfg);
  const whole = viewOf(m, c.joints, 0, m.ts.length, cfg);

  const segs = [];
  for (const seg of findDribbles(m, ev, cfg)) {
    const [a, b] = idxRange(m.ts, seg.t0, seg.t1);
    const view = viewOf(m, c.joints, a, b, cfg);
    const prims = dribblePrims(m, ev, seg, cfg);
    const base = baselineOf(history, 'dribble');
    const sc = scoreAll(criteria.dribble, prims, { view: view.view, fps, course: null }, base);
    segs.push({ motion: 'dribble', name: criteria.dribble.name, t0: +seg.t0.toFixed(3), t1: +seg.t1.toFixed(3), conf: seg.conf, view, touches: seg.touches.map(t => ({ t: +t.t.toFixed(3), foot: t.foot })), ...sc });
  }
  // 동작으로 묶이지 않은 터치·움직임은 "무슨 동작인가요?"로 남긴다(결과 화면에서 고름)
  const used = new Set(segs.flatMap(s => s.touches.map(t => t.t)));
  const loose = ev.touches.filter(t => !used.has(+t.t.toFixed(3)));

  const poseSeen = c.joints[23].filter(Boolean).length / Math.max(1, m.ts.length);
  const ballSeen = c.ball.filter(Boolean).length / Math.max(1, m.ts.length);
  return {
    engine: ENGINE_VER, criteriaVer: criteria.dribble.ver, fps, heightCm,
    dur: m.ts.length ? +(m.ts[m.ts.length - 1] - m.ts[0]).toFixed(2) : 0,
    frames: m.ts.length, poseSeen: +poseSeen.toFixed(2), ballSeen: +ballSeen.toFixed(2), swaps: c.swaps,
    view: whole, calib,
    events: summarizeEvents(ev),
    segs, loose: loose.map(t => ({ t: +t.t.toFixed(3), foot: t.foot })),
  };
}

function summarizeEvents(ev) {
  const r = t => +t.toFixed(3);
  return {
    steps: ev.steps.map(s => ({ t: r(s.t), foot: s.foot })),
    touches: ev.touches.map(s => ({ t: r(s.t), foot: s.foot, why: s.why })),
    impacts: ev.impacts.map(s => ({ t: r(s.t), foot: s.foot, post: s.post })),
    plants: ev.plants.map(s => ({ t: r(s.t), foot: s.foot })),
    cuts: ev.cuts.map(s => ({ t: r(s.t), deg: s.deg })),
    stops: ev.stops.map(s => ({ t: r(s.t), until: r(s.until) })),
  };
}

// 개인 비교 기준선: 같은 동작의 앞선 기록 중 처음 3회 평균(lesson/01 ⑤ "첫 3회 평균을 내 기준선")
export function baselineOf(history, motion) {
  const rows = [];
  for (const h of history) for (const s of (h.segs || [])) if (s.motion === motion) rows.push(s);
  const first = rows.slice(0, 3); if (!first.length) return null;
  const out = {};
  for (const r of first) for (const x of r.rows) if (isNum(x.value)) (out[x.id] ||= []).push(x.value);
  for (const k in out) out[k] = mean(out[k]);
  return out;
}
