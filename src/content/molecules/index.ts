/**
 * index.ts
 * Molecule registry. Imports all 12 NCERT molecules and provides lookup helpers.
 */

import type { MoleculeData } from '../../chem/types';

import h2 from './h2.json';
import o2 from './o2.json';
import n2 from './n2.json';
import h2o from './h2o.json';
import co2 from './co2.json';
import nh3 from './nh3.json';
import ch4 from './ch4.json';
import hcl from './hcl.json';
import nacl from './nacl.json';
import c2h4 from './c2h4.json';
import c2h2 from './c2h2.json';
import c2h5oh from './c2h5oh.json';

export const MOLECULES: MoleculeData[] = [
  h2 as MoleculeData,
  o2 as MoleculeData,
  n2 as MoleculeData,
  h2o as MoleculeData,
  co2 as MoleculeData,
  nh3 as MoleculeData,
  ch4 as MoleculeData,
  hcl as MoleculeData,
  nacl as MoleculeData,
  c2h4 as MoleculeData,
  c2h2 as MoleculeData,
  c2h5oh as MoleculeData,
];

export function getMoleculeById(id: string): MoleculeData | undefined {
  return MOLECULES.find((m) => m.id.toLowerCase() === id.toLowerCase());
}

export function getDefaultMolecule(): MoleculeData {
  return MOLECULES[3]!; // Water (H2O) as the default introductory molecule
}
