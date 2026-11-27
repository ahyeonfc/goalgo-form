// 영상 → 장면별 원재료(raw). MediaPipe 자세(33점) + 공 찾기(지금은 MediaPipe EfficientDet "sports ball").
// 두 번 훑기(lesson-build.md 4절): 1차 stepFps 간격, 2차는 터치 앞뒤 0.3초만 원래 장면 수로.
// 우리 공 감지기(YOLO26s 사본 ONNX)는 아직 없다. 생기면 makeBall 만 바꾼다.

const VER = '0.10.14';
const CDN = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${VER}`;
const POSE_URL = m => `https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_${m}/float16/1/pose_landmarker_${m}.task`;
const BALL_URL = m => `https://storage.googleapis.com/mediapipe-models/object_detector/${m}/float16/1/${m}.tflite`;

let vision = null;
async function models(set) {
  const { FilesetResolver, PoseLandmarker, ObjectDetector } = await import(/* @vite-ignore */ `${CDN}/vision_bundle.mjs`);
  if (!vision) vision = await FilesetResolver.forVisionTasks(`${CDN}/wasm`);
  const mk = async delegate => {
    const pose = await PoseLandmarker.createFromOptions(vision, { baseOptions: { modelAssetPath: POSE_URL(set.pose), delegate }, runningMode: 'VIDEO', numPoses: 4, minPoseDetectionConfidence: 0.4 }); // 여러 사람을 찾고 그중 분석할 사람을 이어서 따라간다
    const ball = await ObjectDetector.createFromOptions(vision, { baseOptions: { modelAssetPath: BALL_URL(set.ball), delegate }, runningMode: 'VIDEO', scoreThreshold: 0.2, categoryAllowlist: ['sports ball'], maxResults: 3 });
    // 확대해서 한 번 더 보는 공 찾기(사람 주변만 잘라 크게 봄). 영상 모드는 시각이 이어져야 해서 따로 하나 둔다
    const ball2 = await ObjectDetector.createFromOptions(vision, { baseOptions: { modelAssetPath: BALL_URL(set.ball), delegate }, runningMode: 'VIDEO', scoreThreshold: 0.15, categoryAllowlist: ['sports ball'], maxResults: 3 });
    return { pose, ball, ball2, delegate };
  };
  try { return await mk(set.delegate); }
  catch (e) { if (set.delegate === 'GPU') return mk('CPU'); throw e; } // GPU 가 안 되는 폰은 CPU 로
}

function seekTo(video, t) {
  return new Promise(ok => {
    const h = () => { video.removeEventListener('seeked', h); ok(); };
    video.addEventListener('seeked', h);
    video.currentTime = t;
  });
}

// 공 후보 중 고르기(바닥에 다른 공이 여러 개 있어도 쓰는 공을 고르게):
// 점수 = 모델 점수 − 사람 몸(관절 상자)에서 떨어진 거리 − 앞 장면 공에서 떨어진 거리. 거리는 사람 키 기준
// 분석할 사람 고르기: 처음엔 사용자가 누른 점(target, 화면 비율 0~1)에 가장 가까운 사람, 없으면 가장 크게 보이는 사람.
// 그 뒤로는 앞 장면의 그 사람과 위치·크기가 가장 이어지는 사람(키 대비 거리)을 고른다. 다른 사람에게 넘어가지 않게.
function personBox(lm) {
  const vis = lm.filter(p => (p.visibility ?? 0) >= 0.5); const use = vis.length >= 4 ? vis : lm;
  const xs = use.map(p => p.x), ys = use.map(p => p.y);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  return { cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, h: Math.max(0.02, y1 - y0), area: (x1 - x0) * (y1 - y0) };
}
function pickPerson(all, track, target) {
  if (!all || !all.length) return null;
  const boxes = all.map((lm, i) => ({ i, ...personBox(lm) }));
  let best;
  if (track) best = boxes.reduce((a, b) => (Math.hypot(b.cx - track.cx, b.cy - track.cy) / track.h + Math.abs(Math.log(b.h / track.h)) < Math.hypot(a.cx - track.cx, a.cy - track.cy) / track.h + Math.abs(Math.log(a.h / track.h)) ? b : a));
  else if (target) best = boxes.reduce((a, b) => (Math.hypot(b.cx - target.x, b.cy - target.y) < Math.hypot(a.cx - target.x, a.cy - target.y) ? b : a));
  else best = boxes.reduce((a, b) => (b.area > a.area ? b : a));
  // 앞 사람과 너무 멀면(키의 1.2배 넘게 순간이동) 그 장면은 다른 사람으로 보고 비운다
  if (track && Math.hypot(best.cx - track.cx, best.cy - track.cy) > 1.2 * track.h) return { lm: null, box: null };
  return { lm: all[best.i], box: best };
}

