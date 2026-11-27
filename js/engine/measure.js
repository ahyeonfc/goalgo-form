// ① 기본 측정값 (lesson-criteria.md ① 표). 장면마다 계산한다.
// 길이는 "키 비율"(그 장면의 화면 속 키 H 로 나눔). 각도는 화면 평면 각도(°).

import { isNum, mid, dist, angleAt, deg, rolling, median, percentile, deriv } from './util.js';

export const J = {
  nose: 0, eyeL: 2, eyeR: 5, earL: 7, earR: 8, shL: 11, shR: 12, wrL: 15, wrR: 16,
  hipL: 23, hipR: 24, kneeL: 25, kneeR: 26, ankL: 27, ankR: 28, heelL: 29, heelR: 30, toeL: 31, toeR: 32,
};

// 인체 비율(키 H 대비 높이). Drillis·Contini 1966, Winter 『Biomechanics and Motor Control of Human Movement』 그림 4.1.
// 어깨 0.818H, 엉덩이(대전자) 0.530H, 눈 0.936H, 발목 0.039H.
export const BODY = { torso: 0.818 - 0.530, eyeToAnkle: 0.936 - 0.039 };

export function measure(c, cfg) {
  const { ts, joints, ball } = c, n = ts.length, P = j => joints[j];
  const hipC = [], shC = [], torsoPx = [], eyeAnk = [], footLow = [];
  for (let i = 0; i < n; i++) {
    const h = mid(P(J.hipL)[i], P(J.hipR)[i]), s = mid(P(J.shL)[i], P(J.shR)[i]);
    hipC.push(h); shC.push(s);
    torsoPx.push(h && s ? dist(h, s) : null);
    const eye = mid(P(J.eyeL)[i], P(J.eyeR)[i]) || P(J.eyeL)[i] || P(J.eyeR)[i];
    const ank = [P(J.ankL)[i], P(J.ankR)[i]].filter(Boolean);
    eyeAnk.push(eye && ank.length ? Math.max(...ank.map(a => a.y)) - eye.y : null);
    const feet = [J.heelL, J.heelR, J.toeL, J.toeR, J.ankL, J.ankR].map(j => P(j)[i]).filter(Boolean);
    footLow.push(feet.length ? Math.max(...feet.map(p => p.y)) : null);
  }
  // 장면별 화면 속 키(px): 몸통 길이 ÷ 0.288 의 0.5초 중앙값. 카메라에서 멀어지면 작아지므로 장면마다 둔다.
  const Hpx = rolling(ts, torsoPx.map(v => isNum(v) ? v / BODY.torso : null), 0.5, median);
  // 바닥 높이(화면 y): 발 가장 낮은 점의 0.6초 창 최대값(달릴 때 발이 떠도 바닥을 잃지 않게)
  const ground = rolling(ts, footLow, 0.6, a => { const b = a.filter(isNum); return b.length ? Math.max(...b) : null; });

  const m = {
    ts, Hpx, ground, hipC, shC,
    trunk_ang: [], shoulder_tilt: [], knee_flex_l: [], knee_flex_r: [], hip_flex_l: [], hip_flex_r: [],
    com_h: [], head_drop: [], arm_span: [], sh_width: [],
    foot_l: [], foot_r: [], foot_h_l: [], foot_h_r: [],
    ball: ball, foot_ball_d: [], foot_ball_side: [], body_ball_d: [],
  };
  for (let i = 0; i < n; i++) {
    const H = Hpx[i], h = hipC[i], s = shC[i];
    // 몸통 기울기: 엉덩이 중심→어깨 중심 선이 수직에서 기운 각(오른쪽 +). 정면이면 좌우(roll), 옆이면 앞뒤(pitch)
    m.trunk_ang.push(h && s ? deg(Math.atan2(s.x - h.x, h.y - s.y)) : null);
    const sl = P(J.shL)[i], sr = P(J.shR)[i];
    m.shoulder_tilt.push(sl && sr ? deg(Math.atan2(sr.y - sl.y, Math.abs(sr.x - sl.x) || 1e-6)) : null);
    m.sh_width.push(sl && sr && H ? Math.abs(sr.x - sl.x) / H : null);
    const flex = (a, b, c) => { const v = angleAt(a, b, c); return v == null ? null : 180 - v; };
    m.knee_flex_l.push(flex(P(J.hipL)[i], P(J.kneeL)[i], P(J.ankL)[i]));
    m.knee_flex_r.push(flex(P(J.hipR)[i], P(J.kneeR)[i], P(J.ankR)[i]));
    m.hip_flex_l.push(flex(P(J.shL)[i], P(J.hipL)[i], P(J.kneeL)[i]));
    m.hip_flex_r.push(flex(P(J.shR)[i], P(J.hipR)[i], P(J.kneeR)[i]));
    m.com_h.push(h && H && isNum(ground[i]) ? (ground[i] - h.y) / H : null);
    // 고개 숙임: 코가 두 귀 중간보다 얼마나 아래인가(키 비율, 클수록 숙임). 뒤에서 찍으면 코가 안 보여 빈칸
    const ear = mid(P(J.earL)[i], P(J.earR)[i]) || P(J.earL)[i] || P(J.earR)[i], nose = P(J.nose)[i];
    m.head_drop.push(ear && nose && H ? (nose.y - ear.y) / H : null);
    const wl = P(J.wrL)[i], wr = P(J.wrR)[i];
    m.arm_span.push(wl && wr && sl && sr ? dist(wl, wr) / (dist(sl, sr) || 1e-6) : null);
    // 발: 발끝(없으면 발목) 위치, 바닥에서 높이(키 비율)
    for (const [side, toe, heel, ank] of [['l', J.toeL, J.heelL, J.ankL], ['r', J.toeR, J.heelR, J.ankR]]) {
      const tp = P(toe)[i] || P(ank)[i];
      m['foot_' + side].push(tp);
      const pts = [P(toe)[i], P(heel)[i]].filter(Boolean);
      m['foot_h_' + side].push(pts.length && H && isNum(ground[i]) ? (ground[i] - Math.max(...pts.map(p => p.y))) / H : null);
    }
    const b = ball[i];
    let fd = null, fs = null;
    if (b && H) {
      for (const side of ['l', 'r']) {
        const f = m['foot_' + side][i]; if (!f) continue;
        const d = dist(f, b) / H; if (fd == null || d < fd) { fd = d; fs = side; }
      }
    }
    m.foot_ball_d.push(fd); m.foot_ball_side.push(fs);
    m.body_ball_d.push(b && h && H ? dist(b, h) / H : null);
  }
  // 속도(키/초): 엉덩이 중심, 발, 공
  const vx = deriv(ts, hipC.map((p, i) => p && Hpx[i] ? p.x / Hpx[i] : null));
  const vy = deriv(ts, hipC.map((p, i) => p && Hpx[i] ? p.y / Hpx[i] : null));
  m.body_vx = vx; m.body_vy = vy;
  m.body_v = vx.map((x, i) => isNum(x) && isNum(vy[i]) ? Math.hypot(x, vy[i]) : null);
  for (const side of ['l', 'r']) {
    const f = m['foot_' + side];
    const fx = deriv(ts, f.map((p, i) => p && Hpx[i] ? p.x / Hpx[i] : null)), fy = deriv(ts, f.map((p, i) => p && Hpx[i] ? p.y / Hpx[i] : null));
    m['foot_v_' + side] = fx.map((x, i) => isNum(x) && isNum(fy[i]) ? Math.hypot(x, fy[i]) : null);
  }
  m.ball_vx = deriv(ts, ball.map((b, i) => b && Hpx[i] ? b.x / Hpx[i] : null));
  m.ball_vy = deriv(ts, ball.map((b, i) => b && Hpx[i] ? b.y / Hpx[i] : null));
  return m;
}

// 찍은 방향: 어깨 폭(키 비율, 화면 가로)으로 옆/정면·뒤/비스듬. 코가 보이면 정면, 아니면 뒤.
// 어깨 너비 실제값은 약 0.259H(Drillis·Contini). 경계 숫자는 첫 판이라 시험으로 맞춘다(기준표 engine).
export function viewOf(m, joints, i0 = 0, i1 = m.ts.length, cfg) {
  const w = percentile(m.sh_width.slice(i0, i1), 50);
  if (w == null) return { view: 'unknown', shW: null };
  const noseSeen = joints[J.nose].slice(i0, i1).filter(Boolean).length / Math.max(1, i1 - i0);
  let view = 'diag';
  if (w >= cfg.view_front_shw) view = noseSeen > 0.5 ? 'front' : 'back';
  else if (w <= cfg.view_side_shw) view = 'side';
  return { view, shW: +w.toFixed(3), noseSeen: +noseSeen.toFixed(2) };
}
