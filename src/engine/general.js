// 동작과 상관없는 전체 코칭: 무슨 동작인지 맞히지 않고, 어떤 훈련 영상에서나 보이는 것으로 코칭한다.
// 근거는 같은 영상 안 비교(왼쪽 대 오른쪽, 앞 절반 대 뒤 절반)와 내 지난 기록뿐이다. 기준 숫자를 지어내지 않는다.
//  - 발: 양발 쓰임(움직인 양·공 터치), 박자 고르기, 뒤로 갈수록 느려짐
//  - 자세: 무릎 굽힘(앞·뒤 절반), 상체 좌우 기울기 치우침, 고개
//  - 공(보일 때): 공이 몸에서 떨어지는 거리, 발별 차이

import { isNum, mean, median, percentile, std, idxRange } from './util.js';
import { tapTouches } from '../motions/mastery.js';
import { juggleEvents } from '../motions/juggle.js';

const FOOT = { l: '왼발', r: '오른발' };
const pct = v => `${Math.round(v)}%`;

// 활동 구간: 발이 움직이거나 공이 발 가까이 있는 장면의 처음~끝
function activeSpan(m, cfg) {
  const act = m.ts.map((t, i) => {
    const fv = Math.max(m.foot_v_l[i] ?? 0, m.foot_v_r[i] ?? 0);
    return fv > cfg.gen_move_v || (isNum(m.foot_ball_d[i]) && m.foot_ball_d[i] < 0.25);
  });
  const a = act.indexOf(true), b = act.lastIndexOf(true);
  return a < 0 ? null : [a, b + 1];
}

// 터치 모으기: 공 움직임이 바뀐 터치 + 공 위 터치(토 탭 모양) + 공중에서 다시 차올린 닿음(리프팅). 0.12초 안 겹치면 하나로
function allTouches(c, m, ev, cfg) {
  const jg = juggleEvents(c, m, cfg).contacts.map(x => ({ t: x.t, foot: x.part === 'foot_l' ? 'l' : x.part === 'foot_r' ? 'r' : null }));
  const t = [...ev.touches.map(x => ({ t: x.t, foot: x.foot })), ...tapTouches(m, cfg).map(x => ({ t: x.t, foot: x.foot })), ...jg].sort((a, b) => a.t - b.t);
  const out = [];
  for (const x of t) { const p = out[out.length - 1]; if (p && x.t - p.t < 0.12) continue; out.push(x); }
  return out;
}

