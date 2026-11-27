// 합성 원재료(옆에서 찍은 제자리 과제): 토 탭, 당기고 밀기, 리프팅. 엔진 시험과 앱 시범 애니메이션이 함께 쓴다. 사람은 화면 오른쪽(+x)을 본다.

function base(o) {
  const fps = o.fps ?? 30, H = o.Hpx ?? 600, ground = 900, x0 = 600, ballR = 22 / 175 * H / 2;
  let seed = o.seed ?? 3; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const gauss = () => (o.noise ?? 1) * Math.sqrt(-2 * Math.log(rnd() + 1e-12)) * Math.cos(2 * Math.PI * rnd());
  const headDown = o.headDown ?? false;
  // 선 자세 몸(옆모습). foot: {l:{x,lift}, r:{x,lift}}
  function body(foot) {
    const kp = new Array(33).fill(null).map(() => [x0, ground - 0.9 * H, 0.2]);
    const set = (j, x, y, v = 0.95) => { kp[j] = [x + gauss(), y + gauss(), v]; };
    const nd = headDown ? 0.06 : 0;
    set(0, x0 + 0.06 * H, ground - (0.915 - nd) * H); set(2, x0 + 0.04 * H, ground - 0.936 * H); set(5, x0 + 0.04 * H, ground - 0.936 * H);
    set(7, x0 - 0.01 * H, ground - 0.93 * H); set(8, x0 - 0.01 * H, ground - 0.93 * H);
    set(11, x0, ground - 0.818 * H); set(12, x0 + 0.01 * H, ground - 0.818 * H);
    set(15, x0 + 0.05 * H, ground - 0.5 * H); set(16, x0 - 0.05 * H, ground - 0.5 * H);
    set(23, x0, ground - 0.53 * H); set(24, x0 + 0.01 * H, ground - 0.53 * H);
    for (const [s, knee, ank, heel, toe] of [['l', 25, 27, 29, 31], ['r', 26, 28, 30, 32]]) {
      const f = foot[s];
      set(knee, (x0 + f.x) / 2 + 0.03 * H, ground - 0.285 * H - f.lift * 0.5);
      set(ank, f.x - 0.06 * H, ground - 0.039 * H - f.lift);
      set(heel, f.x - 0.09 * H, ground - 0.01 * H - f.lift);
      set(toe, f.x, ground - f.lift);
    }
    return kp;
  }
  return { fps, H, ground, x0, ballR, gauss, body };
}
const bump = (t, c, w) => { const d = Math.abs(t - c) / w; return d < 1 ? 0.5 * (1 + Math.cos(Math.PI * d)) : 0; };

// 토 탭: 공은 발 앞에 가만히, 발이 번갈아 공 윗부분을 찍는다
export function synthTap(o = {}) {
  const b = base(o), { fps, H, ground, x0, ballR } = b;
  const still = o.still ?? 1, n = o.n ?? 24, gap = o.gap ?? 0.25, alt = o.alt ?? true;
  const bx = x0 + 0.15 * H, by = ground - ballR;
  const truth = []; for (let k = 0; k < n; k++) truth.push({ t: +(still + 0.3 + k * gap).toFixed(4), foot: alt ? (k % 2 ? 'l' : 'r') : 'r' });
  const T = still + 0.3 + n * gap + 0.7, raw = [];
  for (let i = 0; i < Math.round(T * fps); i++) {
    const t = i / fps, foot = { l: { x: x0 - 0.02 * H, lift: 0 }, r: { x: x0 + 0.02 * H, lift: 0 } };
    for (const tr of truth) {
      const w = bump(t, tr.t, Math.min(0.12, gap * 0.9)); if (!w) continue;
      const f = foot[tr.foot], rest = f.x; f.x = rest + (bx - rest) * w; f.lift = 2 * ballR * w;
    }
    raw.push({ t: +t.toFixed(4), kp: b.body(foot), ball: { x: bx + b.gauss() * 0.5, y: by + b.gauss() * 0.5, r: ballR, conf: 0.8 } });
  }
  return { raw, fps, truth };
}

