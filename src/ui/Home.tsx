// 아래 메뉴 화면들: 분석(영상 고르기·받은 영상·잘 찍는 법·최근 코칭), 일지, 성장
import { useEffect, useState } from 'react';
import * as S from '../store.js';
import { MOTION_KO } from '../engine/coach.js';
import { MOTION_IC } from '../config';
import { hhmm } from '../lib/fmt';
import type { Rec } from '../lib/types';
import type { Ctx } from './App';
import { growth } from '../lib/compare';
import { driveReady, syncNow, getToken } from '../lib/drive';

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

  return (
    <>
      <div className="hero">
        <div className="kicker">AI 개인 코칭</div>
        <h2>오늘 훈련, 영상만 넘기면<br />코칭해 드려요</h2>
        <p>토 탭이든 리프팅이든 드리블이든, 어떤 훈련 영상이든 넣으면 잘한 점과 고칠 점, 오늘의 연습을 알려 줘요.</p>
        <label className="cta"><input type="file" accept="video/*" onChange={pick} />🎥 훈련 영상 고르기</label>
        <div className="chips"><span className="chip">🦶 양발 쓰임</span><span className="chip">🥁 박자</span><span className="chip">🧍 자세 높이</span><span className="chip">⚖️ 좌우 균형</span><span className="chip">⚽ 공 간수</span><span className="chip">📈 지난번과 비교</span></div>
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

      {list && list.length > 0 && <>
        <h3 className="h3">🕘 최근 코칭</h3>
        {list.slice(0, 3).map(r => <RecItem key={r.id} r={r} open={open} />)}
        {list.length > 3 && <button className="sec" onClick={() => ctx.go({ name: 'journal' }, false)}>일지 전체 보기 ({list.length}개)</button>}
      </>}
      <p className="ver">영상과 분석 결과는 이 폰 밖으로 나가지 않아요 · <a href="privacy.html">개인정보처리방침</a> · <a href="terms.html">이용약관</a></p>
    </>
  );
}

// 일지 탭: 날짜별 모든 기록
export function Journal({ ctx }: { ctx: Ctx }) {
  const [list, setList] = useState<Rec[] | null>(null);
  const [drvOn, setDrvOn] = useState(false);
  const [sync, setSync] = useState('');
  const load = () => S.resList().then((l: Rec[]) => setList(l.reverse()));
  useEffect(() => { load(); S.kvGet('driveOn').then((v: any) => setDrvOn(!!v && driveReady())); }, []);
  const open = async (id: string) => { const rec = await S.resGet(id); if (rec) ctx.go({ name: 'result', rec }); };
  const doSync = async () => {
    setSync('연결 중…');
    try { await getToken(true); const r = await syncNow(setSync); ctx.toast(`올림 ${r.up} · 받음 ${r.down}`); load(); }
    catch (e: any) { ctx.toast(e?.message || String(e)); } finally { setSync(''); }
  };
  let day = '';
  return (
    <>
      {drvOn && <button className="sec" disabled={!!sync} onClick={doSync} style={{ marginTop: 0 }}>{sync || '☁️ 드라이브와 동기화'}</button>}
      <h3 className="h3">📒 코칭 일지</h3>
      {list === null ? <p className="empty">불러오는 중…</p> : !list.length ? <p className="empty">아직 기록이 없어요.<br />분석 탭에서 훈련 영상을 하나 골라 보세요.</p> :
        list.map(r => {
          const head = r.lesson !== day ? (day = r.lesson, <div className="day" key={'d' + r.id}>{r.lesson}</div>) : null;
          return [head, <RecItem key={r.id} r={r} open={open} />];
        })}
    </>
  );
}

// 성장 탭
export function Growth() {
  const [list, setList] = useState<Rec[] | null>(null);
  useEffect(() => { S.resList().then(setList); }, []);
  if (list === null) return <p className="empty">불러오는 중…</p>;
  if (!list.length) return <p className="empty">아직 기록이 없어요.<br />영상을 두 번 이상 찍으면 얼마나 좋아졌는지 보여 드려요.</p>;
  return <><GrowthCard list={list} /><TrendCard list={list} /></>;
}

