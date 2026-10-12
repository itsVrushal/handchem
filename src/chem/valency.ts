/**
 * valency.ts
 * Valency checking and validation rules for chemical elements.
 * Evaluates bond orders, octet compliance, and overvalency for build mode.
 * Overvalent atoms are flagged so they can glow red in the 3D scene and HUD.
 */

import { ELEMENTS } from './elements';
import type { AtomData, BondData, ElementSymbol } from './types';

export interface AtomValencyStatus {
  atomId: number;
  element: ElementSymbol;
  maxValency: number;
  currentBondOrder: number;
  isOvervalent: boolean;
  isUnderfilled: boolean;
  isSaturated: boolean;
}

export interface ValencyReport {
  atoms: Map<number, AtomValencyStatus>;
  hasOvervalentAtoms: boolean;
  overvalentAtomIds: number[];
  isValidMolecule: boolean;
}

/**
 * Checks valency for all atoms in a molecule based on chemical bond orders.
 */
export function checkValency(atoms: AtomData[], bonds: BondData[]): ValencyReport {
  const bondOrderMap = new Map<number, number>();
  for (const atom of atoms) {
    bondOrderMap.set(atom.id, 0);
  }

  for (const bond of bonds) {
    const currentA = bondOrderMap.get(bond.a) ?? 0;
    const currentB = bondOrderMap.get(bond.b) ?? 0;
    bondOrderMap.set(bond.a, currentA + bond.order);
    bondOrderMap.set(bond.b, currentB + bond.order);
  }

  const result = new Map<number, AtomValencyStatus>();
  const overvalentIds: number[] = [];
  let allSaturated = true;

  for (const atom of atoms) {
    const info = ELEMENTS[atom.element];
    const maxValency = info ? info.valency : 4;
    const current = bondOrderMap.get(atom.id) ?? 0;
    const isOvervalent = current > maxValency;
    const isSaturated = current === maxValency;
    const isUnderfilled = current < maxValency;

    if (isOvervalent) {
      overvalentIds.push(atom.id);
    }
    if (!isSaturated) {
      allSaturated = false;
    }

    result.set(atom.id, {
      atomId: atom.id,
      element: atom.element,
      maxValency,
      currentBondOrder: current,
      isOvervalent,
      isUnderfilled,
      isSaturated,
    });
  }

  return {
    atoms: result,
    hasOvervalentAtoms: overvalentIds.length > 0,
    overvalentAtomIds: overvalentIds,
    isValidMolecule: overvalentIds.length === 0 && allSaturated,
  };
}
