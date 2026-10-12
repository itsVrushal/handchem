/**
 * types.ts
 * Type definitions for chemical elements, molecules, and physics structures.
 */

export type ElementSymbol = 'H' | 'C' | 'N' | 'O' | 'Cl' | 'Na';

export interface ElementInfo {
  symbol: ElementSymbol;
  name: string;
  atomicNumber: number;
  atomicMass: number; // in atomic mass units (u)
  cpkColor: string; // hex color for 3D CPK rendering
  covalentRadius: number; // in Angstroms (Å)
  vdwRadius: number; // in Angstroms (Å)
  valency: number;
}

export interface AtomData {
  id: number;
  element: ElementSymbol;
  position: [number, number, number]; // initial rest position [x, y, z] in Angstroms
}

export interface BondData {
  a: number; // atom id A
  b: number; // atom id B
  order: 1 | 2 | 3; // single, double, triple
  targetLength?: number; // equilibrium length in Angstroms (computed if omitted)
}

export interface AngleConstraintData {
  atomA: number;
  centerAtom: number;
  atomB: number;
  targetAngleDeg: number; // equilibrium angle in degrees (e.g. 104.5 for H2O)
}

export interface MoleculeData {
  id: string;
  name: string;
  formula: string;
  classLevel: number[]; // e.g. [9, 10, 11]
  tags: string[];
  geometry: string; // e.g. 'Bent', 'Linear', 'Tetrahedral'
  notes: string;
  ncertRef: string; // placeholder for NCERT chapter alignment
  atoms: AtomData[];
  bonds: BondData[];
  angleConstraints?: AngleConstraintData[];
}

export type RepresentationMode = 'ballAndStick' | 'spaceFilling';
