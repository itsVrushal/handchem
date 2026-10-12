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

  constructor(canvas: HTMLCanvasElement, bus: EventBus) {
    // ── Renderer ──────────────────────────────────────────────────
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight, false);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;

    // ── Scene ─────────────────────────────────────────────────────
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x08080f);
    this.scene.fog = new THREE.Fog(0x08080f, 15, 45);

    // ── Camera ────────────────────────────────────────────────────
    this.camera = new THREE.PerspectiveCamera(
      50,
      window.innerWidth / window.innerHeight,
      0.1,
      100,
    );
    this.updateCameraFromSpherical();

    // ── Studio Lighting for CPK Atoms ─────────────────────────────
    const ambient = new THREE.AmbientLight(0xffffff, 0.65);
    this.scene.add(ambient);

    const mainLight = new THREE.DirectionalLight(0xffffff, 1.6);
    mainLight.position.set(6, 9, 7);
    mainLight.castShadow = true;
    mainLight.shadow.mapSize.setScalar(1024);
    this.scene.add(mainLight);

    const fillLight = new THREE.PointLight(0x7c3aed, 1.2, 25);
    fillLight.position.set(-5, 3, -4);
    this.scene.add(fillLight);

    const rimLight = new THREE.PointLight(0x38bdf8, 1.0, 20);
    rimLight.position.set(4, -3, -5);
    this.scene.add(rimLight);

    // ── Subtle backdrop grid ──────────────────────────────────────
    const grid = new THREE.GridHelper(24, 24, 0x1e1e38, 0x141428);
    grid.position.y = -3.2;
    this.scene.add(grid);

    // ── Event wiring ──────────────────────────────────────────────
    this.wireEvents(bus);

    window.addEventListener('resize', this.onResize);
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
    if (this.moleculeMesh) {
      this.moleculeMesh.dispose();
    }
    this.renderer.dispose();
  }
}
