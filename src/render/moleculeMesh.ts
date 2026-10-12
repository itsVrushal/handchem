/**
 * moleculeMesh.ts
 * Manages Three.js meshes for atoms and bonds.
 * Supports Ball-and-Stick and Space-Filling representations,
 * multiple bonds (single, double, triple), and atom hover/selection highlights.
 */

import * as THREE from 'three';
import type { MoleculeData, RepresentationMode } from '../chem/types';
import { ELEMENTS } from '../chem/elements';
import { getAtomRenderRadius, getBondRenderRadius } from './representations';

interface BondMeshGroup {
  bondIdx: number;
  atomA: number;
  atomB: number;
  order: 1 | 2 | 3;
  cylinders: THREE.Mesh[];
}

export class MoleculeMesh {
  public readonly group = new THREE.Group();
  public readonly molecule: MoleculeData;
  public mode: RepresentationMode = 'ballAndStick';

  private atomMeshes: THREE.Mesh[] = [];
  private bondGroups: BondMeshGroup[] = [];
  private highlightSphere: THREE.Mesh;
  private overvalentHaloGroup = new THREE.Group();
  private overvalentIds = new Set<number>();
  private overvalentHaloMat = new THREE.MeshBasicMaterial({
    color: 0xef4444, // Vivid crimson-red warning glow
    wireframe: true,
    transparent: true,
    opacity: 0.85,
  });

  // Shared geometry templates
  private sphereGeom = new THREE.SphereGeometry(1, 32, 24);
  private cylinderGeom = new THREE.CylinderGeometry(1, 1, 1, 16);
  private bondMaterial = new THREE.MeshStandardMaterial({
    color: 0x94a3b8, // Slate grey
    metalness: 0.2,
    roughness: 0.4,
  });

  // Cached materials per element
  private elementMaterials = new Map<string, THREE.MeshStandardMaterial>();

