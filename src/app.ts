/**
 * app.ts
 * Central orchestrator for Phase 0 / Phase 1.
 * Wires the gesture pipeline, mouse fallback, Three.js scene, and all UI.
 *
 * Single rAF loop drives:
 *   1. Inference throttle   (~15 fps)
 *   2. Three.js render      (display fps)
 *   3. Cursor overlay render
 *   4. Camera preview render
 *   5. Debug panel update
 */

import { EventBus } from './input/events';
import { MouseAdapter } from './input/mouseAdapter';
import { HandTracker } from './gesture/handTracker';
import { Scene } from './render/scene';
import { Cursor } from './ui/cursor';
import { ButtonManager } from './ui/buttons';
import { CameraPreview } from './ui/preview';
import { DebugPanel } from './ui/debugPanel';

const INFERENCE_INTERVAL_MS = 1000 / 15; // 15 fps throttle
const REST_REMINDER_MS = 10 * 60 * 1000; // 10 minutes

export class App {
  private readonly bus = new EventBus();
  private readonly tracker: HandTracker;
  private readonly scene: Scene;
  private readonly cursor: Cursor;
  private readonly buttons: ButtonManager;
  private readonly preview: CameraPreview;
  private readonly debug: DebugPanel;
  private readonly mouseAdapter: MouseAdapter;

  private rafId = 0;
  private lastInferenceTime = -Infinity;
  private prevFrameTime = performance.now();

  // FPS counter
  private frameCount = 0;
  private fpsMeasureStart = performance.now();
  private displayFps = 0;

  // Rest reminder
  private trackingStartTime: number | null = null;
  private restReminderShown = false;

  constructor(private readonly video: HTMLVideoElement) {
    const mainCanvas  = document.getElementById('main-canvas')   as HTMLCanvasElement;
    const cursorCanvas = document.getElementById('cursor-canvas') as HTMLCanvasElement;
    const skeletonCanvas = document.getElementById('skeleton-canvas') as HTMLCanvasElement;

    this.scene  = new Scene(mainCanvas, this.bus);
    this.cursor = new Cursor(cursorCanvas, this.bus);
    this.buttons = new ButtonManager(this.bus);
    this.preview = new CameraPreview(video, skeletonCanvas);
    this.debug   = new DebugPanel();
    this.tracker = new HandTracker(this.bus);
    this.mouseAdapter = new MouseAdapter(this.bus, mainCanvas);

    this.wireUI();
  }

  private wireUI(): void {
    // Register gesture-test buttons
    const btnPinch = document.getElementById('btn-pinch') as HTMLButtonElement;
    const btnDwell = document.getElementById('btn-dwell') as HTMLButtonElement;
    this.buttons.register('btn-pinch', btnPinch);
    this.buttons.register('btn-dwell', btnDwell);

    // Click feedback
    this.bus.on('click', (e) => {
      if (e.targetId === 'btn-pinch') this.showFeedback('pinch-feedback');
      if (e.targetId === 'btn-dwell') this.showFeedback('dwell-feedback');
    });

    // Dwell → click pipeline
    this.cursor.setDwellCallback((targetId) => this.buttons.fireDwell(targetId));

    // Scene hit-test target: emit targetId on dragStart so scene knows what to grab
    this.bus.on('dragStart', (e) => {
      if (!e.targetId) {
        // Check if cursor is on the 3D cube
        const cubeId = this.scene.hitTest(e.position.x, e.position.y);
        if (cubeId) {
          // Re-emit with targetId set (the scene is already listening; this approach
          // keeps code simple for Phase 0 – scene handles hit-testing internally)
        }
      }
    });

    // Debug panel callbacks
    this.debug.onFilterChange = (minCutoff, beta) => {
      this.tracker.updateFilterConfig({ minCutoff, beta });
    };
    this.debug.onThresholdChange = (pinchOn, pinchOff) => {
      this.tracker.updateSmConfig({ pinchOnRatio: pinchOn, pinchOffRatio: pinchOff });
    };

    // Log all events in debug panel
    this.bus.onAny((e) => this.debug.logEvent(e));

    // Status messages for hand tracking state changes
    this.bus.on('cancel', () => this.showStatus('Hand lost – cursor frozen', 'warning', 2000));
  }

