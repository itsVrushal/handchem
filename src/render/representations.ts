/**
 * representations.ts
 * Geometry configuration and radii scaling for Ball-and-Stick vs Space-Filling models.
 */

import type { RepresentationMode } from '../chem/types';
import { ELEMENTS } from '../chem/elements';
import type { ElementSymbol } from '../chem/types';

export interface RenderRadii {
  atomRadius: number; // in world coordinates / Å
  bondRadius: number;
}

export function getAtomRenderRadius(element: ElementSymbol, mode: RepresentationMode): number {
  const info = ELEMENTS[element] ?? ELEMENTS.C;
  if (mode === 'spaceFilling') {
    return info.vdwRadius * 0.85;
  }
  // ballAndStick
  return Math.max(0.22, info.covalentRadius * 0.45);
}

export function getBondRenderRadius(mode: RepresentationMode): number {
  if (mode === 'spaceFilling') {
    return 0.001; // hidden inside atoms
  }
  return 0.055; // 0.055 Ångströms radius for sleek ball-and-stick
}
