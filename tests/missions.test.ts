/**
 * missions.test.ts
 * Unit tests for Phase 3 Learning Layer:
 * - Mission loading & schema validation for all 8 NCERT missions
 * - Progress persistence & quiz score tracking
 * - MoleculeBuilder atom addition & bond cycling
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ALL_MISSIONS, getMissionById } from '../src/content/missions';
import { ProgressManager } from '../src/chem/progress';
import { MoleculeBuilder } from '../src/chem/builder';
import { getDefaultMolecule } from '../src/content/molecules';

describe('NCERT Missions Registry', () => {
  it('loads all 8 required NCERT missions', () => {
    expect(ALL_MISSIONS).toHaveLength(8);
  });

  it('all missions contain required metadata and steps', () => {
    for (const m of ALL_MISSIONS) {
      expect(m.id).toBeTruthy();
      expect(m.title).toBeTruthy();
      expect([9, 10, 11, 12]).toContain(m.classLevel);
      expect(m.steps.length).toBeGreaterThanOrEqual(2);
      expect(m.description).toBeTruthy();

      for (const step of m.steps) {
        expect(['predict', 'measure', 'build', 'quiz']).toContain(step.type);
        expect(step.prompt).toBeTruthy();
        expect(step.explanation).toBeTruthy();
        if (step.type === 'predict' || step.type === 'quiz') {
          expect(step.options?.length).toBeGreaterThanOrEqual(2);
          expect(step.correctAnswer).toBeDefined();
        }
      }
    }
  });

  it('lookup by ID works correctly', () => {
    const water = getMissionById('water');
    expect(water).toBeDefined();
    expect(water?.title).toContain('Water');

    const nonExistent = getMissionById('unknown_xyz');
    expect(nonExistent).toBeUndefined();
  });
});

function createMockStorage(): Storage {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, val: string) => { store[key] = val; },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { store = {}; },
    key: (idx: number) => Object.keys(store)[idx] ?? null,
    get length() { return Object.keys(store).length; },
  };
}

describe('ProgressManager', () => {
  let mockStorage: Storage;
  let progress: ProgressManager;

  beforeEach(() => {
    mockStorage = createMockStorage();
    progress = new ProgressManager(mockStorage);
  });

  it('starts with 0 completed missions', () => {
    expect(progress.getCompletedCount()).toBe(0);
    expect(progress.isMissionCompleted('water')).toBe(false);
  });

  it('marks missions as completed and persists', () => {
    progress.markMissionCompleted('water');
    expect(progress.isMissionCompleted('water')).toBe(true);
    expect(progress.getCompletedCount()).toBe(1);

    // New instance reads from the same storage
    const p2 = new ProgressManager(mockStorage);
    expect(p2.isMissionCompleted('water')).toBe(true);
  });

  it('records quiz scores', () => {
    progress.recordQuizScore('w1', 100);
    expect(progress.getState().quizScores['w1']).toBe(100);
  });

  it('resets progress cleanly', () => {
    progress.markMissionCompleted('co2');
    progress.resetAll();
    expect(progress.getCompletedCount()).toBe(0);
    expect(progress.isMissionCompleted('co2')).toBe(false);
  });
});

describe('MoleculeBuilder', () => {
  it('adds atoms dynamically and fires update', () => {
    const mol = getDefaultMolecule();
    const builder = new MoleculeBuilder(mol);
    const initialCount = builder.getMolecule().atoms.length;

    let updatedCount = 0;
    builder.onMoleculeUpdated = (updated) => {
      updatedCount = updated.atoms.length;
    };

    const newId = builder.addAtom('C');
    expect(newId).toBeDefined();
    expect(updatedCount).toBe(initialCount + 1);
  });

  it('cycles bond orders on repeated clicks between two atoms', () => {
    const mol = {
      id: 'test',
      name: 'Test',
      formula: 'CH',
      classLevel: [10],
      tags: [],
      geometry: '',
      notes: '',
      ncertRef: '',
      atoms: [
        { id: 0, element: 'C' as const, position: [0, 0, 0] as [number, number, number] },
        { id: 1, element: 'C' as const, position: [1, 0, 0] as [number, number, number] },
      ],
      bonds: [],
    };
    const builder = new MoleculeBuilder(mol);
    builder.setBuildMode(true);

    // First click: select atom 0
    builder.handleAtomClicked(0);
    expect(builder.getSelectedAtomId()).toBe(0);

    // Second click: connect atom 0 to atom 1 (single bond order 1)
    builder.handleAtomClicked(1);
    expect(builder.getMolecule().bonds).toHaveLength(1);
    expect(builder.getMolecule().bonds[0]?.order).toBe(1);

    // Click again to cycle to double bond (order 2)
    builder.handleAtomClicked(0);
    builder.handleAtomClicked(1);
    expect(builder.getMolecule().bonds[0]?.order).toBe(2);

    // Click again to cycle to triple bond (order 3)
    builder.handleAtomClicked(0);
    builder.handleAtomClicked(1);
    expect(builder.getMolecule().bonds[0]?.order).toBe(3);

    // Click again: removes bond
    builder.handleAtomClicked(0);
    builder.handleAtomClicked(1);
    expect(builder.getMolecule().bonds).toHaveLength(0);
  });
});
