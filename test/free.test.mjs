// 자유 분석 시험: 동작 자동 구분, 코칭, 몸 잘림 알아채기
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { synthTap, synthPullPush, synthJuggle } from '../src/sim.js';
import { synthDribble } from './synth.mjs';
import { analyzeFree } from '../src/engine/free.js';

const load = f => JSON.parse(readFileSync(new URL('../public/criteria/' + f, import.meta.url)));
const criteria = { dribble: load('dribble.json'), challenge: load('challenge.json') };
const run = (s, fps = 30) => analyzeFree(s.raw, { heightCm: 175, fps, criteria, profile: { foot: 'r' } });
const motions = r => r.segs.map(x => x.motion);

test('토 탭 영상 → 토 탭으로 알아채고 코칭', () => {
  const r = run(synthTap({ n: 30 }));
  assert.deepEqual(motions(r), ['toe_tap']);
  assert.ok(r.segs[0].coach.good.length >= 1);
  assert.ok(r.segs[0].coach.drill);
});
test('당기고 밀기 영상 → 당기고 밀기, 잘못된 "한 발이 늦어요" 없음', () => {
  const r = run(synthPullPush({ cycles: 12 }));
  assert.deepEqual(motions(r), ['pull_push']);
  assert.ok(!r.segs[0].coach.fixes.some(f => /늦어요/.test(f.title)), JSON.stringify(r.segs[0].coach.fixes));
});
test('리프팅 영상 → 리프팅, 너무 높으면 고칠 점', () => {
  const r = run(synthJuggle({ n1: 12, n2: 6, apex: 0.95 }));
  assert.deepEqual(motions(r), ['juggle']);
  assert.equal(r.segs[0].prims.best, 12);
  assert.ok(r.segs[0].coach.fixes.some(f => /높이/.test(f.title)));
});
test('한 발 토 탭 → 한 발 연습으로 보고 지적하지 않음', () => {
  const r = run(synthTap({ n: 24, alt: false, gap: 0.4 }));
  assert.equal(r.segs[0]?.motion, 'toe_tap');
  assert.ok(!r.segs[0].coach.fixes.some(f => /연달아/.test(f.title)), JSON.stringify(r.segs[0].coach.fixes));
});
test('드리블 영상 → 드리블, 한 발만 써도 지적하지 않고 기록만', () => {
  const r = run(synthDribble({ leftShare: 1 }));
  assert.ok(motions(r).includes('dribble'), motions(r).join(','));
  const d = r.segs.find(x => x.motion === 'dribble');
  assert.ok(!d.coach.fixes.some(f => /한 발/.test(f.title)), JSON.stringify(d.coach.fixes));
  assert.ok(d.coach.facts.some(f => f.k === '쓴 발'), JSON.stringify(d.coach.facts));
});
test('몸이 잘린 영상(공이 키에 비해 너무 큼) → 자세 믿지 않음', () => {
  const s = synthTap({ n: 24 });
  for (const f of s.raw) f.ball.r *= 3.5; // 공이 실제보다 훨씬 크게 = 몸이 작게 잡힌 것과 같음
  const r = run(s);
  assert.equal(r.poseOk, false);
  assert.equal(r.segs.length, 0);
  assert.ok(r.notes.some(n => /머리부터 발끝/.test(n.text)));
});

test('슬로모션(3배 느림) 리프팅 → 배율을 알아내고 같은 개수, 시각은 영상 시각', () => {
  const s = synthJuggle({ n1: 12, n2: 6 });
  const normal = run(s);
  const slow = { raw: s.raw.map(f => ({ ...f, t: f.t * 3 })) };
  const r = analyzeFree(slow.raw, { heightCm: 175, fps: 10, criteria, profile: { foot: 'r' } });
  assert.ok(r.timeScale && Math.abs(r.timeScale.k - 3) < 0.4, `배율 ${JSON.stringify(r.timeScale)}`);
  assert.equal(r.segs[0].prims.best, normal.segs[0].prims.best);
  assert.ok(Math.abs(r.segs[0].t0 - normal.segs[0].t0 * 3) < 0.2, `영상 시각 ${r.segs[0].t0} 대 ${normal.segs[0].t0 * 3}`);
  assert.ok(r.notes.some(n => /슬로모션/.test(n.text)));
});
test('보통 속도 리프팅은 슬로모션으로 보지 않음', () => {
  const r = run(synthJuggle({ n1: 12, n2: 6 }));
  assert.ok(!r.notes.some(n => /슬로모션 영상으로/.test(n.text)), JSON.stringify(r.timeScale));
});

