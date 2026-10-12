/**
 * missionRunner.ts
 * Manages the interactive NCERT guided missions:
 * - Step-by-step predict-then-reveal flow
 * - Interactive quiz questions with explanation cards
 * - Live measurement goals (bond stretching / angle checking)
 * - Complete hand-gesture operability via ButtonManager
 */

import type { MissionData, MissionStep } from '../chem/missionTypes';
import type { ProgressManager } from '../chem/progress';
import type { ButtonManager } from './buttons';
import type { MoleculePhysics } from '../chem/physics';
import { getMissionById, ALL_MISSIONS } from '../content/missions';

export class MissionRunner {
  private activeMission: MissionData | null = null;
  private currentStepIndex = 0;
  private cardEl: HTMLElement;
  private progress: ProgressManager;
  private buttons: ButtonManager;
  private physics: MoleculePhysics | null = null;

  // Callback to switch molecule in scene
  onSelectMolecule?: (moleculeId: string) => void;
  onMissionFinished?: () => void;
  onOpenSelector?: () => void;

  private optionBtnIds: string[] = [];

  constructor(progress: ProgressManager, buttons: ButtonManager) {
    this.progress = progress;
    this.buttons = buttons;

    const el = document.getElementById('mission-card');
    if (!el) throw new Error('#mission-card not found');
    this.cardEl = el;
  }

  setPhysics(physics: MoleculePhysics): void {
    this.physics = physics;
  }

  startMission(missionId: string): void {
    const mission = getMissionById(missionId);
    if (!mission) return;

    this.activeMission = mission;
    this.currentStepIndex = 0;
    this.progress.setCurrent(missionId, 0);

    // Switch scene molecule to this mission's molecule
    this.onSelectMolecule?.(mission.moleculeId);

    this.renderCurrentStep();
    this.cardEl.hidden = false;
  }

  closeMission(): void {
    this.cardEl.hidden = true;
    this.activeMission = null;
  }

  getActiveMission(): MissionData | null {
    return this.activeMission;
  }

  checkLiveGoals(): void {
    if (!this.activeMission || !this.physics) return;
    const step = this.activeMission.steps[this.currentStepIndex];
    if (!step || step.type !== 'measure' || !step.target) return;

    // Check if target bond length stretch is reached
    if (step.target.expectedBondLength && this.physics.bondRestLengths.length > 0) {
      const current = this.physics.getBondLength(this.physics.molecule.bonds[0]?.a ?? 0, this.physics.molecule.bonds[0]?.b ?? 1);
      const [minStretch] = step.target.expectedBondLength;
      if (current >= minStretch) {
        this.revealMeasureSuccess(step);
      }
    }
  }

  private renderCurrentStep(): void {
    if (!this.activeMission) return;
    const step = this.activeMission.steps[this.currentStepIndex];
    if (!step) {
      this.renderCompletion();
      return;
    }

    const totalSteps = this.activeMission.steps.length;
    const typeLabel =
      step.type === 'predict' ? '🔮 Predict & Discover' :
      step.type === 'measure' ? '📏 Measure & Stretch' :
      step.type === 'quiz' ? '🧠 Concept Check' : '🔬 Build';

    let contentHtml = `
      <div class="mission-header">
        <div class="mission-meta">
          <span class="mission-badge-icon">${this.activeMission.badge}</span>
          <div>
            <h3 class="mission-title">${this.activeMission.title}</h3>
            <span class="mission-step-badge">Step ${this.currentStepIndex + 1} of ${totalSteps} · ${typeLabel}</span>
          </div>
        </div>
        <button id="btn-mission-close" class="btn btn-icon btn-close-mission" data-target-id="btn-mission-close" title="Close Mission">✕</button>
      </div>

      <p class="mission-prompt">${step.prompt}</p>
    `;

    if (step.type === 'predict' || step.type === 'quiz') {
      contentHtml += `<div class="mission-options">`;
      step.options?.forEach((opt, idx) => {
        const btnId = `btn-opt-${idx}`;
        contentHtml += `
          <button id="${btnId}" class="btn btn-mission-option" data-target-id="${btnId}" data-opt-idx="${idx}">
            <span class="opt-num">${String.fromCharCode(65 + idx)}</span>
            <span class="opt-text">${opt}</span>
          </button>
        `;
      });
      contentHtml += `</div>`;
    } else if (step.type === 'measure') {
      contentHtml += `
        <div class="mission-measure-box">
          <div class="measure-indicator" id="measure-status">
            <span class="measure-icon">☝️</span>
            <span>Point with index finger to grab and pull any atom in 3D!</span>
          </div>
        </div>
      `;
    }

    contentHtml += `
      <div id="mission-explanation" class="mission-explanation" hidden>
        <div class="explanation-title">💡 NCERT Explanation</div>
        <p id="explanation-text" class="explanation-text">${step.explanation}</p>
        <button id="btn-mission-next" class="btn btn-primary btn-large btn-mission-next" data-target-id="btn-mission-next">
          ${this.currentStepIndex + 1 < totalSteps ? 'Next Step →' : 'Complete Mission 🎉'}
        </button>
      </div>
    `;

    this.cardEl.innerHTML = contentHtml;
    this.bindStepButtons(step);
  }

