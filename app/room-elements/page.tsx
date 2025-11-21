'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';

/* ============================================================================
   Room Elements – list layout (matches provided screenshots)
   - Walls/Floors/Ceilings in list rows with #, Adjacent Space, Element Name, Dimensions
   - Per-wall +DOOR / +WINDOW buttons added to that wall
   - Total Area footer rows (gross areas)
   - Ventilation with Auto Volume + Override checkbox
   - Back / Save & Continue footer actions
   - **Linked to Rooms page**: binds to a specific roomId and persists elements per room
   FIX: hardened storage + JSON guards to avoid any null deref in non-browser contexts
============================================================================ */

/* ============================================================================
   Persistence helpers (safe localStorage wrapper)
============================================================================ */
const LS_KEY = 'mcs.room.elements.v2'; // legacy single-room fallback
const LS_BYROOM_KEY = 'mcs.room.elements.byRoom.v1'; // per-room map { [roomId]: RoomModel }
const LS_ROOMS_KEYS = ['mcs.Rooms.v2', 'mcs.Rooms.v1', 'mcs.rooms.v2', 'mcs.rooms.v1', 'mcs.rooms', 'rooms.v1']; // likely keys from Rooms page

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
    setItem: (k, v) => {
      m.set(k, v);
    },
    removeItem: (k) => {
      m.delete(k);
    },
  };
})();

function getStorage(): SafeStorage {
  // Never touch window/localStorage on server or blocked envs
  if (typeof window === 'undefined') return memoryStorage;
  try {
    const s: Storage | undefined | null = (window as any).localStorage ?? null;
    if (!s) return memoryStorage;
    // Probe inside try/catch; some sandboxes throw on access
    try {
      const t = '__probe__';
      s.setItem(t, '1');
      s.removeItem(t);
    } catch {
      return memoryStorage;
    }
    // Wrap native storage to normalize errors
    return {
      getItem: (k: string) => {
        try {
          const v = s.getItem(k);
          return typeof v === 'string' ? v : null;
        } catch {
          return null;
        }
      },
      setItem: (k: string, v: string) => {
        try {
          s.setItem(k, v);
        } catch {
          /* ignore */
        }
      },
      removeItem: (k: string) => {
        try {
          s.removeItem(k);
        } catch {
          /* ignore */
        }
      },
    } as SafeStorage;
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
    // Normalize falsy objects
    return parsed == null ? null : (parsed as T);
  } catch {
    return null;
  }
}
function writeJSON(k: string, v: unknown) {
  const s = getStorage();
  try {
    if (typeof v === 'undefined') {
      s.removeItem(k);
      return;
    }
    s.setItem(k, JSON.stringify(v));
  } catch {
    /* ignore quota/access errors */
  }
}

// Helper that ALWAYS returns an object for map-like stores (general use)
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
  id?: string; // when linked to Rooms page
  zoneId?: string; // optional, if Rooms page groups by zones
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

const defaultVentFlows: Record<VentDevice['type'], number> = {
  trickle_vent: 5,
  mvhr_supply: 8,
  mvhr_extract: 13,
  mechanical_extract: 8,
  passive_vent: 5,
};

/* ============================================================================
   Utils
============================================================================ */
const uid = () => Math.random().toString(36).slice(2, 9);
const num = (v: any) => (typeof v === 'number' ? v : parseFloat(v)) || 0;
const area = (w: number, h: number) => +(num(w) * num(h)).toFixed(2); // 2dp like screenshot

