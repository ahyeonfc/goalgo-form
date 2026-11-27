// 전후 비교와 성장 리포트: 같은 동작의 기록끼리 핵심 숫자를 비교한다(기준값이 아니라 내 기록 대비라 지어낸 숫자가 없음)
import type { Rec, Seg } from './types';

export interface KeyMetric { k: string; name: string; unit: string; better: 'high' | 'low'; dp: number }
// 동작마다 비교할 핵심 숫자(엔진 prims 이름)
export const KEYS: Record<string, KeyMetric[]> = {
  juggle: [{ k: 'best', name: '최고 연속', unit: '개', better: 'high', dp: 0 }, { k: 'apex_cv', name: '공 높이 흔들림', unit: '%', better: 'low', dp: 0 }],
  toe_tap: [{ k: 'rate', name: '빠르기', unit: '번/초', better: 'high', dp: 2 }, { k: 'alt', name: '양발 번갈아', unit: '%', better: 'high', dp: 0 }, { k: 'tempo_cv', name: '박자 흔들림', unit: '%', better: 'low', dp: 0 }],
  pull_push: [{ k: 'rate', name: '빠르기', unit: '번/초', better: 'high', dp: 2 }, { k: 'alt', name: '양발 번갈아', unit: '%', better: 'high', dp: 0 }, { k: 'tempo_cv', name: '박자 흔들림', unit: '%', better: 'low', dp: 0 }],
  dribble: [{ k: 'touch_rate', name: '초당 터치', unit: '번', better: 'high', dp: 2 }, { k: 'elastic', name: '꺾을 때 속도 유지', unit: '%', better: 'high', dp: 0 }],
  pass: [{ k: 'ball_speed', name: '공 속도', unit: 'm/s', better: 'high', dp: 1 }],
  shot: [{ k: 'ball_speed', name: '공 속도', unit: 'm/s', better: 'high', dp: 1 }],
};

const num = (v: unknown): v is number => typeof v === 'number' && isFinite(v);
// 한 기록 안에서 그 동작의 대표 구간(표시 개수가 가장 많은 구간)
export function mainSeg(rec: Rec, motion: string): Seg | null {
  const ss = (rec.result.segs || []).filter(s => s.motion === motion);
  return ss.length ? ss.reduce((a, b) => (b.marks.length > a.marks.length ? b : a)) : null;
}

export interface Delta { m: KeyMetric; before: number; after: number; diff: number; pct: number | null; better: boolean | null }
export interface Compare { prev: Rec; prevSeg: Seg; deltas: Delta[]; goneFixes: string[]; newFixes: string[] }

export function compareSeg(seg: Seg, rec: Rec, history: Rec[]): Compare | null {
  // 이 기록보다 앞선, 같은 동작이 있는 가장 최근 기록
  const prev = history.filter(h => h.takenAt < rec.takenAt && h.id !== rec.id && h.result.free && mainSeg(h, seg.motion)).sort((a, b) => b.takenAt - a.takenAt)[0];
  if (!prev) return null;
  const prevSeg = mainSeg(prev, seg.motion)!;
  const deltas: Delta[] = [];
  for (const m of KEYS[seg.motion] || []) {
    const a = prevSeg.prims[m.k], b = seg.prims[m.k];
    if (!num(a) || !num(b)) continue;
    // 화면에 보이는 자리수로 반올림해 같으면 '그대로'
    const ra = +a.toFixed(m.dp), rb = +b.toFixed(m.dp);
    const diff = rb - ra, better = diff === 0 ? null : m.better === 'high' ? diff > 0 : diff < 0;
    deltas.push({ m, before: a, after: b, diff, pct: a ? (diff / Math.abs(a)) * 100 : null, better });
  }
  const t = (s: Seg) => new Set(s.coach.fixes.map(f => f.title));
  const p = t(prevSeg), n = t(seg);
  return { prev, prevSeg, deltas, goneFixes: [...p].filter(x => !n.has(x)), newFixes: [...n].filter(x => !p.has(x)) };
}

// 성장 리포트: 이번 주(월요일부터) 훈련 횟수·연속 일수, 최근 30일 동작별 처음 → 지금 변화
export interface Growth { weekSessions: number; weekDays: number; streak: number; motions: { motion: string; m: KeyMetric; first: number; last: number; better: boolean; n: number }[] }
export function growth(list: Rec[], now = Date.now()): Growth {
  const free = list.filter(r => r.result.free && (r.result.segs || []).length).sort((a, b) => a.takenAt - b.takenAt);
  const d0 = new Date(now); d0.setHours(0, 0, 0, 0);
  const monday = new Date(d0); monday.setDate(d0.getDate() - ((d0.getDay() + 6) % 7));
  const week = free.filter(r => r.takenAt >= monday.getTime());
  const days = new Set(free.map(r => r.lesson));
  let streak = 0;
  for (let k = 0; ; k++) { const d = new Date(d0); d.setDate(d0.getDate() - k); const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; if (days.has(key)) streak++; else if (k > 0) break; }
  const recent = free.filter(r => r.takenAt >= now - 30 * 864e5);
  const motions: Growth['motions'] = [];
  for (const motion of Object.keys(KEYS)) {
    const segs = recent.map(r => mainSeg(r, motion)).filter((s): s is Seg => !!s);
    if (segs.length < 2) continue;
    const m = KEYS[motion][0];
    const vals = segs.map(s => s.prims[m.k]).filter(num);
    if (vals.length < 2) continue;
    const first = vals[0], last = vals[vals.length - 1];
    if (first === last) continue;
    motions.push({ motion, m, first, last, better: m.better === 'high' ? last > first : last < first, n: vals.length });
  }
  return { weekSessions: week.length, weekDays: new Set(week.map(r => r.lesson)).size, streak, motions };
}
