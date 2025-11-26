'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

import ResultsCard from '../components/ResultsCard';
import { computeRoomLoss } from '../lib/calc';
import type { AgeBand, RoomType } from '../lib/vent-rates';

/* ============================================================================
   Persistence helpers (safe localStorage wrapper)
============================================================================ */
const LS_KEY = 'mcs.room.elements.v2';                // legacy single-room fallback
const LS_BYROOM_KEY = 'mcs.room.elements.byRoom.v1';  // per-room map { [roomId]: RoomModel }
const LS_ROOMS_KEYS = [
  'mcs.Rooms.v2', 'mcs.Rooms.v1', 'mcs.rooms.v2', 'mcs.rooms.v1', 'mcs.rooms', 'rooms.v1'
]; // likely keys from Rooms page

interface SafeStorage {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
  removeItem(k: string): void;
}

// In-memory fallback storage (used when localStorage is unavailable)
const memoryStorage: SafeStorage = (() => {
  const m = new Map<string, string>();
  return {
    getItem: (k) => (m.has(k) ? (m.get(k) as string) : null),
    setItem: (k, v) => { m.set(k, v); },
    removeItem: (k) => { m.delete(k); },
  };
})();

function getStorage(): SafeStorage {
  if (typeof window === 'undefined') return memoryStorage;
  try {
    const s: Storage | undefined | null = (window as any).localStorage ?? null;
    if (!s) return memoryStorage;
    try { const t='__probe__'; s.setItem(t,'1'); s.removeItem(t); } catch { return memoryStorage; }
    return {
      getItem: (k) => { try { const v = s.getItem(k); return typeof v === 'string' ? v : null; } catch { return null; } },
      setItem: (k,v) => { try { s.setItem(k,v); } catch {} },
      removeItem: (k) => { try { s.removeItem(k); } catch {} },
    };
  } catch {
    return memoryStorage;
  }
}

function readJSON<T>(k: string): T | null {
  const s = getStorage();
  try {
    const raw = s.getItem(k);
    if (raw === null || raw === '' || raw === 'null' || raw === 'undefined') return null;
    const parsed = JSON.parse(raw as string);
    return parsed == null ? null : (parsed as T);
  } catch {
    return null;
  }
}
function writeJSON(k: string, v: unknown) {
  const s = getStorage();
  try {
    if (typeof v === 'undefined') { s.removeItem(k); return; }
    s.setItem(k, JSON.stringify(v));
  } catch {}
}
function readJSONMap<T extends object = Record<string, any>>(k: string): T {
  const v = readJSON<T>(k);
  return v && typeof v === 'object' ? v : ({} as T);
}

/* ============================================================================
   Types / Model
============================================================================ */
export type Orientation = 'N' | 'NE' | 'E' | 'SE' | 'S' | 'SW' | 'W' | 'NW';
export type Adjacent = 'Exterior' | 'Interior (Heated)' | 'Interior (Unheated)' | 'Ground';
export type OpeningKind = 'window' | 'door' | 'roof_window';

export interface Opening {
  id: string;
  kind: OpeningKind;
  width: number;
  height: number;
  uValue?: number | '';
}
export interface Wall {
  id: string;
  name: string;
  orientation: Orientation;
  adjacent: Adjacent;
  width: number;
  height: number;
  uValue?: number | '';
  openings: Opening[];
}
export interface FloorEl {
  id: string;
  name: string;
  adjacent: Adjacent;
  width: number;
  height: number;
  uValue?: number | '';
}
export interface CeilingEl {
  id: string;
  name: string;
  type: 'Ceiling' | 'Roof';
  adjacent: Exclude<Adjacent, 'Ground'>;
  width: number;
  height: number;
  uValue?: number | '';
  openings: Opening[];
}
export interface VentDevice {
  id: string;
  type: 'trickle_vent' | 'mvhr_supply' | 'mvhr_extract' | 'mechanical_extract' | 'passive_vent';
  overrideFlow?: number | '';
  notes?: string;
}
export interface RoomModel {
  id?: string;
  zoneId?: string;
  name: string;
  length: number;
  width: number;
  height: number;
  volumeOverride?: number | '' | null;
  walls: Wall[];
  floors: FloorEl[];
  ceilings: CeilingEl[];
  ventilation: VentDevice[];
}

/* ============================================================================
   Utils
============================================================================ */
const defaultVentFlows: Record<VentDevice['type'], number> = {
  trickle_vent: 5, mvhr_supply: 8, mvhr_extract: 13, mechanical_extract: 8, passive_vent: 5,
};
const uid = () => Math.random().toString(36).slice(2, 9);
const toNum = (v: any) => (typeof v === 'number' ? v : parseFloat(String(v)));
const num = (v: any) => (Number.isFinite(toNum(v)) && toNum(v) > 0 ? toNum(v) : 0);
const area = (w: number, h: number) => +(num(w) * num(h)).toFixed(2);
const clampNumber = (v: any) => (Number.isFinite(toNum(v)) && toNum(v) > 0 ? toNum(v) : 0);

