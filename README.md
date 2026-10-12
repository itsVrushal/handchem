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
# Run unit tests (Vitest: physics invariants, energy, gesture filters, state machine)
npm test

# Check code styles and formatting (ESLint)
npm run lint

# Production build & TypeScript verification
npm run build
```

---

## ⚛️ Phase 2: Molecular Chemistry Features

### 12 Curated NCERT Molecules
Explore 12 fundamental molecules from Classes 9 through 12, each built with accurate VSEPR 3D coordinates:
1. **$H_2$** (Hydrogen Gas) — Single covalent sigma bond (0.74 Å).
2. **$O_2$** (Oxygen Gas) — Diatomic double bond (1.21 Å).
3. **$N_2$** (Nitrogen Gas) — Inert triple bond (1.10 Å).
4. **$H_2O$** (Water) — Bent VSEPR geometry at **104.5°**.
5. **$CO_2$** (Carbon Dioxide) — Linear double bonds at **180.0°**.
6. **$NH_3$** (Ammonia) — Trigonal pyramidal with lone-pair repulsion at **107.8°**.
7. **$CH_4$** (Methane) — Perfect $sp^3$ tetrahedral geometry at **109.5°**.
8. **$HCl$** (Hydrogen Chloride) — Polar covalent acid.
9. **$NaCl$** (Sodium Chloride) — Electrostatic ionic lattice pair.
10. **$C_2H_4$** (Ethene) — Planar $sp^2$ alkene with $C=C$ double bond at **117.4° / 121.3°**.
11. **$C_2H_2$** (Ethyne) — Linear $sp$ alkyne with $C\equiv C$ triple bond at **180.0°**.
12. **$C_2H_5OH$** (Ethanol) — Organic alcohol with tetrahedral carbons and bent $-OH$.

### Molecular Mechanics & Verlet Physics
- **Bond Length Springs**: Realistic spring forces restore bond lengths towards their equilibrium rest lengths upon release.
- **VSEPR Angle Constraints**: Harmonic angular restoration keeps molecules in their correct chemical shapes (e.g. water springs back to 104.5°).
- **Soft Sphere Repulsion**: Atoms cannot interpenetrate or overlap.
- **Camera-Parallel Atom Grabbing**: Pinch and drag any atom in 3D space to stretch and flex bonds. Non-grabbed atoms react under strain and smoothly spring back to equilibrium when released.

### Representations Toggle
- **Ball-and-Stick**: Emphasizes bond connectivity and angles ($0.45 \times r_{cov}$). Double and triple bonds are rendered as parallel cylinders.
- **Space-Filling (CPK/vdW)**: True van der Waals space-filling radii ($0.85 \times r_{vdw}$) illustrating real molecular volume.

### Heads-Up Display (HUD) & Energy Well
- **Real-Time Chemical Readout**: Chemical formula, molecular geometry, molar mass ($g/mol$), live bond length (Å), and measured bond angle (°).
- **Live Potential Energy Well $V(r)$**: Visualizes harmonic bond strain energy ($V = \frac{1}{2} k (r - r_0)^2$). An animated glowing dot tracks your physical hand displacement on the potential curve in real time.

---

## ✋ How to Use Gestures

All hand tracking is computed locally in real time using `@mediapipe/tasks-vision`.

| Gesture | Action | How It Works |
|---|---|---|
| **Move Cursor** | Point & Hover | Keep palm facing camera. The **index fingertip** controls the glowing virtual cursor. |
| **Magnetic Pull** | Snap to Atoms | When moving near an atom or button, the cursor smoothly eases into the target for effortless selection. |
| **Pinch Click** | Click buttons | Rapidly pinch **thumb and index fingertip** together and release within 350 ms. |
| **Dwell Click** | Hands-free click | Hover the cursor over any interactive button for **800 ms**; the radial indicator ring will fill and trigger a click. |
| **Pinch & Drag Atom** | Stretch Chemical Bonds | Pinch directly on an atom and drag; moves the atom along a camera-parallel plane to observe mechanical strain. |
| **Orbit Scene** | Rotate 3D View | Drag in empty canvas space to orbit around the molecule. |
| **Two-Hand Zoom & Roll** | Dolly / Roll Camera | Pinch with both hands simultaneously: changing distance between hands zooms in/out; changing angle rolls the view. |
| **Clutching** | Re-center cursor | Move hand out of camera frame, reposition comfortably, and re-enter. Cursor resumes smoothly from its last position. |

### Quiet Mouse Fallback
If you don't have a webcam or choose to skip camera access, click **"or try with mouse / touch fallback"** on the startup screen. Every feature, button, dwell ring, atom grabbing, and 3D interaction functions identically with a regular mouse or touchpad.

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
- **Decoupled Pipeline**: Landmark coords → 1€ Filter → Active Zone Mapping → Hand State Machine → Input EventBus. Rendering runs at 60+ FPS while inference is throttled at ~15 FPS.
