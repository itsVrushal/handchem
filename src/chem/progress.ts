/**
 * progress.ts
 * Manages local persistence of user progress, completed NCERT missions,
 * and quiz scores in localStorage. Completely private & client-side.
 */

import type { MissionProgress } from './missionTypes';

const STORAGE_KEY = 'molecule_hands_progress_v1';

export class ProgressManager {
  private progress: MissionProgress;
  private storage: Storage | null;

  constructor(customStorage?: Storage) {
    if (customStorage) {
      this.storage = customStorage;
    } else if (typeof localStorage !== 'undefined') {
      this.storage = localStorage;
    } else {
      this.storage = null;
    }
    this.progress = this.load();
  }

  private load(): MissionProgress {
    try {
      const raw = this.storage?.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<MissionProgress>;
        return {
          completedMissionIds: Array.isArray(parsed.completedMissionIds) ? parsed.completedMissionIds : [],
          currentMissionId: parsed.currentMissionId ?? null,
          currentStepIndex: parsed.currentStepIndex ?? 0,
          quizScores: parsed.quizScores ?? {},
        };
      }
    } catch {
      // In private browsing or storage errors, gracefully fall back
    }

    return {
      completedMissionIds: [],
      currentMissionId: null,
      currentStepIndex: 0,
      quizScores: {},
    };
  }

  private save(): void {
    try {
      this.storage?.setItem(STORAGE_KEY, JSON.stringify(this.progress));
    } catch {
      // Ignore quota errors
    }
  }

  isMissionCompleted(id: string): boolean {
    return this.progress.completedMissionIds.includes(id);
  }

  markMissionCompleted(id: string): void {
    if (!this.progress.completedMissionIds.includes(id)) {
      this.progress.completedMissionIds.push(id);
      this.save();
    }
  }

  getCompletedCount(): number {
    return this.progress.completedMissionIds.length;
  }

  recordQuizScore(stepId: string, score: number): void {
    this.progress.quizScores[stepId] = score;
    this.save();
  }

  setCurrent(missionId: string | null, stepIdx = 0): void {
    this.progress.currentMissionId = missionId;
    this.progress.currentStepIndex = stepIdx;
    this.save();
  }

  getState(): Readonly<MissionProgress> {
    return this.progress;
  }

  resetAll(): void {
    this.progress = {
      completedMissionIds: [],
      currentMissionId: null,
      currentStepIndex: 0,
      quizScores: {},
    };
    this.save();
  }
}
