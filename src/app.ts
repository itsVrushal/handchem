/**
 * app.ts
 * Central orchestrator for Molecule Hands Phase 2:
 * Wires the gesture pipeline, mouse fallback, Three.js 3D molecule scene,
 * Verlet physics solver, Chemistry HUD, Energy curve, and hand-operable UI.
 */

import { EventBus } from './input/events';
import { MouseAdapter } from './input/mouseAdapter';
import { HandTracker } from './gesture/handTracker';
import { Scene } from './render/scene';
import { Cursor } from './ui/cursor';
import { ButtonManager } from './ui/buttons';
import { CameraPreview } from './ui/preview';
import { DebugPanel } from './ui/debugPanel';
import { ChemHUD } from './ui/hud';
import { EnergyGraph } from './ui/energyGraph';
import { MoleculeSelector } from './ui/moleculeSelector';
import { MoleculePhysics } from './chem/physics';
import { getDefaultMolecule } from './content/molecules';
import type { MoleculeData, RepresentationMode } from './chem/types';

const INFERENCE_INTERVAL_MS = 1000 / 15; // 15 fps inference throttle
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

  // Phase 2 Chemistry Components
  private physics: MoleculePhysics;
  private hud: ChemHUD;
  private energyGraph: EnergyGraph;
  private moleculeSelector: MoleculeSelector;
  private currentMode: RepresentationMode = 'ballAndStick';

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

  // Active interaction tracking
  private activeGrabbedAtomId: number | null = null;

  constructor(private readonly video: HTMLVideoElement) {
    const mainCanvas = document.getElementById('main-canvas') as HTMLCanvasElement;
    const cursorCanvas = document.getElementById('cursor-canvas') as HTMLCanvasElement;
    const skeletonCanvas = document.getElementById('skeleton-canvas') as HTMLCanvasElement;
    const energyCanvas = document.getElementById('energy-canvas') as HTMLCanvasElement;

    this.scene = new Scene(mainCanvas, this.bus);
    this.cursor = new Cursor(cursorCanvas, this.bus);
    this.buttons = new ButtonManager(this.bus);
    this.preview = new CameraPreview(video, skeletonCanvas);
    this.debug = new DebugPanel();
    this.tracker = new HandTracker(this.bus);
    this.mouseAdapter = new MouseAdapter(this.bus, mainCanvas);

    // Initialize Chemistry Modules with default molecule (Water)
    const initialMol = getDefaultMolecule();
    this.physics = new MoleculePhysics(initialMol);
    this.scene.setMolecule(initialMol, this.currentMode);

    this.hud = new ChemHUD('chem-hud');
    this.hud.setMolecule(initialMol);

    this.energyGraph = new EnergyGraph(energyCanvas);
    const initialRestLen = this.physics.bondRestLengths[0] ?? 0.96;
    this.energyGraph.setRestLength(initialRestLen);

    this.moleculeSelector = new MoleculeSelector(
      'mol-title',
      'mol-prev',
      'mol-next',
      (mol) => this.switchMolecule(mol),
    );

    this.wireUI();
    this.wirePhysics();
  }

  private switchMolecule(mol: MoleculeData): void {
    this.physics = new MoleculePhysics(mol);
    this.scene.setMolecule(mol, this.currentMode);
    this.hud.setMolecule(mol);
    const restLen = this.physics.bondRestLengths[0] ?? 1.0;
    this.energyGraph.setRestLength(restLen);
  }

  private wirePhysics(): void {
    // When scene grabs an atom on camera plane
    this.scene.onAtomGrab = (atomId, targetPos) => {
      this.activeGrabbedAtomId = atomId;
      this.physics.setGrabbedAtom(atomId, targetPos);
      this.scene.highlightAtom(atomId);
    };

    // When scene drags atom
    this.scene.onAtomMove = (targetPos) => {
      this.physics.updateGrabbedPosition(targetPos);
    };

    // When atom is released
    this.scene.onAtomRelease = () => {
      this.activeGrabbedAtomId = null;
      this.physics.releaseGrab();
      this.scene.highlightAtom(null);
    };
  }

  private wireUI(): void {
    // Register header and action buttons
    const repToggle = document.getElementById('btn-rep-toggle') as HTMLButtonElement;
    const resetBtn = document.getElementById('btn-reset-structure') as HTMLButtonElement;
    const debugToggle = document.getElementById('toggle-debug') as HTMLButtonElement;
    const molPrev = document.getElementById('mol-prev') as HTMLButtonElement;
    const molNext = document.getElementById('mol-next') as HTMLButtonElement;

    if (repToggle) this.buttons.register('btn-rep-toggle', repToggle);
    if (resetBtn) this.buttons.register('btn-reset-structure', resetBtn);
    if (debugToggle) this.buttons.register('toggle-debug', debugToggle);
    if (molPrev) this.buttons.register('mol-prev', molPrev);
    if (molNext) this.buttons.register('mol-next', molNext);

    // Representation Toggle Click
    repToggle?.addEventListener('click', () => {
      this.currentMode = this.currentMode === 'ballAndStick' ? 'spaceFilling' : 'ballAndStick';
      this.scene.setRepresentation(this.currentMode);
      const label = document.getElementById('rep-label');
      if (label) {
        label.textContent = this.currentMode === 'ballAndStick' ? 'Ball & Stick' : 'Space-Filling';
      }
    });

    // Reset Structure Click
    resetBtn?.addEventListener('click', () => {
      this.physics.resetToRest();
      this.scene.updateMoleculePositions(this.physics.positions);
      this.energyGraph.setCurrentLength(this.physics.bondRestLengths[0] ?? 1.0);
      this.hud.updateBondReadout(null);
      this.hud.updateAngleReadout(null);
    });

    // Debug Panel Toggle
    debugToggle?.addEventListener('click', () => {
      this.debug.toggle();
    });

    // Dwell → click pipeline
    this.cursor.setDwellCallback((targetId) => this.buttons.fireDwell(targetId));

    // Scene hit-testing: if cursor hovers or starts drag on an atom
    this.bus.on('hover', (e) => {
      if (!e.targetId) {
        const hit = this.scene.hitTest(e.position.x, e.position.y);
        if (hit && hit.startsWith('atom-')) {
          const atomId = parseInt(hit.replace('atom-', ''), 10);
          this.scene.highlightAtom(atomId);
        } else if (this.activeGrabbedAtomId === null) {
          this.scene.highlightAtom(null);
        }
      }
    });

    // Debug panel tuning callbacks
    this.debug.onFilterChange = (minCutoff, beta) => {
      this.tracker.updateFilterConfig({ minCutoff, beta });
    };
    this.debug.onThresholdChange = (pinchOn, pinchOff) => {
      this.tracker.updateSmConfig({ pinchOnRatio: pinchOn, pinchOffRatio: pinchOff });
    };

    // Log all events in debug panel
    this.bus.onAny((e) => this.debug.logEvent(e));

    // Status message for tracking loss
    this.bus.on('cancel', () => this.showStatus('Hand lost – cursor frozen', 'warning', 2000));
  }

  async init(): Promise<void> {
    try {
      await this.tracker.init();
      const previewEl = document.getElementById('camera-preview');
      if (previewEl) previewEl.hidden = false;
    } catch (err) {
      console.info('HandTracker init skipped or failed; using mouse fallback:', err);
    }

    // Start requestAnimationFrame loop
    this.rafId = requestAnimationFrame((t) => this.loop(t));
  }

  private loop(timestamp: number): void {
    const deltaSec = Math.min((timestamp - this.prevFrameTime) / 1000, 0.05);
    this.prevFrameTime = timestamp;

    // ── FPS counting ────────────────────────────────────────────────
    this.frameCount++;
    const elapsed = timestamp - this.fpsMeasureStart;
    if (elapsed >= 1000) {
      this.displayFps = Math.round((this.frameCount * 1000) / elapsed);
      this.frameCount = 0;
      this.fpsMeasureStart = timestamp;
    }

    // ── Inference throttle (~15 fps) ────────────────────────────────
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

        this.debug.update({
          fps: this.displayFps,
          inferenceMs,
          ...m,
        });
      }
      this.lastInferenceTime = timestamp;
    }

    // ── Physics Step ────────────────────────────────────────────────
    this.physics.step(deltaSec);
    this.scene.updateMoleculePositions(this.physics.positions);

    // ── Live Measurements & Energy Graph ────────────────────────────
    this.updateLiveMeasurements();

    // ── Button hover hit-test & magnetic ease ───────────────────────
    const cursorPos = this.cursor.getDisplayPos();
    const { hoverId, magnetRect } = this.buttons.update(cursorPos.x, cursorPos.y);
    this.mouseAdapter.setHoveredTarget(hoverId ?? undefined);

    // If not hovering over a UI button, check for magnetic pull toward nearest atom
    let atomMagnetRect: DOMRect | null = magnetRect;
    if (!hoverId) {
      const hit = this.scene.hitTest(cursorPos.x, cursorPos.y);
      if (hit && hit.startsWith('atom-')) {
        const atomId = parseInt(hit.replace('atom-', ''), 10);
        const screenPos = this.scene.getAtomScreenCoords(atomId);
        if (screenPos) {
          const pxX = screenPos.x * window.innerWidth;
          const pxY = screenPos.y * window.innerHeight;
          atomMagnetRect = DOMRect.fromRect({ x: pxX - 16, y: pxY - 16, width: 32, height: 32 });
        }
      }
    }

    // ── Render ──────────────────────────────────────────────────────
    this.scene.render(deltaSec);
    this.cursor.render(timestamp, hoverId, atomMagnetRect);
    this.preview.render();

    this.rafId = requestAnimationFrame((t) => this.loop(t));
  }

  private updateLiveMeasurements(): void {
    const mol = this.physics.molecule;
    if (mol.bonds.length === 0) return;

    // If an atom is grabbed, find the connected bond and angle
    let activeBond = mol.bonds[0]!;
    if (this.activeGrabbedAtomId !== null) {
      const connected = mol.bonds.find(
        (b) => b.a === this.activeGrabbedAtomId || b.b === this.activeGrabbedAtomId,
      );
      if (connected) activeBond = connected;
    }

    const curBondLen = this.physics.getBondLength(activeBond.a, activeBond.b);
    const restBondLen = activeBond.targetLength ?? 1.0;

    this.hud.updateBondReadout({ current: curBondLen, rest: restBondLen });
    this.energyGraph.setCurrentLength(curBondLen);

    // Check angle constraint
    if (mol.angleConstraints && mol.angleConstraints.length > 0) {
      let activeAngle = mol.angleConstraints[0]!;
      if (this.activeGrabbedAtomId !== null) {
        const connAngle = mol.angleConstraints.find(
          (c) =>
            c.atomA === this.activeGrabbedAtomId ||
            c.centerAtom === this.activeGrabbedAtomId ||
            c.atomB === this.activeGrabbedAtomId,
        );
        if (connAngle) activeAngle = connAngle;
      }
      const curAngle = this.physics.getAngleDeg(
        activeAngle.atomA,
        activeAngle.centerAtom,
        activeAngle.atomB,
      );
      this.hud.updateAngleReadout({ current: curAngle, target: activeAngle.targetAngleDeg });
    } else {
      this.hud.updateAngleReadout(null);
    }
  }

  private statusTimer: ReturnType<typeof setTimeout> | null = null;

  private showStatus(msg: string, type: 'info' | 'warning' | 'error' = 'info', durationMs = 3000): void {
    const el = document.getElementById('status-message');
    if (!el) return;
    el.textContent = msg;
    el.className = `status-message${type !== 'info' ? ` ${type}` : ''}`;
    el.hidden = false;
    if (this.statusTimer) clearTimeout(this.statusTimer);
    this.statusTimer = setTimeout(() => {
      el.hidden = true;
    }, durationMs);
  }

  dispose(): void {
    cancelAnimationFrame(this.rafId);
    this.mouseAdapter.dispose();
    this.tracker.dispose();
    this.scene.dispose();
  }
}
