/**
 * energy.test.ts
 * Tests for potential energy curves and strain calculations.
 */

import { describe, it, expect } from 'vitest';
import {
  calculateHarmonicEnergy,
  calculateMorseEnergy,
  generateEnergyCurve,
} from '../src/chem/energy';

describe('Potential Energy Calculations', () => {
  it('harmonic energy is zero at equilibrium rest length', () => {
    const energy = calculateHarmonicEnergy(1.0, 1.0);
    expect(energy).toBe(0.0);
  });

  it('harmonic energy increases symmetrically with displacement', () => {
    const stretch = calculateHarmonicEnergy(1.3, 1.0);
    const compress = calculateHarmonicEnergy(0.7, 1.0);

    expect(stretch).toBeGreaterThan(0);
    expect(stretch).toBeCloseTo(compress, 5);
  });

  it('harmonic energy scales quadratically with displacement', () => {
    const e1 = calculateHarmonicEnergy(1.1, 1.0); // delta = 0.1
    const e2 = calculateHarmonicEnergy(1.2, 1.0); // delta = 0.2

    expect(e2 / e1).toBeCloseTo(4.0, 1);
  });

  it('morse energy is zero at rest and increases steeply on compression', () => {
    const atRest = calculateMorseEnergy(1.0, 1.0);
    expect(atRest).toBeCloseTo(0.0, 5);

    const compressed = calculateMorseEnergy(0.5, 1.0);
    const stretched = calculateMorseEnergy(1.5, 1.0);

    // Repulsion on compression is steeper than on stretching
    expect(compressed).toBeGreaterThan(stretched);
  });

  it('generates a valid energy curve dataset for plotting', () => {
    const points = generateEnergyCurve(1.0, 0.5, 1.5, 20);
    expect(points.length).toBe(21);
    expect(points[0]!.r).toBe(0.5);
    expect(points[20]!.r).toBe(1.5);

    // Minimum should occur at or near r = 1.0
    const minPoint = points.reduce((min, p) => (p.energy < min.energy ? p : min), points[0]!);
    expect(minPoint.r).toBeCloseTo(1.0, 1);
  });
});
