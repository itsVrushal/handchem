/**
 * activeZone.ts
 * Maps the central 60%×60% box of the camera view to the full screen.
 * Implements "clutching": when the hand leaves the frame the cursor
 * freezes, and resumes from the frozen position when it returns –
 * exactly like lifting and repositioning a mouse.
 *
 * All coordinates are normalised to [0, 1].
 */

export interface ActiveZoneConfig {
  /** Fraction of camera width that maps to the full screen width. */
  zoneWidthRatio: number;
  /** Fraction of camera height that maps to the full screen height. */
  zoneHeightRatio: number;
}

export const DEFAULT_AZ_CONFIG: ActiveZoneConfig = {
  zoneWidthRatio: 0.6,
  zoneHeightRatio: 0.6,
};

export class ActiveZone {
  private cfg: ActiveZoneConfig;
  private frozenX = 0.5;
  private frozenY = 0.5;
  private tracking = false;

  constructor(cfg: Partial<ActiveZoneConfig> = {}) {
    this.cfg = { ...DEFAULT_AZ_CONFIG, ...cfg };
  }

  /**
   * @param handX  Normalised camera x, already mirrored (0=left, 1=right).
   * @param handY  Normalised camera y (0=top, 1=bottom).
   * @param detected  Whether a hand is currently in frame.
   * @returns Screen-space x, y in [0, 1].
   */
  map(handX: number, handY: number, detected: boolean): { x: number; y: number } {
    if (!detected) {
      this.tracking = false;
      return { x: this.frozenX, y: this.frozenY };
    }

    this.tracking = true;
    const { zoneWidthRatio: zw, zoneHeightRatio: zh } = this.cfg;
    const zl = (1 - zw) / 2; // zone left edge (normalised)
    const zt = (1 - zh) / 2; // zone top edge (normalised)

    // Clamp hand position to the active zone, then remap to [0, 1]
    const cx = Math.max(zl, Math.min(1 - zl, handX));
    const cy = Math.max(zt, Math.min(1 - zt, handY));
    const sx = (cx - zl) / zw;
    const sy = (cy - zt) / zh;

    this.frozenX = sx;
    this.frozenY = sy;
    return { x: sx, y: sy };
  }

  /** Returns the last screen position regardless of tracking state. */
  getFrozen(): { x: number; y: number } {
    return { x: this.frozenX, y: this.frozenY };
  }

  isTracking(): boolean {
    return this.tracking;
  }

  updateConfig(cfg: Partial<ActiveZoneConfig>): void {
    this.cfg = { ...this.cfg, ...cfg };
  }

  getConfig(): Readonly<ActiveZoneConfig> {
    return this.cfg;
  }
}
