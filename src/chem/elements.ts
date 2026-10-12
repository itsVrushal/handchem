/**
 * elements.ts
 * Standard CPK coloring, covalent & van der Waals radii, atomic masses, and valencies.
 * Scale: 1 Ångström = 1.0 Three.js coordinate unit.
 */

import type { ElementInfo, ElementSymbol } from './types';

export const ELEMENTS: Record<ElementSymbol, ElementInfo> = {
  H: {
    symbol: 'H',
    name: 'Hydrogen',
    atomicNumber: 1,
    atomicMass: 1.008,
    cpkColor: '#F5F5FA', // Pure bright white-silver
    covalentRadius: 0.31,
    vdwRadius: 1.20,
    valency: 1,
  },
  C: {
    symbol: 'C',
    name: 'Carbon',
    atomicNumber: 6,
    atomicMass: 12.011,
    cpkColor: '#2B2B33', // Sleek dark slate CPK charcoal
    covalentRadius: 0.76,
    vdwRadius: 1.70,
    valency: 4,
  },
  N: {
    symbol: 'N',
    name: 'Nitrogen',
    atomicNumber: 7,
    atomicMass: 14.007,
    cpkColor: '#2563EB', // Vibrant deep CPK blue
    covalentRadius: 0.71,
    vdwRadius: 1.55,
    valency: 3,
  },
  O: {
    symbol: 'O',
    name: 'Oxygen',
    atomicNumber: 8,
    atomicMass: 15.999,
    cpkColor: '#EF4444', // Vibrant crimson CPK red
    covalentRadius: 0.66,
    vdwRadius: 1.52,
    valency: 2,
  },
  Cl: {
    symbol: 'Cl',
    name: 'Chlorine',
    atomicNumber: 17,
    atomicMass: 35.453,
    cpkColor: '#10B981', // Emerald CPK green
    covalentRadius: 1.02,
    vdwRadius: 1.75,
    valency: 1,
  },
  Na: {
    symbol: 'Na',
    name: 'Sodium',
    atomicNumber: 11,
    atomicMass: 22.990,
    cpkColor: '#A855F7', // Royal CPK purple-violet
    covalentRadius: 1.66,
    vdwRadius: 2.27,
    valency: 1,
  },
};

/** Calculate molar mass for a given molecule from atom array. */
export function calculateMolarMass(atoms: { element: ElementSymbol }[]): number {
  const sum = atoms.reduce((acc, a) => {
    const el = ELEMENTS[a.element];
    return acc + (el ? el.atomicMass : 0);
  }, 0);
  return Math.round(sum * 1000) / 1000;
}
