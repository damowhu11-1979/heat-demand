// app/lib/heat/aggregate.ts

import { equivalentUWithoutGeometry } from './ground';

// Minimal shapes needed for the known-U path.
// (Keep your real types elsewhere; these are just to make this module self-contained.)
export type WallKnownU = {
  category: 'Known U-Value';
  uValue: number;
  knownUGroundContact?: boolean; // from Elements UI
  area?: number;                 // m² (optional until /room-elements provides it)
};

export type FloorKnownU = {
  category: 'known-u';
  construction: 'solid' | 'suspended';
  uValue: number;
  groundContactAdjust?: boolean; // from Elements UI
  area?: number;                 // m²
};

// --- Public helpers you can call from your existing loops ---

export function uForWallKnownU(w: WallKnownU): number {
  const out = equivalentUWithoutGeometry({
    kind: 'wall',
    uKnown: w.uValue,
    area: w.area ?? 1, // placeholder until geometry flows in
    includesGround: !!w.knownUGroundContact,
  });
  return out.uEq;
}

export function uForFloorKnownU(f: FloorKnownU): number {
  // Suspended floors: treat as not ground-contact (pass-through = true)
  const includes = f.construction === 'solid' ? !!f.groundContactAdjust : true;
  const out = equivalentUWithoutGeometry({
    kind: 'floor',
    uKnown: f.uValue,
    area: f.area ?? 1,
    includesGround: includes,
  });
  return out.uEq;
}

/**
 * Example integration (pseudo):
 *
 * for (const elem of elements) {
 *   if (elem.kind === 'wall' && elem.category === 'Known U-Value') {
 *     const u = uForWallKnownU(elem);
 *     totalH += u * elem.area;
 *     continue;
 *   }
 *   if (elem.kind === 'floor' && elem.category === 'known-u') {
 *     const u = uForFloorKnownU(elem);
 *     totalH += u * elem.area;
 *     continue;
 *   }
 *   // ... existing calculation for other categories ...
 * }
 */
