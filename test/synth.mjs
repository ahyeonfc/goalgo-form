// 시험용 가짜 영상 원재료: 정면에서 찍은, 좌우로 지그재그하며 드리블하는 사람.
// 정답(터치 시각·발, 걸음 수, 방향 전환 수)을 알고 있어 엔진이 맞게 찾는지 확인할 수 있다.

export function synthDribble(o = {}) {
  const fps = o.fps ?? 30, H = o.Hpx ?? 600, ground = 900, x0 = 640;
  const still = o.still ?? 1.0, dur = o.dur ?? 6.0;       // 처음 still 초는 가만히 서 있음
  const A = (o.amp ?? 0.5) * H, f = o.freq ?? 0.5;         // 좌우 흔들림 폭·빈도(Hz)
  const stepHz = o.stepHz ?? 2.0;                          // 발 하나의 걸음 빈도(두 발 합치면 2배)
  const touchEvery = o.touchEvery ?? 0.4, leftShare = o.leftShare ?? 0.5;
  const noise = o.noise ?? 1.0, ballR = 22 / 175 * H / 2;
  let seed = o.seed ?? 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const gauss = () => noise * Math.sqrt(-2 * Math.log(rnd() + 1e-12)) * Math.cos(2 * Math.PI * rnd());

  const n = Math.round((still + dur) * fps);
  const T = i => i / fps;
  const hipX = t => t < still ? x0 : x0 + A * Math.sin(2 * Math.PI * f * (t - still));
  // 발: 걸음 주기의 앞 절반은 바닥(그 자리에 고정), 뒤 절반은 들어 올려 다음 자리로 옮김
  const foot = (t, side) => {
    const off = side === 'l' ? -0.08 * H : 0.08 * H;
    if (t < still) return { x: x0 + off, lift: 0 };
    const ph0 = side === 'l' ? 0 : 0.5;
    const u = (t - still) * stepHz + ph0, k = Math.floor(u), ph = u - k;
    const stanceX = kk => hipX(still + (kk - ph0) / stepHz) + off;
    if (ph < 0.5) return { x: stanceX(k), lift: 0 };
    const r = (ph - 0.5) / 0.5;
    return { x: stanceX(k) + (stanceX(k + 1) - stanceX(k)) * r, lift: 0.06 * H * Math.sin(Math.PI * r) };
  };
  // 정답 터치: still 뒤 touchEvery 마다, 발은 leftShare 비율로 왼발
  const truth = [];
  for (let t = still + 0.3, k = 0; t < still + dur - 0.3; t += touchEvery, k++) {
    const side = leftShare >= 1 ? 'l' : leftShare <= 0 ? 'r' : (k % 2 === 0 ? 'l' : 'r'); // 0.5 면 번갈아
    truth.push({ t: +t.toFixed(4), foot: side });
  }
  const toeOf = (t, side) => { const fp = foot(t, side); return { x: fp.x, y: ground - fp.lift }; };
  const ballAt = t => {
    if (t <= truth[0].t) { const p = toeOf(truth[0].t, truth[0].foot); return { x: p.x, y: p.y - ballR * 0.2 }; }
    for (let k = 0; k < truth.length - 1; k++) {
      const a = truth[k], b = truth[k + 1];
      if (t <= b.t) {
        const pa = toeOf(a.t, a.foot), pb = toeOf(b.t, b.foot), r = (t - a.t) / (b.t - a.t);
        // 터치 사이에는 공이 앞으로(화면 아래쪽) 살짝 나갔다 돌아옴
        return { x: pa.x + (pb.x - pa.x) * r, y: pa.y + (pb.y - pa.y) * r + 0.06 * H * Math.sin(Math.PI * r) };
      }
    }
    const p = toeOf(truth[truth.length - 1].t, truth[truth.length - 1].foot); return { x: p.x, y: p.y };
  };

  const raw = [];
  for (let i = 0; i < n; i++) {
    const t = T(i), hx = hipX(t);
    const kp = new Array(33).fill(null).map(() => [hx, ground - 0.9 * H, 0.2]);
    const set = (j, x, y, v = 0.95) => { kp[j] = [x + gauss(), y + gauss(), v]; };
    set(0, hx, ground - 0.915 * H);                    // 코
    set(2, hx - 0.03 * H, ground - 0.936 * H); set(5, hx + 0.03 * H, ground - 0.936 * H); // 눈
    set(7, hx - 0.07 * H, ground - 0.93 * H); set(8, hx + 0.07 * H, ground - 0.93 * H);   // 귀
    set(11, hx - 0.13 * H, ground - 0.818 * H); set(12, hx + 0.13 * H, ground - 0.818 * H); // 어깨
    set(15, hx - 0.2 * H, ground - 0.5 * H); set(16, hx + 0.2 * H, ground - 0.5 * H);     // 손목
    set(23, hx - 0.08 * H, ground - 0.53 * H); set(24, hx + 0.08 * H, ground - 0.53 * H); // 엉덩이
    for (const [side, knee, ank, heel, toe] of [['l', 25, 27, 29, 31], ['r', 26, 28, 30, 32]]) {
      const fp = foot(t, side), hipSide = hx + (side === 'l' ? -0.08 : 0.08) * H;
      set(knee, (hipSide + fp.x) / 2, ground - 0.285 * H - fp.lift * 0.5);
      set(ank, fp.x, ground - 0.039 * H - fp.lift);
      set(heel, fp.x, ground - 0.01 * H - fp.lift);
      set(toe, fp.x, ground - fp.lift);
    }
    const b = t < still ? { x: x0 - 0.08 * H, y: ground - ballR * 0.2 } : ballAt(t);
    raw.push({ t: +t.toFixed(4), kp, ball: { x: b.x + gauss(), y: b.y + gauss(), r: ballR, conf: 0.8 } });
  }
  // 좌우 sin 의 꺾이는 점(속도 방향이 뒤집힘): (k + 0.5) / (2f) 초 < dur
  const cutsTruth = Math.floor(2 * f * dur - 0.5 - 1e-9) + 1;
  const stepsTruth = Math.floor(dur * stepHz) * 2;
  return { raw, fps, truth, cutsTruth, stepsTruth, still, dur };
}
