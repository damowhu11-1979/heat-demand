// app/lib/calc.ts
import type { RoomModel, Adjacent, OpeningKind } from './types-local';
import { getBaseVentRate_lps, AgeBand, RoomType } from './vent-rates';

export interface CalcInputs {
  room: RoomModel;
  indoorC: number;
  outdoorC: number;
  volumeM3?: number;
  ageBand: AgeBand;
  roomType: RoomType;
  policy?: 'max' | 'sum';
}

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
  flowBase_lps: number;
  flowDevices_lps: number;
}

export function computeRoomLoss(input: CalcInputs): RoomLossBreakdown {
  const { room, indoorC, outdoorC, volumeM3, ageBand, roomType } = input;
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

  const base_lps = getBaseVentRate_lps(ageBand, roomType);

  const device_lps = (room.ventilation || []).reduce((s, v) => {
    const val = typeof v.overrideFlow === 'number' ? v.overrideFlow : 0;
    return s + (Number(val) || 0);
  }, 0);

  const policy = input.policy ?? 'max';
  const effective_lps = policy === 'sum' ? (base_lps + device_lps) : Math.max(base_lps, device_lps);

  const flow_m3h = effective_lps * 3.6;
  const qVent = 0.33 * flow_m3h * delta;
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
    flowBase_lps: base_lps,
    flowDevices_lps: device_lps,
  };
}