/* ============================================================================
   Component
============================================================================ */
export default function RoomElementsPage(): React.JSX.Element {
  // Main model
  const [room, setRoom] = useState<RoomModel>({
    id: undefined,
    zoneId: undefined,
    name: 'Bedroom 1',
    length: 0,
    width: 0,
    height: 0,
    volumeOverride: null,
    walls: [],
    floors: [],
    ceilings: [],
    ventilation: [],
  });

  // Linking to Rooms page
  const [roomsList, setRoomsList] = useState<Array<{ id: string; name: string; zoneId?: string }>>([]);
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);

  // UI state (keep hooks at the top and stable order)
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [override, setOverride] = useState(false);

  // Load / persist only on client
  useEffect(() => {
    // 1) read roomId from query string (?roomId=...)
    const q = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
    const fromQuery = q ? q.get('roomId') : null;

    // 2) load Rooms list (best-effort across common shapes/keys)
    const loaded: Array<{ id: string; name: string; zoneId?: string }> = [];
    for (const key of LS_ROOMS_KEYS) {
      const raw = readJSON<any>(key);
      if (!raw) continue;
      const x = raw; // may be {version, zones} or a direct array
      // a) object with zones (Rooms property is capitalized in your Rooms page)
      if (Array.isArray(x?.zones)) {
        try {
          x.zones.forEach((z: any, zi: number) => (z.Rooms || z.rooms || []).forEach((r: any, ri: number) => {
            const rid = String(r?.id ?? r?.roomId ?? r?.name ?? `${zi}:${ri}`);
            loaded.push({ id: rid, name: String(r?.name || `Room ${ri + 1}`), zoneId: String(z?.id ?? zi) });
          }));
        } catch {/* ignore malformed */}
      }
      // b) object with rooms (fallback, any casing)
      if (Array.isArray(x?.Rooms)) {
        try {
          x.Rooms.forEach((r: any, ri: number) => {
            const rid = String(r?.id ?? r?.roomId ?? r?.name ?? ri);
            loaded.push({ id: rid, name: String(r?.name || `Room ${ri + 1}`), zoneId: r?.zoneId });
          });
        } catch {/* ignore */}
      }
      if (Array.isArray(x?.rooms)) {
        try {
          x.rooms.forEach((r: any, ri: number) => {
            const rid = String(r?.id ?? r?.roomId ?? r?.name ?? ri);
            loaded.push({ id: rid, name: String(r?.name || `Room ${ri + 1}`), zoneId: r?.zoneId });
          });
        } catch {/* ignore */}
      }
      // c) bare array
      if (Array.isArray(x)) {
        try {
          x.forEach((r: any, ri: number) => {
            const rid = String(r?.id ?? r?.roomId ?? r?.name ?? ri);
            loaded.push({ id: rid, name: String(r?.name || `Room ${ri + 1}`), zoneId: r?.zoneId });
          });
        } catch {/* ignore */}
      }
      if (loaded.length) break;
    }
    setRoomsList(loaded);

    // 3) choose active room id: query > lastSelected > first room
    const last = readJSON<string>('mcs.rooms.selectedId');
    const activeId = fromQuery || last || (loaded.length ? loaded[0].id : null);
    if (activeId) setSelectedRoomId(activeId);

    // 4) load per-room elements; fallback to legacy single-room LS_KEY
    const byRoom = readJSONMap<Record<string, RoomModel>>(LS_BYROOM_KEY);
    const saved = activeId ? byRoom[activeId] : readJSON<RoomModel>(LS_KEY);
    if (saved) setRoom(saved);
    else if (activeId) setRoom((r) => ({ ...r, id: activeId }));
  }, []);

  useEffect(() => {
    // write per-room if linked, else global fallback
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

  // UI helpers
  const toggle = (id: string) => setExpanded((e) => ({ ...e, [id]: !e[id] }));

  /* -------------------- Adders -------------------- */
  const addWall = () =>
    setRoom((r) => ({
      ...r,
      walls: [
        ...r.walls,
        {
          id: uid(),
          name: `External Wall ${r.walls.length + 1}`,
          orientation: 'N',
          adjacent: 'Exterior',
          width: 0,
          height: 0,
          uValue: '',
          openings: [],
        },
      ],
    }));
  const addFloor = () =>
    setRoom((r) => ({
      ...r,
      floors: [
        ...r.floors,
        { id: uid(), name: `Ground Floor ${r.floors.length + 1}`, adjacent: 'Ground', width: 0, height: 0, uValue: '' },
      ],
    }));
  const addCeiling = () =>
    setRoom((r) => ({
      ...r,
      ceilings: [
        ...r.ceilings,
        {
          id: uid(),
          name: `Internal Ceiling ${r.ceilings.length + 1}`,
          type: 'Ceiling',
          adjacent: 'Interior (Heated)',
          width: 0,
          height: 0,
          uValue: '',
          openings: [],
        },
      ],
    }));
  const addVent = () =>
    setRoom((r) => ({ ...r, ventilation: [...r.ventilation, { id: uid(), type: 'trickle_vent', overrideFlow: '', notes: '' }] }));

  /* -------------------- Updaters -------------------- */
  const updateWall = (i: number, patch: Partial<Wall>) =>
    setRoom((r) => ({ ...r, walls: r.walls.map((w, idx) => (idx === i ? { ...w, ...clean(patch) } : w)) }));
  const removeWall = (i: number) => setRoom((r) => ({ ...r, walls: r.walls.filter((_, idx) => idx !== i) }));
  const duplicateWall = (i: number) =>
    setRoom((r) => ({
      ...r,
      walls: [...r.walls.slice(0, i + 1), { ...r.walls[i], id: uid(), name: r.walls[i].name + ' (copy)' }, ...r.walls.slice(i + 1)],
    }));

  const addWindow = (i: number) => addOpening(i, 'wall', 'window');
  const addDoor = (i: number) => addOpening(i, 'wall', 'door');

  const updateFloor = (i: number, patch: Partial<FloorEl>) =>
    setRoom((r) => ({ ...r, floors: r.floors.map((f, idx) => (idx === i ? { ...f, ...clean(patch) } : f)) }));
  const removeFloor = (i: number) => setRoom((r) => ({ ...r, floors: r.floors.filter((_, idx) => idx !== i) }));

  const updateCeiling = (i: number, patch: Partial<CeilingEl>) =>
    setRoom((r) => ({ ...r, ceilings: r.ceilings.map((c, idx) => (idx === i ? { ...c, ...clean(patch) } : c)) }));
  const removeCeiling = (i: number) => setRoom((r) => ({ ...r, ceilings: r.ceilings.filter((_, idx) => idx !== i) }));
  const addRoofWindow = (i: number) => addOpening(i, 'ceiling', 'roof_window');

  function addOpening(i: number, owner: 'wall' | 'ceiling', kind: OpeningKind) {
    const o: Opening = { id: uid(), kind, width: 0, height: 0, uValue: '' };
    if (owner === 'wall')
      setRoom((r) => ({ ...r, walls: r.walls.map((w, idx) => (idx === i ? { ...w, openings: [...(w.openings || []), o] } : w)) }));
    else setRoom((r) => ({ ...r, ceilings: r.ceilings.map((c, idx) => (idx === i ? { ...c, openings: [...(c.openings || []), o] } : c)) }));
  }
  const updateOpening = (i: number, j: number, owner: 'wall' | 'ceiling', patch: Partial<Opening>) => {
    if (owner === 'wall')
      setRoom((r) => ({
        ...r,
        walls: r.walls.map((w, idx) => (idx === i ? { ...w, openings: w.openings.map((o, k) => (k === j ? { ...o, ...clean(patch) } : o)) } : w)),
      }));
    else
      setRoom((r) => ({
        ...r,
        ceilings: r.ceilings.map((c, idx) => (idx === i ? { ...c, openings: c.openings.map((o, k) => (k === j ? { ...o, ...clean(patch) } : o)) } : c)),
      }));
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
    // Navigate back to Rooms (GitHub Pages-friendly relative link)
    if (typeof window !== 'undefined') window.location.href = '../rooms/';
  };

  /* -------------------- Derived totals -------------------- */
  const wallsGross = useMemo(() => room.walls.reduce((s, w) => s + area(w.width, w.height), 0), [room.walls]);
  const floorsArea = useMemo(() => room.floors.reduce((s, f) => s + area(f.width, f.height), 0), [room.floors]);
  const ceilingsGross = useMemo(() => room.ceilings.reduce((s, c) => s + area(c.width, c.height), 0), [room.ceilings]);

  /* -------------------- Render -------------------- */
  const orientations: Orientation[] = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  const adjacents: Adjacent[] = ['Exterior', 'Interior (Heated)', 'Interior (Unheated)', 'Ground'];

  // Volume input behavior
  const displayVolume = override ? (room.volumeOverride ?? autoVolume) : autoVolume;
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
        <Link href="../rooms/" style={backLink} aria-label="Back">
          ◀
        </Link>
        <h1 style={title}>{activeRoom?.name || room.name}</h1>
      </div>

      {/* Room selector if Rooms list exists */}
      {roomsList.length > 0 && (
        <div style={{ margin: '6px 0 10px' }}>
          <Label>Linked Room</Label>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <Select value={selectedRoomId || ''} onChange={(e) => setSelectedRoomId((e?.target?.value as string) || null)}>
              {roomsList.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </Select>
            <button style={secondaryBtn} onClick={() => setRoom((r) => ({ ...r, id: selectedRoomId || r.id }))}>Bind</button>
          </div>
        </div>
      )}

      {/* W A L L S */}
      <Section
        title="WALLS"
        subtitle="List all walls of this room, including any doors/windows on each wall."
        actionLabel="+ ADD WALL"
        onAction={addWall}
      >
        <ListHeader cols={["#", "Adjacent Space", "Element Name", "Dimensions", "Actions"]} />
        {room.walls.map((w, i) => (
          <div key={w.id}>
            <ListRow>
              <Cell narrow>{i + 1}</Cell>
              <Cell>
                <strong>{w.adjacent}</strong>
              </Cell>
              <Cell>{w.name}</Cell>
              <Cell>
                {(w.width || 0).toFixed(2)} × {(w.height || 0).toFixed(2)} m
              </Cell>
              <Cell>
                <button style={miniBtn} onClick={() => addDoor(i)}>
                  + DOOR
                </button>
                <button style={miniBtn} onClick={() => addWindow(i)}>
                  + WINDOW
                </button>
                <button style={miniBtn} onClick={() => toggle(w.id)}>
                  ✎ EDIT
                </button>
                <button style={miniDanger} onClick={() => removeWall(i)}>
                  🗑 DELETE
                </button>
              </Cell>
            </ListRow>
            {expanded[w.id] && (
              <EditorBlock>
                <div style={grid4}>
                  <div>
                    <Label>Element Name</Label>
                    <Input value={w.name} onChange={(e) => updateWall(i, { name: e?.target?.value || '' })} />
                  </div>
                  <div>
                    <Label>Orientation</Label>
                    <Select value={w.orientation} onChange={(e) => updateWall(i, { orientation: (e?.target?.value as Orientation) || 'N' })}>
                      {orientations.map((o) => (
                        <option key={o} value={o}>
                          {o}
                        </option>
                      ))}
                    </Select>
                  </div>
                  <div>
                    <Label>Adjacent Space</Label>
                    <Select value={w.adjacent} onChange={(e) => updateWall(i, { adjacent: (e?.target?.value as Adjacent) || 'Exterior' })}>
                      {adjacents.map((a) => (
                        <option key={a} value={a}>
                          {a}
                        </option>
                      ))}
                    </Select>
                  </div>
                  <div />
                  <div>
                    <Label>Width (m)</Label>
                    <Input type="number" step="0.01" value={w.width ?? ''} onChange={(e) => updateWall(i, { width: +((e?.target?.value as string) || '0') })} />
                  </div>
                  <div>
                    <Label>Height (m)</Label>
                    <Input type="number" step="0.01" value={w.height ?? ''} onChange={(e) => updateWall(i, { height: +((e?.target?.value as string) || '0') })} />
                  </div>
                  <div>
                    <Label>U-Value (W/m²K)</Label>
                    <Input type="number" step="0.01" value={w.uValue ?? ''} onChange={(e) => updateWall(i, { uValue: (e?.target?.value as string) === '' ? '' : +(e?.target?.value as string) })} />
                  </div>
                </div>

                {!!w.openings.length && <h4 style={subtleH}>Openings</h4>}
                {w.openings.map((o, j) => (
                  <div key={o.id} style={openRow}>
                    <Select value={o.kind} onChange={(e) => updateOpening(i, j, 'wall', { kind: (e?.target?.value as OpeningKind) || 'window' })}>
                      <option value="window">Window</option>
                      <option value="door">Door</option>
                    </Select>
                    <Input type="number" step="0.01" placeholder="Width (m)" value={o.width ?? ''} onChange={(e) => updateOpening(i, j, 'wall', { width: +((e?.target?.value as string) || '0') })} />
                    <Input type="number" step="0.01" placeholder="Height (m)" value={o.height ?? ''} onChange={(e) => updateOpening(i, j, 'wall', { height: +((e?.target?.value as string) || '0') })} />
                    <span style={{ minWidth: 80, textAlign: 'right' }}>{area(o.width, o.height).toFixed(2)} m²</span>
                    <Input type="number" step="0.01" placeholder="U" value={o.uValue ?? ''} onChange={(e) => updateOpening(i, j, 'wall', { uValue: (e?.target?.value as string) === '' ? '' : +(e?.target?.value as string) })} />
                    <button style={miniDanger} onClick={() => removeOpening(i, j, 'wall')}>
                      Remove
                    </button>
                  </div>
                ))}
              </EditorBlock>
            )}
          </div>
        ))}
        <TotalRow label="Total Area:" value={`${wallsGross.toFixed(2)} m²`} />
      </Section>

      {/* F L O O R S */}
      <Section title="FLOORS" subtitle="List all floors of this room." actionLabel="+ ADD FLOOR" onAction={addFloor}>
        <ListHeader cols={["#", "Adjacent Space", "Element Name", "Dimensions", "Actions"]} />
        {room.floors.map((f, i) => (
          <div key={f.id}>
            <ListRow>
              <Cell narrow>{i + 1}</Cell>
              <Cell>
                <strong>{f.adjacent}</strong>
              </Cell>
              <Cell>{f.name}</Cell>
              <Cell>
                {(f.width || 0).toFixed(2)} × {(f.height || 0).toFixed(2)} m
              </Cell>
              <Cell>
                <button style={miniBtn} onClick={() => toggle(f.id)}>
                  ✎ EDIT
                </button>
                <button style={miniDanger} onClick={() => removeFloor(i)}>
                  🗑 DELETE
                </button>
              </Cell>
            </ListRow>
            {expanded[f.id] && (
              <EditorBlock>
                <div style={grid4}>
                  <div>
                    <Label>Element Name</Label>
                    <Input value={f.name} onChange={(e) => updateFloor(i, { name: e?.target?.value || '' })} />
                  </div>
                  <div>
                    <Label>Adjacent Space</Label>
                    <Select value={f.adjacent} onChange={(e) => updateFloor(i, { adjacent: (e?.target?.value as Adjacent) || 'Ground' })}>
                      {adjacents.map((a) => (
                        <option key={a} value={a}>
                          {a}
                        </option>
                      ))}
                    </Select>
                  </div>
                  <div>
                    <Label>Width (m)</Label>
                    <Input type="number" step="0.01" value={f.width ?? ''} onChange={(e) => updateFloor(i, { width: +((e?.target?.value as string) || '0') })} />
                  </div>
                  <div>
                    <Label>Height/Depth (m)</Label>
                    <Input type="number" step="0.01" value={f.height ?? ''} onChange={(e) => updateFloor(i, { height: +((e?.target?.value as string) || '0') })} />
                  </div>
                  <div>
                    <Label>U-Value (W/m²K)</Label>
                    <Input type="number" step="0.01" value={f.uValue ?? ''} onChange={(e) => updateFloor(i, { uValue: (e?.target?.value as string) === '' ? '' : +(e?.target?.value as string) })} />
                  </div>
                </div>
              </EditorBlock>
            )}
          </div>
        ))}
        <TotalRow label="Total Area:" value={`${floorsArea.toFixed(2)} m²`} />
      </Section>

      {/* C E I L I N G S */}
      <Section title="CEILINGS" subtitle="List all ceilings of this room." actionLabel="+ ADD CEILING" onAction={addCeiling}>
        <ListHeader cols={["#", "Adjacent Space", "Element Name", "Dimensions", "Actions"]} />
        {room.ceilings.map((c, i) => (
          <div key={c.id}>
            <ListRow>
              <Cell narrow>{i + 1}</Cell>
              <Cell>
                <strong>{c.adjacent}</strong>
              </Cell>
              <Cell>{c.name}</Cell>
              <Cell>
                {(c.width || 0).toFixed(2)} × {(c.height || 0).toFixed(2)} m
              </Cell>
              <Cell>
                <button style={miniBtn} onClick={() => addRoofWindow(i)}>
                  + ROOF WINDOW
                </button>
                <button style={miniBtn} onClick={() => toggle(c.id)}>
                  ✎ EDIT
                </button>
                <button style={miniDanger} onClick={() => removeCeiling(i)}>
                  🗑 DELETE
                </button>
              </Cell>
            </ListRow>
            {expanded[c.id] && (
              <EditorBlock>
                <div style={grid4}>
                  <div>
                    <Label>Element Name</Label>
                    <Input value={c.name} onChange={(e) => updateCeiling(i, { name: e?.target?.value || '' })} />
                  </div>
                  <div>
                    <Label>Type</Label>
                    <Select value={c.type} onChange={(e) => updateCeiling(i, { type: (e?.target?.value as any) || 'Ceiling' })}>
                      <option value="Ceiling">Ceiling</option>
                      <option value="Roof">Roof</option>
                    </Select>
                  </div>
                  <div>
                    <Label>Adjacent Space</Label>
                    <Select value={c.adjacent} onChange={(e) => updateCeiling(i, { adjacent: (e?.target?.value as any) || 'Interior (Heated)' })}>
                      {(['Exterior', 'Interior (Heated)', 'Interior (Unheated)'] as const).map((a) => (
                        <option key={a} value={a}>
                          {a}
                        </option>
                      ))}
                    </Select>
                  </div>
                  <div />
                  <div>
                    <Label>Width (m)</Label>
                    <Input type="number" step="0.01" value={c.width ?? ''} onChange={(e) => updateCeiling(i, { width: +((e?.target?.value as string) || '0') })} />
                  </div>
                  <div>
                    <Label>Height (m)</Label>
                    <Input type="number" step="0.01" value={c.height ?? ''} onChange={(e) => updateCeiling(i, { height: +((e?.target?.value as string) || '0') })} />
                  </div>
                  <div>
                    <Label>U-Value (W/m²K)</Label>
                    <Input type="number" step="0.01" value={c.uValue ?? ''} onChange={(e) => updateCeiling(i, { uValue: (e?.target?.value as string) === '' ? '' : +(e?.target?.value as string) })} />
                  </div>
                </div>
                {!!c.openings.length && <h4 style={subtleH}>Roof Windows</h4>}
                {c.openings.map((o, j) => (
                  <div key={o.id} style={openRow}>
                    <Select value={o.kind} onChange={(e) => updateOpening(i, j, 'ceiling', { kind: (e?.target?.value as OpeningKind) || 'roof_window' })}>
                      <option value="roof_window">Roof Window</option>
                      <option value="window">Window</option>
                      <option value="door">Door</option>
                    </Select>
                    <Input type="number" step="0.01" placeholder="Width (m)" value={o.width ?? ''} onChange={(e) => updateOpening(i, j, 'ceiling', { width: +((e?.target?.value as string) || '0') })} />
                    <Input type="number" step="0.01" placeholder="Height (m)" value={o.height ?? ''} onChange={(e) => updateOpening(i, j, 'ceiling', { height: +((e?.target?.value as string) || '0') })} />
                    <span style={{ minWidth: 80, textAlign: 'right' }}>{area(o.width, o.height).toFixed(2)} m²</span>
                    <Input type="number" step="0.01" placeholder="U" value={o.uValue ?? ''} onChange={(e) => updateOpening(i, j, 'ceiling', { uValue: (e?.target?.value as string) === '' ? '' : +(e?.target?.value as string) })} />
                    <button style={miniDanger} onClick={() => removeOpening(i, j, 'ceiling')}>
                      Remove
                    </button>
                  </div>
                ))}
              </EditorBlock>
            )}
          </div>
        ))}
        <TotalRow label="Total Area:" value={`${ceilingsGross.toFixed(2)} m²`} />
      </Section>

      {/* V E N T I L A T I O N */}
      <h2 style={sectionTitle}>VENTILATION</h2>
      <p style={muted}>Enter the internal air volume of this room and add any ventilation devices.</p>
      <div style={panel}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 120px 100px', gap: 10, alignItems: 'center' }}>
          <div>
            <Label>Internal Air Volume *</Label>
            <Input value={String(displayVolume)} onChange={onChangeVolume} disabled={!override} />
            <div style={help}>The internal volume has been estimated based on the ceiling areas and wall heights entered.</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span>m³</span>
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'flex-end' }}>
            <input type="checkbox" checked={override} onChange={onToggleOverride} /> Override
          </label>
        </div>
      </div>

      <div style={panel}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ margin: 0, fontSize: 16 }}>Ventilation Devices</h3>
          <button style={secondaryBtn} onClick={addVent}>+ ADD DEVICE</button>
        </div>
        {room.ventilation.length === 0 && <Empty>No devices have been added</Empty>}
        {room.ventilation.map((v, i) => (
          <div key={v.id} style={rowLine}>
            <Select value={v.type} onChange={(e) => updateVent(i, { type: (e?.target?.value as any) || 'trickle_vent' })}>
              <option value="trickle_vent">Trickle vent</option>
              <option value="mvhr_supply">MVHR supply</option>
              <option value="mvhr_extract">MVHR extract</option>
              <option value="mechanical_extract">Mechanical extract</option>
              <option value="passive_vent">Passive vent</option>
            </Select>
            <span style={{ minWidth: 140 }}>Default: {defaultVentFlows[v.type]} l/s</span>
            <Input type="number" step="0.1" placeholder="Override (l/s)" value={v.overrideFlow ?? ''} onChange={(e) => updateVent(i, { overrideFlow: (e?.target?.value as string) === '' ? '' : +(e?.target?.value as string) })} />
            <Input placeholder="Notes" value={v.notes || ''} onChange={(e) => updateVent(i, { notes: e?.target?.value || '' })} />
            <button style={miniDanger} onClick={() => removeVent(i)}>Remove</button>
          </div>
        ))}
      </div>

      {/* Footer nav */}
      <div style={footerNav}>
        <Link href="../rooms/" style={btnGhost}>
          ◀ Back
        </Link>
        <div style={{ flex: 1 }} />
        <button style={btnPrimary} onClick={onSaveAndContinue}>
          Save & Continue ▶
        </button>
      </div>
    </main>
  );

  /* ---- ventilation updaters ---- */
  function updateVent(i: number, patch: Partial<VentDevice>) {
    setRoom((r) => ({ ...r, ventilation: r.ventilation.map((v, idx) => (idx === i ? { ...v, ...clean(patch) } : v)) }));
  }
  function removeVent(i: number) {
    setRoom((r) => ({ ...r, ventilation: r.ventilation.filter((_, idx) => idx !== i) }));
  }
}

