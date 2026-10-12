/**
 * preview.ts
 * Renders the mirrored camera feed in the corner preview and draws the
 * MediaPipe hand skeleton overlay.
 *
 * The video element already has `transform: scaleX(-1)` in CSS.
 * The skeleton canvas mirrors x coordinates to match.
 */

import type { LandmarkList } from '../gesture/features';
import type { HandState } from '../gesture/stateMachine';

// MediaPipe hand connections (pairs of landmark indices)
const CONNECTIONS: [number, number][] = [
  [0, 1], [1, 2], [2, 3], [3, 4],         // thumb
  [0, 5], [5, 6], [6, 7], [7, 8],         // index
  [0, 9], [9, 10], [10, 11], [11, 12],    // middle
  [0, 13], [13, 14], [14, 15], [15, 16],  // ring
  [0, 17], [17, 18], [18, 19], [19, 20],  // pinky
  [5, 9], [9, 13], [13, 17],              // palm
];

const BADGE_CLASS: Record<HandState, string> = {
  idle: 'tracking-idle',
  hovering: 'tracking-hovering',
  pinching: 'tracking-pinching',
  dragging: 'tracking-dragging',
};

const BADGE_TEXT: Record<HandState, string> = {
  idle: 'Idle',
  hovering: 'Hovering',
  pinching: 'Closed Fist',
  dragging: 'Dragging',
};

export class CameraPreview {
  private readonly skeletonCanvas: HTMLCanvasElement;
  private readonly skeletonCtx: CanvasRenderingContext2D;
  private readonly badge: HTMLElement;

  private latestLandmarks: LandmarkList | null = null;
  private handState: HandState = 'idle';
  private isTracking = false;

  constructor(
    _video: HTMLVideoElement,
    skeletonCanvas: HTMLCanvasElement,
  ) {
    this.skeletonCanvas = skeletonCanvas;
    const ctx = skeletonCanvas.getContext('2d');
    if (!ctx) throw new Error('skeleton canvas 2d context unavailable');
    this.skeletonCtx = ctx;

    const badge = document.getElementById('tracking-badge');
    if (!badge) throw new Error('#tracking-badge not found');
    this.badge = badge;

    // Fix canvas size to match CSS size
    this.skeletonCanvas.width = 240;
    this.skeletonCanvas.height = 180;
  }

  updateLandmarks(landmarks: LandmarkList[] | null): void {
    this.latestLandmarks = landmarks?.[0] ?? null;
  }

  updateState(state: HandState, isTracking: boolean): void {
    this.handState = state;
    this.isTracking = isTracking;
  }

  render(): void {
    this.renderBadge();
    this.renderSkeleton();
  }

  private renderBadge(): void {
    if (!this.isTracking) {
      this.badge.className = 'tracking-badge tracking-none';
      this.badge.textContent = 'No Hand';
      return;
    }
    const cls = BADGE_CLASS[this.handState] ?? 'tracking-idle';
    const txt = BADGE_TEXT[this.handState] ?? this.handState;
    this.badge.className = `tracking-badge ${cls}`;
    this.badge.textContent = txt;
  }

  private renderSkeleton(): void {
    const ctx = this.skeletonCtx;
    const W = this.skeletonCanvas.width;
    const H = this.skeletonCanvas.height;
    ctx.clearRect(0, 0, W, H);

    if (!this.latestLandmarks || this.latestLandmarks.length < 21) return;
    const lms = this.latestLandmarks;

    // Helper – convert normalised → canvas pixels (mirroring x)
    const px = (lm: { x: number; y: number }) => ({
      cx: (1 - lm.x) * W,  // mirror x to match video flip
      cy: lm.y * H,
    });

    // Draw bone connections
    ctx.strokeStyle = 'rgba(124,58,237,0.75)';
    ctx.lineWidth = 1.5;
    ctx.lineCap = 'round';
    for (const [a, b] of CONNECTIONS) {
      const lmA = lms[a];
      const lmB = lms[b];
      if (!lmA || !lmB) continue;
      const { cx: ax, cy: ay } = px(lmA);
      const { cx: bx, cy: by } = px(lmB);
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.lineTo(bx, by);
      ctx.stroke();
    }

    // Draw joints
    for (let i = 0; i < lms.length; i++) {
      const lm = lms[i];
      if (!lm) continue;
      const { cx, cy } = px(lm);
      const isSpecial = i === 4 || i === 8; // thumb tip & index tip
      ctx.beginPath();
      ctx.arc(cx, cy, isSpecial ? 4 : 2.5, 0, Math.PI * 2);
      ctx.fillStyle = isSpecial ? '#a78bfa' : 'rgba(167,139,250,0.7)';
      ctx.fill();
    }

    // Pinch indicator (line between LM4 and LM8)
    const lm4 = lms[4];
    const lm8 = lms[8];
    if (lm4 && lm8) {
      const p4 = px(lm4);
      const p8 = px(lm8);
      ctx.beginPath();
      ctx.moveTo(p4.cx, p4.cy);
      ctx.lineTo(p8.cx, p8.cy);
      ctx.strokeStyle = 'rgba(16,185,129,0.6)';
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }
}
