// 공 다루기(제자리): 토 탭, 당기고 인사이드 밀기, 당기고 아웃사이드 밀기
// 공이 거의 제자리라 "몸이 움직여야 드리블" 규칙을 쓰지 않는다.

import { isNum, mean, std, percentile, median, idxRange, minimaBelow, dist } from '../engine/util.js';

// 토 탭 터치: 발(발끝)과 공이 가장 가까운 순간 + 그 발이 바닥에서 떠 있음(공 위에 올라가 있음).
// 공 옆에 서 있는 발은 바닥에 붙어 있으므로 떠 있는지로 거른다.
export function tapTouches(m, cfg) {
  const out = [];
  for (const side of ['l', 'r']) {
    const f = m['foot_' + side], h = m['foot_h_' + side];
    const d = f.map((p, i) => p && m.ball[i] && m.Hpx[i] ? dist(p, m.ball[i]) / m.Hpx[i] : null);
    let last = -9;
    for (const i of minimaBelow(d, cfg.tap_dist, m.ts, cfg.tap_gap / 2)) {
      if (!isNum(h[i]) || h[i] < cfg.tap_h_min) continue;
      if (m.ts[i] - last < cfg.tap_gap) continue;
      last = m.ts[i];
      // 장면 사이 시각: 앞뒤 세 장면 거리로 포물선을 맞춰 가장 가까운 순간을 장면 사이까지 계산(30fps 반올림 오차 줄이기)
      let t = m.ts[i];
      if (i > 0 && i + 1 < d.length && isNum(d[i - 1]) && isNum(d[i + 1])) {
        const den = d[i - 1] - 2 * d[i] + d[i + 1];
        if (den > 1e-9) { const off = (d[i - 1] - d[i + 1]) / (2 * den); if (Math.abs(off) <= 1) t = m.ts[i] + off * (m.ts[i + 1] - m.ts[i - 1]) / 2; }
      }
      out.push({ t, i, foot: side, kind: 'tap' });
    }
  }
  return out.sort((a, b) => a.t - b.t);
}

// 당기고 밀기 터치: 공 움직임이 바뀐 터치(엔진 findTouches)를 쓰고,
// 터치 직후 공이 몸(엉덩이) 쪽으로 가면 당기기, 멀어지면 밀기로 나눈다.
export function pullPushTouches(m, ev) {
  return ev.touches.map(tc0 => {
    // 터치 시각 다듬기: 발-공 가장 가까운 순간은 발이 들어오는 방향에 따라 밀리므로, ±0.15초 안에서 공 가로 속도 부호가 바뀐 순간으로
    let tc = tc0;
    const [w0, w1] = idxRange(m.ts, tc0.t - 0.15, tc0.t + 0.15);
    let best = null;
    for (let k = Math.max(1, w0); k < w1; k++) { const a = m.ball_vx[k - 1], b = m.ball_vx[k]; if (isNum(a) && isNum(b) && a * b < 0) { if (best == null || Math.abs(m.ts[k] - tc0.t) < Math.abs(m.ts[best] - tc0.t)) best = k; } }
    if (best != null) tc = { ...tc0, i: best, t: m.ts[best] };
    const i = tc.i, b = m.ball[i], h = m.bodyC[i];
    const [a, e] = idxRange(m.ts, tc.t + 1e-3, tc.t + 0.12);
    const vx = mean(m.ball_vx.slice(a, e)), vy = mean(m.ball_vy.slice(a, e));
    let kind = 'push';
    if (b && h && isNum(vx) && isNum(vy)) {
      // 화면 가로 방향만 본다(옆에서 찍으므로 앞뒤 = 화면 가로). 엉덩이 쪽으로 가면 당기기
      const toward = (h.x - b.x) * vx > 0;
      kind = toward ? 'pull' : 'push';
    }
    return { ...tc, kind };
  });
}

