"""샘플 영상 → 원재료(raw) JSON. 앱의 src/scan.js 와 같은 규칙을 파이썬 MediaPipe 로 돌린다(브라우저 흉내 모드보다 훨씬 빠름).

같은 점: 처리 너비, 자세(pose_landmarker), 공(efficientdet "sports ball") 전체 + 사람 주변 확대 한 번 더,
몸 가깝고 앞 장면과 이어지는 공 고르기, 1초 넘게 같은 자리의 공(바닥의 다른 공) 거르기.
쓰는 법: python3 tools/extract_raw.py 영상.mp4 출력.json --pose 모델.task --ball 모델.tflite [--width 960] [--fps 30]
출력: {"raw": [{t, kp:[[x,y,vis]*33]|null, ball:{x,y,r,conf}|null}], "W", "H", "dur"}  (앱과 같은 형식)
"""
import argparse, json, math, sys
import cv2
import mediapipe as mp
from mediapipe.tasks import python as mpt
from mediapipe.tasks.python import vision


def pick_ball(cands, prev, body, statics, feet):
    if not cands:
        return None
    H = body["h"] if body else None
    best, bs = None, -1e9
    for c in cands:
        sc = c["conf"]
        st = next((s for s in statics if math.hypot(s["x"] - c["x"], s["y"] - c["y"]) < max(6, c["r"] * 0.6)), None)
        if st and st["n"] >= 25 and H and not any(math.hypot(f[0] - c["x"], f[1] - c["y"]) < 0.2 * H for f in feet):
            sc -= 0.8
        if body:
            dx = max(0, body["x0"] - c["x"], c["x"] - body["x1"]); dy = max(0, body["y0"] - c["y"], c["y"] - body["y1"])
            sc -= 1.2 * math.hypot(dx, dy) / H
        if prev and H:
            sc -= 0.6 * min(1, math.hypot(c["x"] - prev["x"], c["y"] - prev["y"]) / H)
        if sc > bs:
            bs, best = sc, c
    return best


