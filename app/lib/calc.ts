// app/lib/calc.ts
export type Orientation = 'N'|'NE'|'E'|'SE'|'S'|'SW'|'W'|'NW';
export type Adjacent = 'Exterior'|'Interior (Heated)'|'Interior (Unheated)'|'Ground';
export type OpeningKind = 'window'|'door'|'roof_window';

export interface Opening { id:string; kind:OpeningKind; width:number; height:number; uValue?: number|''; }
export interface Wall { id:string; name:string; orientation:Orientation; adjacent:Adjacent; width:number; height:number; uValue?:number|''; openings:Opening[]; }
export interface FloorEl { id:string; name:string; adjacent:Adjacent; width:number; height:number; uValue?:number|''; }
export interface CeilingEl { id:string; name:string; type:'Ceiling'|'Roof'; adjacent:Exclude<Adjacent,'Ground'>; width:number; height:number; uValue?:number|''; openings:Opening[]; }
export interface VentDevice { id:string; type:'trickle_vent'|'mvhr_supply'|'mvhr_extract'|'mechanical_extract'|'passive_vent'; overrideFlow?:number|''; notes?:string; }

export interface RoomModel {
  id?:string; zoneId?:string; name:string;
  length:number; width:number; height:number;
  volumeOverride?: number|''|null;
  walls: Wall[]; floors: FloorEl[]; ceilings: CeilingEl[]; ventilation: VentDevice[];
}

export const defaultVentFlows_lps: Record<VentDevice['type'], number> = {
  trickle_vent: 5, mvhr_supply: 8, mvhr_extract: 13, mechanical_extract: 8, passive_vent: 5,
};

const defaultOpeningU: Record<OpeningKind, number> = { window: 1.3, roof_window: 1.4, door: 1.8 };

export function area_m2(w?: number, h?: number) {
  const ww = Number(w) || 0; const hh = Number(h) || 0;
  return Math.max(ww * hh, 0);
}
export const dT = (indoorC: number, outdoorC: number) => (Number(indoorC) || 0) - (Number(outdoorC) || 0);

export const adjFactor = (adjacent: Adjacent): number => {
  switch (adjacent) {
    case 'Exterior': return 1;
    case 'Interior (Heated)': return 0;
    case 'Interior (Unheated)': return 0.5;
    case 'Ground': return 1;
    default: return 1;
  }
};

export interface CalcInputs {
  room: RoomModel;
  indoorC: number;
  outdoorC: number;
  volumeM3?: number;
}

export interface RoomLossBreakdown {
  qTransmission_W: number;
  qVent_W: number;
  qTotal_W: number;
  qWalls_W: number;
  qFloors_W: number;
  qCeilings_W: number;
  qOpenings_W: number;
  ach: number;
  flow_m3h: number;
}

export function computeRoomLoss({ room, indoorC, outdoorC, volumeM3 }: CalcInputs): RoomLossBreakdown {
  const delta = dT(indoorC, outdoorC);
  const vol = typeof room.volumeOverride === 'number'
    ? room.volumeOverride
    : (typeof volumeM3 === 'number' ? volumeM3 : (room.length || 0) * (room.width || 0) * (room.height || 0));

  let qWalls = 0, qOpenings = 0, qFloors = 0, qCeilings = 0;

  for (const w of room.walls || []) {
    const gross = area_m2(w.width, w.height);
    const openings = (w.openings || []).reduce((s,o) => s + area_m2(o.width, o.height), 0);
    const net = Math.max(gross - openings, 0);
    const uWall = (typeof w.uValue === 'number' ? w.uValue : 0);
    qWalls += uWall * net * delta * adjFactor(w.adjacent);

    for (const o of w.openings || []) {
      const uo = (typeof o.uValue === 'number' ? o.uValue : defaultOpeningU[o.kind]);
      const a = area_m2(o.width, o.height);
      qOpenings += uo * a * delta * adjFactor(w.adjacent);
    }
  }

  for (const f of room.floors || []) {
    const uf = (typeof f.uValue === 'number' ? f.uValue : 0);
    qFloors += uf * area_m2(f.width, f.height) * delta * adjFactor(f.adjacent);
  }

  for (const c of room.ceilings || []) {
    const gross = area_m2(c.width, c.height);
    const openings = (c.openings || []).reduce((s,o) => s + area_m2(o.width, o.height), 0);
    const net = Math.max(gross - openings, 0);
    const uc = (typeof c.uValue === 'number' ? c.uValue : 0);
    qCeilings += uc * net * delta * adjFactor(c.adjacent);
    for (const o of c.openings || []) {
      const uo = (typeof o.uValue === 'number' ? o.uValue : defaultOpeningU[o.kind]);
      const a = area_m2(o.width, o.height);
      qOpenings += uo * a * delta * adjFactor(c.adjacent);
    }
  }

  const qTrans = qWalls + qFloors + qCeilings + qOpenings;

  const total_lps = (room.ventilation || []).reduce((s, v) => {
    const val = typeof v.overrideFlow === 'number' ? v.overrideFlow : defaultVentFlows_lps[v.type];
    return s + (Number(val) || 0);
  }, 0);
  const flow_m3h = total_lps * 3.6;
  const qVent = 0.33 * flow_m3h * ((delta));
  const ach = vol > 0 ? (flow_m3h / vol) : 0;

  return {
    qTransmission_W: qTrans,
    qVent_W: qVent,
    qTotal_W: qTrans + qVent,
    qWalls_W: qWalls,
    qFloors_W: qFloors,
    qCeilings_W: qCeilings,
    qOpenings_W: qOpenings,
    ach, flow_m3h,
  };
}
