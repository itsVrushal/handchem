/**
 * scene.ts
 * Three.js scene for Phase 0: a draggable, lit cube in a dark environment.
 * Listens to the unified InputEvent bus – no raw DOM events.
 *
 * Interaction model:
 *   • dragStart with targetId === 'cube'  → grab cube, compute drag plane
 *   • dragStart with no targetId         → orbit camera (trackball)
 *   • drag                               → move cube OR orbit
 *   • dragEnd                            → release
 *   • zoom                               → dolly camera in/out
 *   • orbit                              → explicit orbit (from gesture engine)
 */

import * as THREE from 'three';
import { EventBus } from '../input/events';

const CUBE_TARGET_ID = 'cube';

export class Scene {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene: THREE.Scene;
  private readonly camera: THREE.PerspectiveCamera;
  private readonly cube: THREE.Mesh;
  private readonly raycaster = new THREE.Raycaster();

  // Orbit state (spherical coords)
  private readonly spherical = new THREE.Spherical(8, Math.PI / 3.5, 0.5);

  // Drag state
  private mode: 'none' | 'orbit' | 'drag' = 'none';
  private readonly dragPlane = new THREE.Plane();
  private readonly grabOffset = new THREE.Vector3();
  private readonly planeHit = new THREE.Vector3();

  constructor(canvas: HTMLCanvasElement, bus: EventBus) {
    // ── Renderer ──────────────────────────────────────────────────
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight, false);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;

