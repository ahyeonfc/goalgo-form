// 보조 공 찾기: RF-DETR Nano(Roboflow, Apache-2.0, COCO 학습)를 8비트로 줄인 것(public/models/rfdetr-nano-int8.onnx, 34MB).
// MediaPipe EfficientDet 이 공을 못 찾은 장면에만 돌린다(폰에서 느려서). 샘플 13개 40장씩 비교: 공 찾은 장면 EfficientDet 40% → RF-DETR 77%,
// 둘 다 찾은 장면의 95% 가 같은 자리(docs/free-analysis.md). 불러오기에 실패하면(오프라인 등) 조용히 빠진다.
const ORT_VER = '1.20.1';
const ORT = `https://cdn.jsdelivr.net/npm/onnxruntime-web@${ORT_VER}/dist/`;
const SIZE = 384, BALL = 37; // COCO 91 칸에서 sports ball
const MEAN = [0.485, 0.456, 0.406], STD = [0.229, 0.224, 0.225];

let loading = null;
export function loadRfBall(onSay) {
  if (!loading) loading = (async () => {
    onSay && onSay('공 찾기 보조 모델 준비 중… (처음 한 번 약 34MB)');
    const ort = await import(/* @vite-ignore */ ORT + 'ort.wasm.min.mjs');
    ort.env.wasm.wasmPaths = ORT;
    ort.env.wasm.numThreads = self.crossOriginIsolated ? Math.min(4, navigator.hardwareConcurrency || 2) : 1;
    const buf = await fetch('models/rfdetr-nano-int8.onnx', { cache: 'force-cache' }).then(r => { if (!r.ok) throw new Error('모델 없음'); return r.arrayBuffer(); });
    const sess = await ort.InferenceSession.create(buf, { executionProviders: ['wasm'], graphOptimizationLevel: 'all' });
    const cv = document.createElement('canvas'); cv.width = cv.height = SIZE;
    const g = cv.getContext('2d', { willReadFrequently: true });
    const data = new Float32Array(3 * SIZE * SIZE);
    return { ort, sess, cv, g, data };
  })().catch(e => { console.warn('RF-DETR 불러오기 실패', e); return null; });
  return loading;
}

/** src(캔버스)의 (sx,sy,sw,sh) 영역에서 공 후보. 반환 좌표는 dst 좌표계(ox,oy + 영역 좌표 × k) */
export async function rfBallDetect(m, src, sx, sy, sw, sh, ox = 0, oy = 0, k = 1, thr = 0.35) {
  if (!m) return [];
  const { ort, sess, g, data } = m;
  g.drawImage(src, sx, sy, sw, sh, 0, 0, SIZE, SIZE);
  const px = g.getImageData(0, 0, SIZE, SIZE).data, N = SIZE * SIZE;
  for (let i = 0; i < N; i++) for (let c = 0; c < 3; c++) data[c * N + i] = (px[i * 4 + c] / 255 - MEAN[c]) / STD[c];
  const out = await sess.run({ input: new ort.Tensor('float32', data, [1, 3, SIZE, SIZE]) });
  const dets = out.dets.data, lab = out.labels.data, nq = out.dets.dims[1], nc = out.labels.dims[2], res = [];
  for (let q = 0; q < nq; q++) {
    const p = 1 / (1 + Math.exp(-lab[q * nc + BALL]));
    if (p < thr) continue;
    const cx = dets[q * 4] * sw, cy = dets[q * 4 + 1] * sh, w = dets[q * 4 + 2] * sw, h = dets[q * 4 + 3] * sh;
    res.push({ x: ox + cx * k, y: oy + cy * k, r: (w + h) / 4 * k, conf: p });
  }
  return res.sort((a, b) => b.conf - a.conf).slice(0, 3);
}
