// /lib/heat/ground.ts
export type GroundElemKind = 'wall' | 'floor';


export interface EqUInput {
kind: GroundElemKind;
uKnown: number; // user/stated U (W/m²K)
area: number; // m²
includesGround?: boolean; // true if U already includes ground-contact effects
}


export interface EqUOut {
uEq: number; // equivalent U to use in transmission
basis: 'pass-through' | 'default-uplift' | 'iso13370';
details?: Record<string, unknown>;
}


const DEFAULT_UPLIFT: Record<GroundElemKind, number> = {
wall: 0.15, // W/m²K (basement wall typical uplift)
floor: 0.10, // W/m²K (solid ground floor typical uplift)
};


export function equivalentUWithoutGeometry(input: EqUInput): EqUOut {
// If user marked as already including ground effects, pass-through
if (input.includesGround) return { uEq: input.uKnown, basis: 'pass-through' };


const delta = DEFAULT_UPLIFT[input.kind];
return {
uEq: input.uKnown + delta,
basis: 'default-uplift',
details: { delta },
};
}