/* ============================================================================
   Component
============================================================================ */
export default function RoomElementsPage(): React.JSX.Element {
  const router = useRouter();

  // Main model
  const [room, setRoom] = useState<RoomModel>({
    name: 'Bedroom 1',
    length: 0, width: 0, height: 0, volumeOverride: null,
    walls: [], floors: [], ceilings: [], ventilation: [],
  });

  // Age band & room type / combine rule
  const [ageBand, setAgeBand] = useState<AgeBand>('y2021_plus');
  const [roomType, setRoomType] = useState<RoomType>('bedroom');
  const [policy, setPolicy] = useState<'max'|'sum'>('max');

  // Quick add internal wall inputs
  const [quickIntWidth, setQuickIntWidth] = useState<number | ''>('');
  const [quickIntHeight, setQuickIntHeight] = useState<number | ''>('');
  const [quickIntAdj, setQuickIntAdj] = useState<Adjacent>('Interior (Heated)');

  function addInternalWallQuick() {
    const width = typeof quickIntWidth === 'number' ? quickIntWidth : parseFloat(String(quickIntWidth)) || 0;
    const height = typeof quickIntHeight === 'number' ? quickIntHeight : parseFloat(String(quickIntHeight)) || 0;
    if (width <= 0 || height <= 0) return;
    setRoom((r) => ({
      ...r,
      walls: [
        ...r.walls,
        { id: uid(), name: `Internal Wall ${r.walls.length + 1}`, orientation: 'N', adjacent: quickIntAdj, width, height, uValue: '', openings: [] },
      ],
    }));
    setQuickIntWidth('');
    setQuickIntHeight('');
    setQuickIntAdj('Interior (Heated)');
  }

  // Linking to Rooms page
  const [roomsList, setRoomsList] = useState<Array<{ id: string; name: string; zoneId?: string }>>([]);
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);

  // UI state
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [override, setOverride] = useState(false);

  // Load / persist only on client
  useEffect(() => {
    const q = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
    const fromQuery = q ? q.get('roomId') : null;

    // load Rooms list (best-effort across common shapes/keys)
    const loaded: Array<{ id: string; name: string; zoneId?: string }> = [];
    for (const key of LS_ROOMS_KEYS) {
      const raw = readJSON<any>(key);
      if (!raw) continue;
      const x = raw;
      if (Array.isArray(x?.zones)) {
        try {
          x.zones.forEach((z: any, zi: number) => (z.Rooms || z.rooms || []).forEach((r: any, ri: number) => {
            const rid = String(r?.id ?? r?.roomId ?? r?.name ?? `${zi}:${ri}`);
            loaded.push({ id: rid, name: String(r?.name || `Room ${ri + 1}`), zoneId: String(z?.id ?? zi) });
          }));
        } catch {}
      }
      if (Array.isArray(x?.Rooms)) {
        try {
          x.Rooms.forEach((r: any, ri: number) => {
            const rid = String(r?.id ?? r?.roomId ?? r?.name ?? ri);
            loaded.push({ id: rid, name: String(r?.name || `Room ${ri + 1}`), zoneId: r?.zoneId });
          });
        } catch {}
      }
      if (Array.isArray(x?.rooms)) {
        try {
          x.rooms.forEach((r: any, ri: number) => {
            const rid = String(r?.id ?? r?.roomId ?? r?.name ?? ri);
            loaded.push({ id: rid, name: String(r?.name || `Room ${ri + 1}`), zoneId: r?.zoneId });
          });
        } catch {}
      }
      if (Array.isArray(x)) {
        try {
          x.forEach((r: any, ri: number) => {
            const rid = String(r?.id ?? r?.roomId ?? r?.name ?? ri);
            loaded.push({ id: rid, name: String(r?.name || `Room ${ri + 1}`), zoneId: r?.zoneId });
          });
        } catch {}
      }
      if (loaded.length) break;
    }
    setRoomsList(loaded);

    const last = readJSON<string>('mcs.rooms.selectedId');
    const activeId = fromQuery || last || (loaded.length ? loaded[0].id : null);
    if (activeId) setSelectedRoomId(activeId);

    const byRoom = readJSONMap<Record<string, RoomModel>>(LS_BYROOM_KEY);
    const saved = activeId ? byRoom[activeId] : readJSON<RoomModel>(LS_KEY);
    if (saved) setRoom(saved);
    else if (activeId) setRoom((r) => ({ ...r, id: activeId }));
  }, []);

  useEffect(() => {
    const rid = selectedRoomId || room.id;
    if (rid) {
      const byRoom = readJSONMap<Record<string, RoomModel>>(LS_BYROOM_KEY);
      byRoom[rid] = { ...room, id: rid };
      writeJSON(LS_BYROOM_KEY, byRoom);
      writeJSON('mcs.rooms.selectedId', rid);
    } else {
      writeJSON(LS_KEY, room);
    }
  }, [room, selectedRoomId]);

  const autoVolume = useMemo(
    () => +(num(room.length) * num(room.width) * num(room.height)).toFixed(1),
    [room.length, room.width, room.height]
  );

  const toggle = (id: string) => setExpanded((e) => ({ ...e, [id]: !e[id] }));

  /* -------------------- Adders -------------------- */
  const addWall = () => setRoom((r) => ({
    ...r,
    walls: [...r.walls, { id: uid(), name: `External Wall ${r.walls.length + 1}`, orientation: 'N', adjacent: 'Exterior', width: 0, height: 0, uValue: '', openings: [] }],
  }));
  const addFloor = () => setRoom((r) => ({
    ...r,
    floors: [...r.floors, { id: uid(), name: `Ground Floor ${r.floors.length + 1}`, adjacent: 'Ground', width: 0, height: 0, uValue: '' }],
  }));
  const addCeiling = () => setRoom((r) => ({
    ...r,
    ceilings: [...r.ceilings, { id: uid(), name: `Internal Ceiling ${r.ceilings.length + 1}`, type: 'Ceiling', adjacent: 'Interior (Heated)', width: 0, height: 0, uValue: '', openings: [] }],
  }));
  const addVent = () => setRoom((r) => ({ ...r, ventilation: [...r.ventilation, { id: uid(), type: 'trickle_vent', overrideFlow: '', notes: '' }] }));

  /* -------------------- Updaters (with numeric guarding) -------------------- */
  const updateWall = (i: number, patch: Partial<Wall>) =>
    setRoom((r) => ({
      ...r,
      walls: r.walls.map((w, idx) => (idx === i ? { ...w, ...cleanNumberPatch(patch) } : w)),
    }));
  const removeWall = (i: number) => setRoom((r) => ({ ...r, walls: r.walls.filter((_, idx) => idx !== i) }));
  const duplicateWall = (i: number) =>
    setRoom((r) => ({ ...r, walls: [...r.walls.slice(0, i + 1), { ...r.walls[i], id: uid(), name: r.walls[i].name + ' (copy)' }, ...r.walls.slice(i + 1)] }));

  const addWindow = (i: number) => addOpening(i, 'wall', 'window');
  const addDoor = (i: number) => addOpening(i, 'wall', 'door');

  const updateFloor = (i: number, patch: Partial<FloorEl>) =>
    setRoom((r) => ({ ...r, floors: r.floors.map((f, idx) => (idx === i ? { ...f, ...cleanNumberPatch(patch) } : f)) }));
  const removeFloor = (i: number) => setRoom((r) => ({ ...r, floors: r.floors.filter((_, idx) => idx !== i) }));

  const updateCeiling = (i: number, patch: Partial<CeilingEl>) =>
    setRoom((r) => ({ ...r, ceilings: r.ceilings.map((c, idx) => (idx === i ? { ...c, ...cleanNumberPatch(patch) } : c)) }));
  const removeCeiling = (i: number) => setRoom((r) => ({ ...r, ceilings: r.ceilings.filter((_, idx) => idx !== i) }));
  const addRoofWindow = (i: number) => addOpening(i, 'ceiling', 'roof_window');

  function addOpening(i: number, owner: 'wall' | 'ceiling', kind: OpeningKind) {
    const o: Opening = { id: uid(), kind, width: 0, height: 0, uValue: '' };
    if (owner === 'wall')
      setRoom((r) => ({ ...r, walls: r.walls.map((w, idx) => (idx === i ? { ...w, openings: [...(w.openings || []), o] } : w)) }));
    else
      setRoom((r) => ({ ...r, ceilings: r.ceilings.map((c, idx) => (idx === i ? { ...c, openings: [...(c.openings || []), o] } : c)) }));
  }
  const updateOpening = (i: number, j: number, owner: 'wall' | 'ceiling', patch: Partial<Opening>) => {
    const patchClean = cleanNumberPatch(patch);
    if (owner === 'wall')
      setRoom((r) => ({ ...r, walls: r.walls.map((w, idx) => (idx === i ? { ...w, openings: w.openings.map((o, k) => (k === j ? { ...o, ...patchClean } : o)) } : w)) }));
    else
      setRoom((r) => ({ ...r, ceilings: r.ceilings.map((c, idx) => (idx === i ? { ...c, openings: c.openings.map((o, k) => (k === j ? { ...o, ...patchClean } : o)) } : c)) }));
  };
  const removeOpening = (i: number, j: number, owner: 'wall' | 'ceiling') => {
    if (owner === 'wall') setRoom((r) => ({ ...r, walls: r.walls.map((w, idx) => (idx === i ? { ...w, openings: w.openings.filter((_, k) => k !== j) } : w)) }));
    else setRoom((r) => ({ ...r, ceilings: r.ceilings.map((c, idx) => (idx === i ? { ...c, openings: c.openings.filter((_, k) => k !== j) } : c)) }));
  };

  const exportJSON = () => {
    const rid = selectedRoomId || room.id || 'room';
    const data = JSON.stringify({ room: { ...room, id: rid } }, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(roomsList.find((r) => r.id === rid)?.name || room.name || 'room')}-elements.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const onSaveAndContinue = () => {
    exportJSON();
    router.push('/rooms/'); // continue flow (still respects basePath)
  };

  /* -------------------- Derived totals (gross, openings, net) -------------------- */
  const wallsGross = useMemo(() => room.walls.reduce((s, w) => s + area(w.width, w.height), 0), [room.walls]);
  const wallsOpenings = useMemo(() => room.walls.reduce((s, w) => s + (w.openings || []).reduce((ss, o) => ss + area(o.width, o.height), 0), 0), [room.walls]);
  const wallsNet = useMemo(() => Math.max(+(wallsGross - wallsOpenings).toFixed(2), 0), [wallsGross, wallsOpenings]);

  const floorsArea = useMemo(() => room.floors.reduce((s, f) => s + area(f.width, f.height), 0), [room.floors]);

  const ceilingsGross = useMemo(() => room.ceilings.reduce((s, c) => s + area(c.width, c.height), 0), [room.ceilings]);
  const ceilingsOpenings = useMemo(() => room.ceilings.reduce((s, c) => s + (c.openings || []).reduce((ss, o) => ss + area(o.width, o.height), 0), 0), [room.ceilings]);
  const ceilingsNet = useMemo(() => Math.max(+(ceilingsGross - ceilingsOpenings).toFixed(2), 0), [ceilingsGross, ceilingsOpenings]);

  /* -------------------- Heat Loss Results -------------------- */
  const INDOOR_C = 21, OUTDOOR_C = -3;

  // ALWAYS a number for the calc
  const displayVolume: number = useMemo(() => {
    const cand = override ? room.volumeOverride : null;
    return (typeof cand === 'number' && Number.isFinite(cand)) ? cand : autoVolume;
  }, [override, room.volumeOverride, autoVolume]);

  const results = useMemo(() => computeRoomLoss({
    room,
    indoorC: INDOOR_C,
    outdoorC: OUTDOOR_C,
    volumeM3: displayVolume,
    ageBand,
    roomType,
    policy
  }), [room, displayVolume, ageBand, roomType, policy]);

  /* -------------------- Volume override handlers -------------------- */
  const onChangeVolume: React.ChangeEventHandler<HTMLInputElement> = (e) => {
    const raw = e?.target?.value;
    const v = raw === '' ? '' : +raw!;
    setRoom((r) => ({ ...r, volumeOverride: override ? (v === '' ? null : Number(v)) : null }));
  };
  const onToggleOverride: React.ChangeEventHandler<HTMLInputElement> = (e) => {
    const checked = !!e?.target?.checked;
    setOverride(checked);
    setRoom((r) => ({ ...r, volumeOverride: checked ? (r.volumeOverride ?? autoVolume) : null }));
  };

  const activeRoom = roomsList.find((r) => r.id === (selectedRoomId || room.id));

  return (
    <main style={wrap}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        {/* header back: go to Building Elements */}
        <button
          type="button"
          onClick={() => router.push('/building-elements/')}
          style={backLink}
          aria-label="Back"
        >
          ◀
        </button>
        <h1 style={title}>{activeRoom?.name || room.name}</h1>
      </div>

      {/* Room selector */}
      {roomsList.length > 0 && (
        <div style={{ margin: '6px 0 10px' }}>
          <Label>Linked Room</Label>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <Select value={selectedRoomId || ''} onChange={(e) => setSelectedRoomId((e?.target?.value as string) || null)}>
              {roomsList.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </Select>
            <button style={secondaryBtn} onClick={() => setRoom((r) => ({ ...r, id: selectedRoomId || r.id }))}>Bind</button>
          </div>
        </div>
      )}

      {/* CONFIG: Age band / room type / policy */}
      <div style={panel}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
          <div>
            <Label>Dwelling Age Band</Label>
            <Select value={ageBand} onChange={(e)=> setAgeBand((e.target.value as AgeBand) || 'y2021_plus')}>
              <option value="pre_2003">Pre-2003</option>
              <option value="y2003_2010">2003–2010</option>
              <option value="y2010_2021">2010–2021</option>
              <option valu
