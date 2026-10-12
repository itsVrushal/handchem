/**
 * hud.ts
 * Chemistry Heads-Up Display (HUD) component.
 * Displays:
 * - Active molecule identity, formula, geometry, molar mass
 * - Real-time bond length (Å) and strain percentage
 * - Real-time VSEPR bond angle (°) readout
 */

import type { MoleculeData } from '../chem/types';
import { calculateMolarMass } from '../chem/elements';

export class ChemHUD {
  private container: HTMLElement;
  private nameEl: HTMLElement;
  private formulaEl: HTMLElement;
  private massEl: HTMLElement;
  private geomEl: HTMLElement;
  private ncertEl: HTMLElement;
  private notesEl: HTMLElement;
  private bondReadoutEl: HTMLElement;
  private angleReadoutEl: HTMLElement;

  constructor(containerId: string) {
    this.container = document.getElementById(containerId)!;

    this.nameEl = this.container.querySelector('#hud-name')!;
    this.formulaEl = this.container.querySelector('#hud-formula')!;
    this.massEl = this.container.querySelector('#hud-mass')!;
    this.geomEl = this.container.querySelector('#hud-geometry')!;
    this.ncertEl = this.container.querySelector('#hud-ncert')!;
    this.notesEl = this.container.querySelector('#hud-notes')!;
    this.bondReadoutEl = this.container.querySelector('#hud-bond-readout')!;
    this.angleReadoutEl = this.container.querySelector('#hud-angle-readout')!;
  }

  public setMolecule(molecule: MoleculeData): void {
    const mass = calculateMolarMass(molecule.atoms);

    this.nameEl.textContent = molecule.name;
    this.formulaEl.textContent = molecule.formula;
    this.massEl.textContent = `${mass.toFixed(2)} g/mol`;
    this.geomEl.textContent = molecule.geometry;
    this.ncertEl.textContent = molecule.ncertRef || 'NCERT Class 9-11';
    this.notesEl.textContent = molecule.notes;

    // Reset readouts
    this.updateBondReadout(null);
    this.updateAngleReadout(null);
  }

  public updateBondReadout(data: { current: number; rest: number } | null): void {
    if (!data) {
      this.bondReadoutEl.innerHTML = `<span class="hud-label">Bond Length:</span> <span class="hud-value">—</span>`;
      return;
    }
    const diff = data.current - data.rest;
    const pct = (diff / data.rest) * 100;
    const sign = pct >= 0 ? '+' : '';
    const colorClass = Math.abs(pct) > 15 ? 'hud-strain-high' : Math.abs(pct) > 5 ? 'hud-strain-med' : 'hud-strain-low';

    this.bondReadoutEl.innerHTML = `
      <span class="hud-label">Bond Length:</span> 
      <strong class="hud-value ${colorClass}">${data.current.toFixed(2)} Å</strong>
      <span class="hud-sub">(Rest: ${data.rest.toFixed(2)} Å, ${sign}${pct.toFixed(0)}%)</span>
    `;
  }

  public updateAngleReadout(data: { current: number; target: number } | null): void {
    if (!data) {
      this.angleReadoutEl.innerHTML = `<span class="hud-label">Bond Angle:</span> <span class="hud-value">—</span>`;
      return;
    }
    const diff = data.current - data.target;
    const sign = diff >= 0 ? '+' : '';

    this.angleReadoutEl.innerHTML = `
      <span class="hud-label">Bond Angle:</span> 
      <strong class="hud-value">${data.current.toFixed(1)}°</strong>
      <span class="hud-sub">(VSEPR: ${data.target.toFixed(1)}°, ${sign}${diff.toFixed(1)}°)</span>
    `;
  }
}
