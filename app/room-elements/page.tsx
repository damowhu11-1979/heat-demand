'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';

/* ============================================================================
   Persistence helpers (safe localStorage wrapper)
============================================================================ */
const LS_KEY = 'mcs.room.elements.v1';

interface SafeStorage {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
  removeItem(k: string): void;
}
const memoryStorage: SafeStorage = (() => {
  const m = new Map<string, string>();
  return {
    getItem: (k) => (m.has(k) ? (m.get(k) as string) : null),
    setItem: (k, v) => void m.set(k, v),
    removeItem: (k) => void m.delete(k),
  };
})();
function getStorage(): SafeStorage {
  if (typeof globalThis === 'undefined') return memoryStorage;
  try {
    const w: any = globalThis as any;
    if (!('localStorage' in w)) return memoryStorage;
    const s: any = w.localStorage;
    try {
      const t = '__mcs_probe__';
      s.setItem(t, '1');
      s.removeItem(t);
    } catch {
      return memoryStorage;
    }
    return {
      getItem: (k: string) => {
        try { return s.getItem(k); } catch { return null; }
      },
      setItem: (k: string, v: string) => { try { s.setItem(k, v); } catch { /* no-op */ } },
      removeItem: (k: string) => { try { s.removeItem(k); } catch { /* no-op */ } },
    } as SafeStorage;
  } catch { return memoryStorage; }
}
function readJSON<T>(k: string): T | null {
  const s = getStorage();
  try {
    const raw = s.getItem(k);
    if (raw === null || raw === '' || raw === 'null' || raw === 'undefined') return null;
    const parsed = JSON.parse(raw);
    return parsed ?? null;
  } catch { return null; }
}
function writeJSON(k: string, v: unknown) {
  const s = getStorage();
  try {
    if (typeof v === 'undefined') { s.removeItem(k); return; }
    s.setItem(k, JSON.stringify(v));
  } catch { /* ignore */ }
}

/* ============================================================================
   Types
============================================================================ */
export type Orientation = 'N'|'NE'|'E'|'SE'|'S'|'SW'|'W'|'NW';
export type Adjacent = 'Exterior' | 'Interior (Heated)' | 'Interior (Unheated)' | 'Ground';
export type OpeningKind = 'window' | 'door' | 'roof_window';

