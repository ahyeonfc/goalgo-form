// 첫 설정: 키와 주발(이 폰에만 저장)
import { useState } from 'react';
import * as S from '../store.js';
import type { Profile } from '../config';

export function Seg<T extends string>(p: { value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return <div className="seg">{p.options.map(([v, label]) => <button key={v} className={v === p.value ? 'on' : ''} onClick={() => p.onChange(v)}>{label}</button>)}</div>;
}

export function Setup({ onDone }: { onDone: (p: Profile) => void }) {
  const [h, setH] = useState('');
  const [foot, setFoot] = useState<'l' | 'r'>('r');
  const [msg, setMsg] = useState('');
  const save = async () => {
    const n = +h;
    if (!(n >= 120 && n <= 220)) { setMsg('키를 cm 로 넣어 주세요(120~220)'); return; }
    const p: Profile = { heightCm: n, foot, createdMs: Date.now() };
    await S.kvSet('profile', p); S.persist(); onDone(p);
  };
  return (
    <>
      <div className="hero">
        <div className="kicker">GOALGO FORM</div>
        <h2>찍은 훈련 영상으로<br />바로 코칭받기</h2>
        <p>처음 한 번만 알려 주세요. 영상 속 크기를 재고 주발·반대발을 나누는 데 써요. 이 폰에만 저장돼요.</p>
      </div>
      <div className="card">
        <label htmlFor="height">키 (cm)</label>
        <input id="height" type="number" inputMode="numeric" min={120} max={220} placeholder="예: 175" value={h} onChange={e => setH(e.target.value)} />
        <label>주발</label>
        <Seg value={foot} options={[['r', '오른발'], ['l', '왼발']]} onChange={setFoot} />
        {msg && <p className="sub warn">{msg}</p>}
        <button className="main" onClick={save}>시작하기</button>
      </div>
    </>
  );
}
