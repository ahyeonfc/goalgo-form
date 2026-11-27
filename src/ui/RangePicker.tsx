// 분석할 구간 고르기: 미리보기를 보며 시작·끝을 막대로 정한다. 기본은 전체
import { useEffect, useRef, useState } from 'react';
import { fmtT } from '../lib/fmt';

export function RangePicker({ blob, name, onPick, onCancel }: { blob: Blob; name: string; onPick: (r?: { t0: number; t1: number }, target?: { x: number; y: number }) => void; onCancel: () => void }) {
  const [url] = useState(() => URL.createObjectURL(blob));
  const [dur, setDur] = useState(0);
  const [t0, setT0] = useState(0);
  const [t1, setT1] = useState(0);
  const [target, setTarget] = useState<{ x: number; y: number } | undefined>();
  const v = useRef<HTMLVideoElement>(null);
  useEffect(() => () => URL.revokeObjectURL(url), [url]);

  const seek = (t: number) => { if (v.current) { v.current.pause(); v.current.currentTime = t; } };
  const len = Math.max(0, t1 - t0);
  const step = dur > 120 ? 1 : 0.1;
  return (
    <div className="card pick-range">
      <h2>✂️ 분석할 구간 고르기</h2>
      <p className="sub">{name} · 전체 {fmtT(dur)}. 필요한 부분만 고르면 더 빨리 분석해요.</p>
      <div className="player tap" onClick={e => { const rc = e.currentTarget.getBoundingClientRect(); setTarget({ x: (e.clientX - rc.left) / rc.width, y: (e.clientY - rc.top) / rc.height }); seek(t0); }}>
        <video ref={v} src={url} playsInline muted preload="auto" controls={false}
          onLoadedMetadata={e => { const d = e.currentTarget.duration; setDur(d); setT1(d); }} />
        {target && <span className="tmark" style={{ left: `${target.x * 100}%`, top: `${target.y * 100}%` }} />}
      </div>
      <p className="sub">👆 여러 사람이 나오면 <b>분석할 사람을 눌러 주세요</b>(시작 장면 기준). 한 사람이면 안 눌러도 돼요.{target ? ' · 고른 사람 ⭕' : ''}</p>
      {dur > 0 && <>
        <div className="rng-bar"><i style={{ left: `${(100 * t0) / dur}%`, width: `${(100 * len) / dur}%` }} /></div>
        <label>시작 <b>{fmtT(t0)}</b></label>
        <input type="range" min={0} max={dur} step={step} value={t0} onChange={e => { const x = Math.min(+e.target.value, t1 - 1); setT0(Math.max(0, x)); seek(Math.max(0, x)); }} />
        <label>끝 <b>{fmtT(t1)}</b></label>
        <input type="range" min={0} max={dur} step={step} value={t1} onChange={e => { const x = Math.max(+e.target.value, t0 + 1); setT1(Math.min(dur, x)); seek(Math.min(dur, x)); }} />
        <div className="row2">
          <button className="sec" onClick={() => { if (v.current) { v.current.currentTime = t0; v.current.play(); } }}>▶ 고른 구간 보기</button>
          <button className="sec" onClick={() => { setT0(0); setT1(dur); seek(0); }}>전체로 되돌리기</button>
        </div>
        <button className="main" onClick={() => onPick(t0 <= 0.05 && t1 >= dur - 0.05 ? undefined : { t0, t1 }, target)}>
          {t0 <= 0.05 && t1 >= dur - 0.05 ? `전체 분석하기 (${fmtT(dur)})` : `이 구간 분석하기 (${fmtT(len)})`}
        </button>
      </>}
      <button className="sec" onClick={onCancel}>취소</button>
    </div>
  );
}