function pickBall(cands, prev, body, statics = [], feet = []) {
  if (!cands.length) return null;
  const H = body ? body.h : null;
  let best = null, bs = -1e9;
  for (const c of cands) {
    let sc = c.conf;
    // 1초 넘게 같은 자리에 있는 공(바닥에 놓인 다른 공)은 발 바로 옆이 아니면 쓰는 공이 아님
    const st = statics.find(s => Math.hypot(s.x - c.x, s.y - c.y) < Math.max(6, c.r * 0.6));
    if (st && st.n >= 25 && H && !feet.some(f => Math.hypot(f[0] - c.x, f[1] - c.y) < 0.2 * H)) sc -= 0.8;
    if (body) { const dx = Math.max(0, body.x0 - c.x, c.x - body.x1), dy = Math.max(0, body.y0 - c.y, c.y - body.y1); sc -= 1.2 * Math.hypot(dx, dy) / H; }
    if (prev && H) sc -= 0.6 * Math.min(1, Math.hypot(c.x - prev.x, c.y - prev.y) / H);
    if (sc > bs) { bs = sc; best = c; }
  }
  return best;
}
import { loadRfBall, rfBallDetect } from './rfball.js';
const toCand = (d, ox = 0, oy = 0, k = 1) => { const b = d.boundingBox; return { x: ox + (b.originX + b.width / 2) * k, y: oy + (b.originY + b.height / 2) * k, r: (b.width + b.height) / 4 * k, conf: d.categories[0].score }; };
// 같은 공이 두 번(전체·확대) 잡히면 하나로
function dedupe(cs) { const out = []; for (const c of cs.sort((a, b) => b.conf - a.conf)) if (!out.some(o => Math.hypot(o.x - c.x, o.y - c.y) < Math.max(o.r, c.r))) out.push(c); return out; }

