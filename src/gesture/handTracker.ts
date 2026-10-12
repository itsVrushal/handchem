/**
 * handTracker.ts
 * Owns the MediaPipe HandLandmarker lifecycle and the full gesture pipeline:
 *   webcam frame → HandLandmarker → LandmarkFilter → features → StateMachine
 *   → ActiveZone → InputEvents → EventBus
 *
 * Inference runs synchronously on the main thread (VIDEO mode), throttled to
 * ~15 fps. The render loop runs independently at display refresh rate.
 *
 * Tracking-loss handling:
 *   • Up to EXTRAPOLATE_MS ms after loss: extrapolate cursor from last velocity
 *   • After that window: emit dragEnd/cancel and freeze cursor
 */

import {
  FilesetResolver,
  HandLandmarker,
  type HandLandmarkerResult,
  type NormalizedLandmark,
} from '@mediapipe/tasks-vision';
import { EventBus, type InputEvent } from '../input/events';
import { LandmarkFilter, type OneEuroConfig } from './oneEuroFilter';
import { extractFeatures, type LandmarkList } from './features';
import {
  createHandSMState,
  stepStateMachine,
  DEFAULT_SM_CONFIG,
  type HandSMState,
  type StateMachineConfig,
  type HandEvent,
  type HandState,
} from './stateMachine';
import { ActiveZone } from './activeZone';

// MediaPipe model URLs (CDN – no data leaves the device; only the model file is fetched)
const WASM_URL =
  'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm';
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';

const EXTRAPOLATE_MS = 200; // ms to extrapolate cursor after tracking loss

export interface HandMetrics {
  palmWidth: number;
  pinchRatio: number;
  fistRatio: number;
  isPointing?: boolean;
  isTwoFingers?: boolean;
  handState: HandState;
  confidence: number;
  isTracking: boolean;
  cursorX: number;
  cursorY: number;
}

export interface ProcessResult {
  inferenceMs: number;
  landmarks: LandmarkList[] | null;
  metrics: HandMetrics;
}

export class HandTracker {
  private landmarker: HandLandmarker | null = null;
  private filter: LandmarkFilter;
  private smState: HandSMState;
  private smCfg: StateMachineConfig;
  private zone: ActiveZone;
  private filterCfg: OneEuroConfig;

  // Tracking-loss state
  private lastDetected = false;
  private lostAt: number | null = null;
  private lastVelX = 0;
  private lastVelY = 0;
  private lastTimestamp = 0;

  // Metrics exposed to debug panel
  private metrics: HandMetrics = {
    palmWidth: 0,
    pinchRatio: 1,
    fistRatio: 1,
    handState: 'idle',
    confidence: 0,
    isTracking: false,
    cursorX: 0.5,
    cursorY: 0.5,
  };

  private latestLandmarks: LandmarkList[] | null = null;
  private prevTwoHandDist: number | null = null;
  private prevTwoHandAngle: number | null = null;

  constructor(private readonly bus: EventBus) {
    this.filterCfg = { minCutoff: 1.0, beta: 0.007, dCutoff: 1.0 };
    this.filter = new LandmarkFilter(21, this.filterCfg);
    this.smState = createHandSMState();
    this.smCfg = { ...DEFAULT_SM_CONFIG };
    this.zone = new ActiveZone();
  }

  // ── Initialisation ──────────────────────────────────────────────

  async init(): Promise<void> {
    const vision = await FilesetResolver.forVisionTasks(WASM_URL);

    // Try GPU delegate first, fall back to CPU
    for (const delegate of ['GPU', 'CPU'] as const) {
      try {
        this.landmarker = await HandLandmarker.createFromOptions(vision, {
          baseOptions: { modelAssetPath: MODEL_URL, delegate },
          runningMode: 'VIDEO',
          numHands: 2,
          minHandDetectionConfidence: 0.5,
          minHandPresenceConfidence: 0.5,
          minTrackingConfidence: 0.5,
        });
        console.info(`HandLandmarker initialised (delegate: ${delegate})`);
        break;
      } catch {
        console.warn(`HandLandmarker: ${delegate} failed, trying next`);
      }
    }

    if (!this.landmarker) {
      throw new Error('HandLandmarker: could not initialise with any delegate');
    }
  }

  // ── Main inference call (called by app.ts on each throttled frame) ─

