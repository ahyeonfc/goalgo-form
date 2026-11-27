// 엔진 결과 형식(자유 분석). 엔진은 JS 라 여기서 형식을 정해 화면이 맞춰 쓴다
export interface Mark { t: number; foot?: 'l' | 'r' | null; part?: string | null; kind?: string }
export interface CoachItem { title: string; text: string; why?: string; t?: number; sev?: number; game?: string; how?: string[] }
export interface Coach { good: CoachItem[]; fixes: CoachItem[]; drill?: { name: string; text: string }; tip?: string; facts: { k: string; v: string }[] }
export interface Seg { motion: string; name: string; t0: number; t1: number; prims: Record<string, unknown>; marks: Mark[]; view?: string; coach: Coach; drops?: number[] }
export interface Note { kind: 'warn' | 'info'; text: string }
export interface General { span: [number, number] | null; good: CoachItem[]; fixes: CoachItem[]; drill?: { name: string; text: string }; plan?: { day: string; title: string; text: string }[]; facts: { k: string; v: string }[]; p?: Record<string, number | null>; marks: Mark[] }
export interface FreeResult {
  free: string; fps: number; heightCm: number; dur: number; frames: number; poseSeen: number; ballSeen: number;
  poseOk: boolean; ballRatio: number | null; view: { view: string }; notes: Note[]; segs: Seg[]; general?: General | null; timeScale?: { k: number } | null;
  scan?: { frame?: { w: number; h: number }; srcFps: number; step: number; frames: number; wallSec: number; w: number; h: number; set: { pose: string; delegate: string; width: number }; mp4?: unknown };
  calib?: { notes: string[] };
}
export interface Shot { t: number; cap: string; blob: Blob; seg?: number; fix?: string }
export interface Rec { id: string; name: string; size: number; takenAt: number; lesson: string; analyzedAt?: number; appVer?: string; result: FreeResult & Record<string, any>; rawGz?: Blob; shots?: Shot[]; memo?: string; nShots?: number }
export interface RawFrame { t: number; kp: [number, number, number][] | null; ball: { x: number; y: number; r: number; conf: number } | null }
