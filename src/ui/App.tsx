// 화면 전체: 첫 설정 → 처음 화면 → 분석 중 → 코칭 결과 → 설정. 안드로이드 뒤로 가기는 history 로 처리
import { useCallback, useEffect, useRef, useState } from 'react';
import * as S from '../store.js';
import { DEF_SET, type Profile, type Settings } from '../config';
import { loadCriteria, type Criteria } from '../lib/pipeline';
import type { Rec } from '../lib/types';
import { Setup } from './Setup';
import { Home, Journal, Growth } from './Home';
import { Run } from './Run';
import { Result } from './Result';
import { SettingsView } from './SettingsView';

export type View =
  | { name: 'boot' } | { name: 'setup' } | { name: 'home' } | { name: 'journal' } | { name: 'growth' } | { name: 'settings' }
  | { name: 'run'; blob: Blob; fileName: string; lastMod?: number; inboxId?: number }
  | { name: 'result'; rec: Rec };

export interface Ctx {
  profile: Profile; settings: Settings; criteria: Criteria;
  go: (v: View, push?: boolean) => void; back: () => void; toast: (t: string) => void;
  setProfile: (p: Profile) => void; setSettings: (s: Settings) => void; reloadCriteria: () => Promise<Criteria>;
  liveVideo: Map<string, Blob>;
}

export function App() {
  const [view, setView] = useState<View>({ name: 'boot' });
  const [profile, setProfile] = useState<Profile | null>(null);
  const [settings, setSettings] = useState<Settings>(DEF_SET);
  const [criteria, setCriteria] = useState<Criteria | null>(null);
  const [toastText, setToast] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const liveVideo = useRef(new Map<string, Blob>()).current; // 이번에 연 영상(앱을 닫으면 사라짐, 영상은 복사해 두지 않음)
  const toastTimer = useRef<number>();

  const toast = useCallback((t: string) => { setToast(t); clearTimeout(toastTimer.current); toastTimer.current = window.setTimeout(() => setToast(null), 2600); }, []);
  const go = useCallback((v: View, push = true) => { if (push && v.name !== 'home') history.pushState({ v: v.name }, ''); setView(v); window.scrollTo(0, 0); }, []);
  const back = useCallback(() => history.back(), []);

  useEffect(() => {
    const onPop = () => setView(cur => cur.name === 'run' ? (history.pushState({ v: 'run' }, ''), cur) : { name: 'home' });
    addEventListener('popstate', onPop);
    return () => removeEventListener('popstate', onPop);
  }, []);

  useEffect(() => {
    (async () => {
      try {
        if ('serviceWorker' in navigator) {
          const had = !!navigator.serviceWorker.controller;
          navigator.serviceWorker.register('sw.js').catch(() => { });
          // 새 버전 서비스 워커가 자리 잡으면 한 번 새로고침(처음 설치 때는 안 함)
          navigator.serviceWorker.addEventListener('controllerchange', () => { if (!had || sessionStorage.getItem('gf-reloaded')) return; sessionStorage.setItem('gf-reloaded', '1'); location.reload(); });
        }
        const [p, s, c] = await Promise.all([S.kvGet('profile'), S.kvGet('settings'), loadCriteria()]);
        setCriteria(c);
        setSettings({ ...DEF_SET, ...(s || {}), ball: DEF_SET.ball });
        if (!p) { setView({ name: 'setup' }); return; }
        setProfile(p);
        // 갤러리 "공유"로 받은 영상이 하나면 바로 분석
        const shared = new URLSearchParams(location.search).get('shared');
        if (shared) {
          history.replaceState(null, '', location.pathname);
          const items = await S.inboxAll();
          if (items.length === 1) { const it = items[0]; setView({ name: 'run', blob: it.blob, fileName: it.name, lastMod: it.lastModified, inboxId: it.id }); return; }
        }
        setView({ name: 'home' });
      } catch (e: any) { setErr(e?.message || String(e)); }
    })();
  }, []);

  if (err) return <main><div className="card"><h2>시작하지 못했어요</h2><p className="sub">{err}</p></div></main>;
  if (view.name === 'boot' || !criteria) return <main><p className="empty">불러오는 중…</p></main>;
  if (view.name === 'setup' || !profile) return <Shell title="골고 폼" home><Setup onDone={p => { setProfile(p); setView({ name: 'home' }); }} /></Shell>;

  const ctx: Ctx = {
    profile, settings, criteria, go, back, toast, liveVideo,
    setProfile: p => { setProfile(p); S.kvSet('profile', p); },
    setSettings: s => { setSettings(s); S.kvSet('settings', s); },
    reloadCriteria: async () => { const c = await loadCriteria(); setCriteria(c); return c; },
  };
  const tab = ['home', 'journal', 'growth', 'settings'].includes(view.name) ? view.name : null;
  const title = view.name === 'settings' ? '설정' : view.name === 'journal' ? '코칭 일지' : view.name === 'growth' ? '성장' : view.name === 'run' ? '분석 중' : view.name === 'result' ? resultTitle(view.rec) : '골고 폼';
  return (
    <Shell title={title} home={!!tab} onBack={view.name === 'run' || tab ? undefined : back} toast={toastText} tab={tab} onTab={n => go({ name: n } as View, false)}>
      {view.name === 'home' && <Home ctx={ctx} />}
      {view.name === 'journal' && <Journal ctx={ctx} />}
      {view.name === 'growth' && <Growth />}
      {view.name === 'run' && <Run ctx={ctx} job={view} />}
      {view.name === 'result' && <Result ctx={ctx} rec={view.rec} key={view.rec.id + (view.rec.analyzedAt || '')} />}
      {view.name === 'settings' && <SettingsView ctx={ctx} />}
    </Shell>
  );
}

import { MOTION_KO } from '../engine/coach.js';
function resultTitle(rec: Rec) {
  const ms = [...new Set((rec.result.segs || []).map(s => s.motion))];
  return ms.length ? ms.map(m => (MOTION_KO as Record<string, string>)[m]).join(' · ') : '코칭 결과';
}

const TABS = [['home', '🎥', '분석'], ['journal', '📒', '일지'], ['growth', '🌱', '성장'], ['settings', '⚙︎', '설정']] as const;
function Shell(p: { title: string; home?: boolean; onBack?: () => void; toast?: string | null; tab?: string | null; onTab?: (n: 'home' | 'journal' | 'growth' | 'settings') => void; children: React.ReactNode }) {
  return (
    <>
      <header className="top">
        {!p.home && p.onBack && <button className="icon" aria-label="뒤로" onClick={p.onBack}>‹</button>}
        <h1>{p.home && <img src="icons/icon-192.png" alt="" />}{p.title}</h1>
      </header>
      <main className={p.tab ? 'with-nav' : ''}>{p.children}</main>
      {p.tab && <nav className="bnav">{TABS.map(([n, ic, l]) => <button key={n} className={p.tab === n ? 'on' : ''} onClick={() => p.onTab?.(n)}><span>{ic}</span>{l}</button>)}</nav>}
      {p.toast && <div id="toast">{p.toast}</div>}
    </>
  );
}
