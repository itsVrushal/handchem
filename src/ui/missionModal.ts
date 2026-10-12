/**
 * missionModal.ts
 * Hand-operable NCERT Mission Selector modal:
 * - Displays all 8 NCERT missions as large, gesture-clickable cards
 * - Shows class badges, estimated durations, and completion checkmarks
 * - Fully accessible via dwell, closed fist click, and mouse
 */

import { ALL_MISSIONS } from '../content/missions';
import type { ProgressManager } from '../chem/progress';
import type { ButtonManager } from './buttons';

export class MissionModal {
  private modalEl: HTMLElement;
  private progress: ProgressManager;
  private buttons: ButtonManager;
  onSelectMission?: (missionId: string) => void;

  constructor(progress: ProgressManager, buttons: ButtonManager) {
    this.progress = progress;
    this.buttons = buttons;

    const el = document.getElementById('mission-selector-modal');
    if (!el) throw new Error('#mission-selector-modal not found');
    this.modalEl = el;

    this.render();
  }

  open(): void {
    this.render();
    this.modalEl.hidden = false;
  }

  close(): void {
    this.modalEl.hidden = true;
  }

  toggle(): void {
    if (this.modalEl.hidden) {
      this.open();
    } else {
      this.close();
    }
  }

  private render(): void {
    const completedCount = this.progress.getCompletedCount();
    const totalCount = ALL_MISSIONS.length;

    let cardsHtml = '';
    ALL_MISSIONS.forEach((mission, idx) => {
      const isDone = this.progress.isMissionCompleted(mission.id);
      const cardBtnId = `btn-mission-card-${idx}`;

      cardsHtml += `
        <button id="${cardBtnId}" class="mission-card-btn ${isDone ? 'mission-done' : ''}" data-target-id="${cardBtnId}">
          <div class="mission-card-top">
            <span class="mission-icon-badge">${mission.badge}</span>
            <div class="mission-badges-row">
              <span class="badge-class">Class ${mission.classLevel}</span>
              <span class="badge-time">⏱️ ${mission.estimatedMinutes} min</span>
              ${isDone ? `<span class="badge-complete">✓ Completed</span>` : ''}
            </div>
          </div>
          <h4 class="mission-card-title">${mission.title}</h4>
          <p class="mission-card-desc">${mission.description}</p>
        </button>
      `;
    });

    this.modalEl.innerHTML = `
      <div class="mission-modal-backdrop"></div>
      <div class="mission-modal-dialog">
        <div class="mission-modal-header">
          <div>
            <h2>📚 NCERT Learning Missions</h2>
            <p class="modal-sub">Classes 9–12 Guided Chemistry · Progress: ${completedCount} / ${totalCount} Completed</p>
          </div>
          <button id="btn-close-modal" class="btn btn-icon btn-close-modal" data-target-id="btn-close-modal" title="Close Modal">✕</button>
        </div>

        <div class="mission-grid">
          ${cardsHtml}
        </div>
      </div>
    `;

    // Wire buttons
    const closeBtn = document.getElementById('btn-close-modal') as HTMLButtonElement;
    if (closeBtn) {
      this.buttons.register('btn-close-modal', closeBtn);
      closeBtn.onclick = () => this.close();
    }

    ALL_MISSIONS.forEach((mission, idx) => {
      const cardBtnId = `btn-mission-card-${idx}`;
      const btn = document.getElementById(cardBtnId) as HTMLButtonElement;
      if (btn) {
        this.buttons.register(cardBtnId, btn);
        btn.onclick = () => {
          this.close();
          this.onSelectMission?.(mission.id);
        };
      }
    });
  }
}
