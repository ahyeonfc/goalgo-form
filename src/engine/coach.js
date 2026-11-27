// 코칭 문장집. 지어낸 조언을 만들지 않는다:
//  ① 같은 영상 안 비교(왼발 대 오른발, 앞 절반 대 뒤 절반, 직선 대 꺾을 때) — 기준 없이도 공정
//  ② 연구 기준(docs/lesson/*.md ⑤ 에 출처가 있는 값만)
//  ③ 내 지난 기록(같은 동작)
// 결과: { good:[{title,text}], fixes:[{title,text,why,t,sev}], drill:{name,text}, tip, facts:[{k,v}] }

import { isNum, mean, median, percentile, idxRange } from './util.js';

export const MOTION_KO = { juggle: '리프팅', toe_tap: '토 탭', pull_push: '당기고 밀기', dribble: '드리블', pass: '패스', shot: '슈팅' };
const FOOT = { l: '왼발', r: '오른발' };
const pct = v => `${Math.round(v)}%`;
const f1 = v => (+v).toFixed(1), f2 = v => (+v).toFixed(2);

// 발별 다음 터치까지 간격(초): "왼발 다음 박자", "오른발 다음 박자"
function gapByFoot(marks) {
  const g = { l: [], r: [] };
  for (let k = 0; k + 1 < marks.length; k++) { const a = marks[k]; if (a.foot && g[a.foot]) g[a.foot].push(marks[k + 1].t - a.t); }
  // 중앙값: 터치 하나를 놓쳐 생긴 긴 간격 하나에 휘둘리지 않게
  return { l: median(g.l), r: median(g.r), nl: g.l.length, nr: g.r.length };
}
// 앞 절반·뒤 절반 빠르기(번/초)
function halves(marks) {
  if (marks.length < 8) return null;
  const mid = (marks[0].t + marks[marks.length - 1].t) / 2;
  const A = marks.filter(x => x.t <= mid), B = marks.filter(x => x.t > mid);
  const rate = s => s.length >= 2 ? (s.length - 1) / (s[s.length - 1].t - s[0].t || 1) : null;
  return { a: rate(A), b: rate(B) };
}
// 터치 뒤 공이 나간 거리(키 비율): 다음 터치까지 공이 몸에서 가장 멀어진 거리, 발별
function pushByFoot(m, marks) {
  const out = { l: [], r: [] };
  for (let k = 0; k + 1 < marks.length; k++) {
    const a = marks[k]; if (!out[a.foot]) continue;
    const [i0, i1] = idxRange(m.ts, a.t, marks[k + 1].t);
    const d = m.body_ball_d.slice(i0, i1).filter(isNum); if (d.length) out[a.foot].push(Math.max(...d));
  }
  return { l: mean(out.l), r: mean(out.r), nl: out.l.length, nr: out.r.length };
}
// 발 드는 높이(키 비율): 같은 발 두 터치 사이 그 발의 가장 높은 점
function liftByFoot(m, marks) {
  const out = { l: [], r: [] };
  for (const side of ['l', 'r']) {
    const mk = marks.filter(x => x.foot === side);
    for (let k = 0; k + 1 < mk.length; k++) { const [i0, i1] = idxRange(m.ts, mk[k].t + 0.05, mk[k + 1].t - 0.05); const h = m['foot_h_' + side].slice(i0, i1).filter(isNum); if (h.length) out[side].push(Math.max(...h)); }
  }
  return { l: median(out.l), r: median(out.r) };
}
// 내 지난 기록 중 같은 동작의 값 평균(최근 3개)
function pastAvg(history, motion, key) {
  const v = [];
  for (const h of history) for (const s of (h.segs || [])) if (s.motion === motion && isNum(s.prims?.[key])) v.push(s.prims[key]);
  const last = v.slice(-3); return last.length ? mean(last) : null;
}
const asym = (a, b) => isNum(a) && isNum(b) && Math.min(a, b) > 0 ? Math.max(a, b) / Math.min(a, b) : null;
const slower = g => g.l > g.r ? 'l' : 'r';

