// 차기(패스·슈팅): 임팩트마다 디딤발 위치, 디딤 무릎, 몸통, 공 속도·뜬 각도, 접근 걸음, 마무리.
// 기준값: docs/lesson/02-shot.md ⑤, 04-pass.md ⑤ (연구 값만. 없는 것은 숫자만 보여 줌)

import { isNum, mean, idxRange, deg } from '../engine/util.js';
import { J } from '../engine/measure.js';

export function kickPrims(c, m, ev, imp, ctx) {
  const { heightCm, fps, view } = ctx;
  const i = imp.i, t = imp.t, H = m.Hpx[i], b = m.ball[i];
  const kickFoot = imp.foot, plantFoot = kickFoot === 'l' ? 'r' : 'l';
  const cm = px => isNum(px) && H ? px / H * heightCm : null;
  // 공이 나간 방향(화면 가로 부호)
  const [a1, a2] = idxRange(m.ts, t + 1e-3, t + 0.15);
  const vx = mean(m.ball_vx.slice(a1, a2)), vy = mean(m.ball_vy.slice(a1, a2));
  const dir = isNum(vx) ? Math.sign(vx) || 1 : 1;
  const p = { kickFoot, plantFoot, dir };
  // 공 속도(m/s): 키/초 × 키(m). 30fps 는 낮게 나와 참고
  p.ball_speed = isNum(imp.post) ? imp.post * heightCm / 100 : null;
  p.speed_ok = fps >= 100;
  // 뜬 각도(옆에서): 화면 위쪽이 +
  p.launch = isNum(vx) && isNum(vy) ? deg(Math.atan2(-vy, Math.abs(vx))) : null;
  // 디딤발: 임팩트 순간 디딤발 발목과 공 중심
  const ank = c.joints[plantFoot === 'l' ? J.ankL : J.ankR][i];
  if (ank && b) {
    if (view === 'side' || view === 'diag') p.plant_ap = cm((ank.x - b.x) * dir); // 공보다 뒤 = −
    if (view === 'front' || view === 'back') p.plant_lat = cm(Math.abs(ank.x - b.x));
  }
  // 디딤 무릎(임팩트), 몸통 앞뒤(옆에서: 차는 방향으로 숙이면 +)
  if (view === 'side' || view === 'diag') {
    p.plant_knee = m['knee_flex_' + plantFoot][i];
    const tr = m.trunk_ang[i]; p.trunk = isNum(tr) ? tr * dir : null;
  }
  // 접근 걸음: 임팩트 전 2초 안 걸음(디딤 포함)
  p.steps = ev.steps.filter(s => s.t < t && s.t >= t - 2).length;
  // 마무리: 임팩트 뒤 0.3초 동안 차는 발이 차는 방향으로 키의 15% 넘게 나감
  const f = m['foot_' + kickFoot];
  const [b1, b2] = idxRange(m.ts, t, t + 0.3);
  const after = f.slice(b1, b2).filter(Boolean);
  if (after.length >= 2 && H) p.follow = (after[after.length - 1].x - after[0].x) * dir / H > 0.15;
  // 종류: 공 속도 15m/s 이상이거나 많이 뜨면 슈팅, 아니면 패스(첫 판 경계)
  p.kind = (isNum(p.ball_speed) && p.ball_speed >= 15) || (isNum(p.launch) && p.launch > 20) ? 'shot' : 'pass';
  return p;
}

export function findKicks(c, m, ev, ctx, busy = []) {
  return ev.impacts.filter(x => !busy.some(([a, b]) => x.t >= a && x.t <= b)).map(x => ({ t: x.t, i: x.i, foot: x.foot, ...kickPrims(c, m, ev, x, ctx) }));
}
