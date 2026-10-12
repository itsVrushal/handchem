# 🧬 Molecule Hands

> **Interactive 3D Chemistry for NCERT Classes 9–12**  
> Explore atoms, molecules, and chemical bonds in 3D using **only your webcam-tracked hand** as a virtual mouse. No AR headsets, no accounts, and no video frames ever leave your device. A silent mouse/touch fallback is always available.

---

## 🚀 Quick Start

### Prerequisites
- [Node.js](https://nodejs.org/) v18+ and `npm`

### Installation & Development
```bash
# Install pinned dependencies
npm install

# Start the Vite local development server
npm run dev
```
Open **`http://localhost:5173/`** in your browser (Chrome or Edge recommended for optimal WebGL & MediaPipe GPU acceleration).

---

## 🧪 Testing & Code Quality

```bash
# Run unit tests (Vitest)
npm test

# Check code styles and formatting
npm run lint

# Production build & TypeScript verification
npm run build
```

---

## ✋ How to Use Gestures

All hand tracking is computed locally in real time using `@mediapipe/tasks-vision`.

| Gesture | Action | How It Works |
|---|---|---|
| **Move Cursor** | Point & Hover | Keep palm facing camera. The **index fingertip** controls the glowing virtual cursor. |
| **Pinch Click** | Click buttons | Rapidly pinch your **thumb and index fingertip** together and release within 350 ms. |
| **Dwell Click** | Hands-free click | Hover the cursor over any interactive button for **800 ms**; the radial indicator ring will fill and trigger a click. |
| **Pinch & Drag** | Move 3D Objects | Pinch thumb and index together and move your hand; translates the 3D cube on the camera plane. |
| **Orbit Scene** | Rotate 3D View | Drag in empty canvas space to orbit the camera. |
| **Clutching** | Re-center cursor | Move hand out of camera frame, reposition, and re-enter. Cursor resumes smoothly from its last position. |

### Quiet Mouse Fallback
If you don't have a webcam or choose to skip camera access, click **"or try with mouse / touch fallback"** on the startup screen. Every feature, button, dwell ring, and 3D interaction functions identically with a regular mouse or touchpad.

---

## 🛠️ Debug Panel

Press the **`D`** key or click the **🛠️ Debug** button in the top navigation bar to toggle the real-time telemetry panel:
- **Render FPS** & **Inference latency** (ms)
- **State Machine**: Live state (`idle`, `hovering`, `pinching`, `dragging`)
- **Pinch Ratio** & hysteresis bars
- **1€ Filter tuning**: Live sliders for `minCutoff` and `beta`
- **Recent Event Log**: Live stream of input bus events (`move`, `hover`, `click`, `dragStart`, `drag`, `dragEnd`)

---

## 🔒 Privacy & Architecture
- **Zero Network Transmission**: Webcam frames are processed strictly in-memory by MediaPipe WebAssembly / WebGL on your device. Frames are never stored, logged, or uploaded.
- **Unified Event Pipeline**: Landmark coords → 1€ Filter → Active Zone Mapping → Hand State Machine → Input EventBus. Rendering and inference are decoupled.
