// 자세 코칭: 공에 닿는 순간의 몸 모양을 본다. 코칭 탭 맨 앞 "🧍 자세" 칸.
// 근거 원칙: 숫자 기준은 연구로 확인한 것만(차기 디딤발·디딤 무릎: docs/lesson/02-shot.md R6~R8).
// 연구 숫자가 없는 것은 지도 원칙(정성)의 방향만 쓰고, 문턱은 "누가 봐도 그렇다" 싶은 넉넉한 값으로 둔다(why 에 밝힘).
// 2D 영상의 한계: 무릎·상체 앞뒤·발등 각도는 옆(또는 비스듬히)에서 찍었을 때만 본다.
//  - 공 다루기(터치마다): 디딤 다리 무릎이 쭉 펴졌나, 상체가 공보다 뒤로 빠졌나
//  - 리프팅(발 닿음마다): 발등이 평평한가(발끝이 많이 떨어지면 공이 앞으로 튐)
//  - 차기: 동작별 코칭(coach.js, 연구 기준)의 자세 항목을 그대로 끌어올림

import { isNum, median, deg } from './util.js';
import { J } from './measure.js';

const FOOT = { l: '왼발', r: '오른발' };
const KICK_POSE = /디딤|젖혀|마무리|다리를 멈춰/;

const near = (ts, t) => { let lo = 0, hi = ts.length - 1; while (hi - lo > 1) { const k = (lo + hi) >> 1; if (ts[k] <= t) lo = k; else hi = k; } return Math.abs(ts[hi] - t) < Math.abs(ts[lo] - t) ? hi : lo; };

// 몸이 향한 방향(화면 가로 부호): 발끝이 발뒤꿈치보다 어느 쪽에 있나(두 발 중앙값). 옆에서 찍을 때만 믿을 만함
function facing(c, i0, i1) {
  const v = [];
  for (let i = i0; i < i1; i++) for (const [h, t] of [[J.heelL, J.toeL], [J.heelR, J.toeR]]) { const a = c.joints[h][i], b = c.joints[t][i]; if (a && b) v.push(b.x - a.x); }
  const md = median(v); return isNum(md) && Math.abs(md) > 1 ? Math.sign(md) : 0;
}

