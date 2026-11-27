// 자유 분석: 찍은 영상만 넘기면 구간마다 무슨 동작인지 알아채고(리프팅·공 다루기·드리블·차기), 코칭을 만든다.
// 우선순위: 리프팅(공이 공중) > 차기(임팩트) > 공 다루기(제자리 터치) > 드리블(이동 터치)

import { clean } from './clean.js';
import { measure, viewOf } from './measure.js';
import { findEvents } from './events.js';
import { calibrate } from './calib.js';
import { idxRange, isNum, median, mean } from './util.js';
import { findDribbles, dribblePrims } from '../motions/dribble.js';
import { masteryPrims, tapTouches, pullPushTouches, longestRun } from '../motions/mastery.js';
import { jugglePrims } from '../motions/juggle.js';
import { findKicks } from '../motions/kick.js';
import { coachSeg, MOTION_KO } from './coach.js';
import { estimateTimeScale } from './timescale.js';

export const FREE_VER = 'f1-2026-11-27';

export function analyzeFree(raw, opts) {
  const { heightCm, fps, criteria, history = [], profile, frame, _scaled } = opts;
  let cfg = { ...criteria.dribble.engine, ...criteria.challenge.engine, frame };
  const c = clean(raw, cfg);
  let m = measure(c, cfg, heightCm);
  // 몸 크기와 공 크기가 어긋나면(공 ÷ 키가 정상 22/키의 1.35배 넘음, 0.25 이하) 몸 일부가 잘린 것: 공 크기로 다시 잰다
  const rr = []; for (let i = 0; i < m.ts.length; i++) { const b = c.ball[i]; if (b && isNum(m.Hpx[i]) && b.r > 2) rr.push(2 * b.r / m.Hpx[i]); }
  const r0 = median(rr), expect = 22 / heightCm;
  let rescaled = false;
  if (isNum(r0) && r0 / expect > 1.35 && r0 <= 0.25) { cfg = { ...cfg, force_scale: 'ball' }; m = measure(c, cfg, heightCm); rescaled = true; }
  // 슬로모션 알아내기: 날아가는 공의 가속도로 영상이 실제보다 몇 배 느린지(k) 잰다. 느리면 실제 시각으로 바꿔 다시 분석하고, 결과 시각은 영상 시각으로 돌려놓는다
  const ts0 = _scaled ? null : estimateTimeScale(c, m, heightCm, cfg);
  if (ts0 && ts0.k && ts0.n >= cfg.ts_min_flights && ts0.k >= cfg.ts_slow) {
    const k = ts0.k;
    const out = analyzeFree(raw.map(f => ({ ...f, t: f.t / k })), { ...opts, fps: fps * k, _scaled: k });
    return toVideoTime(out, k, ts0);
  }
  const ev = findEvents(m, cfg);
  const calib = calibrate(c, m, heightCm, cfg);
  const n = m.ts.length;
  const notes = [];
  const view = viewOf(m, c.joints, 0, n, cfg);

  // 자세 믿음: 공 지름 ÷ 화면 속 키. 실제는 약 22/키(0.13). 0.25 를 넘으면 몸이 다 안 보여 모델이 몸을 지어낸 것
  const ratios = [];
  for (let i = 0; i < n; i++) { const b = c.ball[i]; if (b && isNum(m.Hpx[i]) && b.r > 2) ratios.push(2 * b.r / m.Hpx[i]); }
  const ballRatio = rescaled ? r0 : median(ratios);
  const poseOk = !(isNum(ballRatio) && ballRatio > 0.25);
  if (rescaled && poseOk) notes.push({ kind: 'info', text: '몸 일부가 화면 밖이라 공 크기(22cm)로 크기를 맞췄어요. 머리부터 발끝까지 나오게 찍으면 더 정확해요.' });
  if (!poseOk) notes.push({ kind: 'warn', text: '몸 전체가 화면에 안 보여 자세를 믿을 수 없어요. 머리부터 발끝까지 다 나오게, 3~4m 떨어져 찍어 주세요.' });

  const segs = [];
  const busy = () => segs.map(s => [s.t0 - 0.3, s.t1 + 0.3]);
  const overlaps = (t0, t1) => busy().some(([a, b]) => t1 >= a && t0 <= b);

  if (poseOk) {
    // 1) 리프팅: 이어진 닿음 3번 이상
    const jg = jugglePrims(c, m, cfg, profile);
    if (jg.p.best >= 3) segs.push(mkSeg('juggle', jg.t0, jg.t1, jg.p, jg.contacts.map(x => ({ t: x.t, foot: x.part === 'foot_l' ? 'l' : x.part === 'foot_r' ? 'r' : null, part: x.part, h: x.h })), { drops: jg.drops.map(d => d.t), hgt: null }));

    // 2) 차기: 임팩트(리프팅 구간 밖)
    const kicks = findKicks(c, m, ev, { heightCm, fps, view: view.view }, busy());
    for (const k of kicks) segs.push(mkSeg(k.kind, k.t - 1.0, k.t + 0.6, k, [{ t: k.t, foot: k.foot, kind: 'impact' }]));

    // 3) 공 다루기: 몸이 거의 제자리이고 공이 발 가까이에서 터치가 이어짐
    const still = i => isNum(m.body_v[i]) && m.body_v[i] < cfg.free_still_v;
    const taps = tapTouches(m, cfg).filter(t => still(t.i));
    const pp = pullPushTouches(m, ev).filter(t => still(t.i));
    const runTap = longestRun(taps, cfg.mst_gap, cfg.free_mst_min);
    const units = [];
    for (let k = 0; k < pp.length; k++) { const a = pp[k]; if (a.kind !== 'pull') continue; const b = pp.slice(k + 1).find(x => x.t - a.t <= cfg.pp_gap); if (b && b.kind === 'push') units.push({ t: a.t, i: a.i, foot: a.foot }); }
    const runPP = longestRun(units, cfg.mst_gap, Math.ceil(cfg.free_mst_min / 2));
    const pick = runPP.length * 2 >= runTap.length && runPP.length ? 'pullpush' : runTap.length ? 'tap' : null;
    if (pick) {
      const run = pick === 'tap' ? runTap : runPP;
      const t0 = run[0].t, t1 = run[run.length - 1].t;
      if (!overlaps(t0, t1)) {
        const { p } = masteryPrims(m, ev, { motion: pick }, cfg);
        segs.push(mkSeg(pick === 'tap' ? 'toe_tap' : 'pull_push', t0, t1, p, run.map(x => ({ t: x.t, foot: x.foot }))));
      }
    }

    // 4) 드리블: 이동하며 터치
    for (const d of findDribbles(m, ev, cfg)) {
      if (overlaps(d.t0, d.t1)) continue;
      const p = dribblePrims(m, ev, d, cfg);
      segs.push(mkSeg('dribble', d.t0, d.t1, p, d.touches.map(t => ({ t: t.t, foot: t.foot }))));
    }
  }

  segs.sort((a, b) => a.t0 - b.t0);
  for (let k = 0; k < segs.length; k++) segs[k] = slim(segs[k]);
  // 코칭: 구간마다(같은 영상 안 비교 + 연구 기준 + 내 지난 기록)
  for (const s of segs) {
    const [a, b] = idxRange(m.ts, s.t0, s.t1);
    s.view = viewOf(m, c.joints, a, b, cfg).view;
    s.coach = coachSeg(s, { m, c, ev, cfg, heightCm, fps, view: s.view, history, profile });
  }
  if (poseOk && !segs.length) {
    const ballSeen = c.ball.filter(Boolean).length / Math.max(1, n), poseSeen = m.bodyC.filter(Boolean).length / Math.max(1, n);
    if (ballSeen < 0.5) notes.push({ kind: 'warn', text: '공이 잘 안 보였어요. 공이 화면에서 너무 작지 않게(3~5m) 찍어 주세요.' });
    else if (poseSeen < 0.6) notes.push({ kind: 'warn', text: '몸이 잘 안 보였어요. 머리부터 발끝까지 화면에 들어오게 찍어 주세요.' });
    else notes.push({ kind: 'info', text: '공 터치나 차기를 찾지 못했어요. 지금은 리프팅·공 다루기(토 탭, 당기고 밀기)·드리블·패스·슈팅을 알아봐요.' });
  }
  if (fps < 50 && segs.some(s => s.motion === 'shot' || s.motion === 'pass')) notes.push({ kind: 'info', text: '슬로모션(120fps)으로 찍으면 공 속도와 차는 순간을 더 정확히 봐 드릴 수 있어요.' });

  return {
    free: FREE_VER, timeScale: _scaled ? null : { k: 1, est: ts0 }, fps, heightCm, dur: n ? +(m.ts[n - 1] - m.ts[0]).toFixed(2) : 0, frames: n,
    poseSeen: +(m.bodyC.filter(Boolean).length / Math.max(1, n)).toFixed(2), ballSeen: +(c.ball.filter(Boolean).length / Math.max(1, n)).toFixed(2),
    poseOk, ballRatio: isNum(ballRatio) ? +ballRatio.toFixed(3) : null, view, calib, notes,
    segs, events: { touches: ev.touches.map(t => ({ t: +t.t.toFixed(3), foot: t.foot })), steps: ev.steps.length, cuts: ev.cuts.length },
  };
}

