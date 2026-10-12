/**
 * features.test.ts
 * Unit tests for hand feature extraction.
 */

import { describe, it, expect } from 'vitest';
import { extractFeatures, dist3D, type LandmarkList } from '../src/gesture/features';

// Build a synthetic landmark list (21 zeros, then override specific indices)
function makeLMs(overrides: Partial<Record<number, { x: number; y: number; z: number }>> = {}): LandmarkList {
  const lms = Array.from({ length: 21 }, () => ({ x: 0, y: 0, z: 0 }));
  for (const [idx, val] of Object.entries(overrides)) {
    lms[+idx] = val!;
  }
  return lms;
}

describe('dist3D', () => {
  it('returns 0 for identical points', () => {
    expect(dist3D({ x: 0.5, y: 0.5, z: 0 }, { x: 0.5, y: 0.5, z: 0 })).toBe(0);
  });

  it('computes Euclidean distance', () => {
    expect(dist3D({ x: 0, y: 0, z: 0 }, { x: 3, y: 4, z: 0 })).toBeCloseTo(5);
  });

  it('uses z axis', () => {
    expect(dist3D({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 1 })).toBeCloseTo(1);
  });
});

describe('extractFeatures', () => {
  it('mirrors x coordinate of index tip', () => {
    const lms = makeLMs({ 8: { x: 0.3, y: 0.6, z: 0 } });
    const feats = extractFeatures(lms);
    expect(feats.cursorX).toBeCloseTo(0.7, 5); // 1 - 0.3 = 0.7
    expect(feats.cursorY).toBeCloseTo(0.6, 5);
  });

  it('mirrors x of index tip in indexTip field', () => {
    const lms = makeLMs({ 8: { x: 0.25, y: 0.5, z: 0 } });
    const feats = extractFeatures(lms);
    expect(feats.indexTip.x).toBeCloseTo(0.75);
  });

  it('mirrors x of thumb tip', () => {
    const lms = makeLMs({ 4: { x: 0.4, y: 0.5, z: 0 } });
    const feats = extractFeatures(lms);
    expect(feats.thumbTip.x).toBeCloseTo(0.6);
  });

  it('computes pinch ratio correctly', () => {
    // palm width: lm5=(0,0,0), lm17=(0.1,0,0) → palmWidth=0.1
    // pinch: lm4=(0,0,0), lm8=(0.03,0,0) → pinchDistance=0.03
    // ratio = 0.03 / 0.1 = 0.3
    const lms = makeLMs({
      4:  { x: 0, y: 0, z: 0 },
      5:  { x: 0, y: 0, z: 0 },
      8:  { x: 0.03, y: 0, z: 0 },
      17: { x: 0.1,  y: 0, z: 0 },
    });
    const feats = extractFeatures(lms);
    expect(feats.palmWidth).toBeCloseTo(0.1);
    expect(feats.pinchDistance).toBeCloseTo(0.03);
    expect(feats.pinchRatio).toBeCloseTo(0.3, 3);
  });

  it('returns pinchRatio=1 when palmWidth is near zero (no divide-by-zero)', () => {
    const lms = makeLMs(); // all zeros → palmWidth ~0
    const feats = extractFeatures(lms);
    expect(feats.pinchRatio).toBe(1.0);
    expect(feats.fistRatio).toBe(1.0);
    expect(Number.isFinite(feats.pinchRatio)).toBe(true);
    expect(Number.isFinite(feats.fistRatio)).toBe(true);
  });

  it('computes fistRatio correctly for open palm vs closed fist', () => {
    const openHand = makeLMs({
      5:  { x: 0, y: 0, z: 0 },
      8:  { x: 0, y: 0.12, z: 0 },
      9:  { x: 0.03, y: 0, z: 0 },
      12: { x: 0.03, y: 0.12, z: 0 },
      13: { x: 0.06, y: 0, z: 0 },
      16: { x: 0.06, y: 0.12, z: 0 },
      17: { x: 0.1, y: 0, z: 0 },
      20: { x: 0.1, y: 0.12, z: 0 },
    });
    const openFeats = extractFeatures(openHand);
    expect(openFeats.fistRatio).toBeGreaterThan(1.0);
    expect(openFeats.isFist).toBe(false);

    const fistHand = makeLMs({
      5:  { x: 0, y: 0, z: 0 },
      8:  { x: 0, y: 0.03, z: 0 },
      9:  { x: 0.03, y: 0, z: 0 },
      12: { x: 0.03, y: 0.03, z: 0 },
      13: { x: 0.06, y: 0, z: 0 },
      16: { x: 0.06, y: 0.03, z: 0 },
      17: { x: 0.1, y: 0, z: 0 },
      20: { x: 0.1, y: 0.03, z: 0 },
    });
    const fistFeats = extractFeatures(fistHand);
    expect(fistFeats.fistRatio).toBeLessThan(0.5);
    expect(fistFeats.isFist).toBe(true);
  });

  it('does not classify pointing gesture as closed fist', () => {
    const pointingHand = makeLMs({
      5:  { x: 0, y: 0, z: 0 },
      8:  { x: 0, y: 0.12, z: 0 },
      9:  { x: 0.03, y: 0, z: 0 },
      12: { x: 0.03, y: 0.02, z: 0 },
      13: { x: 0.06, y: 0, z: 0 },
      16: { x: 0.06, y: 0.02, z: 0 },
      17: { x: 0.1, y: 0, z: 0 },
      20: { x: 0.1, y: 0.02, z: 0 },
    });
    const feats = extractFeatures(pointingHand);
    expect(feats.fistRatio).toBeGreaterThan(1.0);
    expect(feats.isFist).toBe(false);
  });

  it('handles missing landmarks gracefully', () => {
    // Only provide 5 landmarks (partial detection)
    const partial: LandmarkList = Array.from({ length: 5 }, () => ({ x: 0.5, y: 0.5, z: 0 }));
    expect(() => extractFeatures(partial)).not.toThrow();
  });
});
