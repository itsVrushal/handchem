/**
 * scene.ts
 * Three.js scene for Molecule Hands Phase 2:
 * - Renders 3D molecules with Ball-and-Stick / Space-Filling representations
 * - Real-time atom raycasting & magnetic target projection
 * - Camera-parallel plane raycasting for dragging grabbed atoms
 * - Trackball camera orbit on empty space & two-hand pinch zoom
 */

import * as THREE from 'three';
import { EventBus } from '../input/events';
import type { MoleculeData, RepresentationMode } from '../chem/types';
import { MoleculeMesh } from './moleculeMesh';

export class Scene {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene: THREE.Scene;
  public readonly camera: THREE.PerspectiveCamera;
  private readonly raycaster = new THREE.Raycaster();

  // Active 3D molecule representation
  private moleculeMesh: MoleculeMesh | null = null;
  private currentMode: RepresentationMode = 'ballAndStick';

  // Orbit state (spherical coordinates)
  private readonly spherical = new THREE.Spherical(6.5, Math.PI / 2.8, 0.4);

  // Drag interaction state
  private mode: 'none' | 'orbit' | 'atomDrag' = 'none';
  private grabbedAtomId: number | null = null;
  private readonly dragPlane = new THREE.Plane();
  private readonly planeHit = new THREE.Vector3();

  // Callback to update physics when an atom is dragged
  public onAtomGrab?: (atomId: number, targetPos: [number, number, number]) => void;
  public onAtomMove?: (targetPos: [number, number, number]) => void;
  public onAtomRelease?: () => void;

  // Holographic Synthesis Dome elements
  private readonly domeGroup = new THREE.Group();
  private domeWireframeMesh!: THREE.Mesh;
  private floorRingsGroup!: THREE.Group;
  private particlesGroup!: THREE.Points;
  private envMapTexture: THREE.Texture | null = null;

  constructor(canvas: HTMLCanvasElement, bus: EventBus) {
    // ── Renderer ──────────────────────────────────────────────────
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight, false);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.25;

