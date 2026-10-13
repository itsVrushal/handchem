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

const DWELL_MS = 500; // ms – snappy, comfortable dwell time
const LERP_FACTOR = 0.28;          // interpolation toward target position per frame
const MAGNET_RADIUS_PX = 115;      // px – within this range cursor snaps toward target
const MAGNET_STRENGTH = 0.40;      // fraction to pull toward target centre each frame

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
  private dwellLostTime: number | null = null;

  // Magnet
  private magnetX: number | null = null;
  private magnetY: number | null = null;

  private hidden = true; // hidden until first hand or mouse event

  private isMouse = true; // start in mouse mode so desktop cursor is immediately active

  private setMouseMode(isMouse: boolean): void {
    this.isMouse = isMouse;
    if (typeof document !== 'undefined') {
      if (isMouse) {
        document.body.classList.remove('hand-tracking-active');
      } else {
        document.body.classList.add('hand-tracking-active');
      }
    }
  }

  constructor(canvas: HTMLCanvasElement, bus: EventBus) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('cursor canvas 2d context unavailable');
    this.ctx = ctx;

    this.dpr = window.devicePixelRatio || 1;
    this.resize();
    window.addEventListener('resize', () => this.resize());

    // Physical mouse detection: whenever physical mouse moves or clicks, dwell is disabled & OS cursor is active
    window.addEventListener('mousemove', () => { this.setMouseMode(true); }, { passive: true });
    window.addEventListener('mousedown', () => { this.setMouseMode(true); }, { passive: true });

    // Listen to unified events
    bus.on('move', (e) => {
      this.setMouseMode(e.source === 'mouse');
      this.setTarget(e.position.x, e.position.y);
      this.state = 'idle';
      this.hidden = false;
    });
    bus.on('hover', (e) => {
      this.setMouseMode(e.source === 'mouse');
      this.setTarget(e.position.x, e.position.y);
      this.state = 'hover';
      this.hidden = false;
    });
    bus.on('dragStart', (e) => {
      this.setMouseMode(e.source === 'mouse');
      this.setTarget(e.position.x, e.position.y);
      this.state = 'dragging';
      this.hidden = false;
    });
    bus.on('drag', (e) => {
      this.setMouseMode(e.source === 'mouse');
      this.setTarget(e.position.x, e.position.y);
      this.state = 'dragging';
      this.hidden = false;
    });
    bus.on('dragEnd', (e) => {
      this.setMouseMode(e.source === 'mouse');
      this.setTarget(e.position.x, e.position.y);
      this.state = 'hover';
      this.hidden = false;
    });
    bus.on('click', (e) => {
      this.setMouseMode(e.source === 'mouse');
      this.setTarget(e.position.x, e.position.y);
      this.state = 'hover';
      this.hidden = false;
      this.flashClick();
    });
    bus.on('cancel', () => {
      this.state = 'idle';
    });
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
    isPointing = false,
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

    // If hovering a target and not in active grip/drag, enter hover display
    if (hoveredTargetId && this.state !== 'dragging' && this.state !== 'pinching') {
      this.state = 'hover';
    }

    // ── Dwell logic ────────────────────────────────────────────────
    // Never run dwell auto-click for mouse input OR single-finger pointing!
    // Dwell click is ONLY for two-finger / open hand hover on buttons.
    let dwellProgress = 0;
    if (this.isMouse || isPointing) {
      this.dwellTargetId = null;
      this.dwellStart = null;
      this.dwellFired = false;
      this.dwellLostTime = null;
    } else {
      if (hoveredTargetId !== this.dwellTargetId) {
        if (hoveredTargetId) {
          this.dwellTargetId = hoveredTargetId;
          this.dwellStart = nowMs;
          this.dwellFired = false;
          this.dwellLostTime = null;
        } else {
          // Allow 200ms grace period so hand tremor/jitter doesn't immediately reset dwell
          if (this.dwellLostTime === null) {
            this.dwellLostTime = nowMs;
          } else if (nowMs - this.dwellLostTime > 200) {
            this.dwellTargetId = null;
            this.dwellStart = null;
            this.dwellFired = false;
            this.dwellLostTime = null;
          }
        }
      } else if (hoveredTargetId) {
        this.dwellLostTime = null;
      }

      const activeTarget = hoveredTargetId ?? this.dwellTargetId;
      if (this.dwellStart !== null && activeTarget && !this.dwellFired) {
        dwellProgress = Math.min(1, (nowMs - this.dwellStart) / DWELL_MS);
        if (dwellProgress >= 1) {
          this.dwellFired = true;
          this.flashClick();
          this.onDwell?.(activeTarget);
          dwellProgress = 0;
        }
      }
    }

    // ── Draw ──────────────────────────────────────────────────────
    this.ctx.clearRect(0, 0, W, H);
    // When in physical mouse mode, OS native cursor is used; only draw in gesture tracking mode
    if (this.hidden || this.isMouse) return;

    const x = this.displayX;
    const y = this.displayY;
    this.pulseT = nowMs / 1000;

    if (this.state === 'dragging') {
      this.drawDragging(x, y);
    } else if (this.state === 'pinching') {
      this.drawPinching(x, y);
    } else if (this.state === 'hover' || hoveredTargetId || dwellProgress > 0) {
      this.drawHover(x, y, dwellProgress);
    } else {
      this.drawIdle(x, y);
    }
  }

  // ── Drawing helpers (Stark Holographic Cyan HUD) ────────────────

  private drawIdle(x: number, y: number): void {
    const r = 7;
    this.ctx.beginPath();
    this.ctx.arc(x, y, r, 0, Math.PI * 2);
    this.ctx.strokeStyle = 'rgba(0, 240, 255, 0.65)';
    this.ctx.lineWidth = 1.5;
    this.ctx.stroke();

    // Centre arc dot
    this.ctx.beginPath();
    this.ctx.arc(x, y, 2, 0, Math.PI * 2);
    this.ctx.fillStyle = '#00f0ff';
    this.ctx.fill();
  }

  private drawHover(x: number, y: number, dwellProgress: number): void {
    const pulse = 1 + 0.12 * Math.sin(this.pulseT * 4);
    const r = 13 * pulse;

    // Stark Cyan Glow
    const grd = this.ctx.createRadialGradient(x, y, 2, x, y, r + 10);
    grd.addColorStop(0, 'rgba(0, 240, 255, 0.4)');
    grd.addColorStop(0.6, 'rgba(0, 119, 255, 0.2)');
    grd.addColorStop(1, 'rgba(0, 240, 255, 0)');
    this.ctx.beginPath();
    this.ctx.arc(x, y, r + 10, 0, Math.PI * 2);
    this.ctx.fillStyle = grd;
    this.ctx.fill();

    // Tech HUD ring
    this.ctx.beginPath();
    this.ctx.arc(x, y, r, 0, Math.PI * 2);
    this.ctx.strokeStyle = '#00f0ff';
    this.ctx.lineWidth = 2;
    this.ctx.stroke();

    // Crosshair ticks
    const tickLen = 4;
    this.ctx.strokeStyle = 'rgba(0, 240, 255, 0.85)';
    this.ctx.lineWidth = 1.5;
    this.ctx.beginPath();
    this.ctx.moveTo(x - r - tickLen, y);
    this.ctx.lineTo(x - r + 1, y);
    this.ctx.moveTo(x + r - 1, y);
    this.ctx.lineTo(x + r + tickLen, y);
    this.ctx.moveTo(x, y - r - tickLen);
    this.ctx.lineTo(x, y - r + 1);
    this.ctx.moveTo(x, y + r - 1);
    this.ctx.lineTo(x, y + r + tickLen);
    this.ctx.stroke();

    // Centre dot
    this.ctx.beginPath();
    this.ctx.arc(x, y, 3.5, 0, Math.PI * 2);
    this.ctx.fillStyle = '#ffffff';
    this.ctx.fill();

    // Dwell progress arc (gestures only)
    if (dwellProgress > 0 && !this.isMouse) {
      this.drawDwellRing(x, y, r + 7, dwellProgress);
    }

    // Click flash ripple animation
    if (this.flashClickTimer > Date.now()) {
      const rem = Math.max(0, (this.flashClickTimer - Date.now()) / 220);
      const burstR = r + 6 + (1 - rem) * 20;
      this.ctx.beginPath();
      this.ctx.arc(x, y, burstR, 0, Math.PI * 2);
      this.ctx.strokeStyle = `rgba(0, 255, 136, ${rem * 0.95})`;
      this.ctx.lineWidth = 3;
      this.ctx.stroke();
    }
  }

  private drawPinching(x: number, y: number): void {
    // Solid Stark Arc Core
    this.ctx.beginPath();
    this.ctx.arc(x, y, 9, 0, Math.PI * 2);
    this.ctx.fillStyle = 'rgba(0, 240, 255, 0.85)';
    this.ctx.fill();

    this.ctx.beginPath();
    this.ctx.arc(x, y, 9, 0, Math.PI * 2);
    this.ctx.strokeStyle = '#ffffff';
    this.ctx.lineWidth = 2;
    this.ctx.stroke();
  }

  private drawDragging(x: number, y: number): void {
    // Holographic diamond target crosshair
    const s = 11;
    this.ctx.save();
    this.ctx.translate(x, y);
    this.ctx.rotate(Math.PI / 4);
    this.ctx.strokeStyle = '#00f0ff';
    this.ctx.lineWidth = 2;
    this.ctx.shadowColor = 'rgba(0, 240, 255, 0.9)';
    this.ctx.shadowBlur = 12;
    this.ctx.strokeRect(-s / 2, -s / 2, s, s);
    this.ctx.restore();

    // Centre laser dot
    this.ctx.beginPath();
    this.ctx.arc(x, y, 2.5, 0, Math.PI * 2);
    this.ctx.fillStyle = '#ffffff';
    this.ctx.fill();
  }

  private drawDwellRing(x: number, y: number, r: number, progress: number): void {
    const start = -Math.PI / 2;
    const end = start + progress * Math.PI * 2;
    this.ctx.beginPath();
    this.ctx.arc(x, y, r, start, end);
    this.ctx.strokeStyle = '#00ff88'; // Arc Reactor emerald/neon cyan
    this.ctx.lineWidth = 3.5;
    this.ctx.lineCap = 'round';
    this.ctx.shadowColor = 'rgba(0, 255, 136, 0.8)';
    this.ctx.shadowBlur = 8;
    this.ctx.stroke();
    this.ctx.shadowBlur = 0;
  }

  private flashClickTimer = 0;
  private flashClick(): void {
    this.flashClickTimer = Date.now() + 220;
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
