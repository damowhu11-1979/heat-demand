// app/lib/heat/ground.ts

export type GroundElemKind = 'wall' | 'floor';

export interface EqUInput {
  kind: GroundElemKind;
  uKnown: number;           // W/m²K
  area: number;             // m² (kept for future ISO 13370 use)
  includesGround?: boolean; // true => the provided U already includes ground effects
}

export interface EqUOut {
  uEq: number;              // equivalent U to use in transmission calculations
  basis: 'pass-through' | 'default-uplift' | 'iso13370';
  details?: Record<string, unknown>;
}

// Phase-1 default uplifts (no geometry yet)
const DEFAULT_UPLIFT: Record<GroundElemKind, number> = {
  wall: 0.15,  // W/m²K (basement wall typical uplift)
  floor: 0.10, // W/m²K (solid ground floor typical uplift)
};

export function equivalentUWithoutGeometry(input: EqUInput): EqUOut {
  if (input.includesGround) {
    return { uEq: input.uKnown, basis: 'pass-through' };
  }
  const delta = DEFAULT_UPLIFT[input.kind];
  return { uEq: input.uKnown + delta, basis: 'default-uplift', details: { delta } };
}
