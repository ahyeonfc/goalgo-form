// 드리블 (docs/lesson/01-dribble.md). 구간 찾기와 지표 기본값(prims) 계산.
// 코스(콘) 알아채기 전이라 코스 시간·드리블 손실·평균/최고 속도·정확도는 빈칸으로 둔다(다음 판).

import { isNum, mean, std, percentile, median, idxRange } from '../engine/util.js';

// 드리블 구간: 터치가 drb_touch_gap 초 안 간격으로 drb_min_touches 번 이상 이어지고 몸이 움직임
export function findDribbles(m, ev, cfg) {
  const segs = []; let cur = [];
  const flush = () => {
    if (cur.length >= cfg.drb_min_touches) {
      const t0 = cur[0].t, t1 = cur[cur.length - 1].t;
      const [a, b] = idxRange(m.ts, t0, t1);
      const v = mean(m.body_v.slice(a, b));
      if (isNum(v) && v >= cfg.move_v) segs.push({ motion: 'dribble', t0, t1, touches: cur.slice(), conf: cur.length >= cfg.drb_min_touches + 2 ? 'high' : 'mid' });
    }
    cur = [];
  };
  for (const tc of ev.touches) {
    if (cur.length && tc.t - cur[cur.length - 1].t > cfg.drb_touch_gap) flush();
    cur.push(tc);
  }
  flush();
  return segs;
}

export function dribblePrims(m, ev, seg, cfg) {
  const why = {};
  const p = { _why: why };
  const { t0, t1, touches } = seg;
  const dur = t1 - t0;
  const [a, b] = idxRange(m.ts, t0, t1);
  const sl = arr => arr.slice(a, b);

  // 코스 지표: 콘 찾기 전
  for (const k of ['time', 'time_ball', 'time_noball', 'speed_avg', 'speed_max', 'cone_hits']) { p[k] = null; why[k] = '콘 코스를 알아챘을 때만'; }

  // 볼터치 빈도: 터치 수 ÷ 구간 시간. 첫 터치부터 마지막 터치까지라 간격 수(n-1)로 나눈다
  p.touch_rate = dur > 0 ? (touches.length - 1) / dur : null;
  const gaps = touches.slice(1).map((t, i) => t.t - touches[i].t);
  p.touch_even = gaps.length >= 2 ? 100 * std(gaps) / mean(gaps) : null;
  if (p.touch_even == null) why.touch_even = '터치가 3번 이상 있어야 함';

  const steps = ev.steps.filter(s => s.t >= t0 && s.t <= t1);
  p.steps = steps.length;
  p.step_rate = dur > 0 ? steps.length / dur : null;
  p.steps_per_touch = touches.length ? steps.length / touches.length : null;
  if (!steps.length) { why.step_rate = why.steps_per_touch = '발 착지를 찾지 못함(발이 잘 안 보임)'; p.step_rate = p.steps_per_touch = null; }

  // 탄력성: 방향 전환마다 (전환 앞뒤 0.25초 최저 속도 ÷ 직전 0.5초 평균 속도)의 평균, %
  const el = [];
  for (const c of ev.cuts.filter(c => c.t >= t0 && c.t <= t1)) {
    const [c0, c1] = idxRange(m.ts, c.t - 0.25, c.t + 0.25), [p0, p1] = idxRange(m.ts, c.t - 0.75, c.t - 0.25);
    const lo = Math.min(...m.body_v.slice(c0, c1).filter(isNum)), pre = mean(m.body_v.slice(p0, p1));
    if (isFinite(lo) && isNum(pre) && pre > cfg.move_v) el.push(Math.min(1.5, lo / pre));
  }
  p.cuts = el.length;
  p.elastic = el.length ? 100 * mean(el) : null;
  if (p.elastic == null) why.elastic = '방향 전환을 찾지 못함';

  // 볼 간수: 공과 가까운 발끝 거리 평균(키 비율). 공은 바닥, 발은 공중이라 참고값
  p.ball_dist = mean(sl(m.foot_ball_d));
  p.ball_dist_max = percentile(sl(m.foot_ball_d), 95);

  // 상체 밸런스: 몸통 기울기 크기의 P90(°)
  p.trunk_roll = percentile(sl(m.trunk_ang).filter(isNum).map(Math.abs), 90);
  // 무게축: 엉덩이 높이(키 비율)의 흔들림 폭(P95−P5)과 평균
  const ch = sl(m.com_h);
  p.com_bob = ch.filter(isNum).length >= 5 ? percentile(ch, 95) - percentile(ch, 5) : null;
  p.com_h = mean(ch);

  // 헤드업: 고개 숙임이 (선 자세 기준 + head_up_drop) 아래인 시간 비율, %
  const still = m.head_drop.filter((v, i) => isNum(v) && isNum(m.body_v[i]) && m.body_v[i] < cfg.stop_v);
  const base = still.length >= 3 ? median(still) : percentile(sl(m.head_drop), 20);
  const hd = sl(m.head_drop).filter(isNum);
  if (isNum(base) && hd.length >= 5) p.head_up = 100 * hd.filter(v => v < base + cfg.head_up_drop).length / hd.length;
  else { p.head_up = null; why.head_up = '얼굴이 보이지 않음(뒤에서 찍음)'; }

  // 양발 사용: 왼발 터치 비율 %
  const known = touches.filter(t => t.foot);
  p.foot_ratio = known.length ? 100 * known.filter(t => t.foot === 'l').length / known.length : null;
  p.touches = touches.length;
  p.dur = dur;
  return p;
}