  process(video: HTMLVideoElement, timestamp: number): ProcessResult | null {
    if (!this.landmarker || video.readyState < 2) return null;

    const t0 = performance.now();
    let result: HandLandmarkerResult;
    try {
      result = this.landmarker.detectForVideo(video, timestamp);
    } catch (err) {
      console.warn('HandLandmarker.detectForVideo error:', err);
      return null;
    }
    const inferenceMs = performance.now() - t0;

    // handednesses may be spelled differently across MP versions
    const handednesses =
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (result as any).handednesses ?? (result as any).handedness ?? [];

    if (result.landmarks.length > 0) {
      this.handleDetection(result.landmarks, handednesses, timestamp);
    } else {
      this.handleLoss(timestamp);
    }

    return { inferenceMs, landmarks: this.latestLandmarks, metrics: { ...this.metrics } };
  }

  // ── Detection ───────────────────────────────────────────────────

  private handleDetection(
    rawLandmarkSets: NormalizedLandmark[][],
    handednesses: Array<Array<{ score: number }>>,
    timestamp: number,
  ): void {
    if (this.lostAt !== null) {
      // Hand reappeared – reset filter to avoid "snap" from stale state
      this.filter.reset();
      this.lostAt = null;
    }

    const rawLMs = rawLandmarkSets[0] ?? [];
    const confidence = handednesses[0]?.[0]?.score ?? 0.8;

    // Filter all 21 landmarks
    const filteredLMs = this.filter.filter(rawLMs as LandmarkList, timestamp);
    this.latestLandmarks = [filteredLMs];

    const feats = extractFeatures(filteredLMs);
    const screen = this.zone.map(feats.cursorX, feats.cursorY, true);

    // Velocity estimate for extrapolation
    const dt = (timestamp - this.lastTimestamp) / 1000;
    if (dt > 0 && this.lastDetected) {
      this.lastVelX = (screen.x - this.metrics.cursorX) / dt;
      this.lastVelY = (screen.y - this.metrics.cursorY) / dt;
    }
    this.lastTimestamp = timestamp;
    this.lastDetected = true;

    const snap = {
      pinchRatio: feats.pinchRatio,
      fistRatio: feats.fistRatio,
      isPointing: feats.isPointing,
      isTwoFingers: feats.isTwoFingers,
      cursorX: screen.x,
      cursorY: screen.y,
      confidence,
      timestamp,
      palmWidth: feats.palmWidth,
    };

    const { next, events } = stepStateMachine(this.smState, snap, this.smCfg);
    this.smState = next;
    this.emitEvents(events);

    this.metrics = {
      palmWidth: feats.palmWidth,
      pinchRatio: feats.pinchRatio,
      fistRatio: feats.fistRatio,
      isPointing: feats.isPointing,
      isTwoFingers: feats.isTwoFingers,
      handState: next.state,
      confidence,
      isTracking: true,
      cursorX: screen.x,
      cursorY: screen.y,
    };

    // Two-hand zoom and rotate detection
    if (rawLandmarkSets.length >= 2) {
      const lm0 = rawLandmarkSets[0];
      const lm1 = rawLandmarkSets[1];
      if (lm0 && lm1 && lm0.length >= 9 && lm1.length >= 9) {
        const p0 = lm0[8]!;
        const p1 = lm1[8]!;
        const dx = (1 - p0.x) - (1 - p1.x);
        const dy = p0.y - p1.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const angle = Math.atan2(dy, dx);

        const f0 = extractFeatures(lm0 as LandmarkList);
        const f1 = extractFeatures(lm1 as LandmarkList);

        if (f0.pinchRatio < 0.45 && f1.pinchRatio < 0.45) {
          if (this.prevTwoHandDist !== null && dist > 1e-4) {
            const factor = this.prevTwoHandDist / dist;
            if (Math.abs(factor - 1) > 0.015) {
              this.bus.emit({
                type: 'zoom',
                factor: Math.max(0.85, Math.min(1.15, factor)),
                timestamp,
                source: 'gesture',
                position: { x: screen.x, y: screen.y },
              });
            }
          }
          if (this.prevTwoHandAngle !== null) {
            let deltaAngle = angle - this.prevTwoHandAngle;
            if (deltaAngle > Math.PI) deltaAngle -= 2 * Math.PI;
            if (deltaAngle < -Math.PI) deltaAngle += 2 * Math.PI;
            if (Math.abs(deltaAngle) > 0.02) {
              this.bus.emit({
                type: 'orbit',
                delta: { x: deltaAngle * 1.5, y: 0 },
                timestamp,
                source: 'gesture',
                position: { x: screen.x, y: screen.y },
              });
            }
          }
          this.prevTwoHandDist = dist;
          this.prevTwoHandAngle = angle;
        } else {
          this.prevTwoHandDist = null;
          this.prevTwoHandAngle = null;
        }
      }
    } else {
      this.prevTwoHandDist = null;
      this.prevTwoHandAngle = null;
    }
  }

