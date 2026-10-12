/**
 * buttons.ts
 * Manages large gesture-target buttons: hit-testing, hover state visual
 * feedback, and dwell-click event emission.
 * Dwell is computed here and forwarded to the Cursor for the ring render.
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

  constructor(bus: EventBus) {
    this.bus = bus;

    // Listen for click events to apply the 'active' flash
    bus.on('click', (e) => {
      if (e.targetId) this.flashActive(e.targetId);
    });
  }

  register(id: string, el: HTMLButtonElement): void {
    this.buttons.push({ el, id });

    // Native mouse click also fires the event
    el.addEventListener('click', () => {
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
      const inside = px >= r.left && px <= r.right && py >= r.top && py <= r.bottom;
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
        const rect = this.buttons.find((b) => b.id === hoverId)!.el.getBoundingClientRect();
        this.bus.emit({
          type: 'hover',
          position: { x: (rect.left + rect.width / 2) / window.innerWidth, y: (rect.top + rect.height / 2) / window.innerHeight },
          targetId: hoverId,
          timestamp: Date.now(),
          source: 'gesture',
        });
      }
    }

    return { hoverId, magnetRect };
  }

  /** Called when dwell fires (from Cursor). Emits a click event. */
  fireDwell(targetId: string): void {
    const btn = this.buttons.find((b) => b.id === targetId);
    if (!btn) return;
    const pos = this.getElCenter(btn.el);
    this.bus.emit({ type: 'click', position: pos, targetId, timestamp: Date.now(), source: 'gesture' });
  }

  private flashActive(id: string): void {
    const btn = this.buttons.find((b) => b.id === id);
    if (!btn) return;
    btn.el.classList.add('active');
    setTimeout(() => btn.el.classList.remove('active'), 180);
  }

  private getElCenter(el: HTMLElement): { x: number; y: number } {
    const r = el.getBoundingClientRect();
    return { x: (r.left + r.width / 2) / window.innerWidth, y: (r.top + r.height / 2) / window.innerHeight };
  }
}
