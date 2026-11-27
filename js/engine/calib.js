// 보정(lesson-build.md 3절 기본: 콘 없음). 키와 공으로 cm/px 를 잡고 서로 맞는지 본다.
// 콘이 있을 때(바닥 평면 변환)는 다음 판에서 붙인다.

import { isNum, median, idxRange } from './util.js';
import { BODY, J } from './measure.js';

export const BALL_CM = 22; // 5호 공 지름(FIFA 규격 둘레 68~70cm → 약 22cm)

export function calibrate(c, m, heightCm, cfg) {
  const { ts, joints, ball } = c;
  const notes = [];
  // 1) 선 자세 구간: 몸 속도가 stop_v 아래인 장면
  const still = [];
  for (let i = 0; i < ts.length; i++) if (isNum(m.body_v[i]) && m.body_v[i] < cfg.stop_v) still.push(i);
  // 눈~발목 길이 ÷ 0.897 = 화면 속 키(px). 서 있을 때만(무릎이 굽으면 짧아짐)
  const hStand = [];
  for (const i of still) {
    const kl = m.knee_flex_l[i], kr = m.knee_flex_r[i];
    if ((isNum(kl) && kl > 20) || (isNum(kr) && kr > 20)) continue;
    const eye = joints[J.eyeL][i] || joints[J.eyeR][i];
    const ank = [joints[J.ankL][i], joints[J.ankR][i]].filter(Boolean);
    if (!eye || !ank.length) continue;
    hStand.push({ i, px: (Math.max(...ank.map(a => a.y)) - eye.y) / BODY.eyeToAnkle });
  }
  let byHeight = null;
  if (hStand.length >= 3 && heightCm) {
    const px = median(hStand.map(h => h.px)), at = hStand[Math.floor(hStand.length / 2)].i;
    // 같은 장면의 몸통 기준 키와 비교하면 몸통 비율 가정이 맞는지 알 수 있다
    const torsoH = median(hStand.map(h => m.Hpx[h.i]));
    byHeight = { cmPerPx: heightCm / px, standPx: +px.toFixed(1), torsoPx: torsoH && +torsoH.toFixed(1), t: ts[at], n: hStand.length };
    if (torsoH && Math.abs(torsoH / px - 1) > 0.15) notes.push('몸통 길이로 잰 키와 선 자세 키가 15% 넘게 다릅니다(자세 모델 오차 또는 몸이 기울어짐).');
  } else notes.push('가만히 선 장면이 없어 키로 크기를 맞추지 못했습니다. 영상 처음에 1초쯤 서 있으면 더 정확해요.');

  // 2) 공: 공이 거의 멈춘 장면의 지름 → cm/px. 사람 근처(엉덩이에서 키의 1.5배 안)만
  const ballCm = [];
  for (let i = 0; i < ts.length; i++) {
    const b = ball[i]; if (!b || c.ballFilled[i] || !isNum(b.r) || b.r < 3) continue;
    const v = Math.hypot(m.ball_vx[i] ?? 9, m.ball_vy[i] ?? 9);
    if (v > cfg.ball_still) continue;
    if (!isNum(m.body_ball_d[i]) || m.body_ball_d[i] > 1.5) continue;
    ballCm.push({ i, cmPerPx: BALL_CM / (2 * b.r), H: m.Hpx[i] });
  }
  let byBall = null;
  if (ballCm.length >= 3) {
    byBall = { cmPerPx: median(ballCm.map(b => b.cmPerPx)), n: ballCm.length };
    // 공 근처 장면의 키(px) × 공 cm/px = 키 추정(cm). 입력한 키와 비교
    const hEst = median(ballCm.filter(b => isNum(b.H)).map(b => b.H * b.cmPerPx));
    if (hEst) byBall.heightCm = Math.round(hEst);
  }
  let warn = false;
  if (byBall && byBall.heightCm && heightCm) {
    const diff = byBall.heightCm / heightCm - 1;
    byBall.diff = +diff.toFixed(3);
    if (Math.abs(diff) > cfg.calib_tol) { warn = true; notes.push(`공 크기로 잰 키(${byBall.heightCm}cm)가 입력한 키(${heightCm}cm)와 ${Math.round(Math.abs(diff) * 100)}% 다릅니다. 화면 가장자리이거나 공이 사람보다 카메라에 가까울 수 있어요.`); }
  }
  // 장면마다 m/키 환산: 그 장면의 화면 속 키(px)가 입력한 키(cm)에 해당한다고 본다(깊이가 바뀌어도 맞음)
  return { heightCm, byHeight, byBall, warn, notes, mPerH: heightCm ? heightCm / 100 : null };
}

// 구간 길이(초) 안에 장면이 충분한지
export function coverage(ts, t0, t1, fps) {
  const [a, b] = idxRange(ts, t0, t1);
  return (b - a) / Math.max(1, (t1 - t0) * fps);
}