export function postureCoach(c, m, { marks = [], segs = [], view = 'unknown', cfg = {} }) {
  const items = [];
  const side = view === 'side' || view === 'diag';
  const pc = cfg.posture || {};
  const touchI = marks.filter(x => x.foot).map(x => ({ ...x, i: near(m.ts, x.t) }));
  const juggle = segs.filter(s => s.motion === 'juggle');
  const inJuggle = t => juggle.some(s => t >= s.t0 - 0.2 && t <= s.t1 + 0.2);

  // ── 공 다루기: 디딤 다리 무릎(공에 안 닿은 발 쪽), 터치 순간 중앙값
  if (side && touchI.length >= 6) {
    const k = touchI.filter(x => !inJuggle(x.t)).map(x => ({ t: x.t, v: m['knee_flex_' + (x.foot === 'l' ? 'r' : 'l')][x.i] })).filter(x => isNum(x.v));
    if (k.length >= 5) {
      const md = median(k.map(x => x.v)), worst = k.reduce((a, b) => (b.v < a.v ? b : a));
      if (md < (pc.stand_knee_locked ?? 10)) items.push({ ok: false, sev: 2.5, title: '디딤 다리가 쭉 펴져 있어요', text: `공을 칠 때 서 있는 다리 무릎이 ${Math.floor(md)}°밖에 안 굽어 있어요(거의 편 다리). 무릎을 살짝 굽혀야 다음 터치로 바로 움직이고 균형도 잡혀요.`, how: ['서 있는 다리 무릎을 "살짝 앉듯" 굽히고 시작', '천천히 10번 하며 무릎이 펴지는지 보기', '익숙해지면 원래 빠르기로'], why: '지도 원칙(굳지 않은 편한 자세, FIFA 훈련 자료) · 10° 미만은 거의 편 다리', t: worst.t });
      else if (md >= 15 && md <= 60) items.push({ ok: true, title: '디딤 무릎을 살짝 굽혀 버텨요', text: `터치할 때 서 있는 다리 무릎 굽힘 약 ${Math.round(md)}°. 다음 동작으로 바로 움직일 수 있는 자세예요.`, why: '지도 원칙(굳지 않은 편한 자세)' });
    }
  }

  // ── 상체 앞뒤: 터치 순간 몸통이 향한 쪽으로 숙였나(+) 뒤로 빠졌나(−). 옆에서 찍을 때만
  if (side && touchI.length >= 6) {
    const i0 = touchI[0].i, i1 = touchI[touchI.length - 1].i + 1, dir = facing(c, i0, i1);
    if (dir) {
      const v = touchI.map(x => ({ t: x.t, v: m.trunk_ang[x.i] })).filter(x => isNum(x.v) && Math.abs(x.v) <= 45).map(x => ({ t: x.t, v: x.v * dir }));
      if (v.length >= 5) {
        const md = median(v.map(x => x.v)), worst = v.reduce((a, b) => (b.v < a.v ? b : a));
        if (md < -(pc.trunk_back ?? 8)) items.push({ ok: false, sev: 2.2, title: '상체가 뒤로 빠져요', text: `공을 칠 때 몸통이 약 ${Math.abs(Math.round(md))}° 뒤로 기울어 있어요. 몸이 공보다 뒤에 있으면 공을 쫓아가게 되고 터치가 커져요. 가슴을 공 쪽으로 살짝 숙이세요.`, how: ['코가 무릎 위에 오도록 살짝 숙이기', '공을 발 바로 앞에 두고 천천히 10번', '숙인 자세를 지키며 빠르기 올리기'], why: '지도 원칙(몸을 공 위에) · 옆에서 찍은 몸통 각도', t: worst.t });
        else if (md >= 0 && md <= 25) items.push({ ok: true, title: '상체를 공 위에 두고 있어요', text: `몸통이 공 쪽으로 약 ${Math.round(md)}° 숙어 있어요. 공을 몸 가까이 두기 좋은 자세예요.`, why: '지도 원칙(몸을 공 위에)' });
      }
    }
  }

  // ── 리프팅: 발이 공에 닿는 순간 발등 각도(발뒤꿈치→발끝 선이 아래로 떨어진 정도). 옆에서 찍을 때만
  if (side && juggle.length) {
    const v = [];
    for (const x of touchI.filter(x => inJuggle(x.t))) {
      const h = c.joints[x.foot === 'l' ? J.heelL : J.heelR][x.i], t = c.joints[x.foot === 'l' ? J.toeL : J.toeR][x.i];
      if (h && t && Math.abs(t.x - h.x) + Math.abs(t.y - h.y) > 3) v.push({ t: x.t, foot: x.foot, v: deg(Math.atan2(t.y - h.y, Math.abs(t.x - h.x))) }); // 발끝이 아래 = +
    }
    if (v.length >= 4) {
      const md = median(v.map(x => x.v)), worst = v.reduce((a, b) => (b.v > a.v ? b : a));
      if (md > (pc.juggle_toe_down ?? 35)) items.push({ ok: false, sev: 2.4, title: '발끝이 아래로 떨어져요', text: `공에 닿을 때 발등이 약 ${Math.round(md)}° 아래로 기울어 있어요. 발등이 기울면 공이 몸 앞쪽으로 튀어 나가요. 발목을 고정하고 발등을 평평하게(발끝을 살짝 들어) 맞혀 보세요.`, how: ['공 없이 발끝을 살짝 들어 발목 고정 10번', '한 번 차고 손으로 잡기(발등이 평평한지 확인)', '두 번, 세 번으로 늘리기'], why: '지도 원칙(발목 고정, 발등 평평) · 옆에서 찍은 발 각도', t: worst.t });
      else if (md <= 20) items.push({ ok: true, title: '발등을 평평하게 맞혀요', text: `공에 닿을 때 발등 기울기 약 ${Math.round(Math.max(0, md))}°. 공이 위로 곧게 올라가는 자세예요.`, why: '지도 원칙(발목 고정)' });
    }
  }

  // ── 차기: 연구 기준 자세 항목(디딤발 위치·디딤 무릎·몸 젖힘·마무리)을 끌어올림
  for (const s of segs.filter(x => x.motion === 'pass' || x.motion === 'shot')) {
    const ko = s.motion === 'shot' ? '슈팅' : '패스';
    for (const f of s.coach?.fixes || []) if (KICK_POSE.test(f.title)) items.push({ ok: false, sev: (f.sev || 2) + 0.5, title: `${ko}: ${f.title}`, text: f.text, why: f.why, t: f.t ?? s.marks?.[0]?.t, how: f.how });
    for (const g of s.coach?.good || []) if (KICK_POSE.test(g.title)) items.push({ ok: true, title: `${ko}: ${g.title}`, text: g.text, why: g.why });
  }

  // 같은 제목은 하나만, 고칠 점 먼저(심한 순), 칭찬은 2개까지
  const seen = new Set(), out = [];
  for (const x of items) { if (seen.has(x.title)) continue; seen.add(x.title); out.push(x); }
  const fixes = out.filter(x => !x.ok).sort((a, b) => b.sev - a.sev).slice(0, 3), good = out.filter(x => x.ok).slice(0, 2);
  const checked = side || segs.some(x => x.motion === 'pass' || x.motion === 'shot');
  return { fixes, good, side, checked, hint: side ? null : '무릎·상체·발등 자세는 옆(또는 비스듬히)에서 찍어야 잴 수 있어요. 다음엔 몸 옆쪽 3~4m에서 찍어 보세요.' };
}
