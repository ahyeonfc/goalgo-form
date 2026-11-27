// 리프팅(저글링): 공을 떨어뜨리지 않고 몸으로 계속 차올리기.
// 닿음 = 공이 내려오다 다시 올라가는 가장 낮은 순간(화면 y 최대)이 바닥보다 충분히 위이고, 몸 한 부위가 가까이 있음.
// 떨어뜨림 = 공이 바닥 높이까지 내려옴.

import { isNum, mean, std, percentile, dist } from '../engine/util.js';
import { J } from '../engine/measure.js';

const PARTS = [['foot_l', [J.toeL, J.ankL]], ['foot_r', [J.toeR, J.ankR]], ['thigh_l', [J.kneeL]], ['thigh_r', [J.kneeR]], ['head', [J.nose]]];
export const PART_KO = { foot_l: '왼발', foot_r: '오른발', thigh_l: '왼 허벅지', thigh_r: '오른 허벅지', head: '머리' };

export function juggleEvents(c, m, cfg) {
  const { ts, ball, Hpx, ground } = m, n = ts.length;
  const hgt = ball.map((b, i) => b && isNum(ground[i]) && Hpx[i] ? (ground[i] - b.y) / Hpx[i] : null);
  const contacts = [], drops = [];
  for (let i = 1; i < n - 1; i++) {
    if (!isNum(hgt[i])) continue;
    // 앞뒤 win 초 안에서 가장 낮은 점인가
    let low = true;
    for (let k = i - 1; k >= 0 && ts[i] - ts[k] <= cfg.jg_win; k--) if (isNum(hgt[k]) && hgt[k] < hgt[i] - 0.01) { low = false; break; } // 0.01: 발 위에 올려 둔 공의 잡음
    if (low) for (let k = i + 1; k < n && ts[k] - ts[i] <= cfg.jg_win; k++) if (isNum(hgt[k]) && hgt[k] <= hgt[i]) { low = false; break; }
    if (!low) continue;
    // 정말 튀어 올랐나: 앞뒤로 공이 jg_bounce 만큼 더 높았어야 함
    // 앞뒤 jg_rise 초 안에 공이 얼마나 높았나(시간으로 재야 30fps·120fps 가 같음)
    let before = -9, after = -9;
    for (let k = i - 1; k >= 0 && ts[i] - ts[k] <= cfg.jg_rise; k--) if (isNum(hgt[k])) before = Math.max(before, hgt[k]);
    for (let k = i + 1; k < n && ts[k] - ts[i] <= cfg.jg_rise; k++) if (isNum(hgt[k])) after = Math.max(after, hgt[k]);
    if (hgt[i] <= cfg.jg_ground) {
      // 바닥에 떨어짐. 바닥에 놓인 공의 잡음으로 여러 번 잡히지 않게 1초 안은 하나로
      const pd = drops[drops.length - 1];
      if (before - hgt[i] > cfg.jg_bounce && !(pd && ts[i] - pd.t < 1.0)) drops.push({ t: ts[i], i });
      continue;
    }
    if (after - hgt[i] < cfg.jg_bounce) continue;
    // 닿은 직후(0.15초 안) 공이 분명히 올라가야 진짜 닿음. 발 위에 가만히 놓인 공의 잡음을 거른다
    let soon = -9;
    for (let k = i + 1; k < n && ts[k] - ts[i] <= 0.15; k++) if (isNum(hgt[k])) soon = Math.max(soon, hgt[k]);
    if (soon - hgt[i] < cfg.jg_kick) continue;
    // 내려오다 올라감(이어 차기) 또는, 앞 닿음 없이 위로 확 올라감(처음 띄우기: 발로 띄우거나 손에서 놓은 공)
    const prevC = contacts[contacts.length - 1];
    const fresh = !prevC || ts[i] - prevC.t > cfg.jg_gap || drops.some(d => d.t > prevC.t);
    if (before - hgt[i] < cfg.jg_bounce && !(fresh && after - hgt[i] >= 2 * cfg.jg_bounce)) continue;
    let best = null;
    for (const [part, js] of PARTS) for (const j of js) {
      const p = c.joints[j][i]; if (!p) continue;
      const d = dist(p, ball[i]) / Hpx[i];
      if (d <= cfg.jg_part_dist && (!best || d < best.d)) best = { part, d };
    }
    if (!best) continue; // 몸(발·무릎·머리) 가까이에서만 닿음
    const prev = contacts[contacts.length - 1];
    if (prev && ts[i] - prev.t < cfg.jg_min_gap) continue;
    contacts.push({ t: ts[i], i, part: best ? best.part : null, h: hgt[i] });
  }
  return { contacts, drops, hgt };
}

export function jugglePrims(c, m, cfg, profile) {
  const why = {}, p = { _why: why };
  const { contacts, drops, hgt } = juggleEvents(c, m, cfg);
  // 연속 묶음: 떨어뜨림이나 jg_gap 초 넘는 쉼에서 끊는다
  const streaks = []; let cur = [];
  const dropT = drops.map(d => d.t);
  for (const ct of contacts) {
    const prev = cur[cur.length - 1];
    if (prev && (ct.t - prev.t > cfg.jg_gap || dropT.some(t => t > prev.t && t < ct.t))) { streaks.push(cur); cur = []; }
    cur.push(ct);
  }
  if (cur.length) streaks.push(cur);
  const best = streaks.reduce((a, s) => s.length > a.length ? s : a, []);
  p.total = contacts.length;
  p.best = best.length;
  p.drops = drops.length;
  p.streaks = streaks.length;
  const feet = contacts.filter(x => x.part === 'foot_l' || x.part === 'foot_r');
  p.foot_ratio = feet.length ? 100 * feet.filter(x => x.part === 'foot_l').length / feet.length : null;
  const bf = best.filter(x => x.part);
  p.alt = bf.length >= 2 ? 100 * bf.slice(1).filter((x, k) => x.part !== bf[k].part).length / (bf.length - 1) : null;
  const weak = profile && profile.foot === 'l' ? 'foot_r' : 'foot_l';
  p.weak_share = bf.length ? 100 * bf.filter(x => x.part === weak).length / bf.length : null;
  p.parts = {}; for (const x of contacts) if (x.part) p.parts[x.part] = (p.parts[x.part] || 0) + 1;
  // 공 높이: 닿음 사이 가장 높은 점(키 비율)의 평균과 고르기
  const apex = [];
  for (let k = 1; k < best.length; k++) { const s = hgt.slice(best[k - 1].i, best[k].i).filter(isNum); if (s.length) apex.push(Math.max(...s)); }
  p.apex = apex.length ? mean(apex) : null;
  p.apex_cv = apex.length >= 2 ? 100 * std(apex) / mean(apex) : null;
  if (p.apex == null) why.apex = why.apex_cv = '두 번 이상 이어져야 함';
  if (!best.length) { why.best = '공을 차올린 순간을 찾지 못함'; }
  p.dur = best.length >= 2 ? best[best.length - 1].t - best[0].t : null;
  p.rate = p.dur ? (best.length - 1) / p.dur : null;
  return { p, contacts, drops, best, t0: best[0]?.t ?? null, t1: best[best.length - 1]?.t ?? null };
}
