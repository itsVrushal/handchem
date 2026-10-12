/**
 * stateMachine.ts
 * Pure per-hand state machine: idle → hovering → pinching/grabbing → dragging.
 * Supports both pinch gesture and closed fist gesture for grabbing and clicking.
 * No DOM, no Three.js – fully unit-testable with simulated landmark streams.
 *
 * Transitions:
 *   idle/hovering  → pinching : pinchRatio < pinchOnRatio OR fistRatio < fistOnRatio
 *   pinching       → dragging : grab held > clickMaxMs OR drift > clickMaxRadius
 *   pinching       → hovering : grab released (debounced) → emits CLICK
 *   dragging       → hovering : grab released (debounced) → emits DRAG_END
 *   any            → idle     : confidence < min OR null features
 */

export type HandState = 'idle' | 'hovering' | 'pinching' | 'dragging';

export interface StateMachineConfig {
  pinchOnRatio: number;     // < this  → enter pinching/grabbing
  pinchOffRatio: number;    // > this  → exit  pinching/grabbing (hysteresis)
  fistOnRatio: number;      // < this  → enter closed fist grab
  fistOffRatio: number;     // > this  → exit  closed fist grab (hysteresis)
  clickMaxMs: number;       // grab duration limit for click
  clickMaxRadius: number;   // normalised drift limit for click
  debounceFrames: number;   // consecutive frames required to commit a transition
  confidenceMin: number;    // below this → treat as no hand
}

export const DEFAULT_SM_CONFIG: StateMachineConfig = {
  pinchOnRatio: 0.30,
  pinchOffRatio: 0.45,
  fistOnRatio: 0.60,
  fistOffRatio: 0.75,
  clickMaxMs: 420,
  clickMaxRadius: 0.038, // ~3.8% screen tolerance for natural finger curl drift
  debounceFrames: 2,
  confidenceMin: 0.6,
};

export interface HandFeatureSnapshot {
  pinchRatio: number;
  fistRatio?: number;
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

function isGrabbingActive(snap: HandFeatureSnapshot, cfg: StateMachineConfig): boolean {
  const isPinch = snap.pinchRatio < cfg.pinchOnRatio;
  const isFist = snap.fistRatio !== undefined && snap.fistRatio < cfg.fistOnRatio;
  return isPinch || isFist;
}

function isGrabbingReleased(snap: HandFeatureSnapshot, cfg: StateMachineConfig): boolean {
  const isPinchOpen = snap.pinchRatio > cfg.pinchOffRatio;
  const isFistOpen = snap.fistRatio === undefined || snap.fistRatio > cfg.fistOffRatio;
  return isPinchOpen && isFistOpen;
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

  const { cursorX, cursorY, timestamp } = features;

  // ── Determine desired state ─────────────────────────────────────
  let desired: HandState;

  if (s.state === 'idle' || s.state === 'hovering') {
    desired = isGrabbingActive(features, cfg) ? 'pinching' : 'hovering';
  } else if (s.state === 'pinching') {
    // Immediate (no debounce) upgrade: grab held too long or drifted
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
      desired = isGrabbingReleased(features, cfg) ? 'hovering' : 'pinching';
    }
  } else if (s.state === 'dragging') {
    desired = isGrabbingReleased(features, cfg) ? 'hovering' : 'dragging';
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
          } else {
            events.push({ type: 'cancel', cursorX, cursorY, timestamp });
          }
          s.pinchStartTime = null;
        } else if (from === 'dragging') {
          events.push({ type: 'dragEnd', cursorX, cursorY, timestamp });
          s.pinchStartTime = null;
        }
      }
    }
  } else {
    s.debounceCount = 0;
    s.pendingState = null;
  }

  // ── Continuous events (per-frame within state) ──────────────────
  const dx = cursorX - s.lastCursorX;
  const dy = cursorY - s.lastCursorY;
  const moved = Math.hypot(dx, dy) > 1e-4;

  if (s.state === 'dragging') {
    events.push({
      type: 'drag',
      cursorX,
      cursorY,
      deltaX: dx,
      deltaY: dy,
      timestamp,
    });
  } else if (s.state === 'hovering' && moved) {
    events.push({
      type: 'move',
      cursorX,
      cursorY,
      deltaX: dx,
      deltaY: dy,
      timestamp,
    });
  }

  s.lastCursorX = cursorX;
  s.lastCursorY = cursorY;

  return { next: s, events };
}
