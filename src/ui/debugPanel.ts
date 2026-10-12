/**
 * debugPanel.ts
 * Live debug panel: fps, inference ms, filter/threshold sliders, pinch
 * ratio bar, hand state, and a scrolling event log.
 * Toggled via ?debug=1 URL param or the keyboard shortcut ` (backtick).
 */

import type { HandMetrics } from '../gesture/handTracker';
import type { InputEvent } from '../input/events';

const MAX_LOG_ENTRIES = 60;

export interface DebugUpdatePayload extends HandMetrics {
  fps: number;
  inferenceMs: number;
}

export class DebugPanel {
  private readonly panel: HTMLElement;
  private visible: boolean;

  // Cached DOM refs
  private elFps: HTMLElement;
  private elInf: HTMLElement;
  private elState: HTMLElement;
  private elConf: HTMLElement;
  private elPinchBar: HTMLElement;
  private elPinchVal: HTMLElement;
  private elFistBar: HTMLElement;
  private elFistVal: HTMLElement;
  private elLog: HTMLElement;
  private elMinCutoff: HTMLInputElement;
  private elBeta: HTMLInputElement;
  private elPinchOn: HTMLInputElement;
  private elPinchOff: HTMLInputElement;

  // Callbacks wired by app.ts
  onFilterChange?: (minCutoff: number, beta: number) => void;
  onThresholdChange?: (pinchOn: number, pinchOff: number) => void;

  private logEntries: string[] = [];

  constructor() {
    const panel = document.getElementById('debug-panel');
    if (!panel) throw new Error('#debug-panel not found');
    this.panel = panel;

    // Check URL flag
    this.visible = new URLSearchParams(window.location.search).get('debug') === '1';
    this.panel.hidden = !this.visible;

    // Cache DOM refs
    this.elFps      = this.q('#dbg-fps');
    this.elInf      = this.q('#dbg-inference');
    this.elState    = this.q('#dbg-state');
    this.elConf     = this.q('#dbg-conf');
    this.elPinchBar = this.q('#dbg-pinch-bar');
    this.elPinchVal = this.q('#dbg-pinch-val');
    this.elFistBar  = this.q('#dbg-fist-bar');
    this.elFistVal  = this.q('#dbg-fist-val');
    this.elLog      = this.q('#event-log');
    this.elMinCutoff = this.qi('#dbg-minCutoff');
    this.elBeta      = this.qi('#dbg-beta');
    this.elPinchOn   = this.qi('#dbg-pinchOn');
    this.elPinchOff  = this.qi('#dbg-pinchOff');

    // Slider handlers
    const syncLabel = (slider: HTMLInputElement, labelId: string) => {
      const lbl = document.getElementById(labelId);
      if (lbl) lbl.textContent = (+slider.value).toFixed(3);
    };

    this.elMinCutoff.addEventListener('input', () => {
      syncLabel(this.elMinCutoff, 'minCutoff-val');
      this.onFilterChange?.(+this.elMinCutoff.value, +this.elBeta.value);
    });
    this.elBeta.addEventListener('input', () => {
      syncLabel(this.elBeta, 'beta-val');
      this.onFilterChange?.(+this.elMinCutoff.value, +this.elBeta.value);
    });
    this.elPinchOn.addEventListener('input', () => {
      syncLabel(this.elPinchOn, 'pinchOn-val');
      this.onThresholdChange?.(+this.elPinchOn.value, +this.elPinchOff.value);
    });
    this.elPinchOff.addEventListener('input', () => {
      syncLabel(this.elPinchOff, 'dbg-pinchOff');
      this.onThresholdChange?.(+this.elPinchOn.value, +this.elPinchOff.value);
    });

    // Close button
    const closeBtn = document.getElementById('debug-close');
    closeBtn?.addEventListener('click', () => this.toggle());

    // Keyboard shortcut
    window.addEventListener('keydown', (e) => {
      if (e.key === '`' || e.key === 'F2') this.toggle();
    });
  }

  toggle(): void {
    this.visible = !this.visible;
    this.panel.hidden = !this.visible;
  }

  update(payload: DebugUpdatePayload): void {
    if (!this.visible) return;

    this.elFps.textContent   = `${payload.fps} fps`;
    this.elInf.textContent   = `${payload.inferenceMs.toFixed(1)} ms`;
    this.elState.textContent = payload.handState;
    this.elConf.textContent  = payload.confidence.toFixed(2);

    const pct = Math.min(100, payload.pinchRatio * 100);
    this.elPinchBar.style.setProperty('--fill', `${pct.toFixed(1)}%`);
    this.elPinchVal.textContent = payload.pinchRatio.toFixed(2);

    const fistPct = Math.min(100, payload.fistRatio * 100);
    this.elFistBar.style.setProperty('--fill', `${fistPct.toFixed(1)}%`);
    this.elFistVal.textContent = payload.fistRatio.toFixed(2);
  }

  logEvent(event: InputEvent): void {
    if (!this.visible) return;
    const cls = `ev-${event.type.toLowerCase()}`;
    const entry = `[${event.source[0]}] ${event.type.padEnd(9)} (${event.position.x.toFixed(2)},${event.position.y.toFixed(2)})`;
    this.logEntries.unshift(`<div class="${cls}">${entry}</div>`);
    if (this.logEntries.length > MAX_LOG_ENTRIES) this.logEntries.pop();
    this.elLog.innerHTML = this.logEntries.join('');
  }

  private q(sel: string): HTMLElement {
    const el = document.querySelector<HTMLElement>(sel);
    if (!el) throw new Error(`debug panel: ${sel} not found`);
    return el;
  }

  private qi(sel: string): HTMLInputElement {
    const el = document.querySelector<HTMLInputElement>(sel);
    if (!el) throw new Error(`debug panel: ${sel} not found`);
    return el;
  }
}