// 가장 긴 연속 구간: 터치 사이가 gap 초 이하로 이어진 묶음
export function longestRun(touches, gap, minN) {
  let best = [], cur = [];
  for (const tc of touches) {
    if (cur.length && tc.t - cur[cur.length - 1].t > gap) { if (cur.length > best.length) best = cur; cur = []; }
    cur.push(tc);
  }
  if (cur.length > best.length) best = cur;
  return best.length >= minN ? best : [];
}

const altPct = seq => seq.length >= 2 ? 100 * seq.slice(1).filter((x, k) => x.foot && seq[k].foot && x.foot !== seq[k].foot).length / (seq.length - 1) : null;
const cvPct = ts => { const g = ts.slice(1).map((t, k) => t - ts[k]); return g.length >= 2 ? 100 * std(g) / mean(g) : null; };

function headUp(m, a, b, cfg) {
  const still = m.head_drop.filter((v, i) => isNum(v) && isNum(m.body_v[i]) && m.body_v[i] < cfg.stop_v);
  const hd = m.head_drop.slice(a, b).filter(isNum);
  if (hd.length < 5) return null;
  // 선 자세 기준: 제자리 과제는 내내 서 있으므로 고개 숙임이 가장 작은 쪽(P10)을 기준으로 삼는다
  const base = percentile(m.head_drop.filter(isNum), 10) ?? median(still);
  return 100 * hd.filter(v => v < base + cfg.head_up_drop).length / hd.length;
}

export function masteryPrims(m, ev, task, cfg) {
  const why = {}, p = { _why: why };
  let touches, unit;
  if (task.motion === 'tap') { touches = tapTouches(m, cfg); unit = touches; }
  else {
    touches = pullPushTouches(m, ev);
    // 반복 = 당기기 다음에 같은 발 밀기가 gap 안에 오면 1번
    unit = [];
    for (let k = 0; k < touches.length; k++) {
      const a = touches[k]; if (a.kind !== 'pull') continue;
      const b = touches.slice(k + 1).find(x => x.t - a.t <= cfg.pp_gap);
      if (b && b.kind === 'push') unit.push({ t: a.t, i: a.i, foot: a.foot, push: b.t });
    }
  }
  const run = longestRun(unit, cfg.mst_gap, 3);
  p.touches_all = touches.length;
  if (!run.length) { for (const k of ['reps', 'rate', 'alt', 'tempo_cv', 'ball_range', 'head_up', 'foot_ratio', 'dur']) { p[k] = null; why[k] = '이어진 반복을 찾지 못함'; } return { p, run: [], touches }; }
  const t0 = run[0].t, t1 = run[run.length - 1].t;
  const [a, b] = idxRange(m.ts, t0, t1);
  p.reps = run.length;
  p.dur = t1 - t0;
  p.rate = p.dur > 0 ? (run.length - 1) / p.dur : null;
  p.alt = altPct(run);
  p.tempo_cv = cvPct(run.map(x => x.t));
  // 공 움직임 크기: 구간 안 공 위치가 가운데(중앙값)에서 벗어난 거리의 P95 (키 비율)
  const bs = m.ball.slice(a, b).map((x, k) => x && m.Hpx[a + k] ? { x: x.x, y: x.y, H: m.Hpx[a + k] } : null).filter(Boolean);
  if (bs.length >= 5) { const cx = median(bs.map(x => x.x)), cy = median(bs.map(x => x.y)); p.ball_range = percentile(bs.map(x => Math.hypot(x.x - cx, x.y - cy) / x.H), 95); }
  else { p.ball_range = null; why.ball_range = '공이 잘 안 보임'; }
  p.head_up = headUp(m, a, b, cfg);
  if (p.head_up == null) why.head_up = '얼굴이 보이지 않음';
  const known = run.filter(x => x.foot);
  p.foot_ratio = known.length ? 100 * known.filter(x => x.foot === 'l').length / known.length : null;
  return { p, run, touches, t0, t1 };
}
