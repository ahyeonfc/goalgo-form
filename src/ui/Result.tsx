// 코칭 결과: 요약 → 동작별 코칭 카드 → 관절 선 다시 보기 → 장면 → 메모 → 분석 정보
import { useEffect, useMemo, useRef, useState } from 'react';
import * as S from '../store.js';
import { MOTION_KO } from '../engine/coach.js';
import { MOTION_IC, VIEW_KO } from '../config';
import { recompute } from '../lib/pipeline';
import { fmtT, hhmm, josa } from '../lib/fmt';
import type { Rec, Seg, Shot } from '../lib/types';
import { Replay, type ReplayHandle } from './Replay';
import type { Ctx } from './App';

const MK = MOTION_KO as Record<string, string>;

function useBlobUrls(shots: Shot[] | undefined) {
  const urls = useMemo(() => (shots || []).map(s => URL.createObjectURL(s.blob)), [shots]);
  useEffect(() => () => urls.forEach(URL.revokeObjectURL), [urls]);
  return urls;
}

export function Result({ ctx, rec: rec0 }: { ctx: Ctx; rec: Rec }) {
  const [rec, setRec] = useState(rec0);
  const [memo, setMemo] = useState(rec0.memo || '');
  const replay = useRef<ReplayHandle>(null);
  const urls = useBlobUrls(rec.shots);
  const r = rec.result, segs: Seg[] = r.segs || [];

  if (!r.free) return <LegacyResult ctx={ctx} rec={rec} onRecalc={setRec} />;

  const motions = [...new Set(segs.map(x => x.motion))];
  const nFix = segs.reduce((a, x) => a + x.coach.fixes.length, 0), nGood = segs.reduce((a, x) => a + x.coach.good.length, 0);
  const shotIdx = (k: number, title: string) => (rec.shots || []).findIndex(x => x.seg === k && x.fix === title);
  const jump = (t: number) => { document.getElementById('replay')?.scrollIntoView({ behavior: 'smooth', block: 'center' }); replay.current?.seek(t - 0.6, true); };
  const others = (rec.shots || []).map((s, i) => ({ s, u: urls[i] })).filter(x => !x.s.fix);

  return (
    <>
      <div className="sum">
        <div className="meta">{rec.lesson} {hhmm(rec.takenAt)} · {fmtT(r.dur)} · {Math.round(r.scan?.srcFps || r.fps)}fps · {VIEW_KO[r.view.view]}에서 찍음</div>
        <h2>{segs.length ? `${josa(motions.map(x => MOTION_IC[x] + ' ' + MK[x]).join(', '), '을', '를')} 알아챘어요` : '코칭할 동작을 찾지 못했어요'}</h2>
        <div className="chips">
          {segs.length > 0 && <><span className="chip on">👍 잘한 점 {nGood}</span><span className="chip">🔧 고칠 점 {nFix}</span></>}
          <span className="chip">🧍 몸 {Math.round(r.poseSeen * 100)}%</span><span className="chip">⚽ 공 {Math.round(r.ballSeen * 100)}%</span>
        </div>
      </div>
      {(r.notes || []).map((n, i) => <div key={i} className={'note' + (n.kind === 'warn' ? ' warn' : '')}>{n.text}</div>)}

      {segs.map((sg, k) => (
        <div className="card coach" key={k}>
          <div className="hd"><span className="ic">{MOTION_IC[sg.motion]}</span><div><b>{MK[sg.motion]}</b><span>{fmtT(sg.t0)} ~ {fmtT(sg.t1)} · {VIEW_KO[sg.view || 'unknown']}에서</span></div></div>
          <div className="bd">
            <div className="facts">{sg.coach.facts.map(f => <span key={f.k}>{f.k}<b>{f.v}</b></span>)}</div>
            {sg.coach.good.map(g => <div className="pt good" key={g.title}><span className="e">👍</span><div><b>{g.title}</b><p>{g.text}</p></div></div>)}
            {sg.coach.fixes.map(f => { const si = shotIdx(k, f.title); return (
              <div className="pt fix" key={f.title}><span className="e">🔧</span><div><b>{f.title}</b><p>{f.text}</p><small>근거: {f.why}</small>
                {si >= 0 && <img className="shot" src={urls[si]} alt="" />}
                {f.t != null && <button className="jump" onClick={() => jump(f.t!)}>▶ 이 장면 보기 ({fmtT(f.t)})</button>}</div></div>); })}
            {!sg.coach.fixes.length && <div className="nofix">이 영상에서는 근거 있게 짚을 고칠 점이 없어요. 기록이 쌓이면 지난번과 비교해 드릴게요.</div>}
            {sg.coach.drill && <div className="pt drill"><span className="e">🏋️</span><div><b>오늘의 연습 · {sg.coach.drill.name}</b><p>{sg.coach.drill.text}</p></div></div>}
            {sg.coach.tip && <div className="pt tip"><span className="e">📱</span><div><b>다음엔 이렇게 찍어 보세요</b><p>{sg.coach.tip}</p></div></div>}
          </div>
        </div>
      ))}

      <div className="card" id="replay"><h2>🦴 관절 선으로 다시 보기</h2><Replay ref={replay} rec={rec} ctx={ctx} /></div>

      {others.length > 0 && <div className="card"><h2>📸 장면</h2><div className="shots">{others.map(({ s, u }) => <figure key={s.t}><img src={u} alt="" /><figcaption>{s.cap}</figcaption></figure>)}</div></div>}

      <div className="card"><h2>📝 메모</h2>
        <textarea rows={3} placeholder="예: 왼발이 자꾸 늦음, 코치님이 무릎 더 굽히래" value={memo} onChange={e => setMemo(e.target.value)} />
        <button className="sec" onClick={async () => { const n = { ...rec, memo: memo.trim() }; await S.resPut(n); setRec(n); ctx.toast('메모를 일지에 저장했어요'); }}>메모 저장</button></div>

      <Info ctx={ctx} rec={rec} onRecalc={setRec} />
    </>
  );
}