export function coachSeg(s, ctx) {
  const fn = { juggle: coachJuggle, toe_tap: coachTap, pull_push: coachTap, dribble: coachDribble, pass: coachKick, shot: coachKick }[s.motion];
  const out = fn ? fn(s, ctx) : { good: [], fixes: [], facts: [] };
  out.fixes.sort((a, b) => b.sev - a.sev);
  out.fixes = out.fixes.slice(0, 2);
  out.good = out.good.slice(0, 2);
  if (!out.drill) out.drill = DRILL[s.motion];
  return out;
}

const DRILL = {
  toe_tap: { name: '20초 빠르게 + 10초 쉬기 × 5세트', text: '매 세트 "발 낮게, 가볍게"만 생각하기.' },
  pull_push: { name: '양발 번갈아 10번 × 4세트', text: '공은 한 발 길이 안에서만. 당기고 미는 걸 한 박자로.' },
  juggle: { name: '발등으로 무릎 높이 10개 × 5세트', text: '공을 같은 높이로. 떨어뜨리면 처음부터 다시 세기.' },
  dribble: { name: '콘 2개 8자 드리블 3바퀴 × 3세트', text: '터치는 작게, 한두 걸음마다 한 번.' },
  pass: { name: '벽 5m 인사이드 패스 20번(양발 10번씩)', text: '디딤발 발끝을 목표 쪽으로, 차고 나서 발을 목표 쪽으로 끝까지.' },
  shot: { name: '공 뒤 2~3걸음 접근 슈팅 6번', text: '디딤발은 공 옆 한 뼘 반, 공보다 조금 뒤. 몸을 공 위에.' },
};

// ── 토 탭 · 당기고 밀기
function coachTap(s, { m, history, fps }) {
  const ctxFps = fps;
  const p = s.prims, mk = s.marks, good = [], fixes = [], facts = [];
  const isTap = s.motion === 'toe_tap';
  facts.push({ k: '횟수', v: `${p.reps ?? mk.length}번` }, { k: '빠르기', v: isNum(p.rate) ? `${f2(p.rate)}번/초` : '—' }, { k: '번갈아', v: isNum(p.alt) ? pct(p.alt) : '—' });
  if (isNum(p.alt) && p.alt >= 90) good.push({ title: '양발이 고르게 번갈아 나와요', text: `${mk.length}번 중 번갈아 ${pct(p.alt)}. 박자가 거의 끊기지 않았어요.` });
  if (isNum(p.tempo_cv) && p.tempo_cv <= 15) good.push({ title: '박자가 일정해요', text: `간격 흔들림이 ${pct(p.tempo_cv)}로 작아요.` });
  if (isNum(p.alt) && p.alt < 80) fixes.push({ sev: (80 - p.alt) / 10, title: '한 발이 연달아 나와요', text: `번갈아 ${pct(p.alt)}예요. 오른발·왼발을 소리 내어 "하나, 둘" 세며 번갈아 해 보세요.`, why: '같은 영상 안 비교' });
  const g = gapByFoot(mk), r = asym(g.l, g.r);
  // 장면 간격(30fps 0.033초)의 세 배보다 작은 차이는 재는 오차라 지적하지 않는다
  if (r && r >= 1.2 && Math.abs(g.l - g.r) >= Math.max(0.08, 3 / (ctxFps || 30)) && g.nl >= 4 && g.nr >= 4) {
    const sl = slower(g);
    fixes.push({ sev: (r - 1) * 10, title: `${FOOT[sl]}이 늦어요`, text: `${FOOT[sl]} 다음 박자가 ${FOOT[sl === 'l' ? 'r' : 'l']}보다 ${f2(Math.abs(g.l - g.r))}초 길어요(${Math.round((r - 1) * 100)}% 느림). ${FOOT[sl]}만 10번 먼저 연습한 뒤 다시 번갈아 해 보세요.`, why: '같은 영상 안 비교', t: mk.find(x => x.foot === sl)?.t });
  }
  const h = halves(mk);
  if (h && isNum(h.a) && isNum(h.b) && h.b < h.a * 0.85) fixes.push({ sev: (1 - h.b / h.a) * 10, title: '뒤로 갈수록 느려져요', text: `앞 절반 ${f2(h.a)}번/초 → 뒤 절반 ${f2(h.b)}번/초(${Math.round((1 - h.b / h.a) * 100)}% 느려짐). 발을 공 높이만큼만 들고 발목 힘을 빼 가볍게 튕기듯 해 보세요.`, why: '같은 영상 안 비교', t: mk[mk.length - 1].t });
  else if (h && isNum(h.a) && isNum(h.b) && h.b >= h.a * 0.97 && mk.length >= 12) good.push({ title: '끝까지 빠르기를 지켰어요', text: `앞 절반 ${f2(h.a)} → 뒤 절반 ${f2(h.b)}번/초.` });
  if (isTap) {
    const lf = liftByFoot(m, mk), lr = asym(lf.l, lf.r);
    if (lr && lr >= 1.4) { const hi = lf.l > lf.r ? 'l' : 'r'; fixes.push({ sev: (lr - 1) * 5, title: `${FOOT[hi]}을 더 높이 들어요`, text: `${FOOT[hi]}이 반대 발보다 ${Math.round((lr - 1) * 100)}% 높이 올라가요. 높이 들수록 박자가 늦어져요. 공 높이만큼만 들어 보세요.`, why: '같은 영상 안 비교' }); }
  }
  if (isNum(p.ball_range) && p.ball_range > (isTap ? 0.15 : 0.35)) fixes.push({ sev: 3, title: '공이 자리에서 밀려나요', text: `공이 처음 자리에서 키의 ${Math.round(p.ball_range * 100)}%만큼 움직였어요. ${isTap ? '공 윗부분만 살짝 찍고' : '밀 때 더 작게 밀고'}, 공이 움직이면 몸이 따라가세요.`, why: '숫자 그대로' });
  if (isNum(p.head_up) && p.head_up < 30) fixes.push({ sev: 1.5, title: '공만 보고 있어요', text: `고개 든 시간 ${pct(p.head_up)}. 박자가 익으면 한 번씩 고개를 들어 앞을 보세요.`, why: '숫자 그대로(고개 방향만 보임)' });
  const past = pastAvg(history, s.motion, 'rate');
  if (isNum(past) && isNum(p.rate)) { if (p.rate > past * 1.05) good.push({ title: '지난번보다 빨라졌어요', text: `최근 평균 ${f2(past)} → 오늘 ${f2(p.rate)}번/초.` }); }
  return { good, fixes, facts, tip: isTap ? '옆에서 찍으면 발 드는 높이를, 정면에서 찍으면 공이 좌우로 밀리는지 볼 수 있어요.' : '옆에서 찍어야 당기고 미는 앞뒤 움직임이 잘 보여요.' };
}

