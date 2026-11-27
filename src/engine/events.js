// ② 사건 찾기 (lesson-build.md 5.4). 규칙 숫자는 모두 cfg(기준표 engine 칸)에서 온다.

import { isNum, mean, idxRange, minimaBelow, dirDiff } from './util.js';

// 구간 [t0,t1] 의 공 평균 속도 벡터(키/초)
function ballVel(m, t0, t1) {
  const [a, b] = idxRange(m.ts, t0, t1);
  const vx = mean(m.ball_vx.slice(a, b)), vy = mean(m.ball_vy.slice(a, b));
  return isNum(vx) && isNum(vy) ? { x: vx, y: vy, s: Math.hypot(vx, vy) } : null;
}

// 걸음(착지): 발이 바닥 + contact_h 안이고 발 속도가 contact_v 미만인 구간의 시작
export function findSteps(m, cfg) {
  const out = [];
  for (const side of ['l', 'r']) {
    const h = m['foot_h_' + side], v = m['foot_v_' + side];
    let on = false;
    for (let i = 0; i < m.ts.length; i++) {
      const c = isNum(h[i]) && isNum(v[i]) && h[i] <= cfg.contact_h && v[i] < cfg.contact_v;
      if (c && !on) out.push({ type: 'step', t: m.ts[i], i, foot: side });
      if (isNum(h[i])) on = c; else on = false;
    }
  }
  return out.sort((a, b) => a.t - b.t);
}

// 터치: 발끝-공 거리가 touch_dist 안으로 들어온 구간의 가장 가까운 장면,
// 그리고 전후 공 속도 크기가 touch_dv 이상 또는 방향이 touch_ddeg 이상 바뀜. 앞 터치와 touch_gap 초 이상.
export function findTouches(m, cfg) {
  const out = [];
  for (const i of minimaBelow(m.foot_ball_d, cfg.touch_dist, m.ts, cfg.touch_gap / 2)) {
    const t = m.ts[i];
    const pre = ballVel(m, t - cfg.vel_win, t - 1e-3), post = ballVel(m, t + 1e-3, t + cfg.vel_win);
    let changed = false, why = '';
    // 앞뒤 둘 다 거의 멈춘 공이면 잡음일 뿐이라 터치가 아니다
    if (pre && post && Math.max(pre.s, post.s) > cfg.ball_still) {
      const big = Math.max(pre.s, post.s);
      const dv = big > 0 ? Math.abs(post.s - pre.s) / big : 0;
      const dd = (pre.s > cfg.ball_still && post.s > cfg.ball_still) ? dirDiff(Math.atan2(pre.y, pre.x), Math.atan2(post.y, post.x)) : 0;
      if (dv >= cfg.touch_dv) { changed = true; why = 'speed'; }
      else if (dd >= cfg.touch_ddeg) { changed = true; why = 'dir'; }
    }
    if (!changed) continue;
    const prev = out[out.length - 1];
    if (prev && t - prev.t < cfg.touch_gap) {
      if (m.foot_ball_d[i] < m.foot_ball_d[prev.i]) out[out.length - 1] = mk();
      continue;
    }
    out.push(mk());
    function mk() { return { type: 'touch', t, i, foot: m.foot_ball_side[i], d: +m.foot_ball_d[i].toFixed(3), why, pre: pre && +pre.s.toFixed(2), post: post && +post.s.toFixed(2) }; }
  }
  return out;
}

// 임팩트: 터치 중 직후 공 속도가 직전의 impact_ratio 배 이상이고 impact_min_v(키/초) 이상
// 디딤: 임팩트 전 마지막 반대발 착지
export function findImpacts(m, touches, steps, cfg) {
  const imp = [], plants = [];
  for (const tc of touches) {
    const pre = tc.pre ?? 0, post = tc.post ?? 0;
    if (post < cfg.impact_min_v || post < Math.max(pre, cfg.ball_still) * cfg.impact_ratio) continue;
    imp.push({ ...tc, type: 'impact' });
    const other = tc.foot === 'l' ? 'r' : 'l';
    const st = steps.filter(s => s.foot === other && s.t <= tc.t && s.t >= tc.t - 1.0).pop();
    if (st) plants.push({ type: 'plant', t: st.t, i: st.i, foot: other, impactT: tc.t });
  }
  return { imp, plants };
}

// 방향 전환: 앞 cut_win 초와 뒤 cut_win 초의 평균 이동 방향 차이가 cut_deg 이상인 구간의 가운데
export function findCuts(m, cfg) {
  const out = [], n = m.ts.length, ang = new Array(n).fill(null);
  for (let i = 0; i < n; i++) {
    const t = m.ts[i];
    const [a0, a1] = idxRange(m.ts, t - cfg.cut_win, t), [b0, b1] = idxRange(m.ts, t, t + cfg.cut_win);
    const ax = mean(m.body_vx.slice(a0, a1)), ay = mean(m.body_vy.slice(a0, a1));
    const bx = mean(m.body_vx.slice(b0, b1)), by = mean(m.body_vy.slice(b0, b1));
    if (![ax, ay, bx, by].every(isNum)) continue;
    if (Math.hypot(ax, ay) < cfg.move_v || Math.hypot(bx, by) < cfg.move_v) continue;
    ang[i] = dirDiff(Math.atan2(ay, ax), Math.atan2(by, bx));
  }
  let s = -1;
  for (let i = 0; i <= n; i++) {
    const on = i < n && isNum(ang[i]) && ang[i] >= cfg.cut_deg;
    if (on && s < 0) s = i;
    if (!on && s >= 0) {
      let best = s; for (let k = s; k < i; k++) if (ang[k] > ang[best]) best = k;
      out.push({ type: 'cut', t: m.ts[best], i: best, deg: Math.round(ang[best]) });
      s = -1;
    }
  }
  return out;
}

// 멈춤: 몸 속도가 stop_v 아래로 떨어진 순간(stop_min 초 이상 이어질 때)
export function findStops(m, cfg) {
  const out = []; let s = -1;
  for (let i = 0; i <= m.ts.length; i++) {
    const low = i < m.ts.length && isNum(m.body_v[i]) && m.body_v[i] < cfg.stop_v;
    if (low && s < 0) s = i;
    if (!low && s >= 0) { if (m.ts[i - 1] - m.ts[s] >= cfg.stop_min) out.push({ type: 'stop', t: m.ts[s], i: s, until: m.ts[i - 1] }); s = -1; }
  }
  return out;
}

export function findEvents(m, cfg) {
  const steps = findSteps(m, cfg), touches = findTouches(m, cfg);
  const { imp, plants } = findImpacts(m, touches, steps, cfg);
  return { steps, touches, impacts: imp, plants, cuts: findCuts(m, cfg), stops: findStops(m, cfg) };
}
