/**
 * stateMachine.test.ts
 * Unit tests for the hand state machine.
 * Tests: state transitions, click detection, drag detection,
 * tracking-loss handling, noisy inputs, and debounce behaviour.
 */

import { describe, it, expect } from 'vitest';
import {
  createHandSMState,
  stepStateMachine,
  DEFAULT_SM_CONFIG,
  type HandFeatureSnapshot,
  type HandSMState,
  type StateMachineConfig,
} from '../src/gesture/stateMachine';

// ── Helpers ───────────────────────────────────────────────────────

const cfg = DEFAULT_SM_CONFIG;

function snap(
  pinchRatio: number,
  timestamp = 0,
  cursorX = 0.5,
  cursorY = 0.5,
  confidence = 0.9,
  fistRatio?: number,
): HandFeatureSnapshot {
  return { pinchRatio, fistRatio, cursorX, cursorY, confidence, timestamp, palmWidth: 0.1 };
}

/** Advance N identical frames. */
function advanceN(
  state: HandSMState,
  n: number,
  s: HandFeatureSnapshot,
  c: StateMachineConfig = cfg,
): { state: HandSMState; allEvents: string[] } {
  const allEvents: string[] = [];
  for (let i = 0; i < n; i++) {
    const { next, events } = stepStateMachine(state, s, c);
    state = next;
    allEvents.push(...events.map((e) => e.type));
  }
  return { state, allEvents };
}

// ── Initial state ─────────────────────────────────────────────────

describe('createHandSMState', () => {
  it('starts in idle', () => {
    expect(createHandSMState().state).toBe('idle');
  });
});

// ── Idle → Hovering ───────────────────────────────────────────────

describe('idle → hovering', () => {
  it('transitions to hovering after debounce frames', () => {
    const s = createHandSMState();
    const { state } = advanceN(s, cfg.debounceFrames, snap(0.8));
    expect(state.state).toBe('hovering');
  });

  it('does NOT transition before debounce frames', () => {
    const s = createHandSMState();
    const { state } = advanceN(s, cfg.debounceFrames - 1, snap(0.8));
    expect(state.state).toBe('idle');
  });
});

// ── Hovering → Pinching → Click ──────────────────────────────────

describe('pinch-click', () => {
  it('emits click on short pinch + release', () => {
    const s = createHandSMState();

    // Enter hovering
    const { state: hovering } = advanceN(s, cfg.debounceFrames, snap(0.8, 0));
    expect(hovering.state).toBe('hovering');

    // Enter pinching
    const { state: pinching } = advanceN(hovering, cfg.debounceFrames, snap(0.15, 50));
    expect(pinching.state).toBe('pinching');

    // Release quickly (well within clickMaxMs)
    const releaseTime = 100; // ms – well within 350ms
    const { state: after, allEvents } = advanceN(
      pinching,
      cfg.debounceFrames,
      snap(0.8, releaseTime),
    );

    expect(after.state).toBe('hovering');
    expect(allEvents).toContain('click');
  });

  it('does NOT emit click for slow pinch (held too long)', () => {
    const s = createHandSMState();
    const { state: hovering } = advanceN(s, cfg.debounceFrames, snap(0.8, 0));
    const { state: pinching } = advanceN(hovering, cfg.debounceFrames, snap(0.15, 50));

    // Simulate time passing beyond clickMaxMs while still pinching
    let cur = pinching;
    for (let i = 0; i < 30; i++) {
      const r = stepStateMachine(cur, snap(0.15, 50 + (i + 1) * 20, 0.5, 0.5), cfg);
      cur = r.next;
    }
    expect(cur.state).toBe('dragging');

    // Release
    const { allEvents } = advanceN(cur, cfg.debounceFrames, snap(0.8, 800));
    expect(allEvents).not.toContain('click');
    expect(allEvents).toContain('dragEnd');
  });
});

// ── Pinch → Drag ──────────────────────────────────────────────────

describe('pinch → drag', () => {
  it('upgrades to dragging after clickMaxMs', () => {
    const s = createHandSMState();
    const { state: hovering } = advanceN(s, cfg.debounceFrames, snap(0.8, 0));
    const { state: pinching } = advanceN(hovering, cfg.debounceFrames, snap(0.15, 10));

    // Advance time beyond clickMaxMs while staying pinched
    let cur = pinching;
    const steps = 25;
    const dt = cfg.clickMaxMs / steps;
    for (let i = 0; i < steps + 2; i++) {
      const r = stepStateMachine(cur, snap(0.15, 10 + (i + 1) * dt), cfg);
      cur = r.next;
    }
    expect(cur.state).toBe('dragging');
  });

  it('upgrades to dragging on drift beyond clickMaxRadius', () => {
    const s = createHandSMState();
    const { state: hovering } = advanceN(s, cfg.debounceFrames, snap(0.8, 0));
    const { state: pinching } = advanceN(hovering, cfg.debounceFrames, snap(0.15, 10));
    expect(pinching.state).toBe('pinching');

    // Move cursor far from pinch start
    const { next, events } = stepStateMachine(
      pinching,
      snap(0.15, 20, pinching.pinchStartX + cfg.clickMaxRadius * 3, 0.5),
      cfg,
    );
    expect(events.some((e) => e.type === 'dragStart')).toBe(true);
    expect(next.state).toBe('dragging');
  });

  it('emits drag delta events while dragging', () => {
    const s = createHandSMState();
    const { state: hovering } = advanceN(s, cfg.debounceFrames, snap(0.8, 0));
    let cur = hovering;

    // Rapid pinch+time → drag
    for (let i = 0; i <= 30; i++) {
      const r = stepStateMachine(cur, snap(0.1, i * 16), cfg);
      cur = r.next;
    }

    expect(cur.state).toBe('dragging');

    // Now drag
    const { events } = stepStateMachine(cur, snap(0.1, 500, 0.6, 0.5), cfg);
    const dragEv = events.find((e) => e.type === 'drag');
    expect(dragEv).toBeDefined();
    expect(dragEv?.deltaX).toBeDefined();
  });
});

