// 관절 선 다시 보기: 영상 위에 원재료(관절·공)를 겹쳐 그린다. 영상은 이번에 연 것이거나, 갤러리에서 같은 영상을 다시 고른 것
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import * as S from '../store.js';
import { drawSkeleton, COL } from '../lib/draw';
import type { RawFrame, Rec } from '../lib/types';
import type { Ctx } from './App';

export interface ReplayHandle { seek: (t: number, play?: boolean) => void }

export const Replay = forwardRef<ReplayHandle, { rec: Rec; ctx: Ctx }>(function Replay({ rec, ctx }, ref) {
  const [blob, setBlob] = useState<Blob | undefined>(ctx.liveVideo.get(rec.id));
  const [url, setUrl] = useState<string>();
  const [raw, setRaw] = useState<RawFrame[] | null>(null);
  const [pose, setPose] = useState(true);
  const [slow, setSlow] = useState(false);
  const [playing, setPlaying] = useState(false);
  const head = useRef<HTMLSpanElement>(null);
  const v = useRef<HTMLVideoElement>(null), cv = useRef<HTMLCanvasElement>(null);
  const r = rec.result;
  // 시간 띠는 실제 영상 길이 기준(구간만 분석한 기록도 영상 시각 그대로라 맞게 그려짐)
  const [vdur, setVdur] = useState(0);
  const dur = vdur || (rec.range ? rec.range.t1 : r.dur) || 1;
  const marks = (r.segs || []).flatMap(s => s.marks);
  const pc = (t: number) => `${(100 * t / dur).toFixed(2)}%`;

  useEffect(() => { if (!blob) return; const u = URL.createObjectURL(blob); setUrl(u); return () => URL.revokeObjectURL(u); }, [blob]);
  useEffect(() => { if (blob) S.gunzip(rec.rawGz).then(setRaw); }, [blob, rec.rawGz]);
  useEffect(() => { if (v.current) v.current.playbackRate = slow ? 0.35 : 1; }, [slow, url]);

  useImperativeHandle(ref, () => ({
    seek: (t, play) => { const el = v.current; if (!el) return; el.currentTime = Math.max(0, t); if (play) { setSlow(true); el.playbackRate = 0.35; el.play(); } },
  }));

  // 그리기: 영상 시각에 가장 가까운 원재료 장면
  useEffect(() => {
    let id = 0;
    const loop = () => {
      const el = v.current, c = cv.current;
      if (el && c && c.width) {
        if (head.current) head.current.style.left = pc(el.currentTime); // 매 장면 다시 그리지 않게 직접 옮김
        const g = c.getContext('2d')!; g.clearRect(0, 0, c.width, c.height);
        if (pose && raw?.length) {
          const t = el.currentTime; let lo = 0, hi = raw.length - 1;
          while (hi - lo > 1) { const m = (lo + hi) >> 1; if (raw[m].t <= t) lo = m; else hi = m; }
          const f = Math.abs(raw[hi].t - t) < Math.abs(raw[lo].t - t) ? raw[hi] : raw[lo];
          if (Math.abs(f.t - t) <= 0.25) {
            const sc = c.width / (r.scan?.frame?.w || c.width);
            drawSkeleton(g, f, sc);
            const hit = marks.find(m => Math.abs(m.t - t) < 0.08);
            if (hit && f.ball) { g.strokeStyle = hit.foot === 'l' ? COL.l : hit.foot === 'r' ? COL.r : '#fff'; g.lineWidth = Math.max(4, c.width / 160); g.beginPath(); g.arc(f.ball.x * sc, f.ball.y * sc, f.ball.r * sc + c.width / 80, 0, 7); g.stroke(); }
          }
        }
      }
      id = requestAnimationFrame(loop);
    };
    id = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(id);
  }, [raw, pose, url]);

  if (!blob) return (
    <label className="reopen"><input type="file" accept="video/*" onChange={e => {
      const f = e.target.files?.[0]; if (!f) return;
      if (rec.size && f.size !== rec.size) ctx.toast('다른 영상 같아요. 그래도 열어 볼게요.');
      ctx.liveVideo.set(rec.id, f); setBlob(f);
    }} />🎬 갤러리에서 같은 영상을 다시 고르면<br />관절 선을 겹쳐 볼 수 있어요</label>
  );
  return (
    <>
      <div className="player">
        <video ref={v} src={url} playsInline muted preload="auto" onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)}
          onLoadedMetadata={e => { const el = e.currentTarget; setVdur(el.duration); if (rec.range) el.currentTime = rec.range.t0; if (cv.current) { cv.current.width = el.videoWidth; cv.current.height = el.videoHeight; } }} />
        <canvas ref={cv} />
      </div>
      <div className="pctl">
        <button onClick={() => { const el = v.current; if (el) el.paused ? el.play() : el.pause(); }}>{playing ? '⏸ 멈춤' : '▶ 재생'}</button>
        <button className={slow ? 'on' : ''} onClick={() => setSlow(s => !s)}>🐢 느리게</button>
        <button className={pose ? 'on' : ''} onClick={() => setPose(p => !p)}>🦴 관절 선</button>
      </div>
      <div className="tl" onClick={e => { const rc = e.currentTarget.getBoundingClientRect(); if (v.current) v.current.currentTime = (e.clientX - rc.left) / rc.width * dur; }}>
        {rec.range && <span className="band" style={{ left: pc(rec.range.t0), width: pc(rec.range.t1 - rec.range.t0) }} />}
        {(r.segs || []).map((s, i) => <span key={i} className="band" style={{ left: pc(s.t0), width: pc(Math.max(0.05, s.t1 - s.t0)) }} />)}
        {marks.map((m, i) => <i key={i} className={m.foot || 'u'} style={{ left: pc(m.t) }} />)}
        {(r.segs || []).flatMap(s => s.drops || []).map((t, i) => <i key={'d' + i} className="drop" style={{ left: pc(t) }} />)}
        <span className="head" ref={head} />
      </div>
      <div className="legend"><b className="l">■ 왼발</b> <b className="r">■ 오른발</b> ■ 기타 · 띠를 누르면 그 순간으로 · 초록 = 알아챈 구간</div>
    </>
  );
});
