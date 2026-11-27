// 분석 중 화면: 관절 선 미리보기, 진행 막대, 단계 표시
import { useEffect, useRef, useState } from 'react';
import * as S from '../store.js';
import { runAnalysis, type Progress } from '../lib/pipeline';
import type { Ctx } from './App';

const STEPS = ['영상 읽기', '몸·공 찾기', '동작 알아채기', '코칭 만들기'];

export function Run({ ctx, job }: { ctx: Ctx; job: { blob: Blob; fileName: string; lastMod?: number; inboxId?: number } }) {
  const cv = useRef<HTMLCanvasElement>(null);
  const ctl = useRef({ stop: false });
  const [p, setP] = useState<Progress>({ step: 0, pct: 0, text: '준비 중…' });
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const rec = await runAnalysis({ blob: job.blob, name: job.fileName, lastMod: job.lastMod, profile: ctx.profile, settings: ctx.settings, criteria: ctx.criteria, canvas: cv.current!, job: ctl.current, onProgress: q => alive && setP(q) });
        ctx.liveVideo.set(rec.id, job.blob);
        if (job.inboxId != null) await S.inboxDel(job.inboxId);
        if (!alive) return;
        history.replaceState({ v: 'result' }, '');
        ctx.go({ name: 'result', rec }, false);
      } catch (e: any) { if (alive) setErr(e?.message || String(e)); }
    })();
    return () => { alive = false; ctl.current.stop = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="card run">
      <h2>{job.fileName}</h2>
      <canvas ref={cv} />
      <div className="bar"><i style={{ width: `${Math.round(p.pct * 100)}%` }} /></div>
      <div className="steps">{STEPS.map((s, i) => <span key={s} className={i < p.step ? 'done' : i === p.step ? 'on' : ''}>{s}</span>)}</div>
      <p className="sub">{err || `${Math.round(p.pct * 100)}% · ${p.text}`}</p>
      {err ? <button className="sec" onClick={() => ctx.go({ name: 'home' }, false)}>처음으로</button>
        : <button className="sec" onClick={() => { ctl.current.stop = true; }}>멈추기</button>}
    </div>
  );
}
