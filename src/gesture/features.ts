/**
 * features.ts
 * Extracts hand features from a filtered landmark list.
 * No DOM, Three.js, or MediaPipe dependencies – unit-testable.
 *
 * Landmark index conventions (MediaPipe):
 *   4  = thumb tip
 *   5  = index MCP  (knuckle)
 *   8  = index tip  (cursor)
 *   17 = pinky MCP  (knuckle)
 */

export interface Landmark {
  x: number; // 0–1, normalised image width
  y: number; // 0–1, normalised image height
  z: number; // depth relative to wrist (same scale as x/y)
}

export type LandmarkList = Landmark[];

export interface HandFeatures {
  /** Distance between LM5 and LM17 – proxy for physical palm size. */
  palmWidth: number;
  /** Euclidean distance between thumb tip (LM4) and index tip (LM8). */
  pinchDistance: number;
  /** pinchDistance / palmWidth  (dimensionless, works at any camera distance). */
  pinchRatio: number;
  /** Index fingertip x – already mirrored so moving right → higher value. */
  cursorX: number;
  /** Index fingertip y (no mirroring – down is larger). */
  cursorY: number;
  /** Mirrored index tip for downstream use. */
  indexTip: Landmark;
  /** Mirrored thumb tip for downstream use. */
  thumbTip: Landmark;
}

export function dist3D(a: Landmark, b: Landmark): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

export function extractFeatures(landmarks: LandmarkList): HandFeatures {
  // Validate we have the required landmark indices
  const lm4 = landmarks[4] ?? { x: 0, y: 0, z: 0 };
  const lm5 = landmarks[5] ?? { x: 0, y: 0, z: 0 };
  const lm8 = landmarks[8] ?? { x: 0, y: 0, z: 0 };
  const lm17 = landmarks[17] ?? { x: 0, y: 0, z: 0 };

  const palmWidth = dist3D(lm5, lm17);
  const pinchDistance = dist3D(lm4, lm8);
  // Guard against degenerate (zero palm) readings
  const pinchRatio = palmWidth > 1e-4 ? pinchDistance / palmWidth : 1.0;

  // Mirror x: MediaPipe x=0 is camera left → on screen that is user's right.
  // After mirroring, moving the hand right increases cursorX. ✓
  return {
    palmWidth,
    pinchDistance,
    pinchRatio,
    cursorX: 1 - lm8.x,
    cursorY: lm8.y,
    indexTip: { x: 1 - lm8.x, y: lm8.y, z: lm8.z },
    thumbTip: { x: 1 - lm4.x, y: lm4.y, z: lm4.z },
  };
}
