/**
 * oneEuroFilter.ts
 * Implementation of the 1€ filter (Casiez et al. 2012).
 * Reduces jitter when still (low beta) while remaining responsive
 * during fast motion (raised cutoff frequency when speed is high).
 *
 * Reference: https://cristal.univ-lille.fr/~casiez/1euro/
 *
 * This module has NO browser or Three.js dependencies so it can be
 * imported cleanly in unit tests.
 */

export interface OneEuroConfig {
  /** Minimum cutoff frequency in Hz – controls smoothing when still. */
  minCutoff: number;
  /** Speed coefficient – higher = faster response to motion. */
  beta: number;
  /** Cutoff frequency for the derivative (velocity) filter. */
  dCutoff: number;
}

export const DEFAULT_EURO_CONFIG: OneEuroConfig = {
  minCutoff: 1.0,
  beta: 0.007,
  dCutoff: 1.0,
};

/** α = 2π·fc·Te / (2π·fc·Te + 1) */
function euroAlpha(cutoff: number, te: number): number {
  const r = 2 * Math.PI * cutoff * te;
  return r / (r + 1);
}

/** Scalar 1€ filter. */
export class OneEuroFilter {
  private cfg: OneEuroConfig;
  private xPrev: number | null = null;
  private dxFiltered = 0;
  private tPrev: number | null = null; // ms

  constructor(cfg: Partial<OneEuroConfig> = {}) {
    this.cfg = { ...DEFAULT_EURO_CONFIG, ...cfg };
  }

  /** Filter a scalar value. `timestamp` is in milliseconds. */
  filter(x: number, timestamp: number): number {
    if (this.xPrev === null || this.tPrev === null) {
      this.xPrev = x;
      this.tPrev = timestamp;
      return x;
    }

    const te = Math.max((timestamp - this.tPrev) / 1000, 1e-6); // → seconds
    this.tPrev = timestamp;

    // Derivative (velocity)
    const dx = (x - this.xPrev) / te;
    const aD = euroAlpha(this.cfg.dCutoff, te);
    this.dxFiltered = aD * dx + (1 - aD) * this.dxFiltered;

    // Adaptive cutoff
    const cutoff = this.cfg.minCutoff + this.cfg.beta * Math.abs(this.dxFiltered);
    const a = euroAlpha(cutoff, te);
    const xFiltered = a * x + (1 - a) * this.xPrev;
    this.xPrev = xFiltered;

    return xFiltered;
  }

  reset(): void {
    this.xPrev = null;
    this.dxFiltered = 0;
    this.tPrev = null;
  }

  updateConfig(cfg: Partial<OneEuroConfig>): void {
    this.cfg = { ...this.cfg, ...cfg };
  }

  getConfig(): Readonly<OneEuroConfig> {
    return this.cfg;
  }
}

/** Three-axis (x, y, z) 1€ filter for a single landmark. */
export class OneEuroFilter3D {
  private readonly fx: OneEuroFilter;
  private readonly fy: OneEuroFilter;
  private readonly fz: OneEuroFilter;

  constructor(cfg: Partial<OneEuroConfig> = {}) {
    this.fx = new OneEuroFilter(cfg);
    this.fy = new OneEuroFilter(cfg);
    this.fz = new OneEuroFilter(cfg);
  }

  filter(x: number, y: number, z: number, timestamp: number): [number, number, number] {
    return [
      this.fx.filter(x, timestamp),
      this.fy.filter(y, timestamp),
      this.fz.filter(z, timestamp),
    ];
  }

  reset(): void {
    this.fx.reset();
    this.fy.reset();
    this.fz.reset();
  }

  updateConfig(cfg: Partial<OneEuroConfig>): void {
    this.fx.updateConfig(cfg);
    this.fy.updateConfig(cfg);
    this.fz.updateConfig(cfg);
  }
}

/**
 * One 1€ filter3D per landmark – covers all 21 MediaPipe hand landmarks
 * across all three axes (63 scalar filters in total per hand).
 */
export class LandmarkFilter {
  private readonly filters: OneEuroFilter3D[];

  constructor(numLandmarks = 21, cfg: Partial<OneEuroConfig> = {}) {
    this.filters = Array.from({ length: numLandmarks }, () => new OneEuroFilter3D(cfg));
  }

  filter(
    landmarks: ReadonlyArray<{ x: number; y: number; z: number }>,
    timestamp: number,
  ): Array<{ x: number; y: number; z: number }> {
    return landmarks.map((lm, i) => {
      const f = this.filters[i];
      if (!f) return { x: lm.x, y: lm.y, z: lm.z };
      const [fx, fy, fz] = f.filter(lm.x, lm.y, lm.z, timestamp);
      return { x: fx, y: fy, z: fz };
    });
  }

  reset(): void {
    this.filters.forEach((f) => f.reset());
  }

  updateConfig(cfg: Partial<OneEuroConfig>): void {
    this.filters.forEach((f) => f.updateConfig(cfg));
  }
}
