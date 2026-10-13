/**
 * builder.ts
 * Manages interactive Build Mode (Phase 3 Learning Layer):
 * - Add atoms (C, H, O, N) in 3D space
 * - Connect and modify bonds between atoms
 * - Real-time valency check: flags overvalent atoms so they glow pulsing red
 */

import type { AtomData, BondData, ElementSymbol, MoleculeData } from './types';
import { checkValency, type ValencyReport } from './valency';

export class MoleculeBuilder {
  private active = false;
  private selectedAtomId: number | null = null;
  private currentMolecule: MoleculeData;

  onMoleculeUpdated?: (molecule: MoleculeData, valencyReport: ValencyReport) => void;

  constructor(initialMolecule: MoleculeData) {
    this.currentMolecule = this.cloneMolecule(initialMolecule);
  }

  setMolecule(mol: MoleculeData): void {
    this.currentMolecule = this.cloneMolecule(mol);
    this.selectedAtomId = null;
  }

  getMolecule(): MoleculeData {
    return this.currentMolecule;
  }

  isBuildModeActive(): boolean {
    return this.active;
  }

  setBuildMode(active: boolean): void {
    this.active = active;
    this.selectedAtomId = null;
  }

  addAtom(element: ElementSymbol): number {
    const nextId = this.currentMolecule.atoms.reduce((max, a) => Math.max(max, a.id), -1) + 1;
    let pos: [number, number, number] = [0, 0, 0];
    let parentAtom: AtomData | null = null;

    if (this.currentMolecule.atoms.length > 0) {
      // 1. Priority 1: User's explicitly selected atom
      if (this.selectedAtomId !== null) {
        parentAtom = this.currentMolecule.atoms.find((a) => a.id === this.selectedAtomId) ?? null;
      }

      // 2. Priority 2: First atom with available/underfilled valency
      if (!parentAtom) {
        const report = checkValency(this.currentMolecule.atoms, this.currentMolecule.bonds);
        for (const atom of this.currentMolecule.atoms) {
          const status = report.atoms.get(atom.id);
          if (status && status.isUnderfilled) {
            parentAtom = atom;
            break;
          }
        }
      }

      // 3. Priority 3: Most recently added atom
      if (!parentAtom) {
        parentAtom = this.currentMolecule.atoms[this.currentMolecule.atoms.length - 1]!;
      }

      // Calculate directional offset from parent atom based on existing bonded neighbor count
      const parentBonds = this.currentMolecule.bonds.filter(
        (b) => b.a === parentAtom!.id || b.b === parentAtom!.id,
      );
      const neighborIdx = parentBonds.length;
      const bondLen = element === 'H' ? 1.08 : 1.38;

      // Realistic tetrahedral / geometric distribution offsets
      const directions: [number, number, number][] = [
        [1, 0.2, 0],
        [-0.45, 0.95, 0.3],
        [-0.45, -0.65, 0.8],
        [-0.45, -0.65, -0.8],
        [0.2, 0.9, -0.45],
        [0.2, -0.9, 0.45],
      ];
      const dir = directions[neighborIdx % directions.length]!;
      const norm = Math.hypot(dir[0], dir[1], dir[2]) || 1;

      pos = [
        parentAtom.position[0] + (dir[0] / norm) * bondLen,
        parentAtom.position[1] + (dir[1] / norm) * bondLen,
        parentAtom.position[2] + (dir[2] / norm) * bondLen,
      ];
    }

    const newAtom: AtomData = {
      id: nextId,
      element,
      position: pos,
    };

    this.currentMolecule.atoms.push(newAtom);

    // If there is a parent atom, automatically connect with a chemical bond!
    if (parentAtom) {
      this.currentMolecule.bonds.push({
        a: parentAtom.id,
        b: nextId,
        order: 1,
      });
    }

    // Set new atom as selected so subsequent additions can continue the chain smoothly
    this.selectedAtomId = nextId;

    this.notifyUpdate();
    return nextId;
  }

  handleAtomClicked(atomId: number): void {
    if (!this.active) return;

    if (this.selectedAtomId === null) {
      // First atom selected
      this.selectedAtomId = atomId;
    } else if (this.selectedAtomId === atomId) {
      // Deselect
      this.selectedAtomId = null;
    } else {
      // Second atom selected -> toggle or cycle bond
      this.toggleBond(this.selectedAtomId, atomId);
      this.selectedAtomId = null;
    }
  }

  getSelectedAtomId(): number | null {
    return this.selectedAtomId;
  }

  clearAll(): void {
    this.currentMolecule.atoms = [];
    this.currentMolecule.bonds = [];
    this.currentMolecule.angleConstraints = [];
    this.selectedAtomId = null;
    this.notifyUpdate();
  }

  private toggleBond(a: number, b: number): void {
    const existingIdx = this.currentMolecule.bonds.findIndex(
      (bond) => (bond.a === a && bond.b === b) || (bond.a === b && bond.b === a),
    );

    if (existingIdx !== -1) {
      const curOrder = this.currentMolecule.bonds[existingIdx]!.order;
      if (curOrder < 3) {
        // Increment bond order (single -> double -> triple)
        this.currentMolecule.bonds[existingIdx]!.order = (curOrder + 1) as 1 | 2 | 3;
      } else {
        // Remove bond on next cycle
        this.currentMolecule.bonds.splice(existingIdx, 1);
      }
    } else {
      // Create new single bond
      const newBond: BondData = { a, b, order: 1 };
      this.currentMolecule.bonds.push(newBond);
    }

    this.notifyUpdate();
  }

  private notifyUpdate(): void {
    const valencyReport = checkValency(this.currentMolecule.atoms, this.currentMolecule.bonds);
    this.onMoleculeUpdated?.(this.currentMolecule, valencyReport);
  }

  private cloneMolecule(mol: MoleculeData): MoleculeData {
    return {
      ...mol,
      atoms: mol.atoms.map((a) => ({ ...a, position: [...a.position] })),
      bonds: mol.bonds.map((b) => ({ ...b })),
      angleConstraints: mol.angleConstraints ? mol.angleConstraints.map((c) => ({ ...c })) : [],
    };
  }
}
