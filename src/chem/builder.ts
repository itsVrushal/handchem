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
    // Spawn in a slight offset from the center
    const count = this.currentMolecule.atoms.length;
    const angle = (count * Math.PI) / 3;
    const radius = 1.3 + (count % 3) * 0.4;
    const pos: [number, number, number] = [
      Math.cos(angle) * radius,
      Math.sin(angle) * radius,
      (count % 2 === 0 ? 0.3 : -0.3),
    ];

    const newAtom: AtomData = {
      id: nextId,
      element,
      position: pos,
    };

    this.currentMolecule.atoms.push(newAtom);
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
