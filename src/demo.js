// 과제 시범 애니메이션: 엔진 시험과 같은 합성 동작(js/sim.js)을 관절 선으로 그린다.
// 설명용이다. 점수·단계 기준으로 쓰지 않는다(숫자를 지어내지 않는다는 원칙).

import { synthTap, synthPullPush, synthJuggle } from './sim.js';

const EDGES = [[11, 12], [11, 13], [13, 15], [12, 14], [14, 16], [11, 23], [12, 24], [23, 24], [23, 25], [25, 27], [27, 29], [29, 31], [27, 31], [24, 26], [26, 28], [28, 30], [30, 32], [28, 32]];
const LEFT = new Set([23, 25, 27, 29, 31]), RIGHT = new Set([24, 26, 28, 30, 32]);
const COL = { l: '#5aa9ff', r: '#ff8a3d', body: '#3ddc97' };

function makeData(demo) {
  const o = { fps: 60, noise: 0, still: 0.6 };
  if (demo === 'toe_tap') { const s = synthTap({ ...o, n: 16, gap: 0.32 }); return { s, marks: s.truth, crop: 'legs' }; }
  if (demo === 'pull_in' || demo === 'pull_out') { const s = synthPullPush({ ...o, cycles: 8, half: 0.4 }); return { s, marks: s.touches, crop: 'legs', label: demo === 'pull_in' ? '발 안쪽으로 앞으로 밀기' : '발 바깥쪽으로 앞으로 밀기' }; }
  const s = synthJuggle({ ...o, n1: 10, n2: 1 }); // 시범은 10개 연속까지만 보여 준다(endAt)
  return { s, marks: s.contacts.slice(0, 10), crop: 'full', endAt: s.contacts[9].t + 0.9 };
}

export class Demo {
  constructor(canvas, demo) {
    this.cv = canvas; this.g = canvas.getContext('2d'); this.speed = 1; this.playing = true; this.t = 0; this.last = null;
    const d = makeData(demo); this.d = d; this.raw = d.s.raw; this.marks = d.marks;
    this.T = d.endAt || this.raw[this.raw.length - 1].t;
    const H = 600, ground = 900, x0 = 600;
    this.box = d.crop === 'legs' ? { x0: x0 - 0.35 * H, x1: x0 + 0.6 * H, y0: ground - 0.75 * H, y1: ground + 0.04 * H } : { x0: x0 - 0.5 * H, x1: x0 + 0.75 * H, y0: ground - 1.05 * H, y1: ground + 0.04 * H };
    this.ground = ground;
    const r = (this.box.x1 - this.box.x0) / (this.box.y1 - this.box.y0);
    canvas.width = 900; canvas.height = Math.round(900 / r);
    this.loop = this.loop.bind(this); requestAnimationFrame(this.loop);
  }
  map(x, y) { const b = this.box; return [(x - b.x0) / (b.x1 - b.x0) * this.cv.width, (y - b.y0) / (b.y1 - b.y0) * this.cv.height]; }
  frameAt(t) { let lo = 0, hi = this.raw.length - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (this.raw[m].t <= t) lo = m; else hi = m; } return this.raw[lo]; }
  loop(ts) {
    if (!this.cv.isConnected) return; // 화면을 떠나면 멈춤
    if (this.last == null) this.last = ts;
    const dt = Math.min(0.05, (ts - this.last) / 1000); this.last = ts;
    if (this.playing) { this.t += dt * this.speed; if (this.t > this.T + 0.8) this.t = 0; }
    this.draw(Math.min(this.t, this.T));
    requestAnimationFrame(this.loop);
  }
  draw(t) {
    const g = this.g, W = this.cv.width, Hc = this.cv.height, f = this.frameAt(t), sc = W / (this.box.x1 - this.box.x0);
    g.fillStyle = '#0b0d11'; g.fillRect(0, 0, W, Hc);
    const [, gy] = this.map(0, this.ground); g.fillStyle = '#122016'; g.fillRect(0, gy, W, Hc - gy);
    g.strokeStyle = '#2c4434'; g.lineWidth = 2; g.beginPath(); g.moveTo(0, gy); g.lineTo(W, gy); g.stroke();
    const P = j => this.map(f.kp[j][0], f.kp[j][1]);
    const lw = Math.max(4, 0.022 * 600 * sc);
    g.lineCap = 'round';
    // 먼 다리(왼발)부터, 몸, 가까운 다리(오른발) 순서
    const order = [...EDGES].sort((a, b) => (LEFT.has(a[0]) ? -1 : RIGHT.has(a[0]) ? 1 : 0) - (LEFT.has(b[0]) ? -1 : RIGHT.has(b[0]) ? 1 : 0));
    for (const [a, b] of order) {
      const col = LEFT.has(a) && LEFT.has(b) ? COL.l : RIGHT.has(a) && RIGHT.has(b) ? COL.r : COL.body;
      g.globalAlpha = LEFT.has(a) && LEFT.has(b) ? 0.8 : 1;
      g.strokeStyle = col; g.lineWidth = lw; const p = P(a), q = P(b); g.beginPath(); g.moveTo(p[0], p[1]); g.lineTo(q[0], q[1]); g.stroke();
    }
    g.globalAlpha = 1;
    if (this.d.crop === 'full') { const h = P(0), e = P(7); g.fillStyle = COL.body; g.beginPath(); g.arc((h[0] + e[0]) / 2, (h[1] + e[1]) / 2, lw * 2.2, 0, 7); g.fill(); }
    // 공 + 닿는 순간 반짝임
    const [bx, by] = this.map(f.ball.x, f.ball.y), br = f.ball.r * sc;
    g.fillStyle = '#f4f6fa'; g.beginPath(); g.arc(bx, by, br, 0, 7); g.fill();
    g.fillStyle = '#0f1115'; g.beginPath(); g.arc(bx, by, br * 0.32, 0, 7); g.fill();
    const hit = this.marks.find(m => Math.abs(m.t - t) < 0.09);
    if (hit) { g.strokeStyle = COL[hit.foot] || '#fff'; g.lineWidth = lw * 0.8; g.beginPath(); g.arc(bx, by, br + lw, 0, 7); g.stroke(); }
    // 글씨: 지금까지 터치 수, 지금 동작
    const done = this.marks.filter(m => m.t <= t + 0.05);
    g.fillStyle = '#e8eaf0'; g.font = `600 ${Math.round(W / 22)}px system-ui,sans-serif`; g.textAlign = 'left';
    g.fillText(`${this.d.crop === 'full' ? '연속' : '터치'} ${done.length}`, W * 0.04, Hc * 0.1);
    if (hit) {
      const name = hit.kind === 'pull' ? '발바닥으로 당기기' : hit.kind === 'push' ? (this.d.label || '앞으로 밀기') : this.d.crop === 'full' ? '발등으로 차올리기' : '앞꿈치로 톡';
      g.fillStyle = COL[hit.foot] || '#fff'; g.font = `600 ${Math.round(W / 26)}px system-ui,sans-serif`;
      g.fillText(`${hit.foot === 'l' ? '왼발' : '오른발'} · ${name}`, W * 0.04, Hc * 0.1 + W / 18);
    }
  }
}