    // ── Scene ─────────────────────────────────────────────────────
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x08080f);
    this.scene.fog = new THREE.Fog(0x08080f, 20, 50);

    // ── Camera ────────────────────────────────────────────────────
    this.camera = new THREE.PerspectiveCamera(
      55,
      window.innerWidth / window.innerHeight,
      0.1,
      100,
    );
    this.updateCameraFromSpherical();

    // ── Lights ────────────────────────────────────────────────────
    const ambient = new THREE.AmbientLight(0x4040ff, 0.25);
    this.scene.add(ambient);

    const sun = new THREE.DirectionalLight(0xffffff, 1.4);
    sun.position.set(6, 10, 8);
    sun.castShadow = true;
    sun.shadow.mapSize.setScalar(1024);
    this.scene.add(sun);

    const fill = new THREE.PointLight(0x7c3aed, 1.2, 20);
    fill.position.set(-4, 2, -3);
    this.scene.add(fill);

    const rim = new THREE.PointLight(0x4f46e5, 0.6, 15);
    rim.position.set(4, -2, -5);
    this.scene.add(rim);

    // ── Ground plane ──────────────────────────────────────────────
    const groundGeo = new THREE.PlaneGeometry(30, 30);
    const groundMat = new THREE.MeshStandardMaterial({
      color: 0x0d0d1a,
      roughness: 1,
      metalness: 0,
    });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -2.5;
    ground.receiveShadow = true;
    this.scene.add(ground);

    // ── Cube ──────────────────────────────────────────────────────
    const geo = new THREE.BoxGeometry(1.4, 1.4, 1.4);
    const mat = new THREE.MeshStandardMaterial({
      color: 0x7c3aed,
      roughness: 0.25,
      metalness: 0.65,
      emissive: new THREE.Color(0x4f46e5),
      emissiveIntensity: 0.08,
    });
    this.cube = new THREE.Mesh(geo, mat);
    this.cube.castShadow = true;
    this.cube.receiveShadow = true;
    this.cube.userData['targetId'] = CUBE_TARGET_ID;
    // Idle rotation animation
    this.cube.userData['spinning'] = true;
    this.scene.add(this.cube);

    // ── Helper grid ───────────────────────────────────────────────
    const grid = new THREE.GridHelper(20, 20, 0x1a1a2e, 0x1a1a2e);
    grid.position.y = -2.5;
    this.scene.add(grid);

    // ── Wireframe edge highlight ───────────────────────────────────
    const edges = new THREE.EdgesGeometry(geo);
    const lineMat = new THREE.LineBasicMaterial({ color: 0xa78bfa, linewidth: 1, opacity: 0.6, transparent: true });
    const wireframe = new THREE.LineSegments(edges, lineMat);
    this.cube.add(wireframe);

    // ── Event wiring ──────────────────────────────────────────────
    this.wireEvents(bus);

    // ── Resize ────────────────────────────────────────────────────
    window.addEventListener('resize', this.onResize);
  }

  // ── Event handling ──────────────────────────────────────────────

  private wireEvents(bus: EventBus): void {
    bus.on('dragStart', (e) => {
      if (e.targetId === CUBE_TARGET_ID) {
        this.startCubeDrag(e.position.x, e.position.y);
      } else if (!e.targetId) {
        this.mode = 'orbit';
        this.cube.userData['spinning'] = false;
      }
    });

    bus.on('drag', (e) => {
      if (this.mode === 'drag') {
        this.moveCube(e.position.x, e.position.y);
      } else if (this.mode === 'orbit') {
        this.orbit(e.delta.x, e.delta.y);
      }
    });

    bus.on('orbit', (e) => this.orbit(e.delta.x, e.delta.y));

    bus.on('dragEnd', () => {
      if (this.mode === 'drag') this.cube.userData['spinning'] = false;
      if (this.mode === 'orbit') this.cube.userData['spinning'] = false;
      this.mode = 'none';
    });

    bus.on('cancel', () => {
      this.mode = 'none';
    });

    bus.on('zoom', (e) => {
      this.spherical.radius = Math.max(2, Math.min(22, this.spherical.radius * e.factor));
      this.updateCameraFromSpherical();
    });
  }

  private startCubeDrag(nx: number, ny: number): void {
    const ndc = this.toNDC(nx, ny);
    this.raycaster.setFromCamera(ndc, this.camera);
    const hits = this.raycaster.intersectObject(this.cube);
    if (hits.length > 0) {
      const hit = hits[0]!;
      // Drag plane: camera-parallel through cube centre
      this.dragPlane.setFromNormalAndCoplanarPoint(
        this.camera.getWorldDirection(new THREE.Vector3()).negate(),
        this.cube.position,
      );
      this.grabOffset.copy(this.cube.position).sub(hit.point);
      this.mode = 'drag';
      this.cube.userData['spinning'] = false;
    }
  }

  private moveCube(nx: number, ny: number): void {
    const ndc = this.toNDC(nx, ny);
    this.raycaster.setFromCamera(ndc, this.camera);
    if (this.raycaster.ray.intersectPlane(this.dragPlane, this.planeHit)) {
      this.cube.position.copy(this.planeHit).add(this.grabOffset);
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

  private toNDC(nx: number, ny: number): THREE.Vector2 {
    return new THREE.Vector2(nx * 2 - 1, -(ny * 2 - 1));
  }

  /** Returns the targetId of the object under the screen-normalised cursor, or undefined. */
  hitTest(nx: number, ny: number): string | undefined {
    const ndc = this.toNDC(nx, ny);
    this.raycaster.setFromCamera(ndc, this.camera);
    const hits = this.raycaster.intersectObject(this.cube);
    return hits.length > 0 ? (this.cube.userData['targetId'] as string) : undefined;
  }

  // ── Render loop ─────────────────────────────────────────────────

  render(deltaSec: number): void {
    if (this.cube.userData['spinning']) {
      this.cube.rotation.x += deltaSec * 0.4;
      this.cube.rotation.y += deltaSec * 0.6;
    }
    this.renderer.render(this.scene, this.camera);
  }

  // ── Resize ──────────────────────────────────────────────────────

  private onResize = (): void => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
  };

  dispose(): void {
    window.removeEventListener('resize', this.onResize);
    this.renderer.dispose();
  }
}
