/**
 * mouseAdapter.ts
 * Translates mouse and touch events into the unified InputEvent stream.
 * This is the quiet fallback when no hand is tracked.
 * Left-button drag → dragStart / drag / dragEnd
 * Right-button drag → orbit
 * Wheel → zoom
 */

import { EventBus, type Point2D } from './events';

export class MouseAdapter {
  private dragging = false;
  private orbiting = false;
  private prevPos: Point2D = { x: 0.5, y: 0.5 };
  private dragStartPos: Point2D = { x: 0.5, y: 0.5 };
  private dragStartTime = 0;
  private hoveredTargetId: string | undefined;

  constructor(
    private readonly bus: EventBus,
    private readonly el: HTMLElement,
  ) {
    el.addEventListener('mousemove', this.onMove);
    el.addEventListener('mousedown', this.onDown);
    window.addEventListener('mouseup', this.onUp);
    el.addEventListener('wheel', this.onWheel, { passive: false });
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    el.addEventListener('touchstart', this.onTouchStart, { passive: false });
    el.addEventListener('touchmove', this.onTouchMove, { passive: false });
    el.addEventListener('touchend', this.onTouchEnd, { passive: false });
  }

  /** Called by app.ts after hit-testing interactive targets. */
  setHoveredTarget(id: string | undefined): void {
    this.hoveredTargetId = id;
  }

  private norm(clientX: number, clientY: number): Point2D {
    const r = this.el.getBoundingClientRect();
    return {
      x: (clientX - r.left) / r.width,
      y: (clientY - r.top) / r.height,
    };
  }

  private onMove = (e: MouseEvent): void => {
    const pos = this.norm(e.clientX, e.clientY);
    const delta: Point2D = { x: pos.x - this.prevPos.x, y: pos.y - this.prevPos.y };
    this.prevPos = pos;

    if (this.orbiting) {
      this.bus.emit({ type: 'orbit', position: pos, delta, timestamp: Date.now(), source: 'mouse' });
    } else if (this.dragging) {
      this.bus.emit({ type: 'drag', position: pos, delta, timestamp: Date.now(), source: 'mouse' });
    } else {
      this.bus.emit({ type: 'move', position: pos, timestamp: Date.now(), source: 'mouse' });
    }
  };

  private onDown = (e: MouseEvent): void => {
    const pos = this.norm(e.clientX, e.clientY);
    this.prevPos = pos;
    this.dragStartPos = pos;
    this.dragStartTime = Date.now();

    if (e.button === 2) {
      this.orbiting = true;
    } else {
      this.dragging = true;
      this.bus.emit({
        type: 'dragStart',
        position: pos,
        targetId: this.hoveredTargetId,
        timestamp: Date.now(),
        source: 'mouse',
      });
    }
  };

  private onUp = (e: MouseEvent): void => {
    const pos = this.norm(e.clientX, e.clientY);
    const duration = Date.now() - this.dragStartTime;
    const drift = Math.hypot(pos.x - this.dragStartPos.x, pos.y - this.dragStartPos.y);

    if (this.orbiting) {
      this.orbiting = false;
    } else if (this.dragging) {
      this.dragging = false;
      if (duration < 350 && drift < 0.02) {
        this.bus.emit({
          type: 'click',
          position: pos,
          targetId: this.hoveredTargetId,
          timestamp: Date.now(),
          source: 'mouse',
        });
      }
      this.bus.emit({ type: 'dragEnd', position: pos, timestamp: Date.now(), source: 'mouse' });
    }
  };

  private onWheel = (e: WheelEvent): void => {
    e.preventDefault();
    const pos = this.norm(e.clientX, e.clientY);
    const factor = 1 + e.deltaY * 0.0008;
    this.bus.emit({ type: 'zoom', position: pos, factor, timestamp: Date.now(), source: 'mouse' });
  };

  // ── Touch ──────────────────────────────────────────────────────

  private onTouchStart = (e: TouchEvent): void => {
    e.preventDefault();
    if (e.touches.length === 1) {
      const t = e.touches[0]!;
      const pos = this.norm(t.clientX, t.clientY);
      this.prevPos = pos;
      this.dragStartPos = pos;
      this.dragStartTime = Date.now();
      this.dragging = true;
      this.bus.emit({
        type: 'dragStart',
        position: pos,
        targetId: this.hoveredTargetId,
        timestamp: Date.now(),
        source: 'mouse',
      });
    }
  };

  private onTouchMove = (e: TouchEvent): void => {
    e.preventDefault();
    if (e.touches.length === 1) {
      const t = e.touches[0]!;
      const pos = this.norm(t.clientX, t.clientY);
      const delta: Point2D = { x: pos.x - this.prevPos.x, y: pos.y - this.prevPos.y };
      this.prevPos = pos;
      this.bus.emit({ type: 'drag', position: pos, delta, timestamp: Date.now(), source: 'mouse' });
    }
  };

  private onTouchEnd = (e: TouchEvent): void => {
    e.preventDefault();
    const pos = this.prevPos;
    const duration = Date.now() - this.dragStartTime;
    const drift = Math.hypot(pos.x - this.dragStartPos.x, pos.y - this.dragStartPos.y);
    this.dragging = false;

    if (duration < 350 && drift < 0.02) {
      this.bus.emit({
        type: 'click',
        position: pos,
        targetId: this.hoveredTargetId,
        timestamp: Date.now(),
        source: 'mouse',
      });
    }
    this.bus.emit({ type: 'dragEnd', position: pos, timestamp: Date.now(), source: 'mouse' });
  };

  dispose(): void {
    this.el.removeEventListener('mousemove', this.onMove);
    this.el.removeEventListener('mousedown', this.onDown);
    window.removeEventListener('mouseup', this.onUp);
    this.el.removeEventListener('wheel', this.onWheel);
    this.el.removeEventListener('touchstart', this.onTouchStart);
    this.el.removeEventListener('touchmove', this.onTouchMove);
    this.el.removeEventListener('touchend', this.onTouchEnd);
  }
}