// ── Tracking loss ─────────────────────────────────────────────────

describe('tracking loss', () => {
  it('emits dragEnd when tracking lost during drag', () => {
    const s = createHandSMState();
    const { state: hovering } = advanceN(s, cfg.debounceFrames, snap(0.8, 0));
    let cur = hovering;
    for (let i = 0; i <= 30; i++) {
      const r = stepStateMachine(cur, snap(0.1, i * 16), cfg);
      cur = r.next;
    }
    expect(cur.state).toBe('dragging');

    // Pass null → tracking lost
    const { next, events } = stepStateMachine(cur, null, cfg);
    expect(next.state).toBe('idle');
    expect(events.some((e) => e.type === 'dragEnd')).toBe(true);
  });

  it('emits cancel when tracking lost during pinching', () => {
    const s = createHandSMState();
    const { state: hovering } = advanceN(s, cfg.debounceFrames, snap(0.8, 0));
    const { state: pinching } = advanceN(hovering, cfg.debounceFrames, snap(0.15, 50));
    expect(pinching.state).toBe('pinching');

    const { next, events } = stepStateMachine(pinching, null, cfg);
    expect(next.state).toBe('idle');
    expect(events.some((e) => e.type === 'cancel')).toBe(true);
  });

  it('ignores low-confidence frames (< confidenceMin)', () => {
    const s = createHandSMState();
    const { state: hovering } = advanceN(s, cfg.debounceFrames, snap(0.8, 0));

    // Low confidence snap
    const lowConf = snap(0.8, 100);
    lowConf.confidence = 0.2;
    const { next } = stepStateMachine(hovering, lowConf, cfg);
    expect(next.state).toBe('idle');
  });
});

// ── Debounce / noisy frames ───────────────────────────────────────

describe('debounce', () => {
  it('single noisy pinch frame does not change state from hovering', () => {
    const s = createHandSMState();
    const { state: hovering } = advanceN(s, cfg.debounceFrames, snap(0.8, 0));
    expect(hovering.state).toBe('hovering');

    // 1 frame of low pinchRatio (pinch), then back
    const { next: after1 } = stepStateMachine(hovering, snap(0.1, 16), cfg);
    const { next: after2 } = stepStateMachine(after1, snap(0.8, 32), cfg);
    expect(after2.state).toBe('hovering');
  });

  it('single noisy release frame does not end drag', () => {
    const s = createHandSMState();
    const { state: hovering } = advanceN(s, cfg.debounceFrames, snap(0.8, 0));
    let cur = hovering;
    for (let i = 0; i <= 30; i++) {
      const r = stepStateMachine(cur, snap(0.1, i * 16), cfg);
      cur = r.next;
    }
    expect(cur.state).toBe('dragging');

    // 1 frame of release
    const { next: afterNoise } = stepStateMachine(cur, snap(0.9, 500), cfg);
    // Debounce should still keep dragging
    expect(afterNoise.state).toBe('dragging');
  });
});

// ── Closed Fist Gesture ───────────────────────────────────────────

describe('closed fist grabbing & clicking', () => {
  it('enters pinching/grabbing state when fistRatio < fistOnRatio even without pinch', () => {
    const s = createHandSMState();
    // Hovering with open hand (pinch 0.8, fist 1.1)
    const { state: hovering } = advanceN(s, cfg.debounceFrames, snap(0.8, 0, 0.5, 0.5, 0.9, 1.1));
    expect(hovering.state).toBe('hovering');

    // Close fist: fistRatio = 0.45 (< 0.60), pinch remains open (0.8)
    const { state: grabbed } = advanceN(hovering, cfg.debounceFrames, snap(0.8, 50, 0.5, 0.5, 0.9, 0.45));
    expect(grabbed.state).toBe('pinching');

    // Quick release (fist opened back to 1.1)
    const { state: after, allEvents } = advanceN(
      grabbed,
      cfg.debounceFrames,
      snap(0.8, 120, 0.5, 0.5, 0.9, 1.1),
    );
    expect(after.state).toBe('hovering');
    expect(allEvents).toContain('click');
  });

  it('drags when fist is held and moved', () => {
    const s = createHandSMState();
    const { state: hovering } = advanceN(s, cfg.debounceFrames, snap(0.8, 0, 0.5, 0.5, 0.9, 1.1));
    const { state: grabbed } = advanceN(hovering, cfg.debounceFrames, snap(0.8, 10, 0.5, 0.5, 0.9, 0.45));

    // Move cursor while fist is closed beyond clickMaxRadius
    const moved = stepStateMachine(grabbed, snap(0.8, 20, 0.65, 0.65, 0.9, 0.45), cfg);
    expect(moved.next.state).toBe('dragging');
    expect(moved.events.map((e) => e.type)).toContain('dragStart');
  });
});

