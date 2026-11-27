// 설정: 키·주발, 분석 설정, 저장 공간
import { useEffect, useState } from 'react';
import * as S from '../store.js';
import { APP_VER, type Settings } from '../config';
import { Seg } from './Setup';
import type { Ctx } from './App';

export function SettingsView({ ctx }: { ctx: Ctx }) {
  const [h, setH] = useState(String(ctx.profile.heightCm));
  const [foot, setFoot] = useState(ctx.profile.foot);
  const [st, setSt] = useState<Settings>(ctx.settings);
  const [usage, setUsage] = useState('—');
  useEffect(() => { S.usage().then((u: any) => setUsage(u ? `이 앱이 쓰는 공간 ${(u.used / 1048576).toFixed(0)}MB / 쓸 수 있는 공간 약 ${(u.quota / 1073741824).toFixed(0)}GB` : '알 수 없음')); }, []);
  const save = () => {
    const n = +h; if (!(n >= 120 && n <= 220)) { ctx.toast('키를 cm 로 넣어 주세요(120~220)'); return; }
    ctx.setProfile({ ...ctx.profile, heightCm: n, foot }); ctx.setSettings(st); ctx.toast('저장했어요'); ctx.back();
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
      <div className="card"><h2>약관·방침</h2>
        <p className="sub"><a href="privacy.html" style={{ color: 'var(--acc)' }}>개인정보처리방침</a> · <a href="terms.html" style={{ color: 'var(--acc)' }}>이용약관</a></p>
        <p className="sub">영상과 분석 결과는 이 폰 밖으로 나가지 않아요.</p></div>
      <p className="ver">골고 폼 {APP_VER} (베타)</p>
    </>
  );
}
