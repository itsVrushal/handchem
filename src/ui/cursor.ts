/**
 * cursor.ts
 * Renders the gesture cursor on a full-screen transparent canvas overlay.
 * Appearance changes per input state:
 *   idle      → dim ring
 *   hover     → bright pulsing ring + glow
 *   pinching  → filled dot (smaller)
 *   dragging  → diamond crosshair
 *
 * Also renders:
 *   • Dwell progress ring (fills over 800 ms when hovering a button)
 *   • Magnetic easing toward the nearest interactive target
 */

import { EventBus } from '../input/events';

type CursorState = 'idle' | 'hover' | 'pinching' | 'dragging';

const DWELL_MS = 800;
const LERP_FACTOR = 0.25;          // interpolation toward target position per frame
const MAGNET_RADIUS_PX = 90;       // px – within this range cursor snaps toward target
const MAGNET_STRENGTH = 0.28;      // fraction to pull toward target centre each frame

export class Cursor {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly dpr: number;

  // Logical (CSS-pixel) target & display positions
  private targetX = 0.5;
  private targetY = 0.5;
  private displayX = 0.5;
  private displayY = 0.5;

  private state: CursorState = 'idle';
  private pulseT = 0; // used for hover pulse animation

  // Dwell
  private dwellTargetId: string | null = null;
  private dwellStart: number | null = null;
  private onDwell: ((targetId: string) => void) | null = null;
  private dwellFired = false;

  // Magnet
  private magnetX: number | null = null;
  private magnetY: number | null = null;

  private hidden = true; // hidden until first hand or mouse event

  constructor(canvas: HTMLCanvasElement, bus: EventBus) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('cursor canvas 2d context unavailable');
    this.ctx = ctx;

    this.dpr = window.devicePixelRatio || 1;
    this.resize();
    window.addEventListener('resize', () => this.resize());

