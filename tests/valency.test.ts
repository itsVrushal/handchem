/**
 * valency.test.ts
 * Unit tests for valency calculations and overvalency detection.
 */

import { describe, it, expect } from 'vitest';
import { checkValency } from '../src/chem/valency';
import type { AtomData, BondData } from '../src/chem/types';

describe('checkValency', () => {
  it('correctly evaluates saturated water (H2O)', () => {
    const atoms: AtomData[] = [
      { id: 0, element: 'O', position: [0, 0, 0] },
      { id: 1, element: 'H', position: [-0.75, 0.58, 0] },
      { id: 2, element: 'H', position: [0.75, 0.58, 0] },
    ];
    const bonds: BondData[] = [
      { a: 0, b: 1, order: 1 },
      { a: 0, b: 2, order: 1 },
    ];

    const report = checkValency(atoms, bonds);
    expect(report.hasOvervalentAtoms).toBe(false);
    expect(report.overvalentAtomIds).toHaveLength(0);
    expect(report.isValidMolecule).toBe(true);
    expect(report.atoms.get(0)?.currentBondOrder).toBe(2);
    expect(report.atoms.get(1)?.currentBondOrder).toBe(1);
    expect(report.atoms.get(2)?.currentBondOrder).toBe(1);
  });

  it('detects overvalent hydrogen (e.g. H bonded to two atoms)', () => {
    const atoms: AtomData[] = [
      { id: 0, element: 'H', position: [0, 0, 0] },
      { id: 1, element: 'C', position: [1, 0, 0] },
      { id: 2, element: 'C', position: [-1, 0, 0] },
    ];
    const bonds: BondData[] = [
      { a: 0, b: 1, order: 1 },
      { a: 0, b: 2, order: 1 },
    ];

    const report = checkValency(atoms, bonds);
    expect(report.hasOvervalentAtoms).toBe(true);
    expect(report.overvalentAtomIds).toContain(0);
    expect(report.atoms.get(0)?.isOvervalent).toBe(true);
  });

  it('detects overvalent carbon (more than 4 bonds)', () => {
    const atoms: AtomData[] = [
      { id: 0, element: 'C', position: [0, 0, 0] },
      { id: 1, element: 'H', position: [1, 0, 0] },
      { id: 2, element: 'H', position: [-1, 0, 0] },
      { id: 3, element: 'H', position: [0, 1, 0] },
      { id: 4, element: 'H', position: [0, -1, 0] },
      { id: 5, element: 'H', position: [0, 0, 1] },
    ];
    // 5 bonds to carbon 0
    const bonds: BondData[] = [
      { a: 0, b: 1, order: 1 },
      { a: 0, b: 2, order: 1 },
      { a: 0, b: 3, order: 1 },
      { a: 0, b: 4, order: 1 },
      { a: 0, b: 5, order: 1 },
    ];

    const report = checkValency(atoms, bonds);
    expect(report.hasOvervalentAtoms).toBe(true);
    expect(report.overvalentAtomIds).toEqual([0]);
    expect(report.atoms.get(0)?.currentBondOrder).toBe(5);
  });

  it('correctly handles double and triple bonds', () => {
    // Ethene C=C (double bond)
    const atoms: AtomData[] = [
      { id: 0, element: 'C', position: [-0.66, 0, 0] },
      { id: 1, element: 'C', position: [0.66, 0, 0] },
      { id: 2, element: 'H', position: [-1.2, 0.9, 0] },
      { id: 3, element: 'H', position: [-1.2, -0.9, 0] },
      { id: 4, element: 'H', position: [1.2, 0.9, 0] },
      { id: 5, element: 'H', position: [1.2, -0.9, 0] },
    ];
    const bonds: BondData[] = [
      { a: 0, b: 1, order: 2 }, // double bond order = 2
      { a: 0, b: 2, order: 1 },
      { a: 0, b: 3, order: 1 },
      { a: 1, b: 4, order: 1 },
      { a: 1, b: 5, order: 1 },
    ];

    const report = checkValency(atoms, bonds);
    expect(report.hasOvervalentAtoms).toBe(false);
    expect(report.isValidMolecule).toBe(true);
    expect(report.atoms.get(0)?.currentBondOrder).toBe(4);
    expect(report.atoms.get(1)?.currentBondOrder).toBe(4);
  });
});