test('동작과 상관없는 전체 코칭: 한 발 연습은 지적하지 않고 "○발 연습"으로 기록, 양발 영상은 칭찬', () => {
  const one = run(synthTap({ n: 24, alt: false, gap: 0.4 }));
  assert.ok(one.general && !one.general.fixes.some(f => /주로 써요|양발/.test(f.title)), JSON.stringify(one.general?.fixes));
  assert.ok(one.general.facts.some(f => f.k === '쓴 발'), JSON.stringify(one.general.facts));
  assert.ok(one.general.p.main_foot, '한 발 표시');
  const both = run(synthTap({ n: 26, gap: 0.3 }));
  assert.ok(both.general.good.some(g => /양발/.test(g.title)), JSON.stringify(both.general.good));
  assert.ok(!both.general.fixes.some(f => /만 주로/.test(f.title)));
  assert.ok(both.general.drill);
});
test('몸이 안 보이면 전체 코칭 없이 찍는 법 안내', () => {
  const s = synthTap({ n: 24 }); for (const f of s.raw) f.ball.r *= 3.5;
  const r = run(s);
  assert.equal(r.general, null);
});

test('몸이 안 나오고 공만 다리 사이를 오가는 영상 → 공만으로 코칭', () => {
  // 공이 좌우로 공 지름 3개만큼 0.3초마다 오감, 관절 없음. 오른쪽으로 보낼 때가 더 느림(0.40초)
  const raw = []; const r = 40, x0 = 400, y0 = 500; let t = 0, k = 0, side = -1; const pts = [{ t: 0, x: x0 - 3 * r }];
  for (let i = 0; i < 30; i++) { const g = side < 0 ? 0.40 : 0.28; t += g; side = -side; pts.push({ t, x: x0 + side * 3 * r }); }
  for (let tt = 0; tt <= t; tt += 1 / 30) {
    while (k + 1 < pts.length && pts[k + 1].t < tt) k++;
    const a = pts[k], b = pts[Math.min(k + 1, pts.length - 1)], u = b.t > a.t ? (tt - a.t) / (b.t - a.t) : 0;
    raw.push({ t: +tt.toFixed(4), kp: null, ball: { x: a.x + (b.x - a.x) * u, y: y0, r, conf: 0.8 } });
  }
  const res = analyzeFree(raw, { heightCm: 175, fps: 30, criteria, profile: { foot: 'r' } });
  assert.ok(res.general && res.general.ballOnly, JSON.stringify(res.notes));
  assert.ok(Math.abs(res.general.p.touches - 30) <= 2, `터치 ${res.general.p.touches}`);
  assert.ok(res.general.fixes.some(f => /오른쪽으로 보낼 때 늦어요/.test(f.title)), JSON.stringify(res.general.fixes.map(f => f.title)));
  assert.ok(res.notes.some(n => /공 움직임만으로/.test(n.text)));
});
test('한 발 연습: 다른 날 반대 발 기록이 있으면 두 발 빠르기 비교', () => {
  const one = run(synthTap({ n: 24, alt: false, gap: 0.4 }));
  const mf = one.general.p.main_foot, other = mf === 'l' ? 'r' : 'l';
  const past = { general: { p: { main_foot: other, rate: one.general.p.rate * 1.5, tempo_cv: 10 } } };
  const r = analyzeFree(synthTap({ n: 24, alt: false, gap: 0.4 }).raw, { heightCm: 175, fps: 30, criteria, profile: { foot: 'r' }, history: [past] });
  assert.ok(r.general.fixes.some(f => /보다 느려요/.test(f.title)), JSON.stringify(r.general.fixes));
});
