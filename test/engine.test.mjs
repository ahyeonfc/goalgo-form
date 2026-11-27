// 엔진 자동 시험: node --test test/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { synthDribble } from './synth.mjs';
import { analyze } from '../src/engine/index.js';
import { metricScore, evalCalc } from '../src/engine/score.js';
import { fillGaps, fixSwaps } from '../src/engine/clean.js';

const dribble = JSON.parse(readFileSync(new URL('../public/criteria/dribble.json', import.meta.url)));
const criteria = { dribble };
const run = (o = {}) => { const s = synthDribble(o); return { s, r: analyze(s.raw, { heightCm: 175, fps: s.fps, criteria }) }; };

test('점수 공식: 범위 안 100, 허용폭 끝 0', () => {
  const s = { lo: 0, hi: 4.06, t: 1.06 };
  assert.equal(metricScore(3, s), 100);
  assert.equal(metricScore(4.06 + 0.53, s), 50);
  assert.equal(metricScore(9, s), 0);
  assert.equal(metricScore(2, { lo: 0, hi: 0, t: 5 }), 60); // 콘 2번 건드림 = 60점
  assert.equal(metricScore(2.45, { lo: 2.8, hi: null, t: 0.7 }), 50);
  assert.equal(evalCalc({ op: 'sub', a: 'x', b: 'y' }, { x: 9, y: 5 }), 4);
});

test('빈칸 채우기: 0.1초 이하만 채우고 긴 빈칸은 그대로', () => {
  const ts = [0, 1 / 30, 2 / 30, 3 / 30, 4 / 30, 5 / 30, 6 / 30, 7 / 30, 8 / 30, 9 / 30];
  const a = [{ x: 0, y: 0 }, null, null, { x: 3, y: 3 }, null, null, null, null, null, { x: 9, y: 9 }];
  const { out } = fillGaps(ts, a, 0.1);
  assert.deepEqual(out[1], { x: 1, y: 1 });
  assert.equal(out[5], null);
});

test('좌우 뒤바뀜: 한 장면만 바뀐 다리를 바로잡음', () => {
  const mk = (lx, rx) => { const kp = new Array(33).fill(null); for (const [l, r] of [[23, 24], [25, 26], [27, 28], [29, 30], [31, 32]]) { kp[l] = { x: lx, y: l * 10 }; kp[r] = { x: rx, y: l * 10 }; } return { kp }; };
  const fr = [mk(100, 200), mk(101, 201), mk(202, 102), mk(103, 203)];
  assert.equal(fixSwaps(fr), 1);
  assert.equal(fr[2].kp[23].x, 102);
});

test('드리블 합성 영상: 터치·발·걸음·방향 전환을 찾음', () => {
  const { s, r } = run();
  const ev = r.events;
  // 터치: 정답과 ±2장면(30fps 0.067초) 안에 맞는 비율
  const tol = 2 / s.fps;
  const hit = s.truth.filter(g => ev.touches.some(t => Math.abs(t.t - g.t) <= tol)).length;
  assert.ok(hit / s.truth.length >= 0.9, `터치 ${hit}/${s.truth.length} 맞음, 찾은 수 ${ev.touches.length}`);
  assert.ok(ev.touches.length <= s.truth.length + 1, `헛 터치가 많음: ${ev.touches.length}`);
  const footOk = s.truth.filter(g => ev.touches.some(t => Math.abs(t.t - g.t) <= tol && t.foot === g.foot)).length;
  assert.ok(footOk / s.truth.length >= 0.9, `터치 발 ${footOk}/${s.truth.length}`);
  // 걸음: 정답 ±20%
  const steps = ev.steps.filter(x => x.t > s.still + 0.1).length;
  assert.ok(Math.abs(steps - s.stepsTruth) <= s.stepsTruth * 0.2, `걸음 ${steps} (정답 ${s.stepsTruth})`);
  // 방향 전환
  assert.ok(Math.abs(ev.cuts.length - s.cutsTruth) <= 1, `방향 전환 ${ev.cuts.length} (정답 ${s.cutsTruth})`);
  // 구간과 찍은 방향
  assert.equal(r.segs.length, 1, '드리블 구간 하나');
  assert.equal(r.segs[0].view.view, 'front');
});

test('드리블 합성 영상: 지표와 점수', () => {
  const { r } = run();
  const seg = r.segs[0], v = id => seg.rows.find(x => x.id === id);
  assert.ok(Math.abs(v('drb.touch_rate').value - 2.5) < 0.3, `터치 빈도 ${v('drb.touch_rate').value}`);
  assert.ok(Math.abs(v('drb.foot_ratio').value - 50) <= 10, `왼발 비율 ${v('drb.foot_ratio').value}`);
  assert.equal(v('drb.foot_ratio').score, 100);
  assert.equal(v('drb.loss').value, null);
  assert.equal(v('drb.loss').why, '정해진 코스를 알아챘을 때만');
  assert.ok(v('drb.head_up').value > 80, `헤드업 ${v('drb.head_up').value}`);
  // 퍼포먼스: 2.5회/초 → (2.8-2.5)/0.7 → 57점 언저리
  assert.ok(seg.axes.perf.score > 40 && seg.axes.perf.score < 75, `퍼포먼스 ${seg.axes.perf.score}`);
  assert.ok(seg.fixes.some(f => f.id === 'drb.touch_rate'), '터치 빈도 고칠 말');
});

test('한 발만 쓰면 양발 점수가 떨어지고 고칠 말이 나옴', () => {
  const { r } = run({ leftShare: 1 });
  const fr = r.segs[0].rows.find(x => x.id === 'drb.foot_ratio');
  assert.ok(fr.value >= 90, `왼발 비율 ${fr.value}`);
  assert.ok(fr.score <= 20, `양발 점수 ${fr.score}`);
  assert.ok(r.segs[0].fixes.some(f => f.id === 'drb.foot_ratio'));
});

test('보정: 선 자세 키와 공 크기가 입력한 키와 맞음', () => {
  const { r } = run();
  assert.ok(r.calib.byHeight, '선 자세를 찾음');
  assert.ok(Math.abs(r.calib.byHeight.standPx / 600 - 1) < 0.05, `선 키 ${r.calib.byHeight.standPx}px`);
  assert.ok(r.calib.byBall && Math.abs(r.calib.byBall.diff) < 0.1, `공으로 잰 키 차이 ${r.calib.byBall?.diff}`);
  assert.equal(r.calib.warn, false);
});

test('120fps 영상에서도 같은 결과', () => {
  const { s, r } = run({ fps: 120 });
  const tol = 2 / 30;
  const hit = s.truth.filter(g => r.events.touches.some(t => Math.abs(t.t - g.t) <= tol)).length;
  assert.ok(hit / s.truth.length >= 0.9, `120fps 터치 ${hit}/${s.truth.length}, 찾은 수 ${r.events.touches.length}`);
});

test('구간에 동작 이름과 점수가 따로 남고, 앞 기록으로 개인 비교 기준선이 생김', () => {
  const { r } = run();
  assert.equal(r.segs[0].motion, 'dribble');
  assert.equal(typeof r.segs[0].total, 'number');
  const s2 = synthDribble({ seed: 11 });
  const r2 = analyze(s2.raw, { heightCm: 175, fps: 30, criteria, history: [r] });
  const te = r2.segs[0].rows.find(x => x.id === 'drb.touch_even');
  assert.ok(te.base != null && te.delta != null, '터치 고르기에 내 기준선 비교가 붙음');
});
