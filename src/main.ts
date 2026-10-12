/**
 * main.ts
 * Entry point.
 * Handles: permission flow → calibration → App init.
 * All camera processing stays on-device; no frames are sent anywhere.
 */

import './style.css';
import { App } from './app';

// ── DOM refs ──────────────────────────────────────────────────────
const permOverlay  = document.getElementById('permission-overlay')!  as HTMLElement;
const calOverlay   = document.getElementById('calibration-overlay')! as HTMLElement;
const startBtn     = document.getElementById('start-btn')!           as HTMLButtonElement;
const startError   = document.getElementById('start-error')!         as HTMLElement;
const calSkipBtn   = document.getElementById('cal-skip')!            as HTMLButtonElement;
const calProgress  = document.getElementById('cal-progress')!        as HTMLElement;
const calStatus    = document.getElementById('cal-status')!          as HTMLElement;
const calInstruction = document.getElementById('cal-instruction')!   as HTMLElement;
const calCanvas    = document.getElementById('cal-canvas')!          as HTMLCanvasElement;
const calVideo     = document.getElementById('cal-video')!           as HTMLVideoElement;
const cameraVideo  = document.getElementById('camera-video')!        as HTMLVideoElement;

// ── Calibration ───────────────────────────────────────────────────

interface CalPhase {
  label: string;
  instruction: string;
  durationMs: number;
}

const CAL_PHASES: CalPhase[] = [
  { label: 'Open palm',    instruction: 'Spread your palm open and hold still', durationMs: 4000 },
  { label: 'Pinch',        instruction: 'Pinch index & thumb together firmly',  durationMs: 3000 },
  { label: 'Release',      instruction: 'Release and open palm again',           durationMs: 2000 },
  { label: 'Test gestures',instruction: 'Try a few pinches to test calibration', durationMs: 4000 },
];
const TOTAL_CAL_MS = CAL_PHASES.reduce((s, p) => s + p.durationMs, 0);

async function runCalibration(stream: MediaStream): Promise<void> {
  // Mirror the calibration video to the cal-video element
  calVideo.srcObject = stream;
  await calVideo.play().catch(() => undefined);

  // Draw a simple skeleton-less preview on the cal canvas while calibrating
  const ctx = calCanvas.getContext('2d');
  let animFrame = 0;
  const drawPreview = () => {
    if (!ctx) return;
    ctx.drawImage(calVideo, 0, 0, calCanvas.width, calCanvas.height);
    animFrame = requestAnimationFrame(drawPreview);
  };
  drawPreview();

  return new Promise<void>((resolve) => {
    const totalMs = TOTAL_CAL_MS;
    const started = Date.now();
    let phaseIdx = 0;
    let phaseStart = started;

    calStatus.textContent = 'Starting calibration…';
    calInstruction.textContent = CAL_PHASES[0]!.instruction;

    const tick = () => {
      const now = Date.now();
      const overall = now - started;
      const overallPct = Math.min(100, (overall / totalMs) * 100);
      calProgress.style.width = `${overallPct}%`;

      // Phase management
      const phase = CAL_PHASES[phaseIdx];
      if (phase && now - phaseStart >= phase.durationMs) {
        phaseIdx++;
        phaseStart = now;
        const next = CAL_PHASES[phaseIdx];
        if (next) {
          calInstruction.textContent = next.instruction;
          calStatus.textContent = `Step ${phaseIdx + 1} / ${CAL_PHASES.length}: ${next.label}`;
        }
      }

      if (overall >= totalMs) {
        cancelAnimationFrame(animFrame);
        calStatus.textContent = 'Calibration complete!';
        setTimeout(resolve, 500);
      } else {
        requestAnimationFrame(tick);
      }
    };
    requestAnimationFrame(tick);

    // Allow skipping
    calSkipBtn.addEventListener('click', () => {
      cancelAnimationFrame(animFrame);
      resolve();
    }, { once: true });
  });
}

// ── Permission flow ───────────────────────────────────────────────

startBtn.addEventListener('click', async () => {
  startBtn.disabled = true;
  startBtn.textContent = 'Requesting camera…';
  startError.hidden = true;

  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
      audio: false,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    startError.textContent = `Camera access denied: ${msg}`;
    startError.hidden = false;
    startBtn.disabled = false;
    startBtn.textContent = 'Allow Camera & Start';
    return;
  }

  // Show calibration screen while MediaPipe loads
  permOverlay.hidden = true;
  calOverlay.hidden = false;

  // Initialise the app (loads MediaPipe in parallel with calibration)
  const app = new App(cameraVideo);
  const [, initErr] = await Promise.allSettled([
    runCalibration(stream),
    app.init(),
  ]).then((results) => [results[0], results[1]] as const);

  if (initErr.status === 'rejected') {
    // MediaPipe failed to load – show error but keep going with mouse-only
    console.error('MediaPipe init failed:', initErr.reason);
    showInitWarning('Hand tracking unavailable – using mouse/touch only.');
  }

  // Wire the stream to the main camera preview video
  cameraVideo.srcObject = stream;
  await cameraVideo.play().catch(() => undefined);

  // Hide calibration overlay → app is live
  calOverlay.hidden = true;
});

function showInitWarning(msg: string): void {
  const el = document.getElementById('status-message');
  if (!el) return;
  el.textContent = msg;
  el.className = 'status-message warning';
  el.hidden = false;
  setTimeout(() => { el.hidden = true; }, 6000);
}

// ── Keyboard shortcuts (global) ───────────────────────────────────
// ` or F2 → toggle debug panel (also handled inside DebugPanel)