export function generalCoach(c, m, ev, cfg, { fps, history = [], view = 'unknown', bodyCut = false }) {
  const span = activeSpan(m, cfg);
  const good = [], fixes = [], facts = [];
  if (!span) return { span: null, good, fixes, facts, marks: [] };
  const [a, b] = span, t0 = m.ts[a], t1 = m.ts[b - 1], dur = t1 - t0;
  const mid = (t0 + t1) / 2, [, h] = idxRange(m.ts, t0, mid);
  const sl = (arr, i0 = a, i1 = b) => arr.slice(i0, i1);
  const p = { dur };

  // ── 발: 움직인 양(키 단위 이동 거리) 왼·오른
  const move = side => { let s = 0; for (let i = a + 1; i < b; i++) { const v = m['foot_v_' + side][i]; if (isNum(v)) s += v * (m.ts[i] - m.ts[i - 1]); } return s; };
  const ml = move('l'), mr = move('r');
  if (ml + mr > 0.5) p.foot_move_l = 100 * ml / (ml + mr);

  // ── 공 터치
  const marks = allTouches(c, m, ev, cfg).filter(x => x.t >= t0 - 0.1 && x.t <= t1 + 0.1);
  p.touches = marks.length;
  const known = marks.filter(x => x.foot);
  if (known.length >= 6) p.touch_l = 100 * known.filter(x => x.foot === 'l').length / known.length;
  if (marks.length >= 6) {
    const gaps = marks.slice(1).map((x, k) => x.t - marks[k].t).filter(g => g < 2);
    if (gaps.length >= 5) { p.rate = 1 / median(gaps); p.tempo_cv = 100 * std(gaps) / mean(gaps); }
    const A = marks.filter(x => x.t <= mid), B = marks.filter(x => x.t > mid);
    const r = s => (s.length >= 3 ? (s.length - 1) / (s[s.length - 1].t - s[0].t || 1) : null);
    p.rate_a = r(A); p.rate_b = r(B);
  }

  // ── 자세: 무릎 굽힘(두 다리 중 큰 쪽) 앞·뒤 절반, 상체 좌우, 고개
  const knee = i => { const v = [m.knee_flex_l[i], m.knee_flex_r[i]].filter(isNum); return v.length ? Math.max(...v) : null; };
  const kA = [], kB = [];
  for (let i = a; i < b; i++) { const k = knee(i); if (isNum(k)) (i < h ? kA : kB).push(k); }
  if (kA.length >= 10 && kB.length >= 10) { p.knee_a = median(kA); p.knee_b = median(kB); }
  // 상체 좌우는 정면·뒤에서 찍었을 때만(옆에서 찍으면 앞뒤 기울기라 좌우 판단에 못 씀). 45° 넘는 장면(공 줍기·자세 오인식)은 뺀다
  const tr = sl(m.trunk_ang).filter(v => isNum(v) && Math.abs(v) <= 45);
  if ((view === 'front' || view === 'back') && tr.length >= 20) { p.lean_r = Math.max(0, percentile(tr, 90)); p.lean_l = Math.max(0, -percentile(tr, 10)); }
  const hd = sl(m.head_drop).filter(isNum);
  // 몸 일부가 화면 밖(공 크기로 다시 잰 영상)이면 머리 위치를 지어냈을 수 있어 고개는 보지 않는다
  if (hd.length >= 20 && !bodyCut) { const base = percentile(m.head_drop.filter(isNum), 10); p.head_up = 100 * hd.filter(v => v < base + cfg.head_up_drop).length / hd.length; }

  // ── 공 거리: 공이 보일 때 가까운 발끝과의 거리(키 비율), 발별(터치한 발 기준 다음 터치까지 가장 먼 거리)
  const bd = sl(m.foot_ball_d).filter(isNum);
  if (bd.length >= 20) p.ball_near = median(bd);
  const push = { l: [], r: [] };
  for (let k = 0; k + 1 < marks.length; k++) { const x = marks[k]; if (!push[x.foot]) continue; const [i0, i1] = idxRange(m.ts, x.t, marks[k + 1].t); const d = m.body_ball_d.slice(i0, i1).filter(isNum); if (d.length) push[x.foot].push(Math.max(...d)); }
  p.push_l = push.l.length >= 3 ? mean(push.l) : null; p.push_r = push.r.length >= 3 ? mean(push.r) : null;

  // ── 사실 줄
  facts.push({ k: '훈련 시간', v: `${dur.toFixed(1)}초` });
  if (p.touches) facts.push({ k: '공 터치', v: `${p.touches}번` });
  if (isNum(p.touch_l)) facts.push({ k: '왼발 터치', v: pct(p.touch_l) });
  else if (isNum(p.foot_move_l)) facts.push({ k: '왼발 움직임', v: pct(p.foot_move_l) });
  if (isNum(p.rate)) facts.push({ k: '박자', v: `초당 ${p.rate.toFixed(1)}번` });

  // ── 코칭: 같은 영상 안 비교만
  // 양발
  const lr = isNum(p.touch_l) ? p.touch_l : p.foot_move_l, basis = isNum(p.touch_l) ? '공 터치' : '발 움직임';
  if (isNum(lr)) {
    if (lr < 30 || lr > 70) { const weak = lr < 50 ? 'l' : 'r'; fixes.push({ sev: Math.abs(lr - 50) / 10, title: `${FOOT[weak === 'l' ? 'r' : 'l']}만 주로 써요`, text: `${basis} 중 왼발 ${pct(lr)} · 오른발 ${pct(100 - lr)}예요. ${FOOT[weak]}도 같은 동작을 해 보세요. 처음엔 ${FOOT[weak]} 두 번에 반대 발 한 번처럼 섞으면 쉬워요.`, why: '같은 영상 안 왼발·오른발 비교', drill: 'weak' }); }
    else if (lr >= 40 && lr <= 60) good.push({ title: '양발을 고르게 써요', text: `${basis} 왼발 ${pct(lr)} · 오른발 ${pct(100 - lr)}.` });
  }
  // 박자
  if (isNum(p.tempo_cv)) {
    if (p.tempo_cv <= 20) good.push({ title: '박자가 일정해요', text: `터치 간격 흔들림 ${pct(p.tempo_cv)}.` });
    else if (p.tempo_cv >= 45) fixes.push({ sev: (p.tempo_cv - 45) / 15 + 1.5, title: '박자가 들쭉날쭉해요', text: `터치 간격 흔들림이 ${pct(p.tempo_cv)}예요. 속도를 조금 낮추더라도 "하나, 둘" 일정한 박자로 해 보세요.`, why: '같은 영상 안 터치 간격' , drill: 'rhythm' });
  }
  // 지침
  if (isNum(p.rate_a) && isNum(p.rate_b) && dur >= 8) {
    if (p.rate_b < p.rate_a * 0.85) fixes.push({ sev: (1 - p.rate_b / p.rate_a) * 10, title: '뒤로 갈수록 느려져요', text: `앞 절반 초당 ${p.rate_a.toFixed(1)}번 → 뒤 절반 ${p.rate_b.toFixed(1)}번(${Math.round((1 - p.rate_b / p.rate_a) * 100)}% 느려짐). 힘을 빼고 가볍게, 짧게 끊어 여러 세트로 해 보세요.`, why: '같은 영상 안 앞·뒤 절반', t: mid, drill: 'endure' });
    else if (p.rate_b >= p.rate_a * 0.97) good.push({ title: '끝까지 속도를 지켰어요', text: `앞 절반 ${p.rate_a.toFixed(1)} → 뒤 절반 ${p.rate_b.toFixed(1)}번/초.` });
  }
  // 무릎: 뒤로 갈수록 펴짐(자세가 높아짐)
  if (isNum(p.knee_a) && isNum(p.knee_b) && dur >= 8) {
    if (p.knee_a - p.knee_b >= 8) fixes.push({ sev: (p.knee_a - p.knee_b) / 6, title: '뒤로 갈수록 자세가 높아져요', text: `무릎 굽힘이 앞 절반 ${Math.round(p.knee_a)}° → 뒤 절반 ${Math.round(p.knee_b)}°로 펴졌어요. 지치면 무릎이 펴지기 쉬워요. 끝까지 무릎을 살짝 굽힌 낮은 자세를 유지해 보세요.`, why: '같은 영상 안 앞·뒤 절반(무릎 각도는 찍은 각도에 따라 오차가 있어요)', t: mid + (t1 - mid) / 2, drill: 'low' });
    else if (Math.abs(p.knee_a - p.knee_b) < 4 && p.knee_a >= 15) good.push({ title: '자세 높이를 끝까지 지켰어요', text: `무릎 굽힘 앞 ${Math.round(p.knee_a)}° · 뒤 ${Math.round(p.knee_b)}°.` });
  }
  // 상체 한쪽으로 치우침(정면·뒤에서 찍었을 때 의미가 큼)
  if (isNum(p.lean_r) && isNum(p.lean_l)) {
    const big = Math.max(p.lean_r, p.lean_l), small = Math.min(p.lean_r, p.lean_l);
    if (big >= 10 && big <= 40 && big >= small * 1.8 && big - small >= 6) { const side = p.lean_r > p.lean_l ? '오른쪽' : '왼쪽'; fixes.push({ sev: (big - small) / 5, title: `상체가 ${side}으로 더 기울어요`, text: `${side}으로 ${Math.round(big)}°까지 기울 때가 있는데 반대쪽은 ${Math.round(small)}°예요. ${side}으로 움직일 때 상체를 세우고 발을 몸 아래에 두세요.`, why: '같은 영상 안 왼쪽·오른쪽 비교', drill: 'balance' }); }
  }
  // 공이 한쪽 발에서 더 멀어짐
  if (isNum(p.push_l) && isNum(p.push_r)) {
    const r = Math.max(p.push_l, p.push_r) / Math.max(0.01, Math.min(p.push_l, p.push_r));
    if (r >= 1.4) { const big = p.push_l > p.push_r ? 'l' : 'r'; fixes.push({ sev: (r - 1) * 5, title: `${FOOT[big]} 터치가 커요`, text: `${FOOT[big]}로 친 공이 반대 발보다 ${Math.round((r - 1) * 100)}% 멀리 나가요. ${FOOT[big]}은 더 살짝, 공을 발 가까이 두세요.`, why: '같은 영상 안 왼발·오른발 비교', t: marks.find(x => x.foot === big)?.t, drill: 'touch' }); }
  }
  // 고개(참고)
  if (isNum(p.head_up) && p.head_up < 25 && p.touches >= 6) fixes.push({ sev: 1.2, title: '공만 보고 있어요', text: `고개 든 시간이 ${pct(p.head_up)}예요. 익숙해지면 한 번씩 고개를 들어 앞을 보세요.`, why: '고개 방향(시선은 모름)', drill: 'head' });
  else if (isNum(p.head_up) && p.head_up >= 60 && p.touches >= 6) good.push({ title: '고개를 잘 들고 해요', text: `고개 든 시간 ${pct(p.head_up)}.` });

  // 지난 기록과 비교(같은 숫자가 있으면)
  const prev = history.map(hh => hh.general?.p).filter(Boolean).slice(-3);
  if (prev.length && isNum(p.rate)) { const pr = mean(prev.map(x => x.rate).filter(isNum)); if (isNum(pr) && p.rate > pr * 1.05) good.push({ title: '지난번보다 빨라졌어요', text: `최근 평균 초당 ${pr.toFixed(1)}번 → 오늘 ${p.rate.toFixed(1)}번.` }); }

  // 축구를 잘하기 위한 코칭: 고칠 점마다 경기에서 왜 중요한지 + 고치는 순서, 잘한 점은 경기에서 써먹는 법(일반적인 지도 원칙, 숫자 기준 아님)
  const WHY = {
    weak: { game: '경기에서는 상대가 내 주발 쪽만 막으면 돼요. 양발을 쓰면 수비가 방향을 읽기 어렵고, 공을 받는 각도도 두 배로 넓어져요.', how: ['약한 발로 같은 동작을 천천히 10번', '주발 2번 + 약한 발 1번 섞기', '양발 번갈아 같은 박자로'] },
    rhythm: { game: '박자가 일정하면 공이 늘 같은 자리에 있어 다음 동작(패스·돌파)을 바로 할 수 있어요. 들쭉날쭉하면 공을 맞추느라 고개를 못 들어요.', how: ['빠르기를 70%로 낮추고 "하나, 둘" 소리 내며', '박자가 고르면 조금씩 빠르게', '음악이나 메트로놈 박자에 맞추기'] },
    endure: { game: '축구는 지친 후반에 실수가 나요. 끝까지 같은 속도로 공을 다루는 힘이 경기 막판 볼 컨트롤을 지켜 줘요.', how: ['20초 + 10초 쉬기로 짧게 끊기', '세트마다 같은 횟수 목표', '쉬는 시간을 조금씩 줄이기'] },
    low: { game: '무릎을 살짝 굽힌 낮은 자세여야 몸싸움에서 밀리지 않고, 방향을 바로 바꿀 수 있어요. 지쳐서 자세가 높아지면 첫 발이 늦어져요.', how: ['시작 전 무릎을 살짝 굽혀 자세 잡기', '동작 중 엉덩이 높이를 일정하게', '지칠 때일수록 자세 높이를 의식하기'] },
    balance: { game: '한쪽으로 기우는 습관이 있으면 그쪽으로 돌 때 균형을 잃고, 수비가 그 타이밍을 노려요.', how: ['기우는 쪽 방향으로만 천천히 10번', '상체를 세우고 발이 몸 아래에 오게', '양쪽을 번갈아 같은 속도로'] },
    touch: { game: '터치가 크면 공이 몸에서 멀어져 수비에게 빼앗기기 쉬워요. 작은 터치가 볼 간수의 기본이에요.', how: ['큰 쪽 발로 공을 "톡" 밀어 한 발 길이 안에', '터치 후 바로 공 옆에 발 두기', '속도를 올려도 공 거리 유지'] },
    head: { game: '고개를 들어야 동료·빈 공간·수비를 봐요. 공만 보면 좋은 패스 기회를 놓쳐요.', how: ['3번 터치마다 한 번 고개 들기', '앞에 물건을 두고 터치하며 이름 말하기', '고개를 든 채로 박자 유지'] },
  };
  for (const f of fixes) { const w = WHY[f.drill]; if (w) { f.game = w.game; f.how = w.how; } }
  const USE = {
    '양발을 고르게 써요': '경기에서 양쪽 어디로든 공을 몰 수 있어요. 수비가 막는 반대쪽으로 바로 치고 나가 보세요.',
    '박자가 일정해요': '공이 늘 같은 자리에 있어요. 터치 사이에 고개를 들어 주변을 보는 연습을 더해 보세요.',
    '끝까지 속도를 지켰어요': '지구력이 좋아요. 다음엔 속도를 조금 올려 같은 시간 버텨 보세요.',
    '자세 높이를 끝까지 지켰어요': '낮은 자세가 몸에 뱄어요. 몸싸움과 방향 전환에서 강해져요.',
    '고개를 잘 들고 해요': '시야를 넓게 쓰는 습관이에요. 경기에서 패스 길이 더 잘 보여요.',
  };
  for (const g of good) if (USE[g.title]) g.game = USE[g.title];

  fixes.sort((x, y) => y.sev - x.sev);
  const top = fixes.slice(0, 3);
  const DR = {
    weak: { name: '약한 발만 1분 × 3세트', text: '오늘 한 동작을 약한 발로만 천천히. 익숙해지면 양발 번갈아.' },
    rhythm: { name: '박자 맞추기 30초 × 4세트', text: '입으로 "하나, 둘" 세며 같은 간격으로. 빠르기보다 고른 박자가 먼저예요.' },
    endure: { name: '20초 하고 10초 쉬기 × 6세트', text: '짧게 끊어 끝까지 같은 속도로. 세트마다 힘 빼기만 생각하기.' },
    low: { name: '낮은 자세로 1분 × 3세트', text: '무릎을 살짝 굽힌 채 시작하고, 끝날 때까지 그 높이를 지키기.' },
    balance: { name: '한쪽 방향 천천히 10번씩', text: '기우는 쪽으로 움직일 때 상체를 세우는 데만 집중.' },
    touch: { name: '작은 터치 1분 × 3세트', text: '큰 쪽 발로 공을 "톡" 밀어 한 발 길이 안에 두기.' },
    head: { name: '고개 들기 연습 1분 × 3세트', text: '3번 터치마다 한 번 고개를 들어 앞의 물건 하나를 보기.' },
  };
  const drill = top[0]?.drill ? DR[top[0].drill] : { name: '오늘 한 동작 1분 × 3세트', text: '같은 자리·같은 각도로 다시 찍으면 지난번과 비교해 드릴게요.' };
  // 이번 주 훈련 계획(3일, 하루 15~20분): 고칠 점 순서대로, 마지막 날은 같은 각도로 다시 찍어 비교
  const plan = [];
  top.slice(0, 2).forEach((f, k) => { const d = DR[f.drill]; if (d) plan.push({ day: `${k + 1}일째`, title: f.title.replace(/요$/, '요 고치기'), text: `${d.name} — ${d.text}` }); });
  if (!plan.length) plan.push({ day: '1일째', title: '지금 동작 다듬기', text: '오늘 한 동작을 조금 더 빠르게, 같은 박자로 1분 × 3세트.' }, { day: '2일째', title: '약한 쪽 키우기', text: '약한 발·약한 방향으로만 1분 × 3세트.' });
  plan.push({ day: `${plan.length + 1}일째`, title: '다시 찍어 비교하기', text: '같은 자리·같은 각도로 다시 찍어 올리면 얼마나 좋아졌는지 보여 드려요.' });
  return { span: [+t0.toFixed(3), +t1.toFixed(3)], good: good.slice(0, 2), fixes: top, drill, plan, facts, p, marks: marks.map(x => ({ t: +x.t.toFixed(3), foot: x.foot })) };
}