def dedupe(cs):
    out = []
    for c in sorted(cs, key=lambda c: -c["conf"]):
        if not any(math.hypot(o["x"] - c["x"], o["y"] - c["y"]) < max(o["r"], c["r"]) for o in out):
            out.append(c)
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("video"); ap.add_argument("out")
    ap.add_argument("--pose", required=True); ap.add_argument("--ball", required=True)
    ap.add_argument("--width", type=int, default=960); ap.add_argument("--fps", type=float, default=30)
    a = ap.parse_args()
    cap = cv2.VideoCapture(a.video)
    src_fps = cap.get(cv2.CAP_PROP_FPS) or 30
    n = int(cap.get(cv2.CAP_PROP_FRAME_COUNT)); vw = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH)); vh = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    W = min(a.width, vw); H = round(W * vh / vw); k_src = vw / W
    step = max(1, round(src_fps / min(a.fps, src_fps)))
    pose = vision.PoseLandmarker.create_from_options(vision.PoseLandmarkerOptions(base_options=mpt.BaseOptions(model_asset_path=a.pose), running_mode=vision.RunningMode.VIDEO, num_poses=1))
    mk = lambda thr: vision.ObjectDetector.create_from_options(vision.ObjectDetectorOptions(base_options=mpt.BaseOptions(model_asset_path=a.ball), running_mode=vision.RunningMode.VIDEO, score_threshold=thr, category_allowlist=["sports ball"], max_results=3))
    ball, ball2 = mk(0.2), mk(0.15)
    raw, prev, statics, i, mono = [], None, [], 0, 0
    while True:
        ok, frame = cap.read()
        if not ok: break
        if i % step:
            i += 1; continue
        t = i / src_fps; i += 1; mono += 33
        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        small = cv2.resize(rgb, (W, H), interpolation=cv2.INTER_AREA)
        img = mp.Image(image_format=mp.ImageFormat.SRGB, data=small)
        pr = pose.detect_for_video(img, mono)
        kp = None
        if pr.pose_landmarks:
            kp = [[round(p.x * W, 1), round(p.y * H, 1), round(p.visibility or 0, 2)] for p in pr.pose_landmarks[0]]
        br = ball.detect_for_video(img, mono)
        cands = [{"x": d.bounding_box.origin_x + d.bounding_box.width / 2, "y": d.bounding_box.origin_y + d.bounding_box.height / 2, "r": (d.bounding_box.width + d.bounding_box.height) / 4, "conf": d.categories[0].score} for d in br.detections]
        body = None
        if kp:
            vis = [p for p in kp if p[2] >= 0.5 and -50 < p[0] < W + 50 and -50 < p[1] < H + 50]
            if len(vis) >= 6:
                xs = [p[0] for p in vis]; ys = [p[1] for p in vis]
                x0, x1, y0, y1 = min(xs), max(xs), min(ys), max(ys); h = max(40, y1 - y0)
                body = {"x0": x0, "x1": x1, "y0": y0, "y1": y1, "h": h}
                cx0, cx1 = max(0, x0 - 0.6 * h), min(W, x1 + 0.6 * h); cy0, cy1 = max(0, y0 - 0.8 * h), min(H, y1 + 0.15 * h)
                cw, ch = cx1 - cx0, cy1 - cy0
                if cw > 20 and ch > 20:
                    # 원본 화질에서 잘라 640px 안팎으로 키움
                    sx0, sy0, sx1, sy1 = int(cx0 * k_src), int(cy0 * k_src), int(cx1 * k_src), int(cy1 * k_src)
                    crop = rgb[sy0:sy1, sx0:sx1]
                    kk = min(640 / max(1, crop.shape[1]), 640 / max(1, crop.shape[0]), 3)
                    crop = cv2.resize(crop, (max(1, round(crop.shape[1] * kk)), max(1, round(crop.shape[0] * kk))))
                    r2 = ball2.detect_for_video(mp.Image(image_format=mp.ImageFormat.SRGB, data=crop.copy()), mono)
                    f = 1 / (kk * k_src)
                    cands += [{"x": cx0 + (d.bounding_box.origin_x + d.bounding_box.width / 2) * f, "y": cy0 + (d.bounding_box.origin_y + d.bounding_box.height / 2) * f, "r": (d.bounding_box.width + d.bounding_box.height) / 4 * f, "conf": d.categories[0].score} for d in r2.detections]
                    cands = dedupe(cands)
        for c in cands:
            s0 = next((s for s in statics if math.hypot(s["x"] - c["x"], s["y"] - c["y"]) < max(6, c["r"] * 0.6)), None)
            if s0: s0["n"] += 1; s0["seen"] = mono
            else: statics.append({"x": c["x"], "y": c["y"], "n": 1, "seen": mono})
        statics = [s for s in statics if mono - s["seen"] <= 33 * 15]
        feet = [kp[j] for j in (27, 28, 31, 32) if kp[j][2] >= 0.5] if kp else []
        b = pick_ball(cands, prev, body, statics, feet)
        if b: prev = b
        raw.append({"t": round(t, 4), "kp": kp, "ball": b and {"x": round(b["x"], 1), "y": round(b["y"], 1), "r": round(b["r"], 1), "conf": round(b["conf"], 2)}})
    json.dump({"raw": raw, "W": W, "H": H, "dur": n / src_fps}, open(a.out, "w"))
    pose_seen = sum(1 for f in raw if f["kp"]) / max(1, len(raw)); ball_seen = sum(1 for f in raw if f["ball"]) / max(1, len(raw))
    print(f"{a.video} 장면 {len(raw)} 자세 {pose_seen:.2f} 공 {ball_seen:.2f}", file=sys.stderr)


if __name__ == "__main__":
    main()
