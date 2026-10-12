/**
 * features.ts
 * Extracts hand features from a filtered landmark list:
 * - Pinch ratio (thumb to index tip distance normalised by palm width)
 * - Closed fist ratio (finger curl distances normalised by palm width)
 * - Palm width (distance between index MCP and pinky MCP)
 * - Mirrored cursor coordinates
 *
 * Landmark index conventions (MediaPipe):
 *   0  = wrist
 *   4  = thumb tip
 *   5  = index MCP  (knuckle)
 *   8  = index tip  (cursor)
 *   9  = middle MCP
 *   12 = middle tip
 *   13 = ring MCP
 *   16 = ring tip
 *   17 = pinky MCP  (knuckle)
 *   20 = pinky tip
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
  /** pinchDistance / palmWidth (dimensionless, works at any camera distance). */
  pinchRatio: number;
  /**
   * Closed fist ratio: curl distance of index and other fingers / palmWidth.
   * Open palm or pointing: fistRatio >= 0.85
   * Closed fist: fistRatio <= 0.58
   */
  fistRatio: number;
  /** True when hand is curled into a closed fist. */
  isFist: boolean;
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
  // Validate required landmark indices
  const lm4 = landmarks[4] ?? { x: 0, y: 0, z: 0 };
  const lm5 = landmarks[5] ?? { x: 0, y: 0, z: 0 };
  const lm8 = landmarks[8] ?? { x: 0, y: 0, z: 0 };
  const lm9 = landmarks[9] ?? { x: 0, y: 0, z: 0 };
  const lm12 = landmarks[12] ?? { x: 0, y: 0, z: 0 };
  const lm13 = landmarks[13] ?? { x: 0, y: 0, z: 0 };
  const lm16 = landmarks[16] ?? { x: 0, y: 0, z: 0 };
  const lm17 = landmarks[17] ?? { x: 0, y: 0, z: 0 };
  const lm20 = landmarks[20] ?? { x: 0, y: 0, z: 0 };

  const palmWidth = dist3D(lm5, lm17);
  const pinchDistance = dist3D(lm4, lm8);
  const pinchRatio = palmWidth > 1e-4 ? pinchDistance / palmWidth : 1.0;

  // Closed fist metric: calculate curl distances from fingertips to MCP bases
  const d8_5 = dist3D(lm8, lm5); // index curl
  const d12_9 = dist3D(lm12, lm9); // middle curl
  const d16_13 = dist3D(lm16, lm13); // ring curl
  const d20_17 = dist3D(lm20, lm17); // pinky curl

  const otherFingersAvg = (d12_9 + d16_13 + d20_17) / 3;
  // If pointing (index extended), d8_5 is high so maxCurl stays high (not a fist)
  const maxCurl = Math.max(d8_5, otherFingersAvg);
  const fistRatio = palmWidth > 1e-4 ? maxCurl / palmWidth : 1.0;
  const isFist = fistRatio < 0.60;

  // Mirror x: MediaPipe x=0 is camera left → on screen that is user's right.
  return {
    palmWidth,
    pinchDistance,
    pinchRatio,
    fistRatio,
    isFist,
    cursorX: 1 - lm8.x,
    cursorY: lm8.y,
    indexTip: { x: 1 - lm8.x, y: lm8.y, z: lm8.z },
    thumbTip: { x: 1 - lm4.x, y: lm4.y, z: lm4.z },
  };
}
