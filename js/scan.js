// 영상 → 장면별 원재료(raw). MediaPipe 자세(33점) + 공 찾기(지금은 MediaPipe EfficientDet "sports ball").
// 두 번 훑기(lesson-build.md 4절): 1차 stepFps 간격, 2차는 터치 앞뒤 0.3초만 원래 장면 수로.
// 우리 공 감지기(YOLO26s 사본 ONNX)는 아직 없다. 생기면 makeBall 만 바꾼다.

const VER = '0.10.14';
const CDN = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${VER}`;
const POSE_URL = m => `https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_${m}/float16/1/pose_landmarker_${m}.task`;
const BALL_URL = m => `https://storage.googleapis.com/mediapipe-models/object_detector/${m}/float16/1/${m}.tflite`;

let vision = null;
async function models(set) {
  const { FilesetResolver, PoseLandmarker, ObjectDetector } = await import(`${CDN}/vision_bundle.mjs`);
  if (!vision) vision = await FilesetResolver.forVisionTasks(`${CDN}/wasm`);
  const mk = async delegate => {
    const pose = await PoseLandmarker.createFromOptions(vision, { baseOptions: { modelAssetPath: POSE_URL(set.pose), delegate }, runningMode: 'VIDEO', numPoses: 1 });
    const ball = await ObjectDetector.createFromOptions(vision, { baseOptions: { modelAssetPath: BALL_URL(set.ball), delegate }, runningMode: 'VIDEO', scoreThreshold: 0.2, categoryAllowlist: ['sports ball'], maxResults: 3 });
    return { pose, ball, delegate };
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

// 공 후보 중 고르기: 앞 장면 공과 가까운 것, 없으면 점수 높은 것
function pickBall(dets, prev) {
  if (!dets.length) return null;
  const c = dets.map(d => { const b = d.boundingBox; return { x: b.originX + b.width / 2, y: b.originY + b.height / 2, r: (b.width + b.height) / 4, conf: d.categories[0].score }; });
  if (prev) c.sort((a, b) => Math.hypot(a.x - prev.x, a.y - prev.y) - Math.hypot(b.x - prev.x, b.y - prev.y));
  else c.sort((a, b) => b.conf - a.conf);
  return c[0];
}

export class Scanner {
  constructor(video, canvas, set) { this.video = video; this.cv = canvas; this.ctx = canvas.getContext('2d', { willReadFrequently: false }); this.set = set; this.mono = 0; this.stop = false; }
  async init(onSay) {
    onSay && onSay('분석 모델 준비 중… (처음 한 번은 내려받느라 시간이 걸려요)');
    this.m = await models(this.set);
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
    const lm = pr.landmarks && pr.landmarks[0];
    const kp = lm ? lm.map(p => [+(p.x * this.W).toFixed(1), +(p.y * this.H).toFixed(1), +(p.visibility ?? 0).toFixed(2)]) : null;
    const ball = pickBall(br.detections || [], prevBall);
    return { t: +t.toFixed(4), kp, ball: ball && { x: +ball.x.toFixed(1), y: +ball.y.toFixed(1), r: +ball.r.toFixed(1), conf: +ball.conf.toFixed(2) } };
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
  close() { try { this.m.pose.close(); this.m.ball.close(); } catch (e) { } }
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
