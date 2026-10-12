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
const startBtn     = document.getElementById('start-btn')!           as HTMLButtonElement;
const startError   = document.getElementById('start-error')!         as HTMLElement;
const cameraVideo  = document.getElementById('camera-video')!        as HTMLVideoElement;
const skipToMouseBtn = document.getElementById('skip-to-mouse')      as HTMLButtonElement | null;

skipToMouseBtn?.addEventListener('click', () => {
  permOverlay.hidden = true;
  const app = new App(cameraVideo);
  app.init().catch(console.error);
});

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

  // Dismiss overlay immediately - direct instant access, no static delay
  permOverlay.hidden = true;

  // Initialise the app immediately (loads MediaPipe locally on device)
  const app = new App(cameraVideo);
  try {
    await app.init();
  } catch (initErr) {
    console.error('MediaPipe init failed:', initErr);
    showInitWarning('Hand tracking unavailable – using mouse/touch only.');
  }

  // Wire the stream to the main camera preview video
  cameraVideo.srcObject = stream;
  await cameraVideo.play().catch(() => undefined);
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
