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
  /** True when thumb tip and index tip are pinching together. */
  isPinch: boolean;
  /**
   * Closed fist ratio: curl distance of index and other fingers / palmWidth.
   * Open palm or pointing: fistRatio >= 0.85
   * Closed fist: fistRatio <= 0.58
   */
  fistRatio: number;
  /** True when hand is curled into a closed fist. */
  isFist: boolean;
  /** True when single index finger is extended while other fingers are curled (pointing/select gesture). */
  isPointing: boolean;
  /** True when index and middle fingers are extended together (two-finger hover gesture). */
  isTwoFingers: boolean;
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
  const lm0 = landmarks[0] ?? { x: 0, y: 0, z: 0 };
  const lm4 = landmarks[4] ?? { x: 0, y: 0, z: 0 };
  const lm5 = landmarks[5] ?? { x: 0, y: 0, z: 0 };
  const lm6 = landmarks[6] ?? { x: 0, y: 0, z: 0 };
  const lm8 = landmarks[8] ?? { x: 0, y: 0, z: 0 };
  const lm9 = landmarks[9] ?? { x: 0, y: 0, z: 0 };
  const lm10 = landmarks[10] ?? { x: 0, y: 0, z: 0 };
  const lm12 = landmarks[12] ?? { x: 0, y: 0, z: 0 };
  const lm13 = landmarks[13] ?? { x: 0, y: 0, z: 0 };
  const lm14 = landmarks[14] ?? { x: 0, y: 0, z: 0 };
  const lm16 = landmarks[16] ?? { x: 0, y: 0, z: 0 };
  const lm17 = landmarks[17] ?? { x: 0, y: 0, z: 0 };
  const lm18 = landmarks[18] ?? { x: 0, y: 0, z: 0 };
  const lm20 = landmarks[20] ?? { x: 0, y: 0, z: 0 };

  const palmWidth = dist3D(lm5, lm17);
  const pScale = palmWidth > 1e-4 ? palmWidth : 0.1;

  const pinchDistance = dist3D(lm4, lm8);
  const pinchRatio = palmWidth > 1e-4 ? pinchDistance / palmWidth : 1.0;
  const isPinch = pinchRatio < 0.35;

  // Finger curl distances from fingertips to MCP bases normalised by palmWidth:
  const d8_5 = dist3D(lm8, lm5) / pScale; // index curl
  const d12_9 = dist3D(lm12, lm9) / pScale; // middle curl
  const d16_13 = dist3D(lm16, lm13) / pScale; // ring curl
  const d20_17 = dist3D(lm20, lm17) / pScale; // pinky curl

  const otherFingersAvg = (d12_9 + d16_13 + d20_17) / 3;
  // If pointing (index extended), d8_5 is high so maxCurl stays high (not a fist)
  const maxCurl = Math.max(d8_5, otherFingersAvg);
  const fistRatio = palmWidth > 1e-4 ? maxCurl : 1.0;
  const isFist = fistRatio < 0.60;

  // Extension tests:
  // When finger is straight/extended, distance to MCP is large AND tip is farther from wrist than PIP
  const indexExtended = d8_5 > 0.70 && dist3D(lm8, lm0) > dist3D(lm6, lm0);
  const middleExtended = d12_9 > 0.70 && dist3D(lm12, lm0) > dist3D(lm10, lm0);
  const ringCurled = d16_13 < 0.72 || dist3D(lm16, lm0) <= dist3D(lm14, lm0);
  const pinkyCurled = d20_17 < 0.72 || dist3D(lm20, lm0) <= dist3D(lm18, lm0);
  const middleCurled = d12_9 < 0.72 || dist3D(lm12, lm0) <= dist3D(lm10, lm0);

  // Single index finger pointing: index is extended while middle, ring, pinky are curled!
  const isPointing = indexExtended && middleCurled && ringCurled && pinkyCurled && d8_5 - otherFingersAvg > 0.20;

  // Two fingers (index + middle extended, ring + pinky curled):
  const isTwoFingers = indexExtended && middleExtended && ringCurled && pinkyCurled;

  // Cursor coordinates
  let rawCursorX = lm8.x;
  let rawCursorY = lm8.y;

  if (isTwoFingers) {
    // Smooth midpoint between index and middle
    rawCursorX = (lm8.x + lm12.x) / 2;
    rawCursorY = (lm8.y + lm12.y) / 2;
  } else if (isFist) {
    // In closed fist, index MCP knuckle provides stable cursor without jump
    rawCursorX = lm5.x;
    rawCursorY = lm5.y;
  }

  // Mirror x: MediaPipe x=0 is camera left → on screen that is user's right.
  return {
    palmWidth,
    pinchDistance,
    pinchRatio,
    isPinch,
    fistRatio,
    isFist,
    isPointing,
    isTwoFingers,
    cursorX: 1 - rawCursorX,
    cursorY: rawCursorY,
    indexTip: { x: 1 - lm8.x, y: lm8.y, z: lm8.z },
    thumbTip: { x: 1 - lm4.x, y: lm4.y, z: lm4.z },
  };
}