// ── 리프팅
function coachJuggle(s, { m, history }) {
  const p = s.prims, mk = s.marks, good = [], fixes = [], facts = [];
  facts.push({ k: '최고 연속', v: `${p.best}개` }, { k: '전체', v: `${p.total}개` }, { k: '떨어뜨림', v: `${p.drops}번` });
  if (p.best >= 10) good.push({ title: `${p.best}개 연속 성공`, text: p.best >= 30 ? '아주 안정적이에요.' : '좋은 감각이에요. 다음 목표는 30개예요.' });
  if (isNum(p.apex_cv) && p.apex_cv <= 20) good.push({ title: '공 높이가 고르게 유지돼요', text: `높이 흔들림 ${pct(p.apex_cv)}.` });
  if (isNum(p.apex_cv) && p.apex_cv > 35) fixes.push({ sev: (p.apex_cv - 35) / 10 + 2, title: '공 높이가 들쭉날쭉해요', text: `높이 흔들림이 ${pct(p.apex_cv)}예요. 세게 차지 말고, 발등을 평평하게 펴서 같은 세기로 살짝 차올리세요.`, why: '같은 영상 안 비교' });
  if (isNum(p.apex) && p.apex > 0.9) fixes.push({ sev: 2.5, title: '공을 너무 높이 차요', text: `공이 평균 키의 ${Math.round(p.apex * 100)}% 높이까지 올라가요(머리 근처). 무릎~허리 높이(키의 30~60%)면 다음 터치가 쉬워요.`, why: '하는 법 안내 기준' });
  if (isNum(p.foot_ratio) && (p.foot_ratio < 20 || p.foot_ratio > 80) && (p.parts?.foot_l || 0) + (p.parts?.foot_r || 0) >= 6) {
    const weak = p.foot_ratio < 50 ? 'l' : 'r';
    fixes.push({ sev: Math.abs(p.foot_ratio - 50) / 15, title: '한 발로만 차요', text: `발 터치 중 왼발 ${pct(p.foot_ratio)}. ${FOOT[weak]}으로 한 번씩 섞어 보세요. 처음엔 주발 두 번, ${FOOT[weak]} 한 번.`, why: '같은 영상 안 비교' });
  }
  // 발별 공 높이: 약한 발로 찬 공이 더 높거나 낮으면 세기 조절이 다름
  const hb = { l: [], r: [] };
  for (let k = 0; k + 1 < mk.length; k++) { const a = mk[k]; if (!hb[a.foot]) continue; const [i0, i1] = idxRange(m.ts, a.t, mk[k + 1].t); const ys = m.ball.slice(i0, i1).map((b, j) => b && m.Hpx[i0 + j] && isNum(m.ground[i0 + j]) ? (m.ground[i0 + j] - b.y) / m.Hpx[i0 + j] : null).filter(isNum); if (ys.length) hb[a.foot].push(Math.max(...ys)); }
  const r = asym(mean(hb.l), mean(hb.r));
  if (r && r >= 1.35 && hb.l.length >= 3 && hb.r.length >= 3) { const hi = mean(hb.l) > mean(hb.r) ? 'l' : 'r'; fixes.push({ sev: (r - 1) * 4, title: `${FOOT[hi]}로 찬 공이 더 높이 떠요`, text: `${FOOT[hi]} 공이 반대 발보다 ${Math.round((r - 1) * 100)}% 높아요. ${FOOT[hi]}은 힘을 빼고 더 살짝 차 보세요.`, why: '같은 영상 안 비교' }); }
  if (p.drops >= 3 && p.best < 10) fixes.push({ sev: 2, title: '자주 떨어뜨려요', text: `${p.drops}번 떨어뜨렸어요. 디딤발 무릎을 살짝 굽히고, 공 아래로 몸을 옮겨 가며 차 보세요.`, why: '숫자 그대로' });
  const past = pastAvg(history, 'juggle', 'best');
  if (isNum(past) && p.best > past) good.push({ title: '최고 기록이 올라갔어요', text: `최근 평균 ${Math.round(past)}개 → 오늘 ${p.best}개.` });
  return { good, fixes, facts, tip: '옆에서 머리부터 발끝, 공이 가장 높이 올라가는 곳까지 다 나오게 찍으면 공 높이를 정확히 재요.' };
}