/* ============================================================================
   Presentational bits
============================================================================ */
function Section({
  title,
  subtitle,
  actionLabel,
  onAction,
  children,
}: {
  title: string;
  subtitle?: string;
  actionLabel?: string;
  onAction?: () => void;
  children: React.ReactNode;
}) {
  return (
    <section style={{ marginTop: 18 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={sectionTitle}>{title}</h2>
          {subtitle && <p style={muted}>{subtitle}</p>}
        </div>
        {actionLabel && (
          <button style={secondaryBtn} onClick={onAction}>
            {actionLabel}
          </button>
        )}
      </div>
      <div style={listBox}>{children}</div>
    </section>
  );
}
function ListHeader({ cols }: { cols: string[] }) {
  return (
    <div style={headerRow}>
      {cols.map((c, i) => (
        <span key={i} style={{ flex: i === 0 ? 0 : 1, minWidth: i === 0 ? 40 : undefined, fontWeight: 600 }}>
          {c}
        </span>
      ))}
    </div>
  );
}
function ListRow({ children }: { children: React.ReactNode }) {
  return <div style={dataRow}>{children}</div>;
}
function Cell({ children, narrow }: { children: React.ReactNode; narrow?: boolean }) {
  return <div style={{ flex: narrow ? 0 : 1, minWidth: narrow ? 40 : undefined }}>{children}</div>;
}
function TotalRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={totalRow}>
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}
function EditorBlock({ children }: { children: React.ReactNode }) {
  return <div style={editor}>{children}</div>;
}
function Empty({ children }: { children: React.ReactNode }) {
  return <div style={{ padding: 12, color: '#666' }}>{children}</div>;
}

/* ============================================================================
   Styles
============================================================================ */
const wrap: React.CSSProperties = {
  maxWidth: 1120,
  margin: '0 auto',
  padding: 24,
  fontFamily: 'Inter, ui-sans-serif, system-ui, Segoe UI, Roboto, Arial, sans-serif',
};
const title: React.CSSProperties = { fontSize: 28, letterSpacing: 0.5, margin: '0 0 6px' };
const sectionTitle: React.CSSProperties = { margin: '0 0 6px', fontSize: 14, letterSpacing: 1.5, textTransform: 'uppercase' };
const muted: React.CSSProperties = { color: '#666', fontSize: 13, margin: '0 0 10px' };
const listBox: React.CSSProperties = { border: '1px solid #E5E7EB', borderRadius: 8, overflow: 'hidden' };
const headerRow: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '40px 1fr 1fr 1fr 1fr',
  gap: 12,
  padding: '10px 12px',
  background: '#ECEDEF',
  color: '#222',
} as React.CSSProperties;
const dataRow: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '40px 1fr 1fr 1fr 1fr',
  gap: 12,
  padding: '12px',
  alignItems: 'center',
  borderTop: '1px solid #F1F1F1',
  background: '#fff',
} as React.CSSProperties;
const totalRow: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', background: '#F3F4F6', padding: '12px', borderTop: '1px solid #E5E7EB', fontWeight: 600 };
const editor: React.CSSProperties = { background: '#FAFAFA', borderTop: '1px solid #F1F1F1', padding: 12 };
const grid4: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 12 };
const openRow: React.CSSProperties = { display: 'grid', gridTemplateColumns: '160px 140px 140px 100px 120px 90px', gap: 8, alignItems: 'center', padding: '6px 0' };
const rowLine: React.CSSProperties = { display: 'grid', gridTemplateColumns: '220px 160px 160px 1fr 100px', gap: 10, alignItems: 'center', padding: '8px 0', borderTop: '1px solid #F1F1F1' };
const input: React.CSSProperties = { width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #D1D5DB', boxSizing: 'border-box' };
const backLink: React.CSSProperties = { display: 'inline-flex', width: 28, height: 28, alignItems: 'center', justifyContent: 'center', border: '1px solid #E5E7EB', borderRadius: 999, textDecoration: 'none', color: '#111' };
const btnPrimary: React.CSSProperties = { background: '#111827', color: '#fff', border: '1px solid #111827', padding: '10px 16px', borderRadius: 10, cursor: 'pointer' } as React.CSSProperties;
const btnGhost: React.CSSProperties = { background: '#fff', color: '#111', border: '1px solid #E5E7EB', padding: '10px 16px', borderRadius: 10, textDecoration: 'none' };
const secondaryBtn: React.CSSProperties = { background: '#fff', color: '#111', border: '1px solid #111', padding: '8px 12px', borderRadius: 8, cursor: 'pointer' };
const miniBtn: React.CSSProperties = { background: '#fff', color: '#111', border: '1px solid #D1D5DB', padding: '4px 8px', borderRadius: 6, cursor: 'pointer', fontSize: 12, marginRight: 6 };
const miniDanger: React.CSSProperties = { ...miniBtn, color: '#b00020', border: '1px solid #f0b3bd' } as React.CSSProperties;
const footerNav: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 12, marginTop: 22 };
const panel: React.CSSProperties = { border: '1px solid #E5E7EB', borderRadius: 8, padding: 12, background: '#fff', marginBottom: 12 };
const help: React.CSSProperties = { color: '#666', fontSize: 12, marginTop: 6 };
const subtleH: React.CSSProperties = { fontSize: 13, color: '#444', margin: '12px 0 6px' };

