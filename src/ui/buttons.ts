/**
 * buttons.ts
 * Manages gesture-target buttons: hit-testing, hover state visual
 * feedback, dwell-click, and closed-fist/pinch gesture-click event dispatching.
 * Forwards cleanly to DOM element click handlers so all UI responds identically
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
  private lastClickedTargetId: string | null = null;
  private lastClickTimestamp = 0;

  constructor(bus: EventBus) {
    this.bus = bus;

    // Listen for click events from gesture pipeline (e.g. quick fist/pinch tap)
    bus.on('click', (e) => {
      if (this.isDispatching) return;
      if (e.source !== 'gesture') return;

      let targetId: string | null = e.targetId ?? null;
      if (!targetId) {
        if (this.currentHoverId) {
          targetId = this.currentHoverId;
        } else if (e.position) {
          targetId = this.findButtonAt(e.position.x * window.innerWidth, e.position.y * window.innerHeight);
        }
      }

      if (targetId) {
        this.triggerGestureClick(targetId);
      }
    });

    // When a grab/closed-fist/drag gesture begins while hovering a button,
    // intercept it immediately as an instant button click rather than starting a 3D orbit!
    bus.on('dragStart', (e) => {
      const targetId =
        this.currentHoverId ??
        (e.position ? this.findButtonAt(e.position.x * window.innerWidth, e.position.y * window.innerHeight) : null);
      if (targetId) {
        // Tag targetId on the event so scene.ts won't treat it as camera orbit
        e.targetId = targetId;
        this.triggerGestureClick(targetId);
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
   * Helper to find which active/visible button is at coordinates (px, py).
   * Picks the closest button center within tolerance.
   */
  findButtonAt(px: number, py: number): string | null {
    let bestId: string | null = null;
    let bestDist = Infinity;

    for (const btn of this.buttons) {
      if (!btn.el.isConnected || btn.el.offsetParent === null) continue;
      const r = btn.el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;

      const pad = 12;
      const insidePadded =
        px >= r.left - pad &&
        px <= r.right + pad &&
        py >= r.top - pad &&
        py <= r.bottom + pad;

      if (insidePadded) {
        const cx = r.left + r.width / 2;
        const cy = r.top + r.height / 2;
        const strictlyInside = px >= r.left && px <= r.right && py >= r.top && py <= r.bottom;
        const dist = strictlyInside ? 0 : Math.hypot(px - cx, py - cy);

        if (dist < bestDist) {
          bestDist = dist;
          bestId = btn.id;
        }
      }
    }
    return bestId;
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

    let bestBtn: ButtonRecord | null = null;
    let bestDist = Infinity;
    let bestRect: DOMRect | null = null;

    for (const btn of this.buttons) {
      // Skip disconnected or invisible/hidden buttons
      if (!btn.el.isConnected || btn.el.offsetParent === null) {
        btn.el.classList.remove('hovered');
        continue;
      }
      const r = btn.el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) {
        btn.el.classList.remove('hovered');
        continue;
      }

      // Check strictly inside first, then padded
      const strictlyInside =
        px >= r.left &&
        px <= r.right &&
        py >= r.top &&
        py <= r.bottom;

      // 10px pad matches flex gap to avoid overlapping adjacent buttons
      const pad = 10;
      const insidePadded =
        px >= r.left - pad &&
        px <= r.right + pad &&
        py >= r.top - pad &&
        py <= r.bottom + pad;

      if (insidePadded) {
        const cx = r.left + r.width / 2;
        const cy = r.top + r.height / 2;
        const dist = strictlyInside ? 0 : Math.hypot(px - cx, py - cy);

        if (dist < bestDist) {
          bestDist = dist;
          bestBtn = btn;
          bestRect = r;
        }
      }
    }

    if (bestBtn && bestRect) {
      hoverId = bestBtn.id;
      magnetRect = bestRect;
    }

    // Toggle .hovered class: ONLY the single winning button gets hovered state
    for (const btn of this.buttons) {
      const isHovered = bestBtn !== null && btn.id === bestBtn.id;
      btn.el.classList.toggle('hovered', isHovered);
    }

    // Emit hover event when hovered target changes
    if (hoverId !== this.currentHoverId) {
      this.currentHoverId = hoverId;
      if (hoverId && bestRect) {
        this.bus.emit({
          type: 'hover',
          position: {
            x: (bestRect.left + bestRect.width / 2) / window.innerWidth,
            y: (bestRect.top + bestRect.height / 2) / window.innerHeight,
          },
          targetId: hoverId,
          timestamp: Date.now(),
          source: 'gesture',
        });
      }
    }

    return { hoverId, magnetRect };
  }

  /**
   * Safely dispatches a DOM click and notifies the EventBus without double-firing or recursion.
   */
  triggerGestureClick(targetId: string): void {
    const now = Date.now();
    // 320ms cooldown per target to prevent accidental double-clicks from hand tremor
    if (this.lastClickedTargetId === targetId && now - this.lastClickTimestamp < 320) {
      return;
    }
    this.lastClickedTargetId = targetId;
    this.lastClickTimestamp = now;

    const btn = this.buttons.find((b) => b.id === targetId);
    if (!btn || !btn.el.isConnected || btn.el.offsetParent === null) return;

    this.flashActive(targetId);

    // Call native DOM click with isDispatching guarded
    try {
      this.isDispatching = true;
      btn.el.click();
      this.bus.emit({
        type: 'click',
        position: this.getElCenter(btn.el),
        targetId,
        timestamp: now,
        source: 'gesture',
      });
    } finally {
      this.isDispatching = false;
    }
  }

  /** Called when dwell fires (from Cursor). */
  fireDwell(targetId: string): void {
    this.triggerGestureClick(targetId);
  }

  private flashActive(id: string): void {
    const btn = this.buttons.find((b) => b.id === id);
    if (!btn) return;
    btn.el.classList.add('active');
    setTimeout(() => btn.el.classList.remove('active'), 240);
  }

  private getElCenter(el: HTMLElement): { x: number; y: number } {
    const r = el.getBoundingClientRect();
    return {
      x: (r.left + r.width / 2) / window.innerWidth,
      y: (r.top + r.height / 2) / window.innerHeight,
    };
  }
}
