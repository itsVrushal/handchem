/**
 * physics.ts
 * Verlet integration & Position-Based Dynamics (PBD) solver for molecular mechanics.
 * Features:
 * - Bond-length springs with rest-length preservation
 * - VSEPR angle constraints (e.g. water 104.5°, methane 109.5°)
 * - Soft sphere repulsion preventing atomic interpenetration
 * - Pinned atom manipulation on a camera-parallel plane
 * - Smooth spring-back to equilibrium on release
 */

import type { MoleculeData } from './types';
import { ELEMENTS } from './elements';

export interface PhysicsConfig {
  bondStiffness: number; // PBD correction fraction per iteration (0.0 to 1.0)
  angleStiffness: number; // Angle restoration rate (0.0 to 1.0)
  damping: number; // Velocity dissipation (0.0 to 1.0)
  iterations: number; // Constraint solver steps per frame
  springBackStiffness: number; // Return-to-rest pull when released
}

export const DEFAULT_PHYSICS_CONFIG: PhysicsConfig = {
  bondStiffness: 0.5,
  angleStiffness: 0.35,
  damping: 0.08,
  iterations: 4,
  springBackStiffness: 0.05,
};

type Vec3 = [number, number, number];

function vSub(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function vAdd(a: Vec3, b: Vec3): Vec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

function vScale(v: Vec3, s: number): Vec3 {
  return [v[0] * s, v[1] * s, v[2] * s];
}

function vLen(v: Vec3): number {
  return Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
}

function vNorm(v: Vec3): Vec3 {
  const l = vLen(v);
  return l > 1e-7 ? [v[0] / l, v[1] / l, v[2] / l] : [0, 0, 0];
}

function vDot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function vCross(a: Vec3, b: Vec3): Vec3 {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

/** Rotate vector `v` around unit axis `axis` by angle in radians (Rodrigues' formula) */
function vRotate(v: Vec3, axis: Vec3, angle: number): Vec3 {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const dot = vDot(axis, v);
  const cross = vCross(axis, v);
  return [
    v[0] * cos + cross[0] * sin + axis[0] * dot * (1 - cos),
    v[1] * cos + cross[1] * sin + axis[1] * dot * (1 - cos),
    v[2] * cos + cross[2] * sin + axis[2] * dot * (1 - cos),
  ];
}

export class MoleculePhysics {
  public readonly molecule: MoleculeData;
  public config: PhysicsConfig;

  // State arrays indexed by atom index
  public positions: Vec3[] = [];
  public prevPositions: Vec3[] = [];
  public restPositions: Vec3[] = [];
  public masses: number[] = [];

  // Pinned grabbed atom index and its target coordinate
  public grabbedAtomIndex: number | null = null;
  public pinnedPosition: Vec3 | null = null;

  // Cached bond rest lengths
  public bondRestLengths: number[] = [];

  constructor(molecule: MoleculeData, cfg: Partial<PhysicsConfig> = {}) {
    this.molecule = molecule;
    this.config = { ...DEFAULT_PHYSICS_CONFIG, ...cfg };
    this.init();
  }

  private init(): void {
    const n = this.molecule.atoms.length;
    this.positions = [];
    this.prevPositions = [];
    this.restPositions = [];
    this.masses = [];

    for (let i = 0; i < n; i++) {
      const atom = this.molecule.atoms[i]!;
      const pos: Vec3 = [atom.position[0], atom.position[1], atom.position[2]];
      this.positions.push([...pos]);
      this.prevPositions.push([...pos]);
      this.restPositions.push([...pos]);

      const mass = ELEMENTS[atom.element]?.atomicMass ?? 12.0;
      this.masses.push(mass);
    }

    // Precalculate or copy bond equilibrium rest lengths
    this.bondRestLengths = this.molecule.bonds.map((bond) => {
      if (bond.targetLength !== undefined && bond.targetLength > 0) {
        return bond.targetLength;
      }
      const atomA = this.molecule.atoms.find((a) => a.id === bond.a);
      const atomB = this.molecule.atoms.find((a) => a.id === bond.b);
      if (atomA && atomB) {
        return vLen(vSub(atomA.position, atomB.position));
      }
      return 1.0;
    });
  }

  public resetToRest(): void {
    for (let i = 0; i < this.positions.length; i++) {
      this.positions[i] = [...this.restPositions[i]!];
      this.prevPositions[i] = [...this.restPositions[i]!];
    }
    this.grabbedAtomIndex = null;
    this.pinnedPosition = null;
  }

  public setGrabbedAtom(atomId: number, targetPos: Vec3): void {
    const idx = this.molecule.atoms.findIndex((a) => a.id === atomId);
    if (idx !== -1) {
      this.grabbedAtomIndex = idx;
      this.pinnedPosition = [...targetPos];
    }
  }

  public updateGrabbedPosition(targetPos: Vec3): void {
    if (this.grabbedAtomIndex !== null) {
      this.pinnedPosition = [...targetPos];
    }
  }

  public releaseGrab(): void {
    this.grabbedAtomIndex = null;
    this.pinnedPosition = null;
  }

  /**
   * Advance physics by one step.
   * `dt` is clamped to prevent stability explosions.
   */
  public step(dt = 0.016): void {
    const n = this.positions.length;
    const damp = 1.0 - this.config.damping;

    // 1. Verlet Integration step
    for (let i = 0; i < n; i++) {
      if (i === this.grabbedAtomIndex && this.pinnedPosition) {
        this.prevPositions[i] = [...this.positions[i]!];
        this.positions[i] = [...this.pinnedPosition];
        continue;
      }

      const curr = this.positions[i]!;
      const prev = this.prevPositions[i]!;

      // Velocity component with damping
      const vel = vScale(vSub(curr, prev), damp);

      // Spring-back force toward rest geometry when no atom is grabbed
      let springForce: Vec3 = [0, 0, 0];
      if (this.grabbedAtomIndex === null) {
        const toRest = vSub(this.restPositions[i]!, curr);
        springForce = vScale(toRest, this.config.springBackStiffness * Math.min(dt / 0.016, 2.0));
      }

      const next = vAdd(curr, vAdd(vel, springForce));
      this.prevPositions[i] = [...curr];
      this.positions[i] = next;
    }

    // 2. Solve Constraints iteratively (PBD)
    for (let it = 0; it < this.config.iterations; it++) {
      this.solveBondSprings();
      this.solveAngleConstraints();
      this.solveRepulsion();

      // Pin grabbed atom strictly
      if (this.grabbedAtomIndex !== null && this.pinnedPosition) {
        this.positions[this.grabbedAtomIndex] = [...this.pinnedPosition];
      }
    }
  }

  private solveBondSprings(): void {
    const bonds = this.molecule.bonds;
    const k = this.config.bondStiffness;

    for (let b = 0; b < bonds.length; b++) {
      const bond = bonds[b]!;
      const idxA = this.molecule.atoms.findIndex((a) => a.id === bond.a);
      const idxB = this.molecule.atoms.findIndex((a) => a.id === bond.b);
      if (idxA === -1 || idxB === -1) continue;

      const pA = this.positions[idxA]!;
      const pB = this.positions[idxB]!;
      const delta = vSub(pB, pA);
      const currentLen = vLen(delta);
      if (currentLen < 1e-6) continue;

      const restLen = this.bondRestLengths[b] ?? 1.0;
      const diff = (currentLen - restLen) / currentLen;
      const correction = vScale(delta, diff * k);

      const isAGrabbed = idxA === this.grabbedAtomIndex;
      const isBGrabbed = idxB === this.grabbedAtomIndex;

      if (isAGrabbed && !isBGrabbed) {
        this.positions[idxB] = vSub(pB, correction);
      } else if (isBGrabbed && !isAGrabbed) {
        this.positions[idxA] = vAdd(pA, correction);
      } else if (!isAGrabbed && !isBGrabbed) {
        const mA = this.masses[idxA]!;
        const mB = this.masses[idxB]!;
        const totalM = mA + mB;
        const wA = mB / totalM;
        const wB = mA / totalM;

        this.positions[idxA] = vAdd(pA, vScale(correction, wA));
        this.positions[idxB] = vSub(pB, vScale(correction, wB));
      }
    }
  }

  private solveAngleConstraints(): void {
    const constraints = this.molecule.angleConstraints;
    if (!constraints || constraints.length === 0) return;

    const kAngle = this.config.angleStiffness;

    for (const c of constraints) {
      const idxA = this.molecule.atoms.findIndex((a) => a.id === c.atomA);
      const idxC = this.molecule.atoms.findIndex((a) => a.id === c.centerAtom);
      const idxB = this.molecule.atoms.findIndex((a) => a.id === c.atomB);
      if (idxA === -1 || idxC === -1 || idxB === -1) continue;

      const pA = this.positions[idxA]!;
      const pC = this.positions[idxC]!;
      const pB = this.positions[idxB]!;

      const u = vSub(pA, pC);
      const v = vSub(pB, pC);
      const lenU = vLen(u);
      const lenV = vLen(v);
      if (lenU < 1e-6 || lenV < 1e-6) continue;

      const cosTheta = Math.max(-1, Math.min(1, vDot(u, v) / (lenU * lenV)));
      const currentTheta = Math.acos(cosTheta);
      const targetTheta = (c.targetAngleDeg * Math.PI) / 180.0;

      const angleDiff = targetTheta - currentTheta;
      if (Math.abs(angleDiff) < 1e-4) continue;

      // Axis perpendicular to the plane formed by u and v
      let axis = vCross(u, v);
      if (vLen(axis) < 1e-6) {
        // Collinear vectors (e.g., 180° in CO2)
        axis = Math.abs(u[0]) > 0.9 ? [0, 1, 0] : [1, 0, 0];
      }
      axis = vNorm(axis);

      const halfAngle = angleDiff * 0.5 * kAngle;

      if (idxA !== this.grabbedAtomIndex) {
        const rotU = vRotate(u, axis, -halfAngle);
        this.positions[idxA] = vAdd(pC, rotU);
      }
      if (idxB !== this.grabbedAtomIndex) {
        const rotV = vRotate(v, axis, halfAngle);
        this.positions[idxB] = vAdd(pC, rotV);
      }
    }
  }

  private solveRepulsion(): void {
    const n = this.positions.length;
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const pA = this.positions[i]!;
        const pB = this.positions[j]!;
        const delta = vSub(pB, pA);
        const dist = vLen(delta);
        const minDist = 0.65; // minimum allowed atom separation in Ångströms

        if (dist < minDist && dist > 1e-6) {
          const overlap = (minDist - dist) * 0.5;
          const push = vScale(vNorm(delta), overlap);
          if (i !== this.grabbedAtomIndex) this.positions[i] = vSub(pA, push);
          if (j !== this.grabbedAtomIndex) this.positions[j] = vAdd(pB, push);
        }
      }
    }
  }

  /** Calculate current distance between atom A and atom B in Angstroms */
  public getBondLength(atomAId: number, atomBId: number): number {
    const idxA = this.molecule.atoms.findIndex((a) => a.id === atomAId);
    const idxB = this.molecule.atoms.findIndex((a) => a.id === atomBId);
    if (idxA === -1 || idxB === -1) return 0;
    return vLen(vSub(this.positions[idxB]!, this.positions[idxA]!));
  }

  /** Calculate current angle in degrees for triad (A, Center, B) */
  public getAngleDeg(atomAId: number, centerAtomId: number, atomBId: number): number {
    const idxA = this.molecule.atoms.findIndex((a) => a.id === atomAId);
    const idxC = this.molecule.atoms.findIndex((a) => a.id === centerAtomId);
    const idxB = this.molecule.atoms.findIndex((a) => a.id === atomBId);
    if (idxA === -1 || idxC === -1 || idxB === -1) return 0;

    const u = vSub(this.positions[idxA]!, this.positions[idxC]!);
    const v = vSub(this.positions[idxB]!, this.positions[idxC]!);
    const lenU = vLen(u);
    const lenV = vLen(v);
    if (lenU < 1e-6 || lenV < 1e-6) return 0;

    const cosTheta = Math.max(-1, Math.min(1, vDot(u, v) / (lenU * lenV)));
    return (Math.acos(cosTheta) * 180.0) / Math.PI;
  }
}
