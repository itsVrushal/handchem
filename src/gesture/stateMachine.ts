/**
 * stateMachine.ts
 * Pure per-hand state machine: idle → hovering → pinching → dragging.
 * No DOM, no Three.js – fully unit-testable with simulated landmark streams.
 *
 * Transitions:
 *   idle/hovering  → pinching : pinchRatio < pinchOnRatio  (debounced)
 *   pinching       → dragging : pinch held > clickMaxMs OR drift > clickMaxRadius
 *   pinching       → hovering : pinchRatio > pinchOffRatio (debounced) → maybe CLICK
 *   dragging       → hovering : pinchRatio > pinchOffRatio (debounced) → DRAG_END
 *   any            → idle     : confidence < min OR null features
 */

export type HandState = 'idle' | 'hovering' | 'pinching' | 'dragging';

export interface StateMachineConfig {
  pinchOnRatio: number;     // < this  → enter pinching
  pinchOffRatio: number;    // > this  → exit  pinching (hysteresis)
  clickMaxMs: number;       // pinch duration limit for click
  clickMaxRadius: number;   // normalised drift limit for click
  debounceFrames: number;   // consecutive frames required to commit a transition
  confidenceMin: number;    // below this → treat as no hand
}

export const DEFAULT_SM_CONFIG: StateMachineConfig = {
  pinchOnRatio: 0.30,
  pinchOffRatio: 0.45,
  clickMaxMs: 350,
  clickMaxRadius: 0.016,  // ~1.6% of screen width
  debounceFrames: 2,
  confidenceMin: 0.6,
};

export interface HandFeatureSnapshot {
  pinchRatio: number;
  cursorX: number;
  cursorY: number;
  confidence: number;
  timestamp: number;
  palmWidth: number;
}

export type HandEventType =
  | 'move'
  | 'hover'
  | 'click'
  | 'dragStart'
  | 'drag'
  | 'dragEnd'
  | 'cancel';

export interface HandEvent {
  type: HandEventType;
  cursorX: number;
  cursorY: number;
  deltaX?: number;
  deltaY?: number;
  timestamp: number;
}

export interface HandSMState {
  state: HandState;
  debounceCount: number;
  pendingState: HandState | null;
  pinchStartTime: number | null;
  pinchStartX: number;
  pinchStartY: number;
  lastCursorX: number;
  lastCursorY: number;
}

export function createHandSMState(): HandSMState {
  return {
    state: 'idle',
    debounceCount: 0,
    pendingState: null,
    pinchStartTime: null,
    pinchStartX: 0,
    pinchStartY: 0,
    lastCursorX: 0.5,
    lastCursorY: 0.5,
  };
}

/**
 * Advance the state machine by one inference frame.
 * Returns a new (immutable) state plus any events to emit.
 * Pass `features = null` to signal tracking loss.
 */
export function stepStateMachine(
  prev: HandSMState,
  features: HandFeatureSnapshot | null,
  cfg: StateMachineConfig,
): { next: HandSMState; events: HandEvent[] } {
  // Shallow clone so the function is pure
  const s: HandSMState = { ...prev };
  const events: HandEvent[] = [];
  const now = features?.timestamp ?? Date.now();

  // ── Tracking loss ──────────────────────────────────────────────
  if (!features || features.confidence < cfg.confidenceMin) {
    if (s.state === 'dragging') {
      events.push({ type: 'dragEnd', cursorX: s.lastCursorX, cursorY: s.lastCursorY, timestamp: now });
    } else if (s.state === 'pinching') {
      events.push({ type: 'cancel', cursorX: s.lastCursorX, cursorY: s.lastCursorY, timestamp: now });
    }
    return {
      next: {
        state: 'idle',
        debounceCount: 0,
        pendingState: null,
        pinchStartTime: null,
        pinchStartX: 0,
        pinchStartY: 0,
        lastCursorX: s.lastCursorX,
        lastCursorY: s.lastCursorY,
      },
      events,
    };
  }

  const { pinchRatio, cursorX, cursorY, timestamp } = features;

  // ── Determine desired state ─────────────────────────────────────
  let desired: HandState;

  if (s.state === 'idle' || s.state === 'hovering') {
    desired = pinchRatio < cfg.pinchOnRatio ? 'pinching' : 'hovering';
  } else if (s.state === 'pinching') {
    // Immediate (no debounce) upgrade: pinch held too long or drifted
    const pinchDur = s.pinchStartTime !== null ? timestamp - s.pinchStartTime : 0;
    const ddx = cursorX - s.pinchStartX;
    const ddy = cursorY - s.pinchStartY;
    const drift = Math.hypot(ddx, ddy);

    if (pinchDur > cfg.clickMaxMs || drift > cfg.clickMaxRadius) {
      // Upgrade to dragging immediately – record dragStart
      events.push({
        type: 'dragStart',
        cursorX: s.pinchStartX,
        cursorY: s.pinchStartY,
        timestamp: s.pinchStartTime ?? timestamp,
      });
      s.state = 'dragging';
      desired = 'dragging';
    } else {
      desired = pinchRatio > cfg.pinchOffRatio ? 'hovering' : 'pinching';
    }
  } else if (s.state === 'dragging') {
    desired = pinchRatio > cfg.pinchOffRatio ? 'hovering' : 'dragging';
  } else {
    desired = 'hovering';
  }

  // ── Debounce ────────────────────────────────────────────────────
  if (desired !== s.state) {
    if (s.pendingState === desired) {
      s.debounceCount++;
    } else {
      s.pendingState = desired;
      s.debounceCount = 1;
    }

    if (s.debounceCount >= cfg.debounceFrames) {
      // Commit transition
      const from = s.state;
      s.state = desired;
      s.debounceCount = 0;
      s.pendingState = null;

      // Transition side-effects
      if (s.state === 'pinching') {
        s.pinchStartTime = timestamp;
        s.pinchStartX = cursorX;
        s.pinchStartY = cursorY;
      } else if (s.state === 'hovering') {
        if (from === 'pinching') {
          const dur = s.pinchStartTime !== null ? timestamp - s.pinchStartTime : Infinity;
          const ddx = cursorX - s.pinchStartX;
          const ddy = cursorY - s.pinchStartY;
          const drift = Math.hypot(ddx, ddy);
          if (dur <= cfg.clickMaxMs && drift <= cfg.clickMaxRadius) {
            events.push({ type: 'click', cursorX, cursorY, timestamp });
          }
          s.pinchStartTime = null;
        } else if (from === 'dragging') {
          events.push({ type: 'dragEnd', cursorX, cursorY, timestamp });
        }
      }
    }
    // else: debounce accumulating – keep emitting current-state events
  } else {
    s.debounceCount = 0;
    s.pendingState = null;
  }

  // ── Ongoing-state events ────────────────────────────────────────
  switch (s.state) {
    case 'hovering':
      events.push({ type: 'hover', cursorX, cursorY, timestamp });
      break;
    case 'pinching':
      events.push({ type: 'move', cursorX, cursorY, timestamp });
      break;
    case 'dragging': {
      const ddx = cursorX - s.lastCursorX;
      const ddy = cursorY - s.lastCursorY;
      events.push({ type: 'drag', cursorX, cursorY, deltaX: ddx, deltaY: ddy, timestamp });
      break;
    }
    default:
      events.push({ type: 'move', cursorX, cursorY, timestamp });
  }

  s.lastCursorX = cursorX;
  s.lastCursorY = cursorY;
  return { next: s, events };
}
