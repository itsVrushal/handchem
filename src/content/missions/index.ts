/**
 * index.ts
 * Loader and catalogue for all NCERT Learning Missions (Phase 3).
 */

import type { MissionData } from '../../chem/missionTypes';

import water from './water.json';
import co2 from './co2.json';
import ammonia from './ammonia.json';
import methane from './methane.json';
import ethene from './ethene.json';
import ethanol from './ethanol.json';
import ionicCovalent from './ionic_covalent.json';
import butaneIsomers from './butane_isomers.json';

export const ALL_MISSIONS: MissionData[] = [
  water as MissionData,
  co2 as MissionData,
  ammonia as MissionData,
  methane as MissionData,
  ethene as MissionData,
  ethanol as MissionData,
  ionicCovalent as MissionData,
  butaneIsomers as MissionData,
];

export function getMissionById(id: string): MissionData | undefined {
  return ALL_MISSIONS.find((m) => m.id === id);
}

export function getDefaultMission(): MissionData {
  return ALL_MISSIONS[0]!;
}
