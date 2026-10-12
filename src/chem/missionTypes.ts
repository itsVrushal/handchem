/**
 * missionTypes.ts
 * Types for NCERT learning missions, guided challenges, and predict-then-reveal flow.
 */

export type MissionStepType = 'predict' | 'measure' | 'build' | 'quiz';

export interface MissionStep {
  id: string;
  type: MissionStepType;
  prompt: string;
  moleculeId?: string;
  options?: string[];
  correctAnswer?: number | string;
  explanation: string;
  target?: {
    expectedBondLength?: [number, number]; // [min, max] in Angstroms
    expectedAngleDeg?: [number, number]; // [min, max] in degrees
    valencyRequirement?: string;
  };
}

export interface MissionData {
  id: string;
  title: string;
  classLevel: 9 | 10 | 11 | 12;
  ncertRef: string;
  estimatedMinutes: number;
  description: string;
  moleculeId: string;
  badge: string;
  steps: MissionStep[];
}

export interface MissionProgress {
  completedMissionIds: string[];
  currentMissionId: string | null;
  currentStepIndex: number;
  quizScores: Record<string, number>;
}