// ── 드리블
function coachDribble(s, { m, history }) {
  const p = s.prims, mk = s.marks, good = [], fixes = [], facts = [];
  facts.push({ k: '터치', v: `${mk.length}번` }, { k: '초당 터치', v: isNum(p.touch_rate) ? f2(p.touch_rate) : '—' }, { k: '왼발', v: isNum(p.foot_ratio) ? pct(p.foot_ratio) : '—' });
  // 연구 기준: 초당 터치 빠른 집단 3.0, 느린 집단 2.3 (Zago 2016, U13 준엘리트)
  if (isNum(p.touch_rate)) {
    if (p.touch_rate >= 2.8) good.push({ title: '터치가 잦아요', text: `초당 ${f2(p.touch_rate)}번. 연구에서 빠른 선수 집단(3.0번)에 가까워요.` });
    else if (p.touch_rate < 2.3) fixes.push({ sev: (2.3 - p.touch_rate) * 3 + 1, title: '터치가 드물어요', text: `초당 ${f2(p.touch_rate)}번이에요(연구: 빠른 선수 3.0, 느린 선수 2.3). 한 번 크게 차고 뛰기보다, 걸음을 짧게 해 한두 걸음마다 한 번씩 터치하세요.`, why: '연구 기준(Zago 2016)' });
  }
  if (isNum(p.foot_ratio) && (p.foot_ratio < 25 || p.foot_ratio > 75) && mk.length >= 6) { const weak = p.foot_ratio < 50 ? 'l' : 'r'; fixes.push({ sev: Math.abs(p.foot_ratio - 50) / 12, title: '한 발만 써요', text: `왼발 ${pct(p.foot_ratio)}. 반대발 사용이 적으면 경기에서 방향이 읽혀요. ${FOOT[weak]}으로 8자 드리블을 따로 해 보세요.`, why: '연구(Mattos dos Reis 2023, 정성) + 같은 영상' }); }
  else if (isNum(p.foot_ratio) && p.foot_ratio >= 35 && p.foot_ratio <= 65 && mk.length >= 6) good.push({ title: '양발을 고르게 써요', text: `왼발 ${pct(p.foot_ratio)} · 오른발 ${pct(100 - p.foot_ratio)}.` });
  const pb = pushByFoot(m, mk), r = asym(pb.l, pb.r);
  if (r && r >= 1.4 && pb.nl >= 3 && pb.nr >= 3) { const big = pb.l > pb.r ? 'l' : 'r'; fixes.push({ sev: (r - 1) * 5, title: `${FOOT[big]} 터치가 커요`, text: `${FOOT[big]}로 친 공이 반대 발보다 ${Math.round((r - 1) * 100)}% 멀리 나가요. 공이 멀면 빼앗기기 쉬워요. ${FOOT[big]}은 발 안쪽으로 "톡" 미는 느낌으로 작게 치세요.`, why: '같은 영상 안 비교', t: mk.find(x => x.foot === big)?.t }); }
  if (isNum(p.elastic)) { if (p.elastic >= 75) good.push({ title: '꺾을 때 속도를 잘 지켜요', text: `방향 전환 때 속도 유지 ${pct(p.elastic)}.` }); else if (p.elastic < 45) fixes.push({ sev: 2.5, title: '꺾을 때 많이 멈춰요', text: `방향을 바꿀 때 속도가 직전의 ${pct(p.elastic)}까지 떨어져요. 꺾기 직전 무게를 낮추고 바깥발로 밀어내듯 방향을 바꾸세요.`, why: '같은 영상 안 비교' }); }
  if (isNum(p.head_up) && p.head_up < 30) fixes.push({ sev: 1.5, title: '공만 보고 있어요', text: `고개 든 시간 ${pct(p.head_up)}. 터치 직후 한 번씩 고개를 들어 앞을 보세요.`, why: '숫자 그대로(고개 방향만 보임)' });
  const past = pastAvg(history, 'dribble', 'touch_rate');
  if (isNum(past) && isNum(p.touch_rate) && p.touch_rate > past * 1.05) good.push({ title: '지난번보다 터치가 잦아졌어요', text: `${f2(past)} → ${f2(p.touch_rate)}번/초.` });
  return { good, fixes, facts, tip: '콘 2개를 3m 간격으로 두고 옆에서 찍으면 8자 코스로 알아보고 더 많은 걸 재요.' };
}