// 실제 시각으로 분석한 결과의 시각을 영상 시각(× k)으로 돌려놓는다. 빠르기(번/초) 같은 값은 실제 시각 기준 그대로
function toVideoTime(r, k, est) {
  const T = t => (isNum(t) ? +(t * k).toFixed(3) : t);
  for (const s of r.segs) {
    s.t0 = T(s.t0); s.t1 = T(s.t1);
    s.marks = s.marks.map(x => ({ ...x, t: T(x.t) }));
    if (s.drops) s.drops = s.drops.map(T);
    for (const f of s.coach.fixes) if (isNum(f.t)) f.t = T(f.t);
  }
  r.events.touches = r.events.touches.map(x => ({ ...x, t: T(x.t) }));
  r.dur = T(r.dur);
  r.timeScale = { k: +k.toFixed(2), est };
  r.notes.unshift({ kind: 'info', text: `슬로모션 영상으로 보여요(실제보다 약 ${k.toFixed(1)}배 느림). 떨어지는 공의 속도로 시간을 맞춰 분석했어요.` });
  return r;
}

function mkSeg(motion, t0, t1, p, marks, extra = {}) { return { motion, name: MOTION_KO[motion], t0, t1, p, marks, ...extra }; }
function slim(s) {
  const { p, ...rest } = s; const prims = {};
  for (const k in p) if (k !== '_why') prims[k] = isNum(p[k]) ? +(+p[k]).toFixed(4) : p[k];
  return { ...rest, t0: +s.t0.toFixed(3), t1: +s.t1.toFixed(3), prims, marks: s.marks.map(x => ({ ...x, t: +x.t.toFixed(3) })) };
}
