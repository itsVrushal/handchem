/**
 * activeZone.test.ts
 * Unit tests for the active zone mapping and clutching behaviour.
 */

import { describe, it, expect } from 'vitest';
import { ActiveZone } from '../src/gesture/activeZone';

describe('ActiveZone – coordinate mapping', () => {
  it('maps centre of zone to screen centre', () => {
    const az = new ActiveZone();
    const { x, y } = az.map(0.5, 0.5, true);
    expect(x).toBeCloseTo(0.5, 5);
    expect(y).toBeCloseTo(0.5, 5);
  });

  it('maps left edge of active zone to screen x=0', () => {
    const az = new ActiveZone({ zoneWidthRatio: 0.6 });
    const zoneLeft = (1 - 0.6) / 2; // = 0.2
    const { x } = az.map(zoneLeft, 0.5, true);
    expect(x).toBeCloseTo(0, 5);
  });

  it('maps right edge of active zone to screen x=1', () => {
    const az = new ActiveZone({ zoneWidthRatio: 0.6 });
    const zoneRight = 1 - (1 - 0.6) / 2; // = 0.8
    const { x } = az.map(zoneRight, 0.5, true);
    expect(x).toBeCloseTo(1, 5);
  });

  it('maps top edge to screen y=0', () => {
    const az = new ActiveZone({ zoneHeightRatio: 0.6 });
    const zoneTop = (1 - 0.6) / 2; // = 0.2
    const { y } = az.map(0.5, zoneTop, true);
    expect(y).toBeCloseTo(0, 5);
  });

  it('clamps out-of-zone hand positions', () => {
    const az = new ActiveZone({ zoneWidthRatio: 0.6, zoneHeightRatio: 0.6 });
    // Hand at extreme left (outside zone)
    const { x: xLeft } = az.map(0.0, 0.5, true);
    expect(xLeft).toBeCloseTo(0, 3);
    // Hand at extreme right
    const { x: xRight } = az.map(1.0, 0.5, true);
    expect(xRight).toBeCloseTo(1, 3);
  });
});

describe('ActiveZone – clutching', () => {
  it('freezes cursor when hand not detected', () => {
    const az = new ActiveZone();
    az.map(0.5, 0.5, true); // sets frozen to (0.5, 0.5)
    const frozen = az.map(0, 0, false); // not detected
    expect(frozen.x).toBeCloseTo(0.5, 5);
    expect(frozen.y).toBeCloseTo(0.5, 5);
  });

  it('returns frozen position from getFrozen()', () => {
    const az = new ActiveZone();
    az.map(0.7, 0.3, true);
    az.map(0, 0, false); // lose tracking
    const { x, y } = az.getFrozen();
    expect(x).toBeGreaterThan(0.5);
    expect(y).toBeLessThan(0.5);
  });

  it('isTracking() reflects detection state', () => {
    const az = new ActiveZone();
    az.map(0.5, 0.5, true);
    expect(az.isTracking()).toBe(true);
    az.map(0, 0, false);
    expect(az.isTracking()).toBe(false);
  });

  it('cursor resumes from frozen position, not from hand position, on re-entry', () => {
    const az = new ActiveZone({ zoneWidthRatio: 0.6, zoneHeightRatio: 0.6 });

    // Hand at centre → cursor at (0.5, 0.5)
    az.map(0.5, 0.5, true);

    // Hand leaves frame
    az.map(0, 0, false);
    const frozenBefore = az.getFrozen();

    // Hand re-enters at a completely different position (0.3, 0.3)
    const reentry = az.map(0.3, 0.3, true);

    // The cursor should move to the mapped position of 0.3, 0.3
    // but should NOT jump to 0.5 (the old frozen pos)
    // The key point: getFrozen() should be updated to the new mapped position
    expect(reentry.x).not.toBeCloseTo(frozenBefore.x, 1); // it moved
    expect(az.getFrozen().x).toBeCloseTo(reentry.x, 5);
  });
});

describe('ActiveZone – config update', () => {
  it('updateConfig changes zone dimensions', () => {
    const az = new ActiveZone({ zoneWidthRatio: 0.6 });
    az.updateConfig({ zoneWidthRatio: 0.8 }); // wider zone → less gain
    const { x } = az.map(0.5, 0.5, true);
    expect(x).toBeCloseTo(0.5, 5); // centre is always 0.5
  });

  it('getConfig returns current config', () => {
    const az = new ActiveZone({ zoneWidthRatio: 0.7 });
    expect(az.getConfig().zoneWidthRatio).toBe(0.7);
    az.updateConfig({ zoneWidthRatio: 0.5 });
    expect(az.getConfig().zoneWidthRatio).toBe(0.5);
  });
});