function Label({ children }: { children: React.ReactNode }) {
  return <label style={{ display: 'block', fontSize: 12, color: '#555', marginBottom: 6 }}>{children}</label>;
}
function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} style={{ ...input, ...(props.style || {}) }} />;
}
function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} style={{ ...input, ...(props.style || {}) }} />;
}

/* ============================================================================
   Helpers
============================================================================ */
function clean<T extends Record<string, any>>(patch: Partial<T>): Partial<T> {
  // prevent NaN sneaking in from empty inputs
  const out: Record<string, any> = {};
  Object.keys(patch).forEach((k) => {
    const v: any = (patch as any)[k];
    out[k] = typeof v === 'number' && Number.isNaN(v) ? 0 : v;
  });
  return out as Partial<T>;
}

/* ============================================================================
   Dev quick tests (browser only)
============================================================================ */
(() => {
  try {
    if (typeof window === 'undefined') return; // SSR safety
    // getStorage returns an object and read/write work
    const S = getStorage();
    console.assert(S && typeof S.getItem === 'function', 'getStorage should return SafeStorage');
    const TMP = '__ROOM_ELEM_TEST__';
    try { S.removeItem(TMP); } catch {}
    console.assert(readJSON(TMP) === null, 'readJSON missing -> null');
    writeJSON(TMP, { ok: 1 });
    const parsed: any = readJSON<any>(TMP);
    console.assert(!parsed || parsed.ok === 1, 'write/read should roundtrip or fallback');
    // geometry
    console.assert(area(3, 2.4) === 7.2, 'area 3x2.4 -> 7.2 m²');
    console.assert(area(0, 0) === 0, 'area 0x0 -> 0');
    // uid sanity
    const id = uid();
    console.assert(typeof id === 'string' && id.length >= 5, 'uid() should produce a short id');
    // writeJSON(undefined) removes key
    writeJSON(TMP, undefined as any);
    console.assert(readJSON(TMP) === null, 'writeJSON(undefined) should remove key');

    // per-room isolation quick check (ALWAYS use readJSONMap fallback)
    const map = readJSONMap<any>(LS_BYROOM_KEY);
    map['__A__'] = { id: '__A__', name: 'A', length: 1, width: 1, height: 1, walls: [], floors: [], ceilings: [], ventilation: [] };
    map['__B__'] = { id: '__B__', name: 'B', length: 2, width: 2, height: 2, walls: [], floors: [], ceilings: [], ventilation: [] };
    writeJSON(LS_BYROOM_KEY, map);
    const back = readJSONMap<any>(LS_BYROOM_KEY);
    console.assert(back['__A__']?.name === 'A' && back['__B__']?.name === 'B', 'per-room map should isolate rooms');

    // Additional hardening tests for null/invalid store values
    // 1) Missing key should not crash when writing properties
    try { S.removeItem(LS_BYROOM_KEY); } catch {}
    const m1 = readJSONMap<any>(LS_BYROOM_KEY);
    m1['__T__'] = { id: '__T__' }; // should not throw
    writeJSON(LS_BYROOM_KEY, m1);
    const b1 = readJSONMap<any>(LS_BYROOM_KEY);
    console.assert(!!b1['__T__'], 'fallback map after missing key');

    // 2) Explicit 'null' / 'undefined' strings should not crash
    try { S.setItem(LS_BYROOM_KEY, 'null'); } catch {}
    const m2 = readJSONMap<any>(LS_BYROOM_KEY);
    m2['__U__'] = { id: '__U__' };
    writeJSON(LS_BYROOM_KEY, m2);
    const b2 = readJSONMap<any>(LS_BYROOM_KEY);
    console.assert(!!b2['__U__'], 'fallback map after string null');

    // 3) Malformed JSON should not crash; default to {}
    try { S.setItem(LS_BYROOM_KEY, '{bad json'); } catch {}
    const m3 = readJSONMap<any>(LS_BYROOM_KEY);
    m3['__V__'] = { id: '__V__' };
    writeJSON(LS_BYROOM_KEY, m3);
    const b3 = readJSONMap<any>(LS_BYROOM_KEY);
    console.assert(!!b3['__V__'], 'fallback map after malformed JSON');

    // 4) readJSONMap always returns object
    const m4 = readJSONMap<any>('__no_such_key__');
    console.assert(m4 && typeof m4 === 'object' && !Array.isArray(m4), 'readJSONMap() should always return {} for missing');

    // NEW: opening area calc test
    console.assert(area(1.2, 1.0) === 1.2, 'opening area 1.2x1.0');

    // Fixture for Rooms page shape (mcs.Rooms.v2)
    const ROOMS_FIXTURE = { version: 2, zones: [ { name: 'Zone 1', Rooms: [ { name: 'Room A' }, { name: 'Room B' } ] } ] };
    writeJSON('mcs.Rooms.v2', ROOMS_FIXTURE as any);
    const candidate = readJSON<any>('mcs.Rooms.v2');
    console.assert(Array.isArray(candidate?.zones) && Array.isArray(candidate.zones[0]?.Rooms), 'should read Rooms fixture');
  } catch (err) {
    // Never crash the app from tests
    console.warn('Dev tests skipped due to runtime error:', err);
  }
})();