  constructor(molecule: MoleculeData, mode: RepresentationMode = 'ballAndStick') {
    this.molecule = molecule;
    this.mode = mode;

    // Create highlight halo sphere
    const haloMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      wireframe: true,
      transparent: true,
      opacity: 0.7,
    });
    this.highlightSphere = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), haloMat);
    this.highlightSphere.visible = false;
    this.group.add(this.highlightSphere);
    this.group.add(this.overvalentHaloGroup);

    this.buildAtoms();
    this.buildBonds();
  }

  private getMaterialForElement(element: string): THREE.MeshStandardMaterial {
    if (!this.elementMaterials.has(element)) {
      const info = ELEMENTS[element as keyof typeof ELEMENTS] ?? ELEMENTS.C;
      const mat = new THREE.MeshStandardMaterial({
        color: new THREE.Color(info.cpkColor),
        roughness: 0.3,
        metalness: 0.15,
      });
      this.elementMaterials.set(element, mat);
    }
    return this.elementMaterials.get(element)!;
  }

  private buildAtoms(): void {
    for (const atom of this.molecule.atoms) {
      const mat = this.getMaterialForElement(atom.element);
      const mesh = new THREE.Mesh(this.sphereGeom, mat);
      mesh.userData = { atomId: atom.id, element: atom.element };
      mesh.castShadow = true;
      mesh.receiveShadow = true;

      const r = getAtomRenderRadius(atom.element, this.mode);
      mesh.scale.set(r, r, r);
      mesh.position.set(atom.position[0], atom.position[1], atom.position[2]);

      this.atomMeshes.push(mesh);
      this.group.add(mesh);
    }
  }

  private buildBonds(): void {
    const bondRadius = getBondRenderRadius(this.mode);

    this.molecule.bonds.forEach((bond, bIdx) => {
      const cylinders: THREE.Mesh[] = [];
      const count = bond.order;

      for (let k = 0; k < count; k++) {
        const cyl = new THREE.Mesh(this.cylinderGeom, this.bondMaterial);
        cyl.scale.set(bondRadius, 1, bondRadius);
        cyl.castShadow = true;
        this.group.add(cyl);
        cylinders.push(cyl);
      }

      this.bondGroups.push({
        bondIdx: bIdx,
        atomA: bond.a,
        atomB: bond.b,
        order: bond.order,
        cylinders,
      });
    });
  }

  /**
   * Updates atom and bond positions to match current physics coordinates.
   */
  public updatePositions(positions: [number, number, number][]): void {
    // 1. Update atoms
    for (let i = 0; i < this.molecule.atoms.length; i++) {
      const pos = positions[i];
      const mesh = this.atomMeshes[i];
      if (pos && mesh) {
        mesh.position.set(pos[0], pos[1], pos[2]);
      }
    }

    // Update overvalent halo positions
    let haloIdx = 0;
    for (const atomId of this.overvalentIds) {
      const idx = this.molecule.atoms.findIndex((a) => a.id === atomId);
      const pos = positions[idx];
      const halo = this.overvalentHaloGroup.children[haloIdx];
      if (pos && halo) {
        halo.position.set(pos[0], pos[1], pos[2]);
      }
      haloIdx++;
    }

    // 2. Update bonds
    const isSpaceFilling = this.mode === 'spaceFilling';
    const bondRadius = getBondRenderRadius(this.mode);

    for (const bg of this.bondGroups) {
      if (isSpaceFilling) {
        bg.cylinders.forEach((c) => (c.visible = false));
        continue;
      }

      const idxA = this.molecule.atoms.findIndex((a) => a.id === bg.atomA);
      const idxB = this.molecule.atoms.findIndex((a) => a.id === bg.atomB);
      const posA = positions[idxA];
      const posB = positions[idxB];
      if (!posA || !posB) continue;

      const pA = new THREE.Vector3(posA[0], posA[1], posA[2]);
      const pB = new THREE.Vector3(posB[0], posB[1], posB[2]);
      const delta = new THREE.Vector3().subVectors(pB, pA);
      const length = delta.length();
      if (length < 1e-4) continue;

      const mid = new THREE.Vector3().addVectors(pA, pB).multiplyScalar(0.5);
      const orientation = new THREE.Quaternion().setFromUnitVectors(
        new THREE.Vector3(0, 1, 0),
        delta.clone().normalize(),
      );

      // Find a perpendicular vector for offsetting multiple bonds
      const up = new THREE.Vector3(0, 1, 0);
      let perp = new THREE.Vector3().crossVectors(delta, up).normalize();
      if (perp.lengthSq() < 1e-4) {
        perp = new THREE.Vector3().crossVectors(delta, new THREE.Vector3(1, 0, 0)).normalize();
      }

      const offsetDist = 0.09; // Angstroms separation between parallel cylinders

      if (bg.order === 1) {
        const cyl = bg.cylinders[0]!;
        cyl.visible = true;
        cyl.scale.set(bondRadius, length, bondRadius);
        cyl.position.copy(mid);
        cyl.quaternion.copy(orientation);
      } else if (bg.order === 2) {
        const offsets = [-offsetDist, offsetDist];
        bg.cylinders.forEach((cyl, k) => {
          cyl.visible = true;
          cyl.scale.set(bondRadius * 0.9, length, bondRadius * 0.9);
          const cylPos = mid.clone().addScaledVector(perp, offsets[k]!);
          cyl.position.copy(cylPos);
          cyl.quaternion.copy(orientation);
        });
      } else if (bg.order === 3) {
        const perp2 = new THREE.Vector3().crossVectors(delta, perp).normalize();
        const offsets = [
          perp.clone().multiplyScalar(offsetDist),
          perp.clone().multiplyScalar(-offsetDist * 0.5).addScaledVector(perp2, offsetDist * 0.866),
          perp.clone().multiplyScalar(-offsetDist * 0.5).addScaledVector(perp2, -offsetDist * 0.866),
        ];
        bg.cylinders.forEach((cyl, k) => {
          cyl.visible = true;
          cyl.scale.set(bondRadius * 0.8, length, bondRadius * 0.8);
          const cylPos = mid.clone().add(offsets[k]!);
          cyl.position.copy(cylPos);
          cyl.quaternion.copy(orientation);
        });
      }
    }
  }

  public setRepresentation(mode: RepresentationMode): void {
    this.mode = mode;
    for (let i = 0; i < this.molecule.atoms.length; i++) {
      const atom = this.molecule.atoms[i]!;
      const mesh = this.atomMeshes[i]!;
      const r = getAtomRenderRadius(atom.element, mode);
      mesh.scale.set(r, r, r);
    }
    const bondRadius = getBondRenderRadius(mode);
    for (const bg of this.bondGroups) {
      for (const cyl of bg.cylinders) {
        cyl.scale.x = bondRadius;
        cyl.scale.z = bondRadius;
      }
    }
  }

  public highlightAtom(atomId: number | null): void {
    if (atomId === null) {
      this.highlightSphere.visible = false;
      return;
    }
    const idx = this.molecule.atoms.findIndex((a) => a.id === atomId);
    if (idx !== -1 && this.atomMeshes[idx]) {
      const mesh = this.atomMeshes[idx]!;
      const r = getAtomRenderRadius(this.molecule.atoms[idx]!.element, this.mode) * 1.35;
      this.highlightSphere.scale.set(r, r, r);
      this.highlightSphere.position.copy(mesh.position);
      this.highlightSphere.visible = true;
    } else {
      this.highlightSphere.visible = false;
    }
  }

  public setOvervalentAtoms(ids: number[]): void {
    this.overvalentIds = new Set(ids);
    while (this.overvalentHaloGroup.children.length > 0) {
      this.overvalentHaloGroup.remove(this.overvalentHaloGroup.children[0]!);
    }

    for (const atomId of ids) {
      const idx = this.molecule.atoms.findIndex((a) => a.id === atomId);
      if (idx !== -1 && this.atomMeshes[idx]) {
        const mesh = this.atomMeshes[idx]!;
        const r = getAtomRenderRadius(this.molecule.atoms[idx]!.element, this.mode) * 1.45;
        const halo = new THREE.Mesh(this.sphereGeom, this.overvalentHaloMat);
        halo.scale.set(r, r, r);
        halo.position.copy(mesh.position);
        this.overvalentHaloGroup.add(halo);
      }
    }
  }

  public getAtomMeshes(): THREE.Mesh[] {
    return this.atomMeshes;
  }

  public dispose(): void {
    this.sphereGeom.dispose();
    this.cylinderGeom.dispose();
    this.bondMaterial.dispose();
    this.elementMaterials.forEach((m) => m.dispose());
    (this.highlightSphere.material as THREE.Material).dispose();
    this.highlightSphere.geometry.dispose();
    this.overvalentHaloMat.dispose();
    while (this.group.children.length > 0) {
      this.group.remove(this.group.children[0]!);
    }
  }
}