    // ── Scene (Tony Stark Holographic Synthesis Dome) ─────────────
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x020510);
    this.scene.fog = new THREE.Fog(0x020510, 18, 52);

    // ── Camera ────────────────────────────────────────────────────
    this.camera = new THREE.PerspectiveCamera(
      50,
      window.innerWidth / window.innerHeight,
      0.1,
      100,
    );
    this.updateCameraFromSpherical();

    // ── Procedural PMREM Studio HDR Environment Map ───────────────
    try {
      this.envMapTexture = this.createStudioHDREnvironment();
      this.scene.environment = this.envMapTexture;
    } catch (e) {
      console.warn('Failed to generate HDR PMREM environment:', e);
    }

    // ── Studio Rig Lights (360° balanced illumination, zero dark angles) ──
    // Hemisphere light gives sky (cyan) and ground (deep navy fill) radiance
    const hemiLight = new THREE.HemisphereLight(0x70f5ff, 0x071e3d, 1.4);
    this.scene.add(hemiLight);

    // Primary directional key light (top-right-front)
    const mainLight = new THREE.DirectionalLight(0xffffff, 1.8);
    mainLight.position.set(6, 10, 8);
    mainLight.castShadow = true;
    mainLight.shadow.mapSize.setScalar(1024);
    this.scene.add(mainLight);

    // Opposite fill directional light (bottom-left-back)
    const fillLight = new THREE.DirectionalLight(0x00d2ff, 1.3);
    fillLight.position.set(-6, -4, -6);
    this.scene.add(fillLight);

    // Bottom-up bounce directional light (guarantees underside of atoms is well lit)
    const bottomLight = new THREE.DirectionalLight(0x38bdf8, 1.0);
    bottomLight.position.set(0, -8, 2);
    this.scene.add(bottomLight);

    // Arc-reactor point light (central holographic radiance)
    const arcReactorLight = new THREE.PointLight(0x00f0ff, 2.0, 32);
    arcReactorLight.position.set(0, 3.5, 2.5);
    this.scene.add(arcReactorLight);

    // ── Build Holographic Synthesis Dome Viewport ─────────────────
    this.buildHolographicDome();

    // ── Event wiring ──────────────────────────────────────────────
    this.wireEvents(bus);

    window.addEventListener('resize', this.onResize);
  }

  /**
   * Generates a procedural HDR equirectangular studio map using HTML5 Canvas & PMREMGenerator.
   * Gives atoms realistic specular glints, rim highlights, and ambient light from every viewing angle.
   */
  private createStudioHDREnvironment(): THREE.Texture {
    const width = 1024;
    const height = 512;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2D context unavailable for HDR generation');

    // Midnight navy studio background gradient
    const bgGrad = ctx.createLinearGradient(0, 0, 0, height);
    bgGrad.addColorStop(0, '#040d1a');      // Zenith (deep navy)
    bgGrad.addColorStop(0.48, '#091c33');   // Upper horizon
    bgGrad.addColorStop(0.52, '#0f2f54');   // Horizon light band
    bgGrad.addColorStop(0.75, '#051426');   // Lower ground
    bgGrad.addColorStop(1, '#020610');      // Nadir
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, width, height);

    // Helper for rendering high-radiance studio softboxes on equirectangular projection
    const drawSoftbox = (
      cx: number, cy: number, rx: number, ry: number,
      colorCenter: string, colorMid: string, colorEdge: string,
    ) => {
      ctx.save();
      ctx.translate(cx, cy);
      ctx.scale(1, ry / rx);
      const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
      grad.addColorStop(0, colorCenter);
      grad.addColorStop(0.4, colorMid);
      grad.addColorStop(1, colorEdge);
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(0, 0, rx, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    };

    // 1. High-intensity Key Softbox (Top-Front: pure brilliant white with electric cyan corona)
    drawSoftbox(width * 0.35, height * 0.22, 170, 95,
      'rgba(255, 255, 255, 1.0)', 'rgba(220, 248, 255, 0.8)', 'rgba(0, 240, 255, 0)');

    // 2. Electric Cyan Fill Softbox (Left-Middle)
    drawSoftbox(width * 0.82, height * 0.35, 190, 110,
      'rgba(140, 245, 255, 0.9)', 'rgba(0, 180, 255, 0.5)', 'rgba(0, 100, 255, 0)');

    // 3. Warm Stark Arc Rim Softbox (Right-Back rim light for metallic & specular glints)
    drawSoftbox(width * 0.12, height * 0.40, 150, 85,
      'rgba(255, 235, 190, 0.85)', 'rgba(255, 180, 80, 0.45)', 'rgba(255, 120, 0, 0)');

    // 4. Underside Bounce Softbox (Nadir/Lower angles so underside of molecules is never dark)
    drawSoftbox(width * 0.50, height * 0.80, 230, 110,
      'rgba(0, 180, 255, 0.7)', 'rgba(0, 100, 210, 0.35)', 'rgba(0, 40, 90, 0)');

    // 5. Horizon Tech Glow Line
    const horizonGrad = ctx.createLinearGradient(0, height * 0.48, 0, height * 0.52);
    horizonGrad.addColorStop(0, 'rgba(0, 240, 255, 0)');
    horizonGrad.addColorStop(0.5, 'rgba(0, 240, 255, 0.35)');
    horizonGrad.addColorStop(1, 'rgba(0, 240, 255, 0)');
    ctx.fillStyle = horizonGrad;
    ctx.fillRect(0, height * 0.48, width, height * 0.04);

    // Convert canvas into PMREM texture
    const texture = new THREE.CanvasTexture(canvas);
    texture.mapping = THREE.EquirectangularReflectionMapping;
    texture.colorSpace = THREE.SRGBColorSpace;
    const pmremGenerator = new THREE.PMREMGenerator(this.renderer);
    pmremGenerator.compileEquirectangularShader();
    const renderTarget = pmremGenerator.fromEquirectangular(texture);
    const envMap = renderTarget.texture;

    texture.dispose();
    pmremGenerator.dispose();
    return envMap;
  }

  /**
   * Constructs the Tony Stark Holographic Synthesis Dome environment:
   * 1. Geodesic overhead wireframe hemisphere dome
   * 2. Concentric holographic floor target rings with cardinal markers
   * 3. Ambient drifting elemental data particles
   */
  private buildHolographicDome(): void {
    // 1. Geodesic overhead wireframe hemisphere dome
    const domeGeom = new THREE.SphereGeometry(18, 36, 18, 0, Math.PI * 2, 0, Math.PI * 0.5);
    const domeMat = new THREE.MeshBasicMaterial({
      color: 0x00f0ff,
      wireframe: true,
      transparent: true,
      opacity: 0.12,
    });
    this.domeWireframeMesh = new THREE.Mesh(domeGeom, domeMat);
    this.domeWireframeMesh.position.y = -3.2; // Starts from floor grid and arches overhead
    this.domeGroup.add(this.domeWireframeMesh);

    // Equator base collar ring
    const collarGeom = new THREE.RingGeometry(17.8, 18.0, 64);
    const collarMat = new THREE.MeshBasicMaterial({
      color: 0x00f0ff,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.35,
    });
    const collarMesh = new THREE.Mesh(collarGeom, collarMat);
    collarMesh.rotation.x = Math.PI / 2;
    collarMesh.position.y = -3.19;
    this.domeGroup.add(collarMesh);

    // 2. Concentric Holographic Floor Target Rings
    this.floorRingsGroup = new THREE.Group();
    this.floorRingsGroup.position.y = -3.18;

    // Outer target boundary ring (radius 11.5)
    const outerRingGeom = new THREE.RingGeometry(11.4, 11.55, 64);
    const outerRingMat = new THREE.MeshBasicMaterial({
      color: 0x0077ff,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.35,
    });
    const outerRing = new THREE.Mesh(outerRingGeom, outerRingMat);
    outerRing.rotation.x = Math.PI / 2;
    this.floorRingsGroup.add(outerRing);

    // Mid calibration ring (radius 6.8)
    const midRingGeom = new THREE.RingGeometry(6.75, 6.85, 48);
    const midRingMat = new THREE.MeshBasicMaterial({
      color: 0x00f0ff,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.50,
    });
    const midRing = new THREE.Mesh(midRingGeom, midRingMat);
    midRing.rotation.x = Math.PI / 2;
    this.floorRingsGroup.add(midRing);

    // Cardinal tick markers along X and Z axes (0°, 90°, 180°, 270°)
    const tickMat = new THREE.LineBasicMaterial({ color: 0x00f0ff, transparent: true, opacity: 0.65 });
    const ticks: [number, number, number, number, number, number][] = [
      [6.4, 0, 0, 7.2, 0, 0],       // +X (90°)
      [-6.4, 0, 0, -7.2, 0, 0],     // -X (270°)
      [0, 0, 6.4, 0, 0, 7.2],       // +Z (0°)
      [0, 0, -6.4, 0, 0, -7.2],     // -Z (180°)
    ];
    for (const [x1, y1, z1, x2, y2, z2] of ticks) {
      const lineGeom = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(x1, y1, z1),
        new THREE.Vector3(x2, y2, z2),
      ]);
      const tickLine = new THREE.Line(lineGeom, tickMat);
      this.floorRingsGroup.add(tickLine);
    }

    // Inner target focus ring (radius 3.2)
    const innerRingGeom = new THREE.RingGeometry(3.15, 3.25, 36);
    const innerRingMat = new THREE.MeshBasicMaterial({
      color: 0x70f5ff,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.65,
    });
    const innerRing = new THREE.Mesh(innerRingGeom, innerRingMat);
    innerRing.rotation.x = Math.PI / 2;
    this.floorRingsGroup.add(innerRing);

    // Center laser core emitter glow disk (radius 1.1)
    const coreDiskGeom = new THREE.CircleGeometry(1.1, 32);
    const coreDiskMat = new THREE.MeshBasicMaterial({
      color: 0x00f0ff,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.16,
      blending: THREE.AdditiveBlending,
    });
    const coreDisk = new THREE.Mesh(coreDiskGeom, coreDiskMat);
    coreDisk.rotation.x = Math.PI / 2;
    this.floorRingsGroup.add(coreDisk);

    this.domeGroup.add(this.floorRingsGroup);

    // 3. Ambient Floating Holographic Data Particles
    const particleCount = 130;
    const particlePositions = new Float32Array(particleCount * 3);
    for (let i = 0; i < particleCount; i++) {
      const angle = Math.random() * Math.PI * 2;
      const dist = 1.5 + Math.random() * 8.5;
      particlePositions[i * 3 + 0] = Math.cos(angle) * dist;
      particlePositions[i * 3 + 1] = -2.8 + Math.random() * 8.0;
      particlePositions[i * 3 + 2] = Math.sin(angle) * dist;
    }
    const particleGeom = new THREE.BufferGeometry();
    particleGeom.setAttribute('position', new THREE.BufferAttribute(particlePositions, 3));
    const particleMat = new THREE.PointsMaterial({
      color: 0x70f5ff,
      size: 0.09,
      transparent: true,
      opacity: 0.60,
      blending: THREE.AdditiveBlending,
    });
    this.particlesGroup = new THREE.Points(particleGeom, particleMat);
    this.domeGroup.add(this.particlesGroup);

    // Floor base grid
    const grid = new THREE.GridHelper(30, 30, 0x00f0ff, 0x06203d);
    grid.position.y = -3.2;
    this.domeGroup.add(grid);

    this.scene.add(this.domeGroup);
  }

  public setMolecule(molecule: MoleculeData, mode: RepresentationMode = this.currentMode): void {
    if (this.moleculeMesh) {
      this.scene.remove(this.moleculeMesh.group);
      this.moleculeMesh.dispose();
      this.moleculeMesh = null;
    }

    this.currentMode = mode;
    this.moleculeMesh = new MoleculeMesh(molecule, mode);
    this.scene.add(this.moleculeMesh.group);

    // Auto-frame camera based on molecule extent
    let maxDist = 1.5;
    for (const a of molecule.atoms) {
      const d = Math.sqrt(a.position[0] ** 2 + a.position[1] ** 2 + a.position[2] ** 2);
      if (d > maxDist) maxDist = d;
    }
    this.spherical.radius = Math.max(4.5, Math.min(12.0, maxDist * 3.2));
    this.updateCameraFromSpherical();
  }

  public updateMoleculePositions(positions: [number, number, number][]): void {
    if (this.moleculeMesh) {
      this.moleculeMesh.updatePositions(positions);
    }
  }

  public setRepresentation(mode: RepresentationMode): void {
    this.currentMode = mode;
    if (this.moleculeMesh) {
      this.moleculeMesh.setRepresentation(mode);
    }
  }

  public highlightAtom(atomId: number | null): void {
    if (this.moleculeMesh) {
      this.moleculeMesh.highlightAtom(atomId);
    }
  }

  public setOvervalentAtoms(ids: number[]): void {
    if (this.moleculeMesh) {
      this.moleculeMesh.setOvervalentAtoms(ids);
    }
  }

  // ── Raycasting & Coordinates ────────────────────────────────────

  private toNDC(nx: number, ny: number): THREE.Vector2 {
    return new THREE.Vector2(nx * 2 - 1, -(ny * 2 - 1));
  }

  /**
   * Raycasts the scene at screen-normalised coords (nx, ny).
   * Returns atom id if intersecting an atom sphere, or undefined.
   */
  public hitTest(nx: number, ny: number): string | undefined {
    if (!this.moleculeMesh) return undefined;

    // 1. Direct raycast intersection
    const ndc = this.toNDC(nx, ny);
    this.raycaster.setFromCamera(ndc, this.camera);
    const atomMeshes = this.moleculeMesh.getAtomMeshes();
    const hits = this.raycaster.intersectObjects(atomMeshes, false);

    if (hits.length > 0) {
      const hit = hits[0]!;
      const atomId = hit.object.userData['atomId'] as number;
      return `atom-${atomId}`;
    }

    // 2. Screen-space proximity check (52px radius for easy webcam hand targeting)
    let closestAtomId: number | null = null;
    let closestDistPx = 52;
    const pxX = nx * window.innerWidth;
    const pxY = ny * window.innerHeight;

    for (const mesh of atomMeshes) {
      const atomId = mesh.userData['atomId'] as number;
      const screenPos = this.getAtomScreenCoords(atomId);
      if (!screenPos) continue;
      const ax = screenPos.x * window.innerWidth;
      const ay = screenPos.y * window.innerHeight;
      const dist = Math.hypot(pxX - ax, pxY - ay);
      if (dist < closestDistPx) {
        closestDistPx = dist;
        closestAtomId = atomId;
      }
    }

    if (closestAtomId !== null) {
      return `atom-${closestAtomId}`;
    }

    return undefined;
  }

  /**
   * Returns normalised screen coordinates [0, 1] for an atom, or null if behind camera.
   */
  public getAtomScreenCoords(atomId: number): { x: number; y: number } | null {
    if (!this.moleculeMesh) return null;
    const meshes = this.moleculeMesh.getAtomMeshes();
    const mesh = meshes.find((m) => m.userData['atomId'] === atomId);
    if (!mesh) return null;

    const worldPos = new THREE.Vector3();
    mesh.getWorldPosition(worldPos);
    worldPos.project(this.camera);

    if (worldPos.z > 1) return null; // behind camera

    return {
      x: (worldPos.x + 1) * 0.5,
      y: (-worldPos.y + 1) * 0.5,
    };
  }

  // ── Event Wiring ────────────────────────────────────────────────

  private wireEvents(bus: EventBus): void {
    bus.on('dragStart', (e) => {
      let targetId = e.targetId;
      if (!targetId) {
        targetId = this.hitTest(e.position.x, e.position.y);
      }

      if (targetId && targetId.startsWith('atom-')) {
        const atomId = parseInt(targetId.replace('atom-', ''), 10);
        this.startAtomDrag(atomId, e.position.x, e.position.y);
      } else if (!targetId) {
        this.mode = 'orbit';
      }
    });

    bus.on('drag', (e) => {
      if (this.mode === 'atomDrag') {
        this.moveAtom(e.position.x, e.position.y);
      } else if (this.mode === 'orbit') {
        this.orbit(e.delta.x, e.delta.y);
      }
    });

    bus.on('orbit', (e) => this.orbit(e.delta.x, e.delta.y));

    bus.on('dragEnd', () => {
      if (this.mode === 'atomDrag') {
        this.onAtomRelease?.();
        this.grabbedAtomId = null;
      }
      this.mode = 'none';
    });

    bus.on('cancel', () => {
      if (this.mode === 'atomDrag') {
        this.onAtomRelease?.();
        this.grabbedAtomId = null;
      }
      this.mode = 'none';
    });

    bus.on('zoom', (e) => {
      this.spherical.radius = Math.max(2.5, Math.min(18.0, this.spherical.radius * e.factor));
      this.updateCameraFromSpherical();
    });
  }

  private startAtomDrag(atomId: number, nx: number, ny: number): void {
    if (!this.moleculeMesh) return;
    const meshes = this.moleculeMesh.getAtomMeshes();
    const mesh = meshes.find((m) => m.userData['atomId'] === atomId);
    if (!mesh) return;

    this.grabbedAtomId = atomId;
    this.mode = 'atomDrag';

    // Camera-parallel drag plane passing through the atom's current world position
    const atomWorldPos = new THREE.Vector3();
    mesh.getWorldPosition(atomWorldPos);

    const camDir = this.camera.getWorldDirection(new THREE.Vector3()).negate();
    this.dragPlane.setFromNormalAndCoplanarPoint(camDir, atomWorldPos);

    // Initial position on plane
    const ndc = this.toNDC(nx, ny);
    this.raycaster.setFromCamera(ndc, this.camera);
    if (this.raycaster.ray.intersectPlane(this.dragPlane, this.planeHit)) {
      this.onAtomGrab?.(atomId, [this.planeHit.x, this.planeHit.y, this.planeHit.z]);
    }
  }

  private moveAtom(nx: number, ny: number): void {
    if (this.grabbedAtomId === null) return;
    const ndc = this.toNDC(nx, ny);
    this.raycaster.setFromCamera(ndc, this.camera);
    if (this.raycaster.ray.intersectPlane(this.dragPlane, this.planeHit)) {
      this.onAtomMove?.([this.planeHit.x, this.planeHit.y, this.planeHit.z]);
    }
  }

  private orbit(dx: number, dy: number): void {
    this.spherical.theta -= dx * 2.5;
    this.spherical.phi -= dy * 2.5;
    this.spherical.phi = Math.max(0.1, Math.min(Math.PI - 0.1, this.spherical.phi));
    this.updateCameraFromSpherical();
  }

  private updateCameraFromSpherical(): void {
    this.camera.position.setFromSpherical(this.spherical);
    this.camera.lookAt(0, 0, 0);
  }

  // ── Render loop ─────────────────────────────────────────────────

  public render(deltaSec: number): void {
    // Gentle ambient drift when not dragging
    if (this.mode === 'none' && this.moleculeMesh) {
      this.moleculeMesh.group.rotation.y += deltaSec * 0.12;
    }

    // Dynamic Holographic Synthesis Dome animations
    if (this.domeWireframeMesh) {
      this.domeWireframeMesh.rotation.y += deltaSec * 0.015;
    }
    if (this.floorRingsGroup) {
      this.floorRingsGroup.rotation.y -= deltaSec * 0.03;
    }
    if (this.particlesGroup) {
      this.particlesGroup.rotation.y += deltaSec * 0.02;
    }

    this.renderer.render(this.scene, this.camera);
  }

  private onResize = (): void => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
  };

  public dispose(): void {
    window.removeEventListener('resize', this.onResize);
    if (this.envMapTexture) {
      this.envMapTexture.dispose();
    }
    if (this.moleculeMesh) {
      this.moleculeMesh.dispose();
    }
    this.renderer.dispose();
  }
}