  // ── Tracking loss ───────────────────────────────────────────────

  private handleLoss(timestamp: number): void {
    if (!this.lastDetected && this.lostAt === null) {
      // Was already idle – nothing to do
      this.latestLandmarks = null;
      return;
    }

    if (this.lastDetected) {
      // First frame of loss
      this.lastDetected = false;
      this.lostAt = timestamp;
    }

    const lostDur = this.lostAt !== null ? timestamp - this.lostAt : Infinity;

    if (lostDur < EXTRAPOLATE_MS && this.smState.state === 'dragging') {
      // Extrapolate: continue the last drag with decaying velocity
      const dt = (timestamp - this.lastTimestamp) / 1000;
      const decay = Math.max(0, 1 - lostDur / EXTRAPOLATE_MS);
      const ex = Math.max(0, Math.min(1, this.metrics.cursorX + this.lastVelX * dt * decay));
      const ey = Math.max(0, Math.min(1, this.metrics.cursorY + this.lastVelY * dt * decay));

      this.bus.emit({
        type: 'drag',
        position: { x: ex, y: ey },
        delta: { x: ex - this.metrics.cursorX, y: ey - this.metrics.cursorY },
        timestamp,
        source: 'gesture',
      });
      this.metrics.cursorX = ex;
      this.metrics.cursorY = ey;
    } else if (lostDur >= EXTRAPOLATE_MS) {
      // Window expired → graceful termination
      const { next, events } = stepStateMachine(this.smState, null, this.smCfg);
      this.smState = next;
      this.emitEvents(events);
      this.zone.map(0, 0, false); // freeze cursor
      this.lostAt = null;
    }

    this.lastTimestamp = timestamp;
    this.latestLandmarks = null;
    this.metrics.isTracking = false;
    this.metrics.handState = this.smState.state;
  }

  // ── Event translation ───────────────────────────────────────────

  private emitEvents(events: HandEvent[]): void {
    for (const ev of events) {
      const base = {
        position: { x: ev.cursorX, y: ev.cursorY },
        timestamp: ev.timestamp,
        source: 'gesture' as const,
      };
      let inputEvent: InputEvent;

      switch (ev.type) {
        case 'move':      inputEvent = { type: 'move',     ...base }; break;
        case 'hover':     inputEvent = { type: 'hover',    ...base }; break;
        case 'click':     inputEvent = { type: 'click',    ...base }; break;
        case 'dragStart': inputEvent = { type: 'dragStart',...base }; break;
        case 'drag':
          inputEvent = {
            type: 'drag',
            ...base,
            delta: { x: ev.deltaX ?? 0, y: ev.deltaY ?? 0 },
          };
          break;
        case 'dragEnd': inputEvent = { type: 'dragEnd', ...base }; break;
        case 'cancel':
          inputEvent = { type: 'cancel', ...base, reason: 'tracking loss' };
          break;
        default:
          continue;
      }
      this.bus.emit(inputEvent);
    }
  }

  // ── Config hot-reloading (from debug panel) ─────────────────────

  updateFilterConfig(cfg: Partial<OneEuroConfig>): void {
    this.filterCfg = { ...this.filterCfg, ...cfg };
    this.filter.updateConfig(this.filterCfg);
  }

  updateSmConfig(cfg: Partial<StateMachineConfig>): void {
    this.smCfg = { ...this.smCfg, ...cfg };
  }

  // ── Accessors ───────────────────────────────────────────────────

  getLatestLandmarks(): LandmarkList[] | null {
    return this.latestLandmarks;
  }

  getMetrics(): Readonly<HandMetrics> {
    return this.metrics;
  }

  dispose(): void {
    this.landmarker?.close();
    this.landmarker = null;
  }
}