  async init(): Promise<void> {
    await this.tracker.init();

    // Show HUD
    (document.getElementById('hud-panel') as HTMLElement).hidden = false;
    (document.getElementById('camera-preview') as HTMLElement).hidden = false;

    // Start loop
    this.rafId = requestAnimationFrame((t) => this.loop(t));
  }

  private loop(timestamp: number): void {
    const deltaSec = Math.min((timestamp - this.prevFrameTime) / 1000, 0.1);
    this.prevFrameTime = timestamp;

    // ── FPS counting ────────────────────────────────────────────────
    this.frameCount++;
    const elapsed = timestamp - this.fpsMeasureStart;
    if (elapsed >= 1000) {
      this.displayFps = Math.round((this.frameCount * 1000) / elapsed);
      this.frameCount = 0;
      this.fpsMeasureStart = timestamp;
    }

    // ── Inference ───────────────────────────────────────────────────
    let inferenceMs = 0;
    if (timestamp - this.lastInferenceTime >= INFERENCE_INTERVAL_MS) {
      const result = this.tracker.process(this.video, timestamp);
      if (result) {
        inferenceMs = result.inferenceMs;
        this.preview.updateLandmarks(result.landmarks);
        const m = result.metrics;
        this.preview.updateState(m.handState, m.isTracking);

        // Rest reminder
        if (m.isTracking) {
          if (!this.trackingStartTime) this.trackingStartTime = timestamp;
          const dur = timestamp - this.trackingStartTime;
          if (dur > REST_REMINDER_MS && !this.restReminderShown) {
            this.restReminderShown = true;
            this.showStatus('🖐 Rest your hand for a moment!', 'warning', 6000);
          }
        } else {
          this.trackingStartTime = null;
          this.restReminderShown = false;
        }

        // Tracking status messages
        if (m.isTracking && m.palmWidth < 0.05) {
          this.showStatus('Move your hand closer', 'warning', 1200);
        }

        this.debug.update({
          fps: this.displayFps,
          inferenceMs,
          ...m,
        });
      }
      this.lastInferenceTime = timestamp;
    }

    // ── Button hover hit-test ────────────────────────────────────────
    const cursorPos = this.cursor.getDisplayPos();
    const { hoverId, magnetRect } = this.buttons.update(cursorPos.x, cursorPos.y);
    this.mouseAdapter.setHoveredTarget(hoverId ?? undefined);

    // ── Render ──────────────────────────────────────────────────────
    this.scene.render(deltaSec);
    this.cursor.render(timestamp, hoverId, magnetRect);
    this.preview.render();

    this.rafId = requestAnimationFrame((t) => this.loop(t));
  }

  private feedbackTimers = new Map<string, ReturnType<typeof setTimeout>>();

  private showFeedback(id: string): void {
    const el = document.getElementById(id);
    if (!el) return;
    el.hidden = false;
    clearTimeout(this.feedbackTimers.get(id));
    const t = setTimeout(() => { el.hidden = true; }, 1800);
    this.feedbackTimers.set(id, t);
  }

  private statusTimer: ReturnType<typeof setTimeout> | null = null;

  private showStatus(msg: string, type: 'info' | 'warning' | 'error' = 'info', durationMs = 3000): void {
    const el = document.getElementById('status-message');
    if (!el) return;
    el.textContent = msg;
    el.className = `status-message${type !== 'info' ? ` ${type}` : ''}`;
    el.hidden = false;
    if (this.statusTimer) clearTimeout(this.statusTimer);
    this.statusTimer = setTimeout(() => { el.hidden = true; }, durationMs);
  }

  dispose(): void {
    cancelAnimationFrame(this.rafId);
    this.mouseAdapter.dispose();
    this.tracker.dispose();
    this.scene.dispose();
  }
}