// ── 패스 · 슈팅 (연구 기준: 02-shot.md R1·R6·R7·R8, 04-pass.md R5·R6)
function coachKick(s, { fps, view }) {
  const p = s.prims, good = [], fixes = [], facts = [], shot = s.motion === 'shot';
  const foot = FOOT[p.kickFoot] || '';
  if (isNum(p.ball_speed)) facts.push({ k: '공 속도', v: `${f1(p.ball_speed)}m/s (${Math.round(p.ball_speed * 3.6)}km/h)${p.speed_ok ? '' : ' · 참고'}` });
  if (isNum(p.launch)) facts.push({ k: '뜬 각도', v: `${Math.round(p.launch)}°` });
  facts.push({ k: '차는 발', v: foot || '—' }, { k: '접근 걸음', v: `${p.steps}걸음` });
  if (isNum(p.plant_ap)) {
    facts.push({ k: '디딤발 앞뒤', v: `${p.plant_ap > 0 ? '공보다 앞' : '공보다 뒤'} ${Math.abs(Math.round(p.plant_ap))}cm` });
    if (p.plant_ap > 3) fixes.push({ sev: 3 + p.plant_ap / 10, title: '디딤발이 공보다 앞이에요', text: `디딤발이 공보다 ${Math.round(p.plant_ap)}cm 앞에 있어요. 공이 땅에 깔리기 쉬워요. 공 옆이나 조금 뒤(0~15cm)에 딛으세요.`, why: '연구 기준(공 뒤 0~15cm, Scurr 2009·Hay 1993)', t: s.marks[0].t });
    else if (p.plant_ap < -20) fixes.push({ sev: 2 + (-p.plant_ap - 20) / 10, title: '디딤발이 공에서 많이 뒤예요', text: `공보다 ${Math.abs(Math.round(p.plant_ap))}cm 뒤에 딛었어요. 몸이 젖혀져 공이 뜨기 쉬워요. 한 걸음 더 들어가 공 뒤 10cm 안에 딛으세요.`, why: '연구 기준(공 뒤 0~15cm)', t: s.marks[0].t });
    else good.push({ title: '디딤발 앞뒤 위치가 좋아요', text: `공 ${p.plant_ap > 0 ? '앞' : '뒤'} ${Math.abs(Math.round(p.plant_ap))}cm. 연구 권장(공 뒤 0~15cm) 안이에요.` });
  }
  if (isNum(p.plant_lat)) {
    facts.push({ k: '디딤발 옆 간격', v: `${Math.round(p.plant_lat)}cm` });
    if (p.plant_lat > 40) fixes.push({ sev: 2 + (p.plant_lat - 40) / 10, title: '디딤발이 공 옆에서 멀어요', text: `공과 ${Math.round(p.plant_lat)}cm 떨어져 딛었어요. 27~37cm에서 공 속도·정확도가 가장 좋았어요. 공 옆 한 뼘 반에 딛으세요.`, why: '연구 기준(Ou 외 2023, Scurr 2009)', t: s.marks[0].t });
    else if (p.plant_lat >= 27) good.push({ title: '디딤발 옆 간격이 좋아요', text: `${Math.round(p.plant_lat)}cm. 연구에서 가장 좋았던 27~37cm 안이에요.` });
  }
  if (isNum(p.plant_knee) && shot) {
    facts.push({ k: '디딤 무릎', v: `${Math.round(p.plant_knee)}° 굽힘` });
    if (p.plant_knee < 25) fixes.push({ sev: 2, title: '디딤 무릎이 펴져 있어요', text: `차는 순간 디딤 무릎이 ${Math.round(p.plant_knee)}°만 굽어 있어요(연구: 임팩트 때 약 40°). 살짝 굽혀 착지해 버티세요.`, why: '연구 기준(Sinclair 2014), 옆에서 찍을 때만', t: s.marks[0].t });
  }
  if (isNum(p.trunk) && p.trunk < -12) fixes.push({ sev: 2.2, title: '몸이 뒤로 젖혀져요', text: `차는 순간 몸통이 ${Math.abs(Math.round(p.trunk))}° 뒤로 기울었어요. 몸을 공 위에 두고 무릎이 공 위를 지나게 하세요.`, why: '지도 원칙(R10) + 각도 숫자', t: s.marks[0].t });
  if (p.follow === false) fixes.push({ sev: 1.8, title: '차고 나서 다리를 멈춰요', text: '공을 지나 목표 쪽으로 차 내고 그 발로 착지하세요.', why: '지도 원칙(R11)' });
  else if (p.follow === true) good.push({ title: '마무리 동작이 이어져요', text: '찬 다리가 목표 쪽으로 끝까지 나갔어요.' });
  if (shot && p.speed_ok && isNum(p.ball_speed)) { if (p.ball_speed >= 26) good.push({ title: '공이 강해요', text: `${f1(p.ball_speed)}m/s. 세미프로 평균(26m/s) 이상이에요.` }); else if (p.ball_speed < 20) fixes.push({ sev: 2, title: '공이 약해요', text: `${f1(p.ball_speed)}m/s(성인 아마추어 평균 약 25m/s). 허벅지를 먼저 보내고 정강이를 채찍처럼 펴세요. 발목은 발등을 편 채 단단히.`, why: '연구 기준(Kellis 2007 리뷰)' }); }
  if (p.steps <= 1) fixes.push({ sev: 1.5, title: '접근이 짧아요', text: '대각선으로 2~4걸음 들어오세요.', why: '연구 기준(접근 2~5걸음)' });
  const tip = view === 'side' ? '공 뒤(공–목표 선 위)에서도 찍으면 디딤발 옆 간격과 공 방향도 봐 드려요.' : view === 'back' || view === 'front' ? '옆에서도 찍으면 디딤발 앞뒤 위치와 디딤 무릎도 봐 드려요.' : '옆에서 찍으면 디딤발·무릎·몸통을 정확히 볼 수 있어요.';
  return { good, fixes, facts, tip: fps < 50 ? tip + ' 슬로모션(120fps)이면 공 속도도 정확해요.' : tip };
}
