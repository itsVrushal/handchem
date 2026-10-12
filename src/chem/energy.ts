/**
 * energy.ts
 * Potential energy curves and strain calculation for bonds.
 * Provides both Harmonic oscillator potential V(r) = 0.5 * k * (r - r0)^2
 * and Morse potential for chemical bond stretch visualization.
 */

export interface PotentialEnergyPoint {
  r: number; // distance in Angstroms
  energy: number; // arbitrary energy units (eV or kcal/mol scaled)
}

/**
 * Calculates harmonic potential energy for a stretched/compressed bond:
 * V(r) = 0.5 * k * (r - r0)^2
 */
export function calculateHarmonicEnergy(r: number, r0: number, k = 15.0): number {
  const delta = r - r0;
  return 0.5 * k * delta * delta;
}

/**
 * Calculates Morse potential energy:
 * V(r) = D_e * (1 - exp(-a * (r - r0)))^2
 */
export function calculateMorseEnergy(r: number, r0: number, De = 4.5, a = 1.8): number {
  const expTerm = Math.exp(-a * (r - r0));
  return De * Math.pow(1 - expTerm, 2);
}

/**
 * Generates curve points for HUD potential well plotting.
 */
export function generateEnergyCurve(
  r0: number,
  rMin = Math.max(0.2, r0 * 0.5),
  rMax = r0 * 1.8,
  steps = 50,
  k = 15.0,
): PotentialEnergyPoint[] {
  const points: PotentialEnergyPoint[] = [];
  const stepSize = (rMax - rMin) / steps;
  for (let i = 0; i <= steps; i++) {
    const r = rMin + i * stepSize;
    points.push({
      r,
      energy: calculateHarmonicEnergy(r, r0, k),
    });
  }
  return points;
}