function RecItem({ r, open }: { r: Rec; open: (id: string) => void }) {
  const segs = r.result.segs || [];
  if (!r.result.free) return <button className="item" onClick={() => open(r.id)}><span className="ic">🎬</span><span className="k"><b>{r.name}</b><span>{hhmm(r.takenAt)} · 예전 분석(다시 계산하면 코칭이 생겨요)</span></span><span className="go">›</span></button>;
  const ms = [...new Set(segs.map(x => x.motion))];
  const fix = (r.result.general?.fixes || [])[0] || segs.flatMap(x => x.coach?.fixes || [])[0];
  return <button className="item" onClick={() => open(r.id)}>
    <span className="ic">{ms.length ? MOTION_IC[ms[0]] : '🧑‍🏫'}</span>
    <span className="k"><b>{ms.length ? ms.map(x => MK[x]).join(' · ') : r.result.general?.span ? '훈련 영상' : '코칭할 장면 없음'}</b><span>{r.lesson.slice(5)} {hhmm(r.takenAt)} · {fix ? '🔧 ' + fix.title : r.name}{r.memo ? ' · 📝' : ''}</span></span>
    <span className="go">›</span></button>;
}

// 전체 코칭 숫자 추이(최근 기록 순): 박자, 양발
function TrendCard({ list }: { list: Rec[] }) {
  const rows = list.filter(r => r.result.general?.p && r.result.general.span).slice(-8);
  if (rows.length < 2) return <div className="card"><h2>📈 기록 추이</h2><p className="sub">영상을 두 번 이상 분석하면 박자·양발 변화를 보여 드려요.</p></div>;
  const v = (r: Rec, k: string) => (r.result.general!.p as any)?.[k];
  return (
    <div className="card"><h2>📈 기록 추이 <small>최근 {rows.length}개</small></h2>
      <table className="settbl"><thead><tr><th>날짜</th><th>터치</th><th>초당</th><th>박자 흔들림</th><th>왼발</th></tr></thead><tbody>
        {rows.map(r => <tr key={r.id}><td>{r.lesson.slice(5)}</td><td>{v(r, 'touches') ?? '—'}</td><td>{v(r, 'rate') != null ? (+v(r, 'rate')).toFixed(1) : '—'}</td><td>{v(r, 'tempo_cv') != null ? Math.round(v(r, 'tempo_cv')) + '%' : '—'}</td><td>{v(r, 'touch_l') != null ? Math.round(v(r, 'touch_l')) + '%' : v(r, 'foot_move_l') != null ? Math.round(v(r, 'foot_move_l')) + '%' : '—'}</td></tr>)}
      </tbody></table>
    </div>
  );
}

// 이번 주 성장: 훈련 횟수·연속 일수, 최근 30일 동작별 처음 → 지금
function GrowthCard({ list }: { list: Rec[] }) {
  const g = growth(list);
  if (!g.weekSessions && !g.motions.length) return null;
  return (
    <div className="card growth">
      <h2>🌱 나의 성장 <small>최근 30일</small></h2>
      <div className="gstats">
        <div><b>{g.weekSessions}</b><span>이번 주 영상</span></div>
        <div><b>{g.weekDays}</b><span>이번 주 훈련한 날</span></div>
        <div><b>{g.streak}</b><span>연속 훈련 일수</span></div>
      </div>
      {g.motions.map(x => (
        <div key={x.motion} className="cmp-row">
          <span>{MOTION_IC[x.motion]} {MK[x.motion]} · {x.m.name}</span>
          <span className="v">{x.first.toFixed(x.m.dp)} → <b>{x.last.toFixed(x.m.dp)}</b>{x.m.unit}</span>
          <span className={x.better ? 'ok' : 'warn'}>{x.better ? '좋아짐' : '아쉬움'}</span>
        </div>
      ))}
      {!g.motions.length && <p className="sub">같은 동작을 두 번 이상 찍으면 얼마나 좋아졌는지 보여 드려요.</p>}
    </div>
  );
}