    // Listen to unified events
    bus.on('move',      (e) => { this.setTarget(e.position.x, e.position.y); this.state = 'idle';     this.hidden = false; });
    bus.on('hover',     (e) => { this.setTarget(e.position.x, e.position.y); this.state = 'hover';    this.hidden = false; });
    bus.on('dragStart', (e) => { this.setTarget(e.position.x, e.position.y); this.state = 'dragging'; this.hidden = false; });
    bus.on('drag',      (e) => { this.setTarget(e.position.x, e.position.y); this.state = 'dragging'; this.hidden = false; });
    bus.on('dragEnd',   (e) => { this.setTarget(e.position.x, e.position.y); this.state = 'hover';    this.hidden = false; });
    bus.on('click',     (e) => { this.setTarget(e.position.x, e.position.y); this.state = 'hover';    this.hidden = false; this.flashClick(); });
    bus.on('cancel',    ()  => { this.state = 'idle'; });
  }

  private setTarget(nx: number, ny: number): void {
    this.targetX = nx * window.innerWidth;
    this.targetY = ny * window.innerHeight;
  }

  /**
   * Called each frame by app.ts.
   * @param nowMs  performance.now() for animation timing
   * @param hoveredTargetId  id of the button currently under the cursor (if any)
   * @param magnetRect  bounding rect of the magnet target (if any)
   */
  render(
    nowMs: number,
    hoveredTargetId: string | null = null,
    magnetRect: DOMRect | null = null,
  ): void {
    const W = window.innerWidth;
    const H = window.innerHeight;

    // ── Magnet attraction ──────────────────────────────────────────
    if (magnetRect) {
      this.magnetX = magnetRect.left + magnetRect.width / 2;
      this.magnetY = magnetRect.top + magnetRect.height / 2;
    } else {
      this.magnetX = null;
      this.magnetY = null;
    }

    // Move display toward target (interpolation)
    let tx = this.targetX;
    let ty = this.targetY;

    if (this.magnetX !== null && this.magnetY !== null) {
      const dist = Math.hypot(tx - this.magnetX, ty - this.magnetY);
      if (dist < MAGNET_RADIUS_PX && dist > 0) {
        const t = (1 - dist / MAGNET_RADIUS_PX) * MAGNET_STRENGTH;
        tx += (this.magnetX - tx) * t;
        ty += (this.magnetY - ty) * t;
      }
    }

    this.displayX += (tx - this.displayX) * LERP_FACTOR;
    this.displayY += (ty - this.displayY) * LERP_FACTOR;

    // ── Dwell logic ────────────────────────────────────────────────
    if (hoveredTargetId !== this.dwellTargetId) {
      this.dwellTargetId = hoveredTargetId;
      this.dwellStart = hoveredTargetId ? nowMs : null;
      this.dwellFired = false;
    }

    let dwellProgress = 0;
    if (this.dwellStart !== null && hoveredTargetId) {
      dwellProgress = Math.min(1, (nowMs - this.dwellStart) / DWELL_MS);
      if (dwellProgress >= 1 && !this.dwellFired) {
        this.dwellFired = true;
        this.onDwell?.(hoveredTargetId);
      }
    }

    // ── Draw ──────────────────────────────────────────────────────
    this.ctx.clearRect(0, 0, W, H);
    if (this.hidden) return;

    const x = this.displayX;
    const y = this.displayY;
    this.pulseT = nowMs / 1000;

    switch (this.state) {
      case 'idle':     this.drawIdle(x, y); break;
      case 'hover':    this.drawHover(x, y, dwellProgress); break;
      case 'pinching': this.drawPinching(x, y); break;
      case 'dragging': this.drawDragging(x, y); break;
    }
  }

  // ── Drawing helpers ─────────────────────────────────────────────

  private drawIdle(x: number, y: number): void {
    const r = 7;
    this.ctx.beginPath();
    this.ctx.arc(x, y, r, 0, Math.PI * 2);
    this.ctx.strokeStyle = 'rgba(167,139,250,0.55)';
    this.ctx.lineWidth = 1.5;
    this.ctx.stroke();

    // Centre dot
    this.ctx.beginPath();
    this.ctx.arc(x, y, 2, 0, Math.PI * 2);
    this.ctx.fillStyle = 'rgba(167,139,250,0.6)';
    this.ctx.fill();
  }

  private drawHover(x: number, y: number, dwellProgress: number): void {
    const pulse = 1 + 0.12 * Math.sin(this.pulseT * 4);
    const r = 13 * pulse;

    // Glow
    const grd = this.ctx.createRadialGradient(x, y, 2, x, y, r + 8);
    grd.addColorStop(0, 'rgba(124,58,237,0.35)');
    grd.addColorStop(1, 'rgba(124,58,237,0)');
    this.ctx.beginPath();
    this.ctx.arc(x, y, r + 8, 0, Math.PI * 2);
    this.ctx.fillStyle = grd;
    this.ctx.fill();

    // Ring
    this.ctx.beginPath();
    this.ctx.arc(x, y, r, 0, Math.PI * 2);
    this.ctx.strokeStyle = 'rgba(167,139,250,0.85)';
    this.ctx.lineWidth = 2;
    this.ctx.stroke();

    // Centre dot
    this.ctx.beginPath();
    this.ctx.arc(x, y, 3.5, 0, Math.PI * 2);
    this.ctx.fillStyle = '#a78bfa';
    this.ctx.fill();

    // Dwell progress arc
    if (dwellProgress > 0) {
      this.drawDwellRing(x, y, r + 7, dwellProgress);
    }
  }

  private drawPinching(x: number, y: number): void {
    // Solid filled circle – indicates grip
    this.ctx.beginPath();
    this.ctx.arc(x, y, 9, 0, Math.PI * 2);
    this.ctx.fillStyle = 'rgba(124,58,237,0.85)';
    this.ctx.fill();

    this.ctx.beginPath();
    this.ctx.arc(x, y, 9, 0, Math.PI * 2);
    this.ctx.strokeStyle = '#a78bfa';
    this.ctx.lineWidth = 1.5;
    this.ctx.stroke();
  }

  private drawDragging(x: number, y: number): void {
    // Diamond + cross
    const s = 10;
    this.ctx.save();
    this.ctx.translate(x, y);
    this.ctx.rotate(Math.PI / 4);
    this.ctx.strokeStyle = '#a78bfa';
    this.ctx.lineWidth = 2;
    this.ctx.shadowColor = 'rgba(124,58,237,0.7)';
    this.ctx.shadowBlur = 10;
    this.ctx.strokeRect(-s / 2, -s / 2, s, s);
    this.ctx.restore();

    // Centre dot
    this.ctx.beginPath();
    this.ctx.arc(x, y, 2.5, 0, Math.PI * 2);
    this.ctx.fillStyle = '#a78bfa';
    this.ctx.fill();
  }

  private drawDwellRing(x: number, y: number, r: number, progress: number): void {
    const start = -Math.PI / 2;
    const end = start + progress * Math.PI * 2;
    this.ctx.beginPath();
    this.ctx.arc(x, y, r, start, end);
    this.ctx.strokeStyle = '#10b981';
    this.ctx.lineWidth = 3;
    this.ctx.lineCap = 'round';
    this.ctx.stroke();
  }

  private flashClickTimer = 0;
  private flashClick(): void {
    this.flashClickTimer = Date.now() + 120;
  }

  getDisplayPos(): { x: number; y: number } {
    return {
      x: this.displayX / window.innerWidth,
      y: this.displayY / window.innerHeight,
    };
  }

  setDwellCallback(cb: (targetId: string) => void): void {
    this.onDwell = cb;
  }

  private resize(): void {
    const dpr = window.devicePixelRatio || 1;
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.canvas.width = w * dpr;
    this.canvas.height = h * dpr;
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    this.ctx.scale(dpr, dpr);
  }
}
