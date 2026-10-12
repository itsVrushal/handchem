/**
 * oneEuroFilter.test.ts
 * Unit tests for the 1€ filter, OneEuroFilter3D, and LandmarkFilter.
 */

import { describe, it, expect } from 'vitest';
import { OneEuroFilter, OneEuroFilter3D, LandmarkFilter } from '../src/gesture/oneEuroFilter';

// ── Scalar filter ─────────────────────────────────────────────────

describe('OneEuroFilter – scalar', () => {
  it('returns the first value unchanged', () => {
    const f = new OneEuroFilter();
    expect(f.filter(0.5, 0)).toBe(0.5);
  });

  it('returns the second value on second call (still needs history)', () => {
    const f = new OneEuroFilter();
    f.filter(0.5, 0);
    const out = f.filter(0.5, 16); // same value → should still be ~0.5
    expect(out).toBeCloseTo(0.5, 3);
  });

  it('smooths a constant noisy signal (output variance < input variance)', () => {
    const f = new OneEuroFilter({ minCutoff: 1.0, beta: 0.007 });
    const noiseAmplitude = 0.05;
    const inputValues: number[] = [];
    const outputValues: number[] = [];

    for (let i = 0; i < 100; i++) {
      const t = i * 16; // ms
      const noise = (Math.random() * 2 - 1) * noiseAmplitude;
      const x = 0.5 + noise;
      inputValues.push(x);
      outputValues.push(f.filter(x, t));
    }

    const variance = (arr: number[]) => {
      const mean = arr.reduce((s, v) => s + v, 0) / arr.length;
      return arr.reduce((s, v) => s + (v - mean) ** 2, 0) / arr.length;
    };

    expect(variance(outputValues)).toBeLessThan(variance(inputValues));
  });

  it('responds to a step change within 10 frames', () => {
    const f = new OneEuroFilter({ minCutoff: 1.0, beta: 0.1 }); // high beta → responsive
    // Stabilise at 0
    for (let i = 0; i < 30; i++) f.filter(0, i * 16);
    // Step to 1
    let last = 0;
    for (let i = 0; i < 10; i++) last = f.filter(1, (30 + i) * 16);
    expect(last).toBeGreaterThan(0.5);
  });

  it('resets state correctly', () => {
    const f = new OneEuroFilter();
    f.filter(0.5, 0);
    f.filter(0.8, 16);
    f.reset();
    const out = f.filter(0.3, 32); // after reset, first value returned as-is
    expect(out).toBe(0.3);
  });

  it('applies updateConfig immediately', () => {
    const f = new OneEuroFilter({ beta: 0.0 });
    // Stabilise at 0
    for (let i = 0; i < 30; i++) f.filter(0, i * 16);
    // High beta → now responsive to fast motion
    f.updateConfig({ beta: 1.0 });
    let out = 0;
    for (let i = 0; i < 5; i++) out = f.filter(1, (30 + i) * 16);
    // Should move significantly toward 1
    expect(out).toBeGreaterThan(0.4);
  });

  it('handles zero time delta gracefully (no NaN)', () => {
    const f = new OneEuroFilter();
    f.filter(0.5, 0);
    const out = f.filter(0.6, 0); // same timestamp
    expect(Number.isFinite(out)).toBe(true);
  });
});

// ── 3D filter ─────────────────────────────────────────────────────

describe('OneEuroFilter3D', () => {
  it('returns first values unchanged', () => {
    const f = new OneEuroFilter3D();
    const [x, y, z] = f.filter(0.1, 0.2, 0.3, 0);
    expect(x).toBe(0.1);
    expect(y).toBe(0.2);
    expect(z).toBe(0.3);
  });

  it('smooths each axis independently', () => {
    const f = new OneEuroFilter3D({ minCutoff: 1.0, beta: 0.007 });
    let x = 0, y = 0, z = 0;
    for (let i = 0; i < 30; i++) {
      [x, y, z] = f.filter(
        0.5 + (Math.random() - 0.5) * 0.1,
        0.5 + (Math.random() - 0.5) * 0.1,
        0 + (Math.random() - 0.5) * 0.05,
        i * 16,
      );
    }
    expect(x).toBeGreaterThan(0.3);
    expect(x).toBeLessThan(0.7);
    expect(y).toBeGreaterThan(0.3);
    expect(y).toBeLessThan(0.7);
    expect(z).toBeGreaterThan(-0.2);
    expect(z).toBeLessThan(0.2);
  });

  it('resets all axes', () => {
    const f = new OneEuroFilter3D();
    f.filter(0.9, 0.9, 0.9, 0);
    f.filter(0.8, 0.8, 0.8, 16);
    f.reset();
    const [rx, ry, rz] = f.filter(0.1, 0.2, 0.3, 32);
    expect(rx).toBe(0.1);
    expect(ry).toBe(0.2);
    expect(rz).toBe(0.3);
  });
});

// ── LandmarkFilter ────────────────────────────────────────────────

describe('LandmarkFilter', () => {
  const makeLMs = (n = 21, val = 0.5) =>
    Array.from({ length: n }, () => ({ x: val, y: val, z: 0 }));

  it('returns the first frame unchanged', () => {
    const f = new LandmarkFilter(21);
    const out = f.filter(makeLMs(), 0);
    expect(out[0]!.x).toBe(0.5);
    expect(out[8]!.y).toBe(0.5);
  });

  it('smooths noisy landmarks', () => {
    const f = new LandmarkFilter(21, { minCutoff: 1.0, beta: 0.007 });
    let lastX = 0;
    for (let i = 0; i < 40; i++) {
      const noisy = makeLMs().map(() => ({
        x: 0.5 + (Math.random() - 0.5) * 0.1,
        y: 0.5,
        z: 0,
      }));
      const out = f.filter(noisy, i * 16);
      lastX = out[0]!.x;
    }
    // After many frames the filtered value should be close to the mean (0.5)
    expect(Math.abs(lastX - 0.5)).toBeLessThan(0.08);
  });

  it('handles fewer landmarks than expected without throwing', () => {
    const f = new LandmarkFilter(21);
    // Provide only 5 landmarks (partial hand)
    const partial = makeLMs(5);
    expect(() => f.filter(partial, 0)).not.toThrow();
  });
});