// 당기고 밀기: 공이 앞(멀리)↔몸 쪽(가까이)으로 왔다 갔다. 당기기(먼 자리에서 발바닥) → 밀기(가까운 자리에서 같은 발)
export function synthPullPush(o = {}) {
  const b = base(o), { fps, H, ground, x0, ballR } = b;
  const still = o.still ?? 1, cycles = o.cycles ?? 12, half = o.half ?? 0.3;
  const far = x0 + 0.32 * H, near = x0 + 0.1 * H, by = ground - ballR;
  const touches = [];
  for (let k = 0; k < cycles * 2; k++) touches.push({ t: still + 0.3 + k * half, kind: k % 2 ? 'push' : 'pull', foot: Math.floor(k / 2) % 2 ? 'l' : 'r' });
  const start = touches[0].t, end = touches[touches.length - 1].t + half;
  const ballX = t => {
    if (t <= start) return far;
    if (t >= end) return far;
    const k = Math.floor((t - start) / half), r = (t - start - k * half) / half;
    return k % 2 === 0 ? far + (near - far) * r : near + (far - near) * r;
  };
  const raw = [];
  for (let i = 0; i < Math.round((end + 0.8) * fps); i++) {
    const t = i / fps, bx = ballX(t), foot = { l: { x: x0 - 0.04 * H, lift: 0 }, r: { x: x0 + 0.02 * H, lift: 0 } };
    for (const tc of touches) {
      const w = bump(t, tc.t, 0.13); if (!w) continue;
      const f = foot[tc.foot];
      const tx = tc.kind === 'pull' ? (ballX(tc.t)) : ballX(tc.t) - ballR; // 당기기: 공 위, 밀기: 공 뒤
      f.x = f.x + (tx - f.x) * w; f.lift = (tc.kind === 'pull' ? 2 * ballR : ballR * 0.6) * w;
    }
    raw.push({ t: +t.toFixed(4), kp: b.body(foot), ball: { x: bx + b.gauss() * 0.5, y: by + b.gauss() * 0.5, r: ballR, conf: 0.8 } });
  }
  return { raw, fps, touches, cycles };
}

// 리프팅: 공이 발에서 튀어 올라 포물선으로 떨어지고 다시 발에 닿는다. n1 개 → 떨어뜨림 → n2 개
export function synthJuggle(o = {}) {
  const b = base(o), { fps, H, ground, x0, ballR } = b;
  const g = 9.8 / 1.75 * H; // px/s²
  const hc = 0.18 * H, ha = (o.apex ?? 0.65) * H, up = Math.sqrt(2 * (ha - hc) / g), period = 2 * up;
  const n1 = o.n1 ?? 12, n2 = o.n2 ?? 6, alt = o.alt ?? true, only = o.only ?? null;
  const bx = x0 + 0.2 * H, still = o.still ?? 1;
  const contacts = []; let t = still + 0.5;
  for (let k = 0; k < n1; k++) { contacts.push({ t, foot: only || (alt ? (k % 2 ? 'l' : 'r') : 'r') }); t += period; }
  const dropAt = t - period + up;            // 마지막 닿음 뒤 꼭대기에서 떨어짐
  const dropGround = dropAt + Math.sqrt(2 * (ha - ballR) / g);
  const restart = dropGround + 1.0;          // 1초 쉬고 손으로 다시 시작
  t = restart + 0.3;
  const c2 = []; for (let k = 0; k < n2; k++) { c2.push({ t, foot: only || (alt ? (k % 2 ? 'l' : 'r') : 'r') }); t += period; }
  const endT = t - period + period; // 마지막 뒤 한 번 더 꼭대기 → 끝
  const all = [...contacts, ...c2];
  const ballH = tt => {
    // 공 중심 높이(px, 바닥 위)
    for (const seq of [contacts, c2]) {
      const s0 = seq[0].t, sN = seq[seq.length - 1].t;
      if (tt >= s0 && tt <= sN + up) {
        const k = Math.min(seq.length - 1, Math.floor((tt - s0) / period)), dt = tt - seq[k].t;
        return hc + (g * up) * dt - 0.5 * g * dt * dt;
      }
    }
    if (tt > contacts[contacts.length - 1].t + up && tt < dropGround) { const dt = tt - dropAt; return ha - 0.5 * g * dt * dt; }
    if (tt >= dropGround && tt < restart) return ballR;
    if (tt >= restart && tt < c2[0].t) { const r = (tt - restart) / (c2[0].t - restart); return ballR + (hc - ballR) * r; } // 손으로 들어 올림
    if (tt < contacts[0].t) return hc + (contacts[0].t - tt) * 0;   // 처음: 발 위에 올려 둠
    return ballR;
  };
  const raw = [];
  for (let i = 0; i < Math.round((endT + 0.6) * fps); i++) {
    const tt = i / fps, foot = { l: { x: x0 - 0.03 * H, lift: 0 }, r: { x: x0 + 0.03 * H, lift: 0 } };
    for (const c of all) { const w = bump(tt, c.t, 0.15); if (!w) continue; const f = foot[c.foot]; f.x = f.x + (bx + 0.02 * H - f.x) * w; f.lift = (hc - ballR) * w; }
    const h = Math.max(ballR, ballH(tt));
    raw.push({ t: +tt.toFixed(4), kp: b.body(foot), ball: { x: bx + b.gauss() * 0.5, y: ground - h + b.gauss() * 0.5, r: ballR, conf: 0.8 } });
  }
  return { raw, fps, contacts: all, best: Math.max(n1, n2), total: n1 + n2, drops: 1 };
}
