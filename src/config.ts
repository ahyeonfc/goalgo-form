// 앱 전체 설정·버전·기능 스위치를 한곳에 둔다
export const APP_VER = '0.8.1';
/** 도전 모드(과제·단계)는 잠시 숨김(2026-11-27 사용자: 자유 분석 먼저). 엔진은 src/engine/challenge.js 에 그대로 있음 */
export const SHOW_CHALLENGE = false;

export interface Settings { pose: 'lite' | 'full' | 'heavy'; ball: string; delegate: 'GPU' | 'CPU'; width: number; step: number; rfBall?: boolean }
export const DEF_SET: Settings = { pose: 'full', ball: 'efficientdet_lite2', delegate: 'GPU', width: 960, step: 30, rfBall: true };

export interface Profile { heightCm: number; foot: 'l' | 'r'; createdMs?: number }

export const MOTION_IC: Record<string, string> = { juggle: '⚽', toe_tap: '👟', pull_push: '↔️', dribble: '🏃', pass: '🎯', shot: '💥' };
export const VIEW_KO: Record<string, string> = { front: '정면', back: '뒤', side: '옆', diag: '비스듬', unknown: '알 수 없음' };

/** 구글 드라이브 동기화: 골고 폼 전용 Google Cloud 프로젝트의 웹 OAuth 클라이언트 ID(공개돼도 되는 값). 비어 있으면 동기화 칸이 "준비 중"으로 보인다 */
export const GOOGLE_CLIENT_ID = '425392299573-cmk68jnfi8ej227t7v4a7r315fio5ngq.apps.googleusercontent.com';
