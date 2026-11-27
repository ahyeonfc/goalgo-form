// 공만으로 코칭: 몸이 화면에 안 나와도(다리 사이 공 터치를 다리·공만 찍은 영상) 공 움직임으로 코칭한다.
// 크기는 공 지름(22cm). 터치 = 공의 좌우 이동 방향이 바뀐 순간. 발은 몰라도 "왼쪽으로 보낼 때·오른쪽으로 보낼 때"로 비교한다.
// 근거는 같은 영상 안 비교와 지난 기록뿐이다.

import { isNum, mean, median, std, percentile } from './util.js';

const pct = v => `${Math.round(v)}%`;
const DIR = { L: '왼쪽으로 보낼 때', R: '오른쪽으로 보낼 때' };

export function ballOnlyCoach(c, cfg, { history = [] } = {}) {
  const { ts, ball } = c, n = ts.length;
  const good = [], fixes = [], facts = [];
  // 공 지름(px)의 중앙값으로 단위를 맞춘다
  const rs = ball.filter(Boolean).map(b => b.r).filter(r => isNum(r) && r > 2);
  const D = 2 * (median(rs) || 0);
  if (!D || ball.filter(Boolean).length < Math.max(15, n * 0.4)) return null;
  // 좌우 위치(공 지름 단위)를 살짝 다듬기(앞뒤 1장면 평균)
  const x = ball.map(b => (b ? b.x / D : null)), y = ball.map(b => (b ? b.y / D : null));
  const xs = x.map((v, i) => { const w = [x[i - 1], v, x[i + 1]].filter(isNum); return w.length ? mean(w) : null; });
  // 터치: 좌우 이동 방향이 바뀌는 순간. 바뀌기 전후로 공 지름의 bo_min_swing 배 넘게 움직였을 때만
  const ext = []; // 방향이 바뀐 점(극값)
  let dir = 0, last = null;
  for (let i = 1; i < n; i++) {
    if (!isNum(xs[i]) || !isNum(xs[i - 1])) continue;
    const d = xs[i] - xs[i - 1];
    if (Math.abs(d) < 0.02) continue;
    const s = Math.sign(d);
    if (dir && s !== dir && last != null) ext.push(last);
    dir = s; last = i;
  }
  // 실제로 공이 오간 크기가 충분한 극값만
  const touches = [];
  for (let k = 0; k < ext.length; k++) {
    const i = ext[k], prev = touches.length ? touches[touches.length - 1].i : null;
    if (prev != null && Math.abs(xs[i] - xs[prev]) < cfg.bo_min_swing) continue;
    // 다음에 공이 어느 쪽으로 가나: 오른쪽(+)으로 가면 "오른쪽으로 보냄"
    const nx = ext[k + 1] != null ? xs[ext[k + 1]] : null;
    const to = isNum(nx) ? (nx > xs[i] ? 'R' : 'L') : null;
    // 꺾이는 순간을 장면 사이까지: 앞뒤 2장면 위치로 두 직선을 맞춰 만나는 시각(공은 터치 사이 거의 곧게 움직임)
    let t = ts[i];
    const a0 = i - 2, a1 = i - 1, b0 = i + 1, b1 = i + 2;
    if (a0 >= 0 && b1 < n && [a0, a1, b0, b1].every(j => isNum(x[j]))) {
      const va = (x[a1] - x[a0]) / (ts[a1] - ts[a0]), vb = (x[b1] - x[b0]) / (ts[b1] - ts[b0]);
      if (Math.sign(va) !== Math.sign(vb) && Math.abs(va - vb) > 1e-6) {
        const tc = (x[b0] - x[a1] + va * ts[a1] - vb * ts[b0]) / (va - vb);
        if (tc > ts[a1] - 1e-6 && tc < ts[b0] + 1e-6) t = tc;
      }
    }
    touches.push({ i, t, to });
  }
  if (touches.length < 6) return null;
  const t0 = touches[0].t, t1 = touches[touches.length - 1].t, dur = t1 - t0;
  const gaps = touches.slice(1).map((x2, k) => x2.t - touches[k].t);
  const p = { touches: touches.length, dur, rate: 1 / median(gaps), tempo_cv: 100 * std(gaps) / mean(gaps) };
  // 앞·뒤 절반
  const mid = (t0 + t1) / 2, A = touches.filter(q => q.t <= mid), B = touches.filter(q => q.t > mid);
  const rate = s => (s.length >= 3 ? (s.length - 1) / (s[s.length - 1].t - s[0].t || 1) : null);
  p.rate_a = rate(A); p.rate_b = rate(B);
  // 방향별: 다음 터치까지 걸린 시간, 공이 간 거리(공 지름 단위)
  const by = { L: { g: [], w: [] }, R: { g: [], w: [] } };
  for (let k = 0; k + 1 < touches.length; k++) { const q = touches[k]; if (!q.to) continue; by[q.to].g.push(touches[k + 1].t - q.t); by[q.to].w.push(Math.abs(xs[touches[k + 1].i] - xs[q.i])); }
  p.swing = median(touches.slice(1).map((q, k) => Math.abs(xs[q.i] - xs[touches[k].i])));
  // 공이 앞뒤로 밀려남: 처음 1/4 와 마지막 1/4 의 세로 위치 차이(공 지름 단위)
  const ys = touches.map(q => y[q.i]).filter(isNum), qn = Math.max(2, Math.floor(ys.length / 4));
  if (ys.length >= 8) p.drift = Math.abs(mean(ys.slice(-qn)) - mean(ys.slice(0, qn)));

  facts.push({ k: '훈련 시간', v: `${dur.toFixed(1)}초` }, { k: '공 터치', v: `${p.touches}번` }, { k: '박자', v: `초당 ${p.rate.toFixed(1)}번` });
  if (isNum(p.swing)) facts.push({ k: '공이 오간 폭', v: `${(p.swing * 22).toFixed(0)}cm` });

  // ── 코칭
  if (p.tempo_cv <= 20) good.push({ title: '박자가 일정해요', text: `터치 간격 흔들림 ${pct(p.tempo_cv)}.`, game: '공이 늘 같은 자리에 있어요. 터치 사이에 고개를 들어 주변을 보는 연습을 더해 보세요.' });
  else if (p.tempo_cv >= 40) fixes.push({ sev: (p.tempo_cv - 40) / 15 + 1.5, title: '박자가 들쭉날쭉해요', text: `터치 간격 흔들림이 ${pct(p.tempo_cv)}예요. 속도를 조금 낮추더라도 "하나, 둘" 일정한 박자로 해 보세요.`, why: '같은 영상 안 터치 간격', drill: 'rhythm' });
  const gL = median(by.L.g), gR = median(by.R.g);
  if (isNum(gL) && isNum(gR) && by.L.g.length >= 4 && by.R.g.length >= 4) {
    const r = Math.max(gL, gR) / Math.min(gL, gR);
    if (r >= 1.2 && Math.abs(gL - gR) >= 0.08) { const slow = gL > gR ? 'L' : 'R'; fixes.push({ sev: (r - 1) * 8, title: `${DIR[slow]} 늦어요`, text: `${DIR[slow]} 다음 터치까지 ${Math.abs(gL - gR).toFixed(2)}초 더 걸려요(${Math.round((r - 1) * 100)}% 느림). 그 방향으로 미는 발이 약한 쪽이에요. 그 발만 10번씩 먼저 연습해 보세요.`, why: '같은 영상 안 왼쪽·오른쪽 비교', t: touches.find(q => q.to === slow)?.t, drill: 'weak' }); }
    else if (r < 1.1) good.push({ title: '양쪽 박자가 고르게 맞아요', text: `왼쪽·오른쪽으로 보낼 때 박자 차이가 ${Math.abs(gL - gR).toFixed(2)}초뿐이에요.`, game: '양발을 고르게 쓰면 수비가 방향을 읽기 어려워요.' });
  }
  const wL = median(by.L.w), wR = median(by.R.w);
  if (isNum(wL) && isNum(wR) && by.L.w.length >= 4 && by.R.w.length >= 4) {
    const r = Math.max(wL, wR) / Math.min(wL, wR);
    if (r >= 1.35) { const big = wL > wR ? 'L' : 'R'; fixes.push({ sev: (r - 1) * 5, title: `${DIR[big]} 공을 세게 밀어요`, text: `${DIR[big]} 공이 반대쪽보다 ${Math.round((r - 1) * 100)}% 더 멀리 가요. 그 방향으로 미는 발은 힘을 빼고 더 살짝 밀어 보세요.`, why: '같은 영상 안 왼쪽·오른쪽 비교', drill: 'touch' }); }
  }
  if (isNum(p.rate_a) && isNum(p.rate_b) && dur >= 8) {
    if (p.rate_b < p.rate_a * 0.85) fixes.push({ sev: (1 - p.rate_b / p.rate_a) * 10, title: '뒤로 갈수록 느려져요', text: `앞 절반 초당 ${p.rate_a.toFixed(1)}번 → 뒤 절반 ${p.rate_b.toFixed(1)}번(${Math.round((1 - p.rate_b / p.rate_a) * 100)}% 느려짐). 힘을 빼고 가볍게, 짧게 끊어 여러 세트로 해 보세요.`, why: '같은 영상 안 앞·뒤 절반', t: mid, drill: 'endure' });
    else if (p.rate_b >= p.rate_a * 0.97) good.push({ title: '끝까지 속도를 지켰어요', text: `앞 절반 ${p.rate_a.toFixed(1)} → 뒤 절반 ${p.rate_b.toFixed(1)}번/초.`, game: '지구력이 좋아요. 다음엔 속도를 조금 올려 같은 시간 버텨 보세요.' });
  }
  if (isNum(p.drift) && p.drift >= 1.5) fixes.push({ sev: p.drift, title: '공이 점점 자리를 벗어나요', text: `처음보다 공이 공 ${p.drift.toFixed(1)}개 크기(약 ${(p.drift * 22).toFixed(0)}cm)만큼 앞뒤로 밀려났어요. 공이 움직이면 몸이 따라가고, 발 안쪽 가운데로 정확히 맞추세요.`, why: '같은 영상 처음·끝 비교', drill: 'touch' });
  // 지난 기록
  const prev = history.map(h => h.general?.p).filter(q => q && isNum(q.rate)).slice(-3);
  if (prev.length) { const pr = mean(prev.map(q => q.rate)); if (p.rate > pr * 1.05) good.push({ title: '지난번보다 빨라졌어요', text: `최근 평균 초당 ${pr.toFixed(1)}번 → 오늘 ${p.rate.toFixed(1)}번.` }); }

  const WHY = {
    weak: { game: '경기에서는 상대가 내 주발 쪽만 막으면 돼요. 약한 발이 빨라지면 양쪽 어디로든 치고 나갈 수 있어요.', how: ['약한 쪽 발로만 10번 천천히', '주발 2번 + 약한 발 1번 섞기', '양쪽 같은 박자로 번갈아'] },
    rhythm: { game: '박자가 일정하면 공이 늘 같은 자리에 있어 다음 동작을 바로 할 수 있어요.', how: ['빠르기를 70%로 낮추고 "하나, 둘" 소리 내며', '박자가 고르면 조금씩 빠르게', '음악 박자에 맞추기'] },
    endure: { game: '경기 후반 지쳤을 때 실수가 나요. 끝까지 같은 속도로 다루는 힘이 막판 볼 컨트롤을 지켜 줘요.', how: ['20초 + 10초 쉬기로 짧게 끊기', '세트마다 같은 횟수 목표', '쉬는 시간을 조금씩 줄이기'] },
    touch: { game: '공이 발에서 멀어지면 수비에게 빼앗기기 쉬워요. 작은 터치가 볼 간수의 기본이에요.', how: ['공을 발 안쪽 가운데로 "톡"', '공이 한 발 길이 안에서만 오가게', '속도를 올려도 폭 유지'] },
  };
  for (const f of fixes) { const w = WHY[f.drill]; if (w) { f.game = w.game; f.how = w.how; } }
  fixes.sort((a, b) => b.sev - a.sev);
  const top = fixes.slice(0, 3);
  const DR = {
    weak: { name: '약한 쪽 발만 30초 × 4세트', text: '늦은 방향으로 미는 발만 천천히, 익숙해지면 번갈아.' },
    rhythm: { name: '박자 맞추기 30초 × 4세트', text: '입으로 "하나, 둘" 세며 같은 간격으로.' },
    endure: { name: '20초 하고 10초 쉬기 × 6세트', text: '짧게 끊어 끝까지 같은 속도로.' },
    touch: { name: '작은 터치 30초 × 4세트', text: '공이 한 발 길이 안에서만 오가게.' },
  };
  const drill = top[0] ? DR[top[0].drill] : { name: '지금 동작 30초 × 4세트', text: '조금 더 빠르게, 같은 박자로. 다시 찍으면 지난번과 비교해 드릴게요.' };
  const plan = top.slice(0, 2).map((f, k) => ({ day: `${k + 1}일째`, title: f.title.replace(/요$/, '요 고치기'), text: `${DR[f.drill].name} — ${DR[f.drill].text}` }));
  if (!plan.length) plan.push({ day: '1일째', title: '빠르기 올리기', text: '지금 박자를 지키며 조금 더 빠르게 30초 × 4세트.' });
  plan.push({ day: `${plan.length + 1}일째`, title: '다시 찍어 비교하기', text: '같은 자리·같은 각도로 다시 찍어 올리면 얼마나 좋아졌는지 보여 드려요.' });
  return { ballOnly: true, span: [+t0.toFixed(3), +t1.toFixed(3)], good: good.slice(0, 2), fixes: top, drill, plan, facts, p, marks: touches.map(q => ({ t: +q.t.toFixed(3), foot: null, kind: q.to })) };
}
