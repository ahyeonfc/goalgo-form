// 빛나는 관절 선: 몸통 초록, 왼쪽 파랑, 오른쪽 주황, 관절 점, 공 노란 원
import type { RawFrame } from './types';

export const EDGES: [number, number][] = [[11, 12], [11, 13], [13, 15], [12, 14], [14, 16], [11, 23], [12, 24], [23, 24], [23, 25], [25, 27], [27, 29], [29, 31], [27, 31], [24, 26], [26, 28], [28, 30], [30, 32], [28, 32]];
const LSET = new Set([11, 13, 15, 23, 25, 27, 29, 31]), RSET = new Set([12, 14, 16, 24, 26, 28, 30, 32]);
export const COL = { l: '#5aa9ff', r: '#ff8a3d', body: '#3ddc97', ball: '#ffd400' };

export function drawSkeleton(g: CanvasRenderingContext2D, f: RawFrame, sc: number) {
  const W = g.canvas.width, lw = Math.max(3, W / 220);
  g.save(); g.lineCap = 'round'; g.shadowBlur = lw * 3;
  if (f.kp) {
    for (const [a, b] of EDGES) {
      const p = f.kp[a], q = f.kp[b]; if (p[2] < .5 || q[2] < .5) continue;
      const col = LSET.has(a) && LSET.has(b) ? COL.l : RSET.has(a) && RSET.has(b) ? COL.r : COL.body;
      g.strokeStyle = col; g.shadowColor = col; g.lineWidth = lw; g.beginPath(); g.moveTo(p[0] * sc, p[1] * sc); g.lineTo(q[0] * sc, q[1] * sc); g.stroke();
    }
    g.shadowBlur = 0;
    for (const i of [11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28, 31, 32]) { const p = f.kp[i]; if (p[2] < .5) continue; g.fillStyle = '#fff'; g.beginPath(); g.arc(p[0] * sc, p[1] * sc, lw * 1.1, 0, 7); g.fill(); }
  }
  if (f.ball) { g.shadowBlur = lw * 3; g.shadowColor = COL.ball; g.strokeStyle = COL.ball; g.lineWidth = lw * 0.9; g.beginPath(); g.arc(f.ball.x * sc, f.ball.y * sc, f.ball.r * sc, 0, 7); g.stroke(); }
  g.restore();
}