export class Scanner {
  constructor(video, canvas, set) { this.video = video; this.cv = canvas; this.ctx = canvas.getContext('2d', { willReadFrequently: false }); this.set = set; this.mono = 0; this.stop = false; this.crop = document.createElement('canvas'); this.cctx = this.crop.getContext('2d'); }
  async init(onSay) {
    onSay && onSay('분석 모델 준비 중… (처음 한 번은 내려받느라 시간이 걸려요)');
    this.m = await models(this.set);
    if (this.set.rfBall !== false) this.rf = await loadRfBall(onSay); // 보조 공 찾기(못 찾은 장면에만)
    const v = this.video, W = this.set.width;
    this.W = Math.min(W, v.videoWidth); this.H = Math.round(this.W * v.videoHeight / v.videoWidth);
    this.cv.width = this.W; this.cv.height = this.H;
  }
  async frameAt(t, prevBall) {
    await seekTo(this.video, t);
    this.ctx.drawImage(this.video, 0, 0, this.W, this.H);
    this.mono += 33; // MediaPipe 영상 모드는 시각이 늘 늘어나야 함
    const pr = this.m.pose.detectForVideo(this.cv, this.mono);
    const br = this.m.ball.detectForVideo(this.cv, this.mono);
    // 2차 훑기(건너뛰며 보기): 1차에서 그 시각 근처에 고른 사람 위치를 기준으로
    if (this.anchors && this.anchors.length) { let a = this.anchors[0]; for (const x of this.anchors) if (Math.abs(x[0] - t) < Math.abs(a[0] - t)) a = x; if (Math.abs(a[0] - t) <= 0.5) this.track = a[1]; }
    const pick = pickPerson(pr.landmarks, this.track, this.set.target);
    const lm = pick && pick.lm;
    if (pick && pick.box) { this.track = pick.box; this.lost = 0; }
    else if (this.track && ++this.lost > 15) this.track = null; // 15장 넘게 못 찾으면 처음부터 다시 고름(사용자가 누른 점 기준)
    const kp = lm ? lm.map(p => [+(p.x * this.W).toFixed(1), +(p.y * this.H).toFixed(1), +(p.visibility ?? 0).toFixed(2)]) : null;
    let cands = (br.detections || []).map(d => toCand(d));
    // 사람 주변 상자(관절): 옆으로 키의 0.6배, 위로 0.8배(리프팅 공), 아래로 0.15배 넓혀 원본 화질에서 잘라 다시 찾기
    let body = null;
    if (kp) {
      const vis = kp.filter(p => p[2] >= 0.5 && p[0] > -50 && p[0] < this.W + 50 && p[1] > -50 && p[1] < this.H + 50);
      if (vis.length >= 6) {
        const xs = vis.map(p => p[0]), ys = vis.map(p => p[1]);
        const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys), h = Math.max(40, y1 - y0);
        body = { x0, x1, y0, y1, h };
        const cx0 = Math.max(0, x0 - 0.6 * h), cx1 = Math.min(this.W, x1 + 0.6 * h), cy0 = Math.max(0, y0 - 0.8 * h), cy1 = Math.min(this.H, y1 + 0.15 * h);
        const cw = cx1 - cx0, ch = cy1 - cy0;
        if (cw > 20 && ch > 20) {
          // 원본 영상 화질로 잘라 640px 안팎으로 키운다
          const vw = this.video.videoWidth / this.W, k = Math.min(640 / (cw * vw), 640 / (ch * vw), 3) * vw;
          this.crop.width = Math.round(cw * k); this.crop.height = Math.round(ch * k);
          this.cctx.drawImage(this.video, cx0 * vw, cy0 * vw, cw * vw, ch * vw, 0, 0, this.crop.width, this.crop.height);
          const r2 = this.m.ball2.detectForVideo(this.crop, this.mono);
          cands = dedupe([...cands, ...(r2.detections || []).map(d => toCand(d, cx0, cy0, 1 / k))]);
        }
      }
    }
    // 두 번 찾아도 공이 없으면 RF-DETR 로 한 번 더(사람 주변 영역, 없으면 화면 전체)
    if (!cands.length && this.rf) {
      try {
        if (body) { const h = body.h, x0 = Math.max(0, body.x0 - 0.6 * h), x1 = Math.min(this.W, body.x1 + 0.6 * h), y0 = Math.max(0, body.y0 - 0.8 * h), y1 = Math.min(this.H, body.y1 + 0.15 * h), s = Math.max(x1 - x0, y1 - y0), cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, sx = Math.max(0, Math.min(this.W - s, cx - s / 2)), sy = Math.max(0, Math.min(this.H - s, cy - s / 2)), sw = Math.min(s, this.W), sh = Math.min(s, this.H); cands = await rfBallDetect(this.rf, this.cv, sx, sy, sw, sh, sx, sy, 1); }
        else cands = await rfBallDetect(this.rf, this.cv, 0, 0, this.W, this.H);
        this.rfHits = (this.rfHits || 0) + (cands.length ? 1 : 0); this.rfRuns = (this.rfRuns || 0) + 1;
      } catch (e) { this.rf = null; }
    }
    // 가만히 있는 공 기억: 후보마다 같은 자리에 몇 장 연속 있었나
    const st = this.statics || (this.statics = []);
    for (const c of cands) { const s0 = st.find(s => Math.hypot(s.x - c.x, s.y - c.y) < Math.max(6, c.r * 0.6)); if (s0) { s0.n++; s0.seen = this.mono; } else st.push({ x: c.x, y: c.y, n: 1, seen: this.mono }); }
    for (let k = st.length - 1; k >= 0; k--) if (this.mono - st[k].seen > 33 * 15) st.splice(k, 1); // 15장 넘게 안 보이면 잊음
    const feet = kp ? [27, 28, 31, 32].map(j => kp[j]).filter(p => p[2] >= 0.5) : [];
    const ball = pickBall(cands, prevBall, body, st, feet);
    const pb = pick && pick.box ? { cx: +pick.box.cx.toFixed(4), cy: +pick.box.cy.toFixed(4), h: +pick.box.h.toFixed(4) } : null;
    return { t: +t.toFixed(4), pb, kp, ball: ball && { x: +ball.x.toFixed(1), y: +ball.y.toFixed(1), r: +ball.r.toFixed(1), conf: +ball.conf.toFixed(2) } };
  }
  // times 순서대로 훑기. onFrame(장면, 진행률)
  async scanTimes(times, onFrame) {
    const out = []; let prev = null;
    for (let k = 0; k < times.length && !this.stop; k++) {
      const f = await this.frameAt(times[k], prev);
      if (f.ball) prev = f.ball;
      out.push(f);
      if (onFrame && (k % 3 === 0 || k === times.length - 1)) await onFrame(f, (k + 1) / times.length);
    }
    return out;
  }
  close() { try { this.m.pose.close(); this.m.ball.close(); this.m.ball2.close(); } catch (e) { } }
}

export function grid(t0, t1, fps) {
  const out = [], dt = 1 / fps;
  for (let t = t0; t <= t1 + 1e-9; t += dt) out.push(+t.toFixed(4));
  return out;
}

// 2차로 더 볼 시각: 사건 앞뒤 win 초를 원래 장면 수로. 이미 본 시각(±반 장면)은 뺀다.
export function denseTimes(evTimes, srcFps, dur, have, win = 0.3) {
  const dt = 1 / srcFps, seen = new Set(have.map(t => Math.round(t * srcFps)));
  const want = new Set();
  for (const t of evTimes) for (let x = Math.max(0, t - win); x <= Math.min(dur - 0.001, t + win); x += dt) {
    const k = Math.round(x * srcFps); if (!seen.has(k)) want.add(k);
  }
  return [...want].sort((a, b) => a - b).map(k => +(k / srcFps).toFixed(4));
}