export interface Opening {
  id: string;
  kind: OpeningKind;
  width: number; // m
  height: number; // m
  uValue?: number | '';
}
export interface Wall {
  id: string;
  name: string;
  orientation: Orientation;
  adjacent: Adjacent;
  width: number; // m
  height: number; // m
  uValue?: number | '';
  openings: Opening[]; // windows/doors in this wall
}
export interface FloorEl {
  id: string;
  name: string;
  adjacent: Adjacent; // Ground/Exterior/Interior
  width: number; // m
  height: number; // m (depth/length)
  uValue?: number | '';
}
export interface CeilingEl {
  id: string;
  name: string;
  type: 'Ceiling' | 'Roof';
  adjacent: Exclude<Adjacent, 'Ground'>; // not ground
  width: number; // m
  height: number; // m
  uValue?: number | '';
  openings: Opening[]; // roof windows
}
export interface VentDevice {
  id: string;
  type: 'trickle_vent' | 'mvhr_supply' | 'mvhr_extract' | 'mechanical_extract' | 'passive_vent';
  overrideFlow?: number | '';
  notes?: string;
}
export interface RoomModel {
  name: string;
  length: number; width: number; height: number; // m
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
const area = (w: number, h: number) => +(num(w) * num(h)).toFixed(3);
const openingsArea = (os: Opening[]) => +os.reduce((s, o) => s + num(o.width) * num(o.height), 0).toFixed(3);

/* ============================================================================
   Component
============================================================================ */
export default function RoomElementsPage(): React.JSX.Element {
  const [room, setRoom] = useState<RoomModel>({
    name: 'Bedroom 1',
    length: 0, width: 0, height: 0,
    volumeOverride: null,
    walls: [], floors: [], ceilings: [], ventilation: [],
  });

  // load & persist
  useEffect(() => { const saved = readJSON<RoomModel>(LS_KEY); if (saved) setRoom(saved); }, []);
  useEffect(() => { writeJSON(LS_KEY, room); }, [room]);

  const autoVolume = useMemo(() => +(num(room.length) * num(room.width) * num(room.height)).toFixed(3), [room.length, room.width, room.height]);

  // ----- actions -----
  function addWall() {
    setRoom((r) => ({ ...r, walls: [...r.walls, { id: uid(), name: `Wall ${r.walls.length + 1}`, orientation: 'N', adjacent: 'Exterior', width: 0, height: 0, uValue: '', openings: [] }] }));
  }
  function addFloor() {
    setRoom((r) => ({ ...r, floors: [...r.floors, { id: uid(), name: `Floor ${r.floors.length + 1}`, adjacent: 'Ground', width: 0, height: 0, uValue: '' }] }));
  }
  function addCeiling() {
    setRoom((r) => ({ ...r, ceilings: [...r.ceilings, { id: uid(), name: `Ceiling ${r.ceilings.length + 1}`, type: 'Ceiling', adjacent: 'Exterior', width: 0, height: 0, uValue: '', openings: [] }] }));
  }
  function addVent() {
    setRoom((r) => ({ ...r, ventilation: [...r.ventilation, { id: uid(), type: 'trickle_vent', overrideFlow: '', notes: '' }] }));
  }

  function exportJSON() {
    const data = JSON.stringify({ room }, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `${room.name || 'room'}-elements.json`; a.click();
    URL.revokeObjectURL(url);
  }
  function clearAll() {
    if (typeof window === 'undefined') return;
    const ok = window.confirm('Clear all Room Elements data?');
    if (!ok) return;
    try { getStorage().removeItem(LS_KEY); } catch {}
    setRoom({ name: 'Bedroom 1', length: 0, width: 0, height: 0, volumeOverride: null, walls: [], floors: [], ceilings: [], ventilation: [] });
  }

  // ----- render helpers -----
  const orientations: Orientation[] = ['N','NE','E','SE','S','SW','W','NW'];
  const adjacents: Adjacent[] = ['Exterior','Interior (Heated)','Interior (Unheated)','Ground'];

  return (
    <main style={wrap}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <h1 style={h1}>Room Elements</h1>
        <div style={{ display: 'flex', gap: 8 }}>
          <button style={secondaryBtn} onClick={exportJSON}>Export JSON</button>
          <button style={dangerBtn} onClick={clearAll}>Clear Data</button>
        </div>
      </div>
      <p style={mutedText}>Define walls, floors, ceilings/roofs, openings and ventilation for a single room. Saved automatically.</p>

      {/* Room header */}
      <section style={card}>
        <h2 style={h2}>Room</h2>
        <div style={grid3}>
          <div>
            <Label>Room Name</Label>
            <Input value={room.name} onChange={(e) => setRoom({ ...room, name: e.target.value })} />
          </div>
          <div>
            <Label>Length (m)</Label>
            <Input type="number" step="0.01" value={room.length || ''} onChange={(e) => setRoom({ ...room, length: +e.target.value || 0 })} />
          </div>
          <div>
            <Label>Width (m)</Label>
            <Input type="number" step="0.01" value={room.width || ''} onChange={(e) => setRoom({ ...room, width: +e.target.value || 0 })} />
          </div>
          <div>
            <Label>Height (m)</Label>
            <Input type="number" step="0.01" value={room.height || ''} onChange={(e) => setRoom({ ...room, height: +e.target.value || 0 })} />
          </div>
          <div>
            <Label>Internal Air Volume (m³) – auto</Label>
            <Input value={autoVolume} disabled />
          </div>
          <div>
            <Label>Volume Override (m³)</Label>
            <Input type="number" step="0.01" value={(room.volumeOverride as any) ?? ''} onChange={(e) => setRoom({ ...room, volumeOverride: e.target.value === '' ? null : +e.target.value })} />
          </div>
        </div>
      </section>

      {/* Walls */}
      <section style={{ ...card, marginTop: 16 }}>
        <div style={sectionHeader}><h2 style={h2}>Walls</h2><button style={secondaryBtn} onClick={addWall}>Add Wall</button></div>
        {!!room.walls.length && (
          <div style={{ overflowX: 'auto' }}>
            <div style={tableHeader}>
              <span style={{ flex: 2 }}>Name</span>
              <span style={{ width: 90 }}>Orientation</span>
              <span style={{ width: 160 }}>Adjacent</span>
              <span style={{ width: 110 }}>Width (m)</span>
              <span style={{ width: 110 }}>Height (m)</span>
              <span style={{ width: 120 }}>Gross (m²)</span>
              <span style={{ width: 120 }}>Openings (m²)</span>
              <span style={{ width: 120 }}>Net (m²)</span>
              <span style={{ width: 120 }}>U (W/m²K)</span>
              <span style={{ width: 160 }}>Actions</span>
            </div>
            {room.walls.map((w, idx) => {
              const gross = area(w.width, w.height);
              const oa = openingsArea(w.openings || []);
              const net = Math.max(0, +(gross - oa).toFixed(3));
              return (
                <div key={w.id} style={row}>
                  <div style={{ flex: 2 }}>
                    <Input value={w.name} onChange={(e) => updateWall(idx, { name: e.target.value })} />
                  </div>
                  <div style={{ width: 90 }}>
                    <Select value={w.orientation} onChange={(e) => updateWall(idx, { orientation: e.target.value as any })}>
                      {orientations.map((o) => (<option key={o} value={o}>{o}</option>))}
                    </Select>
                  </div>
                  <div style={{ width: 160 }}>
                    <Select value={w.adjacent} onChange={(e) => updateWall(idx, { adjacent: e.target.value as any })}>
                      {adjacents.map((a) => (<option key={a} value={a}>{a}</option>))}
                    </Select>
                  </div>
                  <div style={{ width: 110 }}>
                    <Input type="number" step="0.01" value={w.width || ''} onChange={(e) => updateWall(idx, { width: +e.target.value || 0 })} />
                  </div>
                  <div style={{ width: 110 }}>
                    <Input type="number" step="0.01" value={w.height || ''} onChange={(e) => updateWall(idx, { height: +e.target.value || 0 })} />
                  </div>
                  <div style={{ width: 120 }}>{gross}</div>
                  <div style={{ width: 120 }}>
                    <div>{oa}</div>
                    <button style={tinyBtn} onClick={() => addOpening(idx, 'wall')}>+ Opening</button>
                  </div>
                  <div style={{ width: 120 }}>{net}</div>
                  <div style={{ width: 120 }}>
                    <Input type="number" step="0.01" value={w.uValue ?? ''} onChange={(e) => updateWall(idx, { uValue: e.target.value === '' ? '' : +e.target.value })} />
                  </div>
                  <div style={{ width: 160, display: 'flex', gap: 6 }}>
                    <button style={tinyBtn} onClick={() => duplicateWall(idx)}>Duplicate</button>
                    <button style={linkDanger} onClick={() => removeWall(idx)}>Remove</button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        {!room.walls.length && <p style={mutedText}>No walls yet. Add your first wall.</p>}

        {/* Per-wall openings list */}
        {room.walls.map((w, idx) => (
          <div key={w.id + '-openings'} style={{ marginTop: 8 }}>
            {!!w.openings.length && <h3 style={h3}>Openings in {w.name}</h3>}
            {w.openings.map((o, j) => (
              <div key={o.id} style={{ ...row, paddingLeft: 8 }}>
                <div style={{ width: 140 }}>
                  <Select value={o.kind} onChange={(e) => updateOpening(idx, j, 'wall', { kind: e.target.value as OpeningKind })}>
                    <option value="window">Window</option>
                    <option value="door">Door</option>
                    <option value="roof_window">Roof Window</option>
                  </Select>
                </div>
                <div style={{ width: 120 }}>
                  <Input type="number" step="0.01" placeholder="Width (m)" value={o.width || ''} onChange={(e) => updateOpening(idx, j, 'wall', { width: +e.target.value || 0 })} />
                </div>
                <div style={{ width: 120 }}>
                  <Input type="number" step="0.01" placeholder="Height (m)" value={o.height || ''} onChange={(e) => updateOpening(idx, j, 'wall', { height: +e.target.value || 0 })} />
                </div>
                <div style={{ width: 120 }}>{area(o.width, o.height)}</div>
                <div style={{ width: 140 }}>
                  <Input type="number" step="0.01" placeholder="U-Value" value={o.uValue ?? ''} onChange={(e) => updateOpening(idx, j, 'wall', { uValue: e.target.value === '' ? '' : +e.target.value })} />
                </div>
                <button style={linkDanger} onClick={() => removeOpening(idx, j, 'wall')}>Remove</button>
              </div>
            ))}
          </div>
        ))}
      </section>

      {/* Floors */}
      <section style={{ ...card, marginTop: 16 }}>
        <div style={sectionHeader}><h2 style={h2}>Floors</h2><button style={secondaryBtn} onClick={addFloor}>Add Floor</button></div>
        {room.floors.length ? room.floors.map((f, i) => (
          <div key={f.id} style={row}>
            <div style={{ flex: 2 }}><Input value={f.name} onChange={(e) => updateFloor(i, { name: e.target.value })} /></div>
            <div style={{ width: 160 }}>
              <Select value={f.adjacent} onChange={(e) => updateFloor(i, { adjacent: e.target.value as Adjacent })}>
                {adjacents.map((a) => (<option key={a} value={a}>{a}</option>))}
              </Select>
            </div>
            <div style={{ width: 110 }}><Input type="number" step="0.01" value={f.width || ''} onChange={(e) => updateFloor(i, { width: +e.target.value || 0 })} /></div>
            <div style={{ width: 140 }}><Input type="number" step="0.01" value={f.height || ''} onChange={(e) => updateFloor(i, { height: +e.target.value || 0 })} /></div>
            <div style={{ width: 120 }}>{area(f.width, f.height)}</div>
            <div style={{ width: 120 }}><Input type="number" step="0.01" value={f.uValue ?? ''} onChange={(e) => updateFloor(i, { uValue: e.target.value === '' ? '' : +e.target.value })} /></div>
            <div style={{ width: 160, display: 'flex', gap: 6 }}>
              <button style={tinyBtn} onClick={() => duplicateFloor(i)}>Duplicate</button>
              <button style={linkDanger} onClick={() => removeFloor(i)}>Remove</button>
            </div>
          </div>
        )) : <p style={mutedText}>No floors yet.</p>}
      </section>

      {/* Ceilings / Roofs */}
      <section style={{ ...card, marginTop: 16 }}>
        <div style={sectionHeader}><h2 style={h2}>Ceilings / Roofs</h2><button style={secondaryBtn} onClick={addCeiling}>Add Ceiling/Roof</button></div>
        {room.ceilings.length ? room.ceilings.map((c, i) => {
          const gross = area(c.width, c.height);
          const oa = openingsArea(c.openings || []);
          const net = Math.max(0, +(gross - oa).toFixed(3));
          return (
            <React.Fragment key={c.id}>
              <div style={row}>
                <div style={{ flex: 2 }}><Input value={c.name} onChange={(e) => updateCeiling(i, { name: e.target.value })} /></div>
                <div style={{ width: 120 }}>
                  <Select value={c.type} onChange={(e) => updateCeiling(i, { type: e.target.value as any })}>
                    <option value="Ceiling">Ceiling</option>
                    <option value="Roof">Roof</option>
                  </Select>
                </div>
                <div style={{ width: 160 }}>
                  <Select value={c.adjacent} onChange={(e) => updateCeiling(i, { adjacent: e.target.value as any })}>
                    {(['Exterior','Interior (Heated)','Interior (Unheated)'] as const).map((a) => (<option key={a} value={a}>{a}</option>))}
                  </Select>
                </div>
                <div style={{ width: 110 }}><Input type="number" step="0.01" value={c.width || ''} onChange={(e) => updateCeiling(i, { width: +e.target.value || 0 })} /></div>
                <div style={{ width: 110 }}><Input type="number" step="0.01" value={c.height || ''} onChange={(e) => updateCeiling(i, { height: +e.target.value || 0 })} /></div>
                <div style={{ width: 120 }}>{gross}</div>
                <div style={{ width: 120 }}>
                  <div>{oa}</div>
                  <button style={tinyBtn} onClick={() => addOpening(i, 'ceiling')}>+ Roof Window</button>
                </div>
                <div style={{ width: 120 }}>{net}</div>
                <div style={{ width: 120 }}><Input type="number" step="0.01" value={c.uValue ?? ''} onChange={(e) => updateCeiling(i, { uValue: e.target.value === '' ? '' : +e.target.value })} /></div>
                <div style={{ width: 160, display: 'flex', gap: 6 }}>
                  <button style={tinyBtn} onClick={() => duplicateCeiling(i)}>Duplicate</button>
                  <button style={linkDanger} onClick={() => removeCeiling(i)}>Remove</button>
                </div>
              </div>
              {c.openings.map((o, j) => (
                <div key={o.id} style={{ ...row, paddingLeft: 8 }}>
                  <div style={{ width: 140 }}>
                    <Select value={o.kind} onChange={(e) => updateOpening(i, j, 'ceiling', { kind: e.target.value as OpeningKind })}>
                      <option value="roof_window">Roof Window</option>
                      <option value="window">Window</option>
                      <option value="door">Door</option>
                    </Select>
                  </div>
                  <div style={{ width: 120 }}><Input type="number" step="0.01" placeholder="Width (m)" value={o.width || ''} onChange={(e) => updateOpening(i, j, 'ceiling', { width: +e.target.value || 0 })} /></div>
                  <div style={{ width: 120 }}><Input type="number" step="0.01" placeholder="Height (m)" value={o.height || ''} onChange={(e) => updateOpening(i, j, 'ceiling', { height: +e.target.value || 0 })} /></div>
                  <div style={{ width: 120 }}>{area(o.width, o.height)}</div>
                  <div style={{ width: 140 }}><Input type="number" step="0.01" placeholder="U-Value" value={o.uValue ?? ''} onChange={(e) => updateOpening(i, j, 'ceiling', { uValue: e.target.value === '' ? '' : +e.target.value })} /></div>
                  <button style={linkDanger} onClick={() => removeOpening(i, j, 'ceiling')}>Remove</button>
                </div>
              ))}
            </React.Fragment>
          );
        }) : <p style={mutedText}>No ceilings/roofs yet.</p>}
      </section>

      {/* Ventilation */}
      <section style={{ ...card, marginTop: 16 }}>
        <div style={sectionHeader}><h2 style={h2}>Ventilation Devices</h2><button style={secondaryBtn} onClick={addVent}>Add Device</button></div>
        {room.ventilation.length ? room.ventilation.map((v, i) => (
          <div key={v.id} style={row}>
            <div style={{ width: 220 }}>
              <Select value={v.type} onChange={(e) => updateVent(i, { type: e.target.value as VentDevice['type'] })}>
                <option value="trickle_vent">Trickle vent</option>
                <option value="mvhr_supply">MVHR supply</option>
                <option value="mvhr_extract">MVHR extract</option>
                <option value="mechanical_extract">Mechanical extract</option>
                <option value="passive_vent">Passive vent</option>
              </Select>
            </div>
            <div style={{ width: 120, alignSelf: 'center' }}>Default: {defaultVentFlows[v.type]} l/s</div>
            <div style={{ width: 160 }}><Input type="number" step="0.1" placeholder="Override (l/s)" value={v.overrideFlow ?? ''} onChange={(e) => updateVent(i, { overrideFlow: e.target.value === '' ? '' : +e.target.value })} /></div>
            <div style={{ flex: 1 }}><Input placeholder="Notes (optional)" value={v.notes || ''} onChange={(e) => updateVent(i, { notes: e.target.value })} /></div>
            <div style={{ width: 160, display: 'flex', gap: 6 }}>
              <button style={tinyBtn} onClick={() => duplicateVent(i)}>Duplicate</button>
              <button style={linkDanger} onClick={() => removeVent(i)}>Remove</button>
            </div>
          </div>
        )) : <p style={mutedText}>No ventilation devices yet.</p>}
      </section>

      {/* footer nav */}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 18 }}>
        <Link href="/rooms" style={{ ...secondaryBtn, textDecoration: 'none' }}>← Back: Heated Rooms</Link>
        <Link href="/room-detail" style={{ ...primaryBtn, textDecoration: 'none' }}>Next: Room Detail →</Link>
      </div>
    </main>
  );

  /* -------------------- updaters -------------------- */
  function updateWall(i: number, patch: Partial<Wall>) {
    setRoom((r) => ({ ...r, walls: r.walls.map((w, idx) => (idx === i ? { ...w, ...clean(patch) } : w)) }));
  }
  function duplicateWall(i: number) {
    setRoom((r) => ({ ...r, walls: [...r.walls.slice(0, i+1), { ...r.walls[i], id: uid(), name: r.walls[i].name + ' (copy)' }, ...r.walls.slice(i+1)] }));
  }
  function removeWall(i: number) {
    setRoom((r) => ({ ...r, walls: r.walls.filter((_, idx) => idx !== i) }));
  }
  function addOpening(i: number, owner: 'wall'|'ceiling') {
    const o: Opening = { id: uid(), kind: owner === 'ceiling' ? 'roof_window' : 'window', width: 0, height: 0, uValue: '' };
    if (owner === 'wall') setRoom((r) => ({ ...r, walls: r.walls.map((w, idx) => (idx === i ? { ...w, openings: [...(w.openings||[]), o] } : w)) }));
    else setRoom((r) => ({ ...r, ceilings: r.ceilings.map((c, idx) => (idx === i ? { ...c, openings: [...(c.openings||[]), o] } : c)) }));
  }
  function updateOpening(i: number, j: number, owner: 'wall'|'ceiling', patch: Partial<Opening>) {
    if (owner === 'wall') setRoom((r) => ({ ...r, walls: r.walls.map((w, idx) => idx === i ? { ...w, openings: w.openings.map((o, k) => k === j ? { ...o, ...clean(patch) } : o) } : w) }));
    else setRoom((r) => ({ ...r, ceilings: r.ceilings.map((c, idx) => idx === i ? { ...c, openings: c.openings.map((o, k) => k === j ? { ...o, ...clean(patch) } : o) } : c) }));
  }
  function removeOpening(i: number, j: number, owner: 'wall'|'ceiling') {
    if (owner === 'wall') setRoom((r) => ({ ...r, walls: r.walls.map((w, idx) => idx === i ? { ...w, openings: w.openings.filter((_, k) => k !== j) } : w) }));
    else setRoom((r) => ({ ...r, ceilings: r.ceilings.map((c, idx) => idx === i ? { ...c, openings: c.openings.filter((_, k) => k !== j) } : c) }));
  }

  function updateFloor(i: number, patch: Partial<FloorEl>) {
    setRoom((r) => ({ ...r, floors: r.floors.map((f, idx) => (idx === i ? { ...f, ...clean(patch) } : f)) }));
  }
  function duplicateFloor(i: number) {
    setRoom((r) => ({ ...r, floors: [...r.floors.slice(0, i+1), { ...r.floors[i], id: uid(), name: r.floors[i].name + ' (copy)' }, ...r.floors.slice(i+1)] }));
  }
  function removeFloor(i: number) {
    setRoom((r) => ({ ...r, floors: r.floors.filter((_, idx) => idx !== i) }));
  }

  function updateCeiling(i: number, patch: Partial<CeilingEl>) {
    setRoom((r) => ({ ...r, ceilings: r.ceilings.map((c, idx) => (idx === i ? { ...c, ...clean(patch) } : c)) }));
  }
  function duplicateCeiling(i: number) {
    setRoom((r) => ({ ...r, ceilings: [...r.ceilings.slice(0, i+1), { ...r.ceilings[i], id: uid(), name: r.ceilings[i].name + ' (copy)' }, ...r.ceilings.slice(i+1)] }));
  }
  function removeCeiling(i: number) {
    setRoom((r) => ({ ...r, ceilings: r.ceilings.filter((_, idx) => idx !== i) }));
  }

  function updateVent(i: number, patch: Partial<VentDevice>) {
    setRoom((r) => ({ ...r, ventilation: r.ventilation.map((v, idx) => (idx === i ? { ...v, ...clean(patch) } : v)) }));
  }
  function duplicateVent(i: number) {
    setRoom((r) => ({ ...r, ventilation: [...r.ventilation.slice(0, i+1), { ...r.ventilation[i], id: uid() }, ...r.ventilation.slice(i+1)] }));
  }
  function removeVent(i: number) {
    setRoom((r) => ({ ...r, ventilation: r.ventilation.filter((_, idx) => idx !== i) }));
  }
}

/* ============================================================================
   Tiny UI bits
============================================================================ */
function Label({ children }: { children: React.ReactNode }) { return (<label style={{ display: 'block', fontSize: 12, color: '#555', marginBottom: 6 }}>{children}</label>); }
function Input(props: React.InputHTMLAttributes<HTMLInputElement>) { return <input {...props} style={{ ...input, ...(props.style || {}) }} />; }
function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) { return <select {...props} style={{ ...input, ...(props.style || {}) }} />; }

/* ============================================================================
   Styles
============================================================================ */
const wrap: React.CSSProperties = { maxWidth: 1120, margin: '0 auto', padding: 24, fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif' };
const h1: React.CSSProperties = { fontSize: 28, margin: '6px 0 10px' };
const h2: React.CSSProperties = { fontSize: 18, margin: '0 0 8px', letterSpacing: 1.2 };
const h3: React.CSSProperties = { fontSize: 16, margin: '10px 0 6px' };
const mutedText: React.CSSProperties = { color: '#666', fontSize: 13, marginBottom: 12 };
const card: React.CSSProperties = { background: '#fff', border: '1px solid #e6e6e6', borderRadius: 14, padding: 16 };
const grid3: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 12 };
const row: React.CSSProperties = { display: 'flex', gap: 8, padding: '8px 4px', alignItems: 'center', borderBottom: '1px solid #f2f2f2' };
const tableHeader: React.CSSProperties = { ...row, fontSize: 12, color: '#666', fontWeight: 600 } as React.CSSProperties;
const sectionHeader: React.CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 };
const input: React.CSSProperties = { width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid #ddd', outline: 'none', boxSizing: 'border-box' };
const primaryBtn: React.CSSProperties = { background: '#111', color: '#fff', border: '1px solid #111', padding: '10px 16px', borderRadius: 12, cursor: 'pointer' };
const secondaryBtn: React.CSSProperties = { background: '#fff', color: '#111', border: '1px solid #ddd', padding: '10px 16px', borderRadius: 12, cursor: 'pointer' };
const tinyBtn: React.CSSProperties = { background: '#fff', color: '#111', border: '1px solid #ddd', padding: '6px 10px', borderRadius: 10, cursor: 'pointer', fontSize: 12 };
const linkDanger: React.CSSProperties = { color: '#b00020', textDecoration: 'underline', background: 'none', border: 0, cursor: 'pointer', padding: 0 };
const dangerBtn: React.CSSProperties = { background: '#fff', color: '#b00020', border: '1px solid #f0b3bd', padding: '10px 16px', borderRadius: 12, cursor: 'pointer' };

/* ============================================================================
   Helpers
============================================================================ */
function clean<T extends Record<string, any>>(patch: Partial<T>): Partial<T> {
  // prevent NaN sneaking in from empty inputs
  const out: Record<string, any> = {};
  Object.keys(patch).forEach((k) => {
    const v: any = (patch as any)[k];
    out[k] = (typeof v === 'number' && Number.isNaN(v)) ? 0 : v;
  });
  return out as Partial<T>;
}
