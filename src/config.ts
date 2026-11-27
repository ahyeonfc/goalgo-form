// 앱 전체 설정·버전·기능 스위치를 한곳에 둔다
export const APP_VER = '0.6.1';
/** 도전 모드(과제·단계)는 잠시 숨김(2026-11-27 사용자: 자유 분석 먼저). 엔진은 src/engine/challenge.js 에 그대로 있음 */
export const SHOW_CHALLENGE = false;

export interface Settings { pose: 'lite' | 'full' | 'heavy'; ball: string; delegate: 'GPU' | 'CPU'; width: number; step: number }
export const DEF_SET: Settings = { pose: 'full', ball: 'efficientdet_lite2', delegate: 'GPU', width: 960, step: 30 };

export interface Profile { heightCm: number; foot: 'l' | 'r'; createdMs?: number }

export const MOTION_IC: Record<string, string> = { juggle: '⚽', toe_tap: '👟', pull_push: '↔️', dribble: '🏃', pass: '🎯', shot: '💥' };
export const VIEW_KO: Record<string, string> = { front: '정면', back: '뒤', side: '옆', diag: '비스듬', unknown: '알 수 없음' };
