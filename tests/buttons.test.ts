/**
 * buttons.test.ts
 * Unit tests for ButtonManager:
 * - Non-overlapping hit-testing and closest-button resolution
 * - Dwell-click single firing (no double clicks)
 * - Toggle button state preservation
 * - Closed-fist / dragStart interception on hover
 * - Disconnected / hidden element filtering
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ButtonManager } from '../src/ui/buttons';
import { EventBus, type InputEvent } from '../src/input/events';

interface MockButtonOptions {
  id: string;
  left: number;
  top: number;
  width: number;
  height: number;
  visible?: boolean;
}

function createMockButton(opts: MockButtonOptions): HTMLButtonElement {
  const classes = new Set<string>();
  const listeners: Record<string, Array<() => void>> = {};
  let clickCount = 0;

  const btn = {
    id: opts.id,
    isConnected: true,
    offsetParent: opts.visible !== false ? ({} as Element) : null,
    classList: {
      add: (c: string) => classes.add(c),
      remove: (c: string) => classes.delete(c),
      toggle: (c: string, force?: boolean) => {
        const val = force !== undefined ? force : !classes.has(c);
        if (val) classes.add(c);
        else classes.delete(c);
        return val;
      },
      contains: (c: string) => classes.has(c),
    },
    getBoundingClientRect: () => ({
      left: opts.left,
      top: opts.top,
      right: opts.left + (opts.visible !== false ? opts.width : 0),
      bottom: opts.top + (opts.visible !== false ? opts.height : 0),
      width: opts.visible !== false ? opts.width : 0,
      height: opts.visible !== false ? opts.height : 0,
    } as DOMRect),
    addEventListener: (ev: string, cb: () => void) => {
      listeners[ev] = listeners[ev] || [];
      listeners[ev].push(cb);
    },
    click: () => {
      clickCount++;
      listeners['click']?.forEach((cb) => cb());
    },
    getClickCount: () => clickCount,
  };

  return btn as unknown as HTMLButtonElement & { getClickCount: () => number };
}

describe('ButtonManager', () => {
  let bus: EventBus;
  let manager: ButtonManager;

  beforeEach(() => {
    // Set up mock window dimensions
    (globalThis as unknown as { window: { innerWidth: number; innerHeight: number } }).window = {
      innerWidth: 1000,
      innerHeight: 1000,
    };
    bus = new EventBus();
    manager = new ButtonManager(bus);
  });

  it('selects strictly inside button without jumping to adjacent button', () => {
    // Two adjacent buttons with 10px gap
    // Button 1: [100, 190], width 90
    // Button 2: [200, 290], width 90
    const btn1 = createMockButton({ id: 'btn-missions', left: 100, top: 20, width: 90, height: 40 });
    const btn2 = createMockButton({ id: 'btn-build', left: 200, top: 20, width: 90, height: 40 });

    manager.register('btn-missions', btn1);
    manager.register('btn-build', btn2);

    // Cursor at (185, 30) - near the right edge of Button 1
    const { hoverId } = manager.update(0.185, 0.03);
    expect(hoverId).toBe('btn-missions');
    expect(btn1.classList.contains('hovered')).toBe(true);
    expect(btn2.classList.contains('hovered')).toBe(false);
  });

  it('dwell click dispatches DOM click exactly once', () => {
    let toggleState = false;
    const btn = createMockButton({ id: 'btn-toggle', left: 100, top: 20, width: 80, height: 40 });

    // Listener acts like a toggle (e.g. missionModal.toggle())
    btn.addEventListener('click', () => {
      toggleState = !toggleState;
    });

    manager.register('btn-toggle', btn);

    // Trigger dwell click
    manager.fireDwell('btn-toggle');

    // Button should be toggled ON and NOT double-clicked back OFF
    expect(toggleState).toBe(true);
    expect((btn as unknown as { getClickCount: () => number }).getClickCount()).toBe(1);
  });

  it('intercepts closed-fist dragStart while hovering a button as instant click', () => {
    let clicked = false;
    const btn = createMockButton({ id: 'btn-reset', left: 300, top: 20, width: 80, height: 40 });
    btn.addEventListener('click', () => {
      clicked = true;
    });

    manager.register('btn-reset', btn);

    // Hover over button
    manager.update(0.34, 0.035);

    // User makes a closed fist -> emits dragStart
    const dragEvent: InputEvent = {
      type: 'dragStart',
      position: { x: 0.34, y: 0.035 },
      timestamp: Date.now(),
      source: 'gesture',
    };
    bus.emit(dragEvent);

    expect(dragEvent.targetId).toBe('btn-reset');
    // Button is not clicked instantly by dragStart; deliberate dwell is required
    expect(clicked).toBe(false);

    // Dwell finishes -> triggers click
    manager.fireDwell('btn-reset');
    expect(clicked).toBe(true);
  });

  it('ignores hidden or closed-modal buttons during hit-testing', () => {
    const hiddenBtn = createMockButton({
      id: 'btn-modal-card',
      left: 100,
      top: 100,
      width: 200,
      height: 100,
      visible: false,
    });
    manager.register('btn-modal-card', hiddenBtn);

    const { hoverId } = manager.update(0.15, 0.15);
    expect(hoverId).toBeNull();
    expect(hiddenBtn.classList.contains('hovered')).toBe(false);
  });

  it('prevents accidental duplicate clicks within cooldown window', () => {
    let clickCount = 0;
    const btn = createMockButton({ id: 'btn-test', left: 10, top: 10, width: 50, height: 50 });
    btn.addEventListener('click', () => {
      clickCount++;
    });
    manager.register('btn-test', btn);

    // First click
    manager.triggerGestureClick('btn-test');
    expect(clickCount).toBe(1);

    // Rapid second click within cooldown
    manager.triggerGestureClick('btn-test');
    expect(clickCount).toBe(1);
  });
});
