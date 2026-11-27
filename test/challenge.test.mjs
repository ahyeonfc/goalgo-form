// 도전 모드 엔진 시험: 공 다루기(토 탭, 당기고 밀기)와 리프팅
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { synthTap, synthPullPush, synthJuggle } from '../src/sim.js';
import { analyzeTask, progress, checkLevel } from '../src/engine/challenge.js';

const load = f => JSON.parse(readFileSync(new URL('../public/criteria/' + f, import.meta.url)));
const criteria = { dribble: load('dribble.json'), challenge: load('challenge.json') };
const run = (taskId, s, level = 1, history = [], profile = { foot: 'r' }) => analyzeTask(s.raw, { taskId, level, heightCm: 175, fps: s.fps, criteria, history, profile });
const pr = r => r.task.prims;

test('토 탭: 24번 번갈아 세고 1단계 통과', () => {
  const s = synthTap({ n: 24 });
  const r = run('toe_tap', s);
  assert.ok(Math.abs(pr(r).reps - 24) <= 1, `반복 ${pr(r).reps}`);
  assert.ok(pr(r).alt >= 90, `번갈아 ${pr(r).alt}`);
  assert.ok(Math.abs(pr(r).rate - 4) < 0.4, `빠르기 ${pr(r).rate}`);
  assert.ok(pr(r).ball_range <= 0.05, `공 움직임 ${pr(r).ball_range}`);
  assert.equal(r.task.passed, true, JSON.stringify(r.task.check.checks));
});

test('토 탭: 한 발만 쓰면 1단계 실패(번갈아 조건)', () => {
  const s = synthTap({ n: 24, alt: false, gap: 0.4 });
  const r = run('toe_tap', s);
  assert.ok(pr(r).alt < 20, `번갈아 ${pr(r).alt}`);
  assert.equal(r.task.passed, false);
  assert.ok(r.task.check.checks.some(c => c.m === 'alt' && !c.ok));
});

test('토 탭 2단계: 1단계 기록 없으면 먼저 통과하라고 함, 있으면 15% 빠르기 비교', () => {
  const slow = run('toe_tap', synthTap({ n: 24, gap: 0.3 }));
  const r0 = run('toe_tap', synthTap({ n: 24, gap: 0.22 }), 2, []);
  assert.equal(r0.task.passed, false);
  assert.ok(r0.task.check.checks.some(c => /먼저 통과/.test(c.text)));
  const hist = [slow];  // 1단계 통과, 빠르기 약 3.3
  const fast = run('toe_tap', synthTap({ n: 24, gap: 0.22 }), 2, hist); // 약 4.5 > 3.3×1.15
  assert.equal(fast.task.passed, true, JSON.stringify(fast.task.check.checks));
  const same = run('toe_tap', synthTap({ n: 24, gap: 0.3 }), 2, hist);
  assert.equal(same.task.passed, false);
});

test('토 탭 3단계: 고개 숙이면 실패', () => {
  const hist = [run('toe_tap', synthTap({ n: 24, gap: 0.3 }))];
  const down = run('toe_tap', synthTap({ n: 24, gap: 0.22, headDown: true }), 3, hist);
  assert.ok(pr(down).head_up != null);
  const up = run('toe_tap', synthTap({ n: 24, gap: 0.22 }), 3, hist);
  assert.ok(pr(up).head_up >= 50, `고개 든 시간 ${pr(up).head_up}`);
  assert.equal(up.task.passed, true, JSON.stringify(up.task.check.checks));
});

test('당기고 밀기: 12번 반복, 양발 번갈아', () => {
  const s = synthPullPush({ cycles: 12 });
  const r = run('pull_in', s);
  assert.ok(Math.abs(pr(r).reps - 12) <= 1, `반복 ${pr(r).reps}, 터치 ${pr(r).touches_all}`);
  assert.ok(pr(r).alt >= 80, `번갈아 ${pr(r).alt}`);
  assert.ok(pr(r).ball_range <= 0.35, `공 움직임 ${pr(r).ball_range}`);
  assert.equal(r.task.passed, true, JSON.stringify(r.task.check.checks));
  const pulls = r.marks.filter(x => x.kind === 'pull').length, pushes = r.marks.filter(x => x.kind === 'push').length;
  assert.ok(Math.abs(pulls - 12) <= 1 && Math.abs(pushes - 12) <= 1, `당기기 ${pulls}, 밀기 ${pushes}`);
});

test('리프팅: 12개 → 떨어뜨림 → 6개, 최고 연속 12', () => {
  const s = synthJuggle({ n1: 12, n2: 6 });
  const r = run('juggle', s);
  assert.equal(pr(r).best, 12, `최고 연속 ${pr(r).best}, 전체 ${pr(r).total}, 떨어뜨림 ${pr(r).drops}`);
  assert.ok(Math.abs(pr(r).total - 18) <= 1, `전체 ${pr(r).total}`);
  assert.equal(pr(r).drops, 2); // 가운데 한 번 + 영상 끝에서 공이 바닥으로 떨어짐
  assert.ok(Math.abs(pr(r).foot_ratio - 50) <= 10, `왼발 비율 ${pr(r).foot_ratio}`);
  assert.ok(Math.abs(pr(r).apex - 0.65) < 0.08, `공 높이 ${pr(r).apex}`);
  assert.equal(r.task.passed, true);
  const l2 = run('juggle', s, 2); assert.equal(l2.task.passed, false);
});

test('리프팅 4단계: 약한 발(주발 오른발 → 왼발)만 10개', () => {
  const s = synthJuggle({ n1: 11, n2: 3, only: 'l' });
  const r = run('juggle', s, 4);
  assert.ok(pr(r).weak_share >= 90, `약한 발 비율 ${pr(r).weak_share}`);
  assert.equal(r.task.passed, true, JSON.stringify(r.task.check.checks));
  const rr = run('juggle', s, 4, [], { foot: 'l' }); // 왼발잡이면 약한 발은 오른발 → 실패
  assert.equal(rr.task.passed, false);
});

test('단계 진행: 2번 통과하면 다음 단계', () => {
  const ok = run('toe_tap', synthTap({ n: 24 }));
  const p1 = progress([ok], criteria.challenge);
  assert.equal(p1.toe_tap.current, 1);
  const p2 = progress([ok, ok], criteria.challenge);
  assert.equal(p2.toe_tap.current, 2);
  assert.equal(p2.toe_tap.doneCount, 1);
  assert.equal(p2.juggle.current, 1);
});

test('120fps 에서도 토 탭·리프팅 횟수 같음', () => {
  assert.ok(Math.abs(pr(run('toe_tap', synthTap({ n: 24, fps: 120 }))).reps - 24) <= 1);
  assert.equal(pr(run('juggle', synthJuggle({ n1: 12, n2: 6, fps: 120 }))).best, 12);
});
