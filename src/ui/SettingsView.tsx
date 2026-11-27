// 설정: 키·주발, 분석 설정, 저장 공간
import { useEffect, useState } from 'react';
import * as S from '../store.js';
import { APP_VER, type Settings } from '../config';
import { Seg } from './Setup';
import type { Ctx } from './App';
import { exportAll, importFile } from '../lib/backup';
import { driveReady, connect, disconnect, syncNow } from '../lib/drive';
import { dateKey } from '../lib/fmt';

export function SettingsView({ ctx }: { ctx: Ctx }) {
  const [h, setH] = useState(String(ctx.profile.heightCm));
  const [foot, setFoot] = useState(ctx.profile.foot);
  const [st, setSt] = useState<Settings>(ctx.settings);
  const [usage, setUsage] = useState('—');
  const [busy, setBusy] = useState(false);
  const [drv, setDrv] = useState<{ on: boolean; user?: string; last?: number }>({ on: false });
  const [syncText, setSyncText] = useState('');
  const loadDrv = async () => setDrv({ on: !!(await S.kvGet('driveOn')), user: await S.kvGet('driveUser'), last: await S.kvGet('driveLast') });
  useEffect(() => { loadDrv(); }, []);
  const runSync = async (first: boolean) => {
    setBusy(true); setSyncText('');
    try { const r = first ? await connect() : await syncNow(setSyncText); ctx.toast(`올림 ${r.up} · 받음 ${r.down}${r.del ? ' · 지움 ' + r.del : ''}`); }
    catch (e: any) { ctx.toast(e?.message || String(e)); }
    finally { setBusy(false); setSyncText(''); loadDrv(); }
  };
  useEffect(() => { S.usage().then((u: any) => setUsage(u ? `이 앱이 쓰는 공간 ${(u.used / 1048576).toFixed(0)}MB / 쓸 수 있는 공간 약 ${(u.quota / 1073741824).toFixed(0)}GB` : '알 수 없음')); }, []);
  const save = () => {
    const n = +h; if (!(n >= 120 && n <= 220)) { ctx.toast('키를 cm 로 넣어 주세요(120~220)'); return; }
    ctx.setProfile({ ...ctx.profile, heightCm: n, foot }); ctx.setSettings(st); ctx.toast('저장했어요');
  };
  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => setSt(s => ({ ...s, [k]: v }));
  return (
    <>
      <div className="card"><h2>내 정보</h2>
        <label htmlFor="sh">키 (cm)</label><input id="sh" type="number" inputMode="numeric" value={h} onChange={e => setH(e.target.value)} />
        <label>주발</label><Seg value={foot} options={[['r', '오른발'], ['l', '왼발']]} onChange={setFoot} /></div>
      <div className="card"><h2>분석 설정</h2>
        <label>자세 모델</label>
        <select value={st.pose} onChange={e => set('pose', e.target.value as Settings['pose'])}><option value="lite">가벼움 (빠름)</option><option value="full">보통 (추천)</option><option value="heavy">무거움 (정확, 느림)</option></select>
        <label>처리 너비</label>
        <select value={st.width} onChange={e => set('width', +e.target.value)}>{[640, 960, 1280].map(w => <option key={w} value={w}>{w}</option>)}</select>
        <label>계산 장치</label>
        <select value={st.delegate} onChange={e => set('delegate', e.target.value as Settings['delegate'])}><option value="GPU">그래픽(GPU, 추천)</option><option value="CPU">CPU</option></select>
        <label>1차 훑기 간격</label>
        <select value={st.step} onChange={e => set('step', +e.target.value)}><option value={15}>초당 15장 (빠름)</option><option value={30}>초당 30장 (추천)</option></select>
        <p className="sub">슬로모션(120fps) 영상은 1차로 대략 사건을 찾은 뒤, 사건 앞뒤 0.3초만 모든 장면을 다시 봐요.</p>
        <button className="main" onClick={save}>저장</button></div>
      <div className="card"><h2>저장 공간</h2><p className="sub">{usage}</p>
        <p className="sub">코칭 기록은 이 폰(브라우저 저장소)에 있어요. 영상은 갤러리에 그대로 두고 복사하지 않아요.</p></div>
      <div className="card"><h2>☁️ 구글 드라이브 동기화</h2>
        {!driveReady() ? <p className="sub">준비 중이에요. 곧 구글로 로그인하면 기록이 내 드라이브 "골고폼" 폴더에 저장되고, 다른 폰에서도 같은 기록을 볼 수 있어요. 그 전에는 아래 "기록 옮기기"를 써 주세요.</p>
          : drv.on ? <>
            <p className="sub">✅ 연결됨{drv.user ? ` · ${drv.user}` : ''}{drv.last ? ` · 마지막 동기화 ${new Date(drv.last).toLocaleString('ko-KR')}` : ''}<br />앱을 열 때와 분석이 끝날 때 자동으로 맞춰요. 영상은 올리지 않아요.</p>
            <button className="sec" disabled={busy} onClick={() => runSync(false)}>{busy && syncText ? syncText : '🔄 지금 동기화'}</button>
            <button className="sec" disabled={busy} onClick={async () => { if (!confirm('드라이브 연결을 끊을까요? 드라이브와 이 폰의 기록은 그대로 남아요.')) return; await disconnect(); loadDrv(); }}>연결 끊기</button>
          </> : <>
            <p className="sub">구글로 로그인하면 기록(코칭·관절 원재료·장면 사진·메모)을 내 드라이브 "골고폼" 폴더에 저장해요. 다른 폰에서 같은 계정으로 연결하면 그대로 보여요. 골고 폼이 만든 파일만 볼 수 있는 권한이라 다른 드라이브 파일은 보지 않아요.</p>
            <button className="main" disabled={busy} onClick={() => runSync(true)}>구글 드라이브 연결</button>
          </>}
      </div>
      <div className="card"><h2>📦 다른 폰으로 기록 옮기기</h2>
        <p className="sub">기록은 이 폰에만 있어요. 폰을 바꾸거나 다른 폰에서도 보려면 기록 파일을 내보내 카톡·메일·드라이브로 옮긴 뒤, 그 폰의 골고 폼에서 가져오세요. 영상은 들어가지 않아요(갤러리에 그대로).</p>
        <button className="sec" disabled={busy} onClick={async () => {
          setBusy(true);
          try {
            const { blob, n } = await exportAll();
            if (!n) { ctx.toast('아직 옮길 기록이 없어요'); return; }
            const name = `골고폼_기록_${dateKey(Date.now())}.goalgoform`;
            const file = new File([blob], name, { type: 'application/octet-stream' });
            if ((navigator as any).canShare?.({ files: [file] })) { try { await navigator.share({ files: [file], title: '골고 폼 기록' }); ctx.toast(`기록 ${n}개를 보냈어요`); return; } catch (e: any) { if (e?.name === 'AbortError') return; } }
            const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 5000);
            ctx.toast(`기록 ${n}개를 파일로 저장했어요`);
          } catch (e: any) { ctx.toast('내보내지 못했어요: ' + (e?.message || e)); } finally { setBusy(false); }
        }}>📤 기록 내보내기</button>
        <label className="sec filebtn">📥 기록 가져오기<input type="file" hidden disabled={busy} onChange={async e => {
          const f = e.target.files?.[0]; e.target.value = ''; if (!f) return;
          setBusy(true);
          try {
            const r = await importFile(f);
            if (r.profile && confirm('내보낸 폰의 키·주발도 가져올까요?')) { ctx.setProfile({ ...ctx.profile, ...r.profile }); setH(String(r.profile.heightCm)); setFoot(r.profile.foot); }
            ctx.toast(`새 기록 ${r.added}개, 바뀐 기록 ${r.updated}개를 가져왔어요`);
          } catch (e: any) { ctx.toast(e?.message || String(e)); } finally { setBusy(false); }
        }} /></label>
      </div>
      <div className="card"><h2>약관·방침</h2>
        <p className="sub"><a href="privacy.html" style={{ color: 'var(--acc)' }}>개인정보처리방침</a> · <a href="terms.html" style={{ color: 'var(--acc)' }}>이용약관</a></p>
        <p className="sub">영상과 분석 결과는 이 폰 밖으로 나가지 않아요(직접 내보낼 때만 나가요).</p></div>
      <p className="ver">골고 폼 {APP_VER} (베타)</p>
    </>
  );
}
