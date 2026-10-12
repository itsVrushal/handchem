/**
 * physics.test.ts
 * Invariant tests for the molecular mechanics Verlet & PBD solver.
 */

import { describe, it, expect } from 'vitest';
import { MoleculePhysics } from '../src/chem/physics';
import { MOLECULES, getMoleculeById } from '../src/content/molecules';

describe('Molecular Physics & Registry', () => {
  it('loads all 12 NCERT molecules with valid atoms and bonds', () => {
    expect(MOLECULES.length).toBe(12);

    for (const mol of MOLECULES) {
      expect(mol.id).toBeDefined();
      expect(mol.name).toBeDefined();
      expect(mol.formula).toBeDefined();
      expect(mol.atoms.length).toBeGreaterThan(1);
      expect(mol.bonds.length).toBeGreaterThan(0);

      // Verify all bond atom indices point to valid atoms
      for (const bond of mol.bonds) {
        const hasA = mol.atoms.some((a) => a.id === bond.a);
        const hasB = mol.atoms.some((a) => a.id === bond.b);
        expect(hasA).toBe(true);
        expect(hasB).toBe(true);
      }
    }
  });

  it('preserves rest bond lengths when undisturbed', () => {
    const h2o = getMoleculeById('h2o')!;
    const sim = new MoleculePhysics(h2o);

    // Initial bond length of O-H
    const initialLen = sim.getBondLength(0, 1);
    expect(initialLen).toBeCloseTo(0.96, 2);

    // Step 30 times without disturbance
    for (let i = 0; i < 30; i++) sim.step(0.016);

    const afterLen = sim.getBondLength(0, 1);
    expect(afterLen).toBeCloseTo(0.96, 2);
  });

  it('restores bond length back to equilibrium after displacement (spring-back)', () => {
    const h2o = getMoleculeById('h2o')!;
    const sim = new MoleculePhysics(h2o);

    // Displace hydrogen atom 1 by -0.6 Angstroms along x (stretching bond)
    sim.positions[1]![0] -= 0.6;
    const displacedLen = sim.getBondLength(0, 1);
    expect(displacedLen).toBeGreaterThan(1.4);

    // Run solver steps to allow relaxation
    for (let i = 0; i < 80; i++) {
      sim.step(0.016);
    }

    const relaxedLen = sim.getBondLength(0, 1);
    // Should settle back close to 0.96 Å (within 0.03 Å tolerance)
    expect(Math.abs(relaxedLen - 0.96)).toBeLessThan(0.03);
  });

  it('restores VSEPR bond angle back toward 104.5 degrees in water', () => {
    const h2o = getMoleculeById('h2o')!;
    const sim = new MoleculePhysics(h2o);

    // Initial angle is ~104.5°
    expect(sim.getAngleDeg(1, 0, 2)).toBeCloseTo(104.5, 1);

    // Distort hydrogen 1 to alter the angle significantly
    sim.positions[1]![0] = 0.2;
    sim.positions[1]![1] = 0.96;
    const distortedAngle = sim.getAngleDeg(1, 0, 2);
    expect(distortedAngle).toBeLessThan(70);

    // Relax under VSEPR angle constraints
    for (let i = 0; i < 100; i++) {
      sim.step(0.016);
    }

    const settledAngle = sim.getAngleDeg(1, 0, 2);
    expect(Math.abs(settledAngle - 104.5)).toBeLessThan(2.5);
  });

  it('strictly pins grabbed atom to the target coordinate during dragging', () => {
    const ch4 = getMoleculeById('ch4')!;
    const sim = new MoleculePhysics(ch4);

    const targetPos: [number, number, number] = [2.5, 1.0, 0.0];
    sim.setGrabbedAtom(1, targetPos);

    // Step solver
    for (let i = 0; i < 20; i++) {
      sim.step(0.016);
    }

    const pinnedAtomPos = sim.positions[sim.grabbedAtomIndex!]!;
    expect(pinnedAtomPos[0]).toBeCloseTo(2.5, 3);
    expect(pinnedAtomPos[1]).toBeCloseTo(1.0, 3);
    expect(pinnedAtomPos[2]).toBeCloseTo(0.0, 3);

    // Release grab and verify pin is cleared
    sim.releaseGrab();
    expect(sim.grabbedAtomIndex).toBeNull();
  });
});
