/**
 * moleculeSelector.ts
 * Hand-operable molecule switcher allowing students to cycle through
 * all 12 NCERT molecules with large touch/gesture buttons.
 */

import { MOLECULES } from '../content/molecules';
import type { MoleculeData } from '../chem/types';

export class MoleculeSelector {
  private currentIndex = 3; // Start at Water (H2O)
  private onSelectCallback: (molecule: MoleculeData) => void;
  private labelEl: HTMLElement;

  constructor(
    labelId: string,
    prevBtnId: string,
    nextBtnId: string,
    onSelect: (molecule: MoleculeData) => void,
  ) {
    this.labelEl = document.getElementById(labelId)!;
    this.onSelectCallback = onSelect;

    const prevBtn = document.getElementById(prevBtnId);
    const nextBtn = document.getElementById(nextBtnId);

    prevBtn?.addEventListener('click', () => this.previous());
    nextBtn?.addEventListener('click', () => this.next());

    this.updateLabel();
  }

  public getCurrent(): MoleculeData {
    return MOLECULES[this.currentIndex]!;
  }

  public next(): void {
    this.currentIndex = (this.currentIndex + 1) % MOLECULES.length;
    this.update();
  }

  public previous(): void {
    this.currentIndex = (this.currentIndex - 1 + MOLECULES.length) % MOLECULES.length;
    this.update();
  }

  public selectById(id: string): void {
    const idx = MOLECULES.findIndex((m) => m.id.toLowerCase() === id.toLowerCase());
    if (idx !== -1) {
      this.currentIndex = idx;
      this.update();
    }
  }

  private update(): void {
    const mol = this.getCurrent();
    this.updateLabel();
    this.onSelectCallback(mol);
  }

  private updateLabel(): void {
    const mol = this.getCurrent();
    this.labelEl.textContent = `${this.currentIndex + 1}/${MOLECULES.length} • ${mol.name} (${mol.formula})`;
  }
}
