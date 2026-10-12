/**
 * buttons.ts
 * Manages large gesture-target buttons: hit-testing, hover state visual
 * feedback, and dwell-click / gesture-click event emission.
 * Forwarded to DOM element click handlers so all UI responds identically
 * to gestures and real mouse clicks.
 */

import { EventBus } from '../input/events';

interface ButtonRecord {
  el: HTMLButtonElement;
  id: string;
}

export class ButtonManager {
  private buttons: ButtonRecord[] = [];
  private currentHoverId: string | null = null;
  private bus: EventBus;
  private isDispatching = false; // prevents re-entrant loops between DOM and bus clicks

  constructor(bus: EventBus) {
    this.bus = bus;

    // Listen for click events to apply visual flash and trigger native DOM click if gesture-driven
    bus.on('click', (e) => {
      if (e.targetId) {
        this.flashActive(e.targetId);
        if (e.source === 'gesture' && !this.isDispatching) {
          const btn = this.buttons.find((b) => b.id === e.targetId);
          if (btn) {
            this.isDispatching = true;
            btn.el.click();
            this.isDispatching = false;
          }
        }
      }
    });
  }

  register(id: string, el: HTMLButtonElement): void {
    // Avoid duplicate registration
    const existing = this.buttons.findIndex((b) => b.id === id);
    if (existing !== -1) {
      this.buttons[existing] = { el, id };
    } else {
      this.buttons.push({ el, id });
    }

    // Native mouse click also notifies bus
    el.addEventListener('click', () => {
      if (this.isDispatching) return;
      this.bus.emit({
        type: 'click',
        position: this.getElCenter(el),
        targetId: id,
        timestamp: Date.now(),
        source: 'mouse',
      });
    });
  }

  /**
   * Call once per frame with the normalised cursor position (0–1).
   * Returns the hovered button's id and DOM rect for the cursor's magnet.
   */
  update(nx: number, ny: number): { hoverId: string | null; magnetRect: DOMRect | null } {
    const px = nx * window.innerWidth;
    const py = ny * window.innerHeight;
    let hoverId: string | null = null;
    let magnetRect: DOMRect | null = null;

    for (const btn of this.buttons) {
      const r = btn.el.getBoundingClientRect();
      // Expand hit area slightly (8px) for easier hovering with hands
      const pad = 8;
      const inside =
        px >= r.left - pad &&
        px <= r.right + pad &&
        py >= r.top - pad &&
        py <= r.bottom + pad;

      btn.el.classList.toggle('hovered', inside);

      if (inside) {
        hoverId = btn.id;
        magnetRect = r;
      }
    }

    // Emit hover event when hovered target changes
    if (hoverId !== this.currentHoverId) {
      this.currentHoverId = hoverId;
      if (hoverId) {
        const targetBtn = this.buttons.find((b) => b.id === hoverId);
        if (targetBtn) {
          const rect = targetBtn.el.getBoundingClientRect();
          this.bus.emit({
            type: 'hover',
            position: {
              x: (rect.left + rect.width / 2) / window.innerWidth,
              y: (rect.top + rect.height / 2) / window.innerHeight,
            },
            targetId: hoverId,
            timestamp: Date.now(),
            source: 'gesture',
          });
        }
      }
    }

    return { hoverId, magnetRect };
  }

  /** Called when dwell fires (from Cursor). Triggers DOM click and emits click event. */
  fireDwell(targetId: string): void {
    const btn = this.buttons.find((b) => b.id === targetId);
    if (!btn) return;
    const pos = this.getElCenter(btn.el);
    this.flashActive(targetId);

    this.bus.emit({
      type: 'click',
      position: pos,
      targetId,
      timestamp: Date.now(),
      source: 'gesture',
    });

    if (!this.isDispatching) {
      this.isDispatching = true;
      btn.el.click();
      this.isDispatching = false;
    }
  }

  private flashActive(id: string): void {
    const btn = this.buttons.find((b) => b.id === id);
    if (!btn) return;
    btn.el.classList.add('active');
    setTimeout(() => btn.el.classList.remove('active'), 220);
  }

  private getElCenter(el: HTMLElement): { x: number; y: number } {
    const r = el.getBoundingClientRect();
    return {
      x: (r.left + r.width / 2) / window.innerWidth,
      y: (r.top + r.height / 2) / window.innerHeight,
    };
  }
}