  private bindStepButtons(step: MissionStep): void {
    // Close button
    const closeBtn = document.getElementById('btn-mission-close') as HTMLButtonElement;
    if (closeBtn) {
      this.buttons.register('btn-mission-close', closeBtn);
      closeBtn.onclick = () => this.closeMission();
    }

    // Next step button
    const nextBtn = document.getElementById('btn-mission-next') as HTMLButtonElement;
    if (nextBtn) {
      this.buttons.register('btn-mission-next', nextBtn);
      nextBtn.onclick = () => this.nextStep();
    }

    // Option buttons
    this.optionBtnIds = [];
    if (step.options) {
      step.options.forEach((_, idx) => {
        const btnId = `btn-opt-${idx}`;
        const btn = document.getElementById(btnId) as HTMLButtonElement;
        if (btn) {
          this.optionBtnIds.push(btnId);
          this.buttons.register(btnId, btn);
          btn.onclick = () => this.handleOptionChosen(idx, step);
        }
      });
    }
  }

  private handleOptionChosen(chosenIdx: number, step: MissionStep): void {
    const isCorrect = chosenIdx === step.correctAnswer;
    const correctIdx = typeof step.correctAnswer === 'number' ? step.correctAnswer : 0;

    // Apply styles to options
    this.optionBtnIds.forEach((id, idx) => {
      const btn = document.getElementById(id);
      if (!btn) return;
      btn.setAttribute('disabled', 'true');
      if (idx === correctIdx) {
        btn.classList.add('opt-correct');
      } else if (idx === chosenIdx && !isCorrect) {
        btn.classList.add('opt-wrong');
      }
    });

    if (isCorrect) {
      this.progress.recordQuizScore(step.id, 100);
    }

    // Reveal explanation card
    const exp = document.getElementById('mission-explanation');
    if (exp) exp.hidden = false;
  }

  private measureRevealed = false;
  private revealMeasureSuccess(step: MissionStep): void {
    if (this.measureRevealed) return;
    this.measureRevealed = true;

    const statusEl = document.getElementById('measure-status');
    if (statusEl) {
      statusEl.classList.add('measure-success');
      statusEl.innerHTML = `<span>✓ Target Stretched! Great hand control.</span>`;
    }

    const exp = document.getElementById('mission-explanation');
    if (exp) {
      exp.hidden = false;
      const expText = document.getElementById('explanation-text');
      if (expText) expText.textContent = step.explanation;
    }
  }

  private nextStep(): void {
    this.measureRevealed = false;
    this.currentStepIndex++;
    if (this.activeMission) {
      this.progress.setCurrent(this.activeMission.id, this.currentStepIndex);
      if (this.currentStepIndex >= this.activeMission.steps.length) {
        this.progress.markMissionCompleted(this.activeMission.id);
        this.renderCompletion();
      } else {
        this.renderCurrentStep();
      }
    }
  }

  private renderCompletion(): void {
    if (!this.activeMission) return;
    const nextMissionIdx = ALL_MISSIONS.findIndex((m) => m.id === this.activeMission?.id) + 1;
    const nextMission = ALL_MISSIONS[nextMissionIdx];

    this.cardEl.innerHTML = `
      <div class="mission-completion-card">
        <div class="completion-icon">🏆</div>
        <h3>Mission Completed!</h3>
        <p class="completion-desc">
          You mastered <strong>${this.activeMission.title}</strong> aligned with NCERT chemistry.
        </p>
        <div class="completion-actions">
          <button id="btn-mission-all" class="btn btn-secondary btn-large" data-target-id="btn-mission-all">
            All Missions 📋
          </button>
          ${
            nextMission
              ? `<button id="btn-mission-continue" class="btn btn-primary btn-large" data-target-id="btn-mission-continue">
                  Next Mission: ${nextMission.title.split('—')[0]} →
                </button>`
              : `<button id="btn-mission-continue" class="btn btn-primary btn-large" data-target-id="btn-mission-continue">
                  Back to Free Explore 🧬
                </button>`
          }
        </div>
      </div>
    `;

    const allBtn = document.getElementById('btn-mission-all') as HTMLButtonElement;
    const contBtn = document.getElementById('btn-mission-continue') as HTMLButtonElement;

    if (allBtn) {
      this.buttons.register('btn-mission-all', allBtn);
      allBtn.onclick = () => {
        this.closeMission();
        this.onOpenSelector?.();
      };
    }

    if (contBtn) {
      this.buttons.register('btn-mission-continue', contBtn);
      contBtn.onclick = () => {
        if (nextMission) {
          this.startMission(nextMission.id);
        } else {
          this.closeMission();
          this.onMissionFinished?.();
        }
      };
    }
  }
}