function Info({ ctx, rec, onRecalc }: { ctx: Ctx; rec: Rec; onRecalc: (r: Rec) => void }) {
  const r = rec.result;
  const recalc = async () => { try { const c = await ctx.reloadCriteria(); onRecalc(await recompute(rec, ctx.profile, c)); ctx.toast('다시 계산했어요'); } catch (e: any) { ctx.toast(e.message); } };
  const download = () => {
    const { rawGz, shots, ...meta } = rec;
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(meta, null, 1)], { type: 'application/json' }));
    a.download = `goalgo-form_${rec.lesson}_${hhmm(rec.takenAt).replace(':', '')}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  };
  const del = async () => { if (!confirm('이 기록을 지울까요? 갤러리 영상은 그대로 남아요.')) return; await S.resDel(rec.id); ctx.back(); };
  return (
    <div className="card">
      <details><summary>분석 정보</summary><table><tbody>
        <tr><td>장면</td><td className="v">{r.frames}장 · {r.scan?.wallSec ?? '—'}초 걸림</td></tr>
        <tr><td>몸·공을 찾은 장면</td><td className="v">{Math.round(r.poseSeen * 100)}% · {Math.round(r.ballSeen * 100)}%</td></tr>
        <tr><td>공 크기 ÷ 키 (정상 약 {(22 / ctx.profile.heightCm).toFixed(2)})</td><td className="v">{r.ballRatio ?? '—'}</td></tr>
        <tr><td>모델</td><td className="v">{r.scan?.set ? `${r.scan.set.pose} · ${r.scan.set.delegate} · ${r.scan.set.width}px` : '—'}</td></tr>
        <tr><td>엔진</td><td className="v">{r.free || r.engine}</td></tr>
      </tbody></table></details>
      <div className="row2"><button className="sec" onClick={recalc}>최신 기준으로 다시 계산</button><button className="sec" onClick={download}>결과 파일 받기</button></div>
      <button className="sec" style={{ color: 'var(--bad)' }} onClick={del}>이 기록 지우기</button>
    </div>
  );
}

// 0.3.0 이전(드리블 점수) 기록: 다시 계산하면 새 코칭으로 바뀐다
function LegacyResult({ ctx, rec, onRecalc }: { ctx: Ctx; rec: Rec; onRecalc: (r: Rec) => void }) {
  return (<><div className="sum"><div className="meta">{rec.lesson} {hhmm(rec.takenAt)}</div><h2>예전 방식으로 분석한 기록이에요</h2><p className="sub">"최신 기준으로 다시 계산"을 누르면 새 코칭으로 바뀌어요.</p></div><Info ctx={ctx} rec={rec} onRecalc={onRecalc} /></>);
}
