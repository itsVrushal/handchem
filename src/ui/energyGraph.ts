/**
 * energyGraph.ts
 * Real-time 2D Canvas plot for the Harmonic/Morse bond potential well:
 * V(r) = 0.5 * k * (r - r0)^2
 * Displays the potential curve and a glowing marker indicating current bond strain.
 */

import { generateEnergyCurve } from '../chem/energy';

export class EnergyGraph {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private r0 = 1.0;
  private currentR = 1.0;
  private curvePoints: { r: number; energy: number }[] = [];

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    this.setRestLength(1.0);
  }

  public setRestLength(r0: number): void {
    this.r0 = r0;
    this.currentR = r0;
    this.curvePoints = generateEnergyCurve(r0, Math.max(0.3, r0 * 0.5), r0 * 1.6, 40);
    this.render();
  }

  public setCurrentLength(r: number): void {
    this.currentR = r;
    this.render();
  }

  public render(): void {
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;

    ctx.clearRect(0, 0, w, h);

    if (this.curvePoints.length === 0) return;

    const rMin = this.curvePoints[0]!.r;
    const rMax = this.curvePoints[this.curvePoints.length - 1]!.r;
    const maxEnergy = Math.max(...this.curvePoints.map((p) => p.energy), 1.0);

    const padX = 20;
    const padY = 16;
    const plotW = w - padX * 2;
    const plotH = h - padY * 2;

    const toScreenX = (r: number) => padX + ((r - rMin) / (rMax - rMin)) * plotW;
    const toScreenY = (e: number) => h - padY - (e / maxEnergy) * plotH;

    // 1. Draw subtle grid baseline
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padX, h - padY);
    ctx.lineTo(w - padX, h - padY);
    ctx.stroke();

    // Equilibrium vertical line
    const eqX = toScreenX(this.r0);
    ctx.strokeStyle = 'rgba(0, 240, 255, 0.35)';
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(eqX, padY);
    ctx.lineTo(eqX, h - padY);
    ctx.stroke();
    ctx.setLineDash([]);

    // 2. Draw Potential Energy Well Curve (Stark Arc Cyan)
    ctx.strokeStyle = '#00f0ff';
    ctx.lineWidth = 2.5;
    ctx.shadowColor = 'rgba(0, 240, 255, 0.6)';
    ctx.shadowBlur = 8;
    ctx.beginPath();
    for (let i = 0; i < this.curvePoints.length; i++) {
      const pt = this.curvePoints[i]!;
      const sx = toScreenX(pt.r);
      const sy = toScreenY(pt.energy);
      if (i === 0) ctx.moveTo(sx, sy);
      else ctx.lineTo(sx, sy);
    }
    ctx.stroke();
    ctx.shadowBlur = 0;

    // 3. Draw Current State Marker
    const curDelta = this.currentR - this.r0;
    const curEnergy = 0.5 * 15.0 * curDelta * curDelta;
    const curX = Math.max(padX, Math.min(w - padX, toScreenX(this.currentR)));
    const curY = Math.max(padY, Math.min(h - padY, toScreenY(curEnergy)));

    // Outer glow ring
    ctx.fillStyle = Math.abs(curDelta) > 0.15 ? '#ff2a5f' : '#00ff88';
    ctx.beginPath();
    ctx.arc(curX, curY, 6, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(curX, curY, 6, 0, Math.PI * 2);
    ctx.stroke();

    // Label
    ctx.fillStyle = '#e6f7ff';
    ctx.font = '11px "Share Tech Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText(`${this.currentR.toFixed(2)} Å`, curX, curY - 10);
  }
}
