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
test('한 발 토 탭 → 번갈아 고칠 점', () => {
  const r = run(synthTap({ n: 24, alt: false, gap: 0.4 }));
  assert.equal(r.segs[0]?.motion, 'toe_tap');
  assert.ok(r.segs[0].coach.fixes.some(f => /연달아/.test(f.title)));
});
test('드리블 영상 → 드리블, 한 발만 쓰면 고칠 점', () => {
  const r = run(synthDribble({ leftShare: 1 }));
  assert.ok(motions(r).includes('dribble'), motions(r).join(','));
  const d = r.segs.find(x => x.motion === 'dribble');
  assert.ok(d.coach.fixes.some(f => /한 발/.test(f.title)), JSON.stringify(d.coach.fixes));
});
test('몸이 잘린 영상(공이 키에 비해 너무 큼) → 자세 믿지 않음', () => {
  const s = synthTap({ n: 24 });
  for (const f of s.raw) f.ball.r *= 3.5; // 공이 실제보다 훨씬 크게 = 몸이 작게 잡힌 것과 같음
  const r = run(s);
  assert.equal(r.poseOk, false);
  assert.equal(r.segs.length, 0);
  assert.ok(r.notes.some(n => /머리부터 발끝/.test(n.text)));
});
