// 처음 화면: 영상 고르기, 받은 영상, 잘 찍는 법, 설치 안내, 코칭 일지
import { useEffect, useState } from 'react';
import * as S from '../store.js';
import { MOTION_KO } from '../engine/coach.js';
import { MOTION_IC } from '../config';
import { hhmm } from '../lib/fmt';
import type { Rec } from '../lib/types';
import type { Ctx } from './App';

const MK = MOTION_KO as Record<string, string>;
let installEvt: any = null;
addEventListener('beforeinstallprompt', (e: Event) => { e.preventDefault(); installEvt = e; });

export function Home({ ctx }: { ctx: Ctx }) {
  const [list, setList] = useState<Rec[] | null>(null);
  const [inbox, setInbox] = useState<any[]>([]);
  const [canInstall, setCanInstall] = useState(!!installEvt);
  const standalone = matchMedia('(display-mode: standalone)').matches || (navigator as any).standalone;

  useEffect(() => { (async () => { setInbox(await S.inboxAll()); setList((await S.resList()).reverse()); })(); }, []);
  useEffect(() => { const h = () => setCanInstall(true); addEventListener('beforeinstallprompt', h); return () => removeEventListener('beforeinstallprompt', h); }, []);

  const pick = (e: React.ChangeEvent<HTMLInputElement>) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) ctx.go({ name: 'run', blob: f, fileName: f.name }); };
  const open = async (id: string) => { const rec = await S.resGet(id); if (rec) ctx.go({ name: 'result', rec }); };

  let day = '';
  return (
    <>
      <div className="hero">
        <div className="kicker">AI 개인 코칭</div>
        <h2>오늘 훈련, 영상만 넘기면<br />코칭해 드려요</h2>
        <p>무슨 동작인지 알아서 알아채고, 잘한 점과 고칠 점, 오늘의 연습을 알려 줘요.</p>
        <label className="cta"><input type="file" accept="video/*" onChange={pick} />🎥 훈련 영상 고르기</label>
        <div className="chips">{Object.entries(MOTION_IC).map(([k, ic]) => <span key={k} className="chip">{ic} {MK[k]}</span>)}</div>
      </div>

      {inbox.length > 0 && <>
        <h3 className="h3">📥 받은 영상 {inbox.length}개</h3>
        {inbox.map(it => <button key={it.id} className="item" onClick={() => ctx.go({ name: 'run', blob: it.blob, fileName: it.name, lastMod: it.lastModified, inboxId: it.id })}>
          <span className="ic">🎬</span><span className="k"><b>{it.name}</b><span>{(it.blob.size / 1048576).toFixed(0)}MB · 눌러서 코칭받기</span></span><span className="go">›</span></button>)}
      </>}

      <div className="card">
        <h2>📱 잘 찍는 법</h2>
        <div className="howto">
          <div><b>🧍</b>머리부터 발끝까지 다 보이게</div>
          <div><b>📏</b>3~4m 떨어져서</div>
          <div><b>📌</b>폰은 세워 두고 고정</div>
        </div>
        <p className="sub" style={{ marginTop: 10 }}>슈팅·패스는 슬로모션(120fps)으로 찍으면 공 속도까지 재요. 시작 전 1초 가만히 서 있으면 크기를 더 정확히 맞춰요.</p>
      </div>

      {!standalone && <div className="card">
        <h2>📲 홈 화면에 추가</h2>
        <p className="sub">설치하면 갤러리 → 공유 → "골고 폼"으로 영상을 바로 넘길 수 있어요. 크롬 메뉴(⋮) → "홈 화면에 추가".</p>
        {canInstall && <button className="sec" onClick={async () => { installEvt?.prompt(); await installEvt?.userChoice; installEvt = null; setCanInstall(false); }}>지금 설치</button>}
      </div>}

      <h3 className="h3">📒 코칭 일지</h3>
      {list === null ? <p className="empty">불러오는 중…</p> : !list.length ? <p className="empty">아직 기록이 없어요.<br />훈련 영상을 하나 골라 보세요.</p> :
        list.map(r => {
          const head = r.lesson !== day ? (day = r.lesson, <div className="day" key={'d' + r.id}>{r.lesson}</div>) : null;
          const segs = r.result.segs || [];
          if (!r.result.free) return [head, <button key={r.id} className="item" onClick={() => open(r.id)}><span className="ic">🎬</span><span className="k"><b>{r.name}</b><span>{hhmm(r.takenAt)} · 예전 분석(다시 계산하면 코칭이 생겨요)</span></span><span className="go">›</span></button>];
          const ms = [...new Set(segs.map(x => x.motion))];
          const fix = segs.flatMap(x => x.coach?.fixes || [])[0];
          return [head, <button key={r.id} className="item" onClick={() => open(r.id)}>
            <span className="ic">{ms.length ? MOTION_IC[ms[0]] : '🎬'}</span>
            <span className="k"><b>{ms.length ? ms.map(x => MK[x]).join(' · ') : '동작을 찾지 못함'}</b><span>{hhmm(r.takenAt)} · {fix ? '🔧 ' + fix.title : r.name}{r.memo ? ' · 📝' : ''}</span></span>
            <span className="go">›</span></button>];
        })}
    </>
  );
}
