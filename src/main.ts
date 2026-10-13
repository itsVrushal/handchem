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

let appInstance: App | null = null;

skipToMouseBtn?.addEventListener('click', () => {
  permOverlay.hidden = true;
  if (!appInstance) {
    appInstance = new App(cameraVideo);
    appInstance.init().catch(console.error);
  }
});

// ── Permission & Start flow ───────────────────────────────────────

startBtn.addEventListener('click', async () => {
  if (appInstance) {
    // If app already running, just dismiss the guide overlay
    permOverlay.hidden = true;
    return;
  }

  startBtn.disabled = true;
  startBtn.textContent = 'CONNECTING OPTICAL SENSOR…';
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
    startBtn.textContent = 'INITIALIZE HOLOGRAPHIC CAMERA & START';
    return;
  }

  // Dismiss overlay immediately – direct instant access to holographic 3D scene
  permOverlay.hidden = true;

  // Initialise the app immediately (loads MediaPipe locally on device)
  appInstance = new App(cameraVideo);
  try {
    await appInstance.init();
  } catch (initErr) {
    console.error('MediaPipe init failed:', initErr);
    showInitWarning('Hand tracking unavailable – using desktop mouse controls.');
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
