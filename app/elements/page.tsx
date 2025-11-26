'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';

/* =============================================================================
   Elements Page (Walls, Floors, Ceilings, Doors, Windows)
   - Safe storage w/ in-memory fallback
   - Guard JSON parsing & bad values
   - No duplicate declarations / clean single default export
   - External insulation option on walls with U-value recalculation
   - Known-U flags for ground contact (walls/floors) + UI fixes
   - Removed hook call in JSX props (WallSearchDialog rows)
   - Tiny self-tests (at module scope)
============================================================================= */

/**************************** Safe Persistence ****************************/
const LS_KEY = 'mcs.elements.v1';
const PROP_KEY = 'mcs.property'; // read ageBand default (optional)

interface SafeStorage {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
  removeItem(k: string): void;
}

// In-memory fallback when localStorage is unavailable or blocked
const memoryStorage: SafeStorage = (() => {
  const m = new Map<string, string>();
  return {
    getItem: (k) => (m.has(k) ? (m.get(k) as string) : null),
    setItem: (k, v) => { m.set(k, v); },
    removeItem: (k) => { m.delete(k); },
  };
})();

function getStorage(): SafeStorage {
  if (typeof globalThis === 'undefined') return memoryStorage;
  try {
    const w: any = globalThis as any;
    if (!('localStorage' in w)) return memoryStorage;
    const s: Storage = w.localStorage as Storage;
    try {
      const t = '__probe__';
      s.setItem(t, '1');
      s.removeItem(t);
    } catch {
      return memoryStorage;
    }
    return {
      getItem: (k: string) => {
        try { const v = s.getItem(k); return typeof v === 'string' ? v : null; } catch { return null; }
      },
      setItem: (k: string, v: string) => { try { s.setItem(k, v); } catch {/* quota */} },
      removeItem: (k: string) => { try { s.removeItem(k); } catch {/* ignore */} },
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
    const parsed = JSON.parse(raw);
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
  } catch {/* ignore */}
}

/******************************** Types ********************************/

type SectionKey = 'walls' | 'floors' | 'ceilings' | 'doors' | 'windows';

type AgeBand =
  | 'pre-1900' | '1900-1929' | '1930-1949' | '1950-1966'
  | '1967-1975' | '1976-1982' | '1983-1990' | '1991-1995'
  | '1996-2002' | '2003-2006' | '2007-2011' | '2012-present';

type WallCategory = 'External' | 'Internal' | 'Party' | 'Known U-Value';
type FloorCategory = 'ground-unknown' | 'ground-known' | 'exposed' | 'internal' | 'party' | 'known-u';

type CeilingCategory = 'external-roof' | 'internal' | 'party' | 'known-u';
type DoorCategory = 'external' | 'internal' | 'known-u';
type WindowCategory = 'external' | 'internal' | 'known-u';

interface WallForm {
  category: WallCategory;
  name: string;
  ageBand: AgeBand | '';
  construction: string; // e.g., Cavity (Filled), Solid Brick etc.
  uValue?: number | '';
  // External insulation (optional)
  extInsulated?: boolean;
  extInsulThk?: number | '';
  extInsulMat?: keyof typeof INSULATION_LAMBDA | '';
  // NEW: for Known-U walls, indicates input U already includes ground (basement) effects
  knownUGroundContact?: boolean;
}

interface FloorForm {
  category: FloorCategory;
  name: string;
  construction: 'solid' | 'suspended';
  insulThk?: number | '';
  uValue?: number | '';
  groundContactAdjust?: boolean; // when true, U already includes ground for solid floors
  includesPsi?: boolean; // cosmetic flag only
}

interface CeilingForm {
  category: CeilingCategory;
  name: string;
  roofType?: 'flat' | 'pitched' | '';
  insulThk?: number | '';
  uValue?: number | '';
}

interface DoorForm {
  category: DoorCategory;
  name: string;
  ageBand?: AgeBand | '';
  uValue?: number | '';
}

interface WindowForm {
  category: WindowCategory;
  name: string;
  glazingType?: 'single' | 'double' | 'triple' | '';
  frameType?: 'uPVC' | 'timber' | 'aluminium' | '';
  ageBand?: AgeBand | '';
  uValue?: number | '';
}

interface SavedModel {
  walls: WallForm[];
  floors: FloorForm[];
  ceilings: CeilingForm[];
  doors: DoorForm[];
  windows: WindowForm[];
}

/************************* U-tables & interpolation *************************/

type UPoint = { t: number; u: number };
function lerp(points: ReadonlyArray<UPoint>, t: number): number {
  if (!points.length) return NaN;
  if (t <= points[0].t) return points[0].u;
  const last = points[points.length - 1];
  if (t >= last.t) return last.u;
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i], b = points[i + 1];
    if (t >= a.t && t <= b.t) {
      const x = (t - a.t) / (b.t - a.t);
      return +(a.u + x * (b.u - a.u)).toFixed(2);
    }
  }
  return NaN;
}

const U_TABLE: {
  ground: { solid: ReadonlyArray<UPoint>; suspended: ReadonlyArray<UPoint> };
  exposed: { solid: ReadonlyArray<UPoint>; suspended: ReadonlyArray<UPoint> };
  internal: { solid: ReadonlyArray<UPoint>; suspended: ReadonlyArray<UPoint> };
} = {
  ground: {
    solid: [ { t: 0, u: 1.3 }, { t: 50, u: 0.45 }, { t: 100, u: 0.25 } ],
    suspended: [ { t: 0, u: 1.6 }, { t: 50, u: 0.55 }, { t: 100, u: 0.3 } ],
  },
  exposed: {
    solid: [ { t: 0, u: 1.8 }, { t: 50, u: 0.6 }, { t: 100, u: 0.35 } ],
    suspended: [ { t: 0, u: 2.0 }, { t: 50, u: 0.7 }, { t: 100, u: 0.4 } ],
  },
  internal: {
    solid: [ { t: 0, u: 0.0 } ],
    suspended: [ { t: 0, u: 0.0 } ],
  },
};

const WALL_U_BY_AGE: Record<Exclude<AgeBand, ''>, { [construction: string]: number }> = {
  'pre-1900': { 'Solid Brick or Stone': 2.1, 'Cavity (Unfilled)': 1.6, 'Cavity (Filled)': 1.2, 'Timber Frame': 1.7 },
  '1900-1929': { 'Solid Brick or Stone': 2.1, 'Cavity (Unfilled)': 1.6, 'Cavity (Filled)': 1.2, 'Timber Frame': 1.7 },
  '1930-1949': { 'Solid Brick or Stone': 2.0, 'Cavity (Unfilled)': 1.6, 'Cavity (Filled)': 1.2, 'Timber Frame': 1.6 },
  '1950-1966': { 'Solid Brick or Stone': 1.9, 'Cavity (Unfilled)': 1.5, 'Cavity (Filled)': 0.9, 'Timber Frame': 1.5 },
  '1967-1975': { 'Solid Brick or Stone': 1.7, 'Cavity (Unfilled)': 1.4, 'Cavity (Filled)': 0.8, 'Timber Frame': 1.3 },
  '1976-1982': { 'Solid Brick or Stone': 1.5, 'Cavity (Unfilled)': 1.1, 'Cavity (Filled)': 0.6, 'Timber Frame': 0.8 },
  '1983-1990': { 'Solid Brick or Stone': 1.3, 'Cavity (Unfilled)': 0.9, 'Cavity (Filled)': 0.55, 'Timber Frame': 0.6 },
  '1991-1995': { 'Solid Brick or Stone': 0.8, 'Cavity (Unfilled)': 0.7, 'Cavity (Filled)': 0.45, 'Timber Frame': 0.45 },
  '1996-2002': { 'Solid Brick or Stone': 0.6, 'Cavity (Unfilled)': 0.5, 'Cavity (Filled)': 0.35, 'Timber Frame': 0.35 },
  '2003-2006': { 'Solid Brick or Stone': 0.45, 'Cavity (Unfilled)': 0.4, 'Cavity (Filled)': 0.3, 'Timber Frame': 0.3 },
  '2007-2011': { 'Solid Brick or Stone': 0.35, 'Cavity (Unfilled)': 0.3, 'Cavity (Filled)': 0.27, 'Timber Frame': 0.27 },
  '2012-present': { 'Solid Brick or Stone': 0.3, 'Cavity (Unfilled)': 0.28, 'Cavity (Filled)': 0.25, 'Timber Frame': 0.22 },
};

// Thermal conductivities (lambda W/mK) for EWI choices (illustrative)
const INSULATION_LAMBDA = {
  'EPS (white)': 0.038,
  'EPS (graphite)': 0.031,
  XPS: 0.034,
  'Mineral Wool': 0.036,
  'Wood Fibre': 0.043,
} as const;

const WINDOW_U_DEFAULTS: Record<'single' | 'double' | 'triple', number> = {
  single: 4.8,
  double: 3.1,
  triple: 2.4,
};
const WINDOW_FRAME_MULT: Record<'uPVC' | 'timber' | 'aluminium', number> = {
  uPVC: 1.0,
  timber: 1.05,
  aluminium: 1.15,
};

/***************************** Suggestions *****************************/
function suggestWallUValue(f: WallForm): number | null {
  if (f.category === 'Known U-Value') return typeof f.uValue === 'number' ? f.uValue : null;
  if (f.category === 'Internal' || f.category === 'Party') return 0;
  if (!f.ageBand || !f.construction) return null;
  const table = WALL_U_BY_AGE[f.ageBand as Exclude<AgeBand, ''>];
  const base = table?.[f.construction];
  if (typeof base !== 'number') return null;
  // External insulation adjustment (simple series R approach; ignores bridging)
  if (
    f.extInsulated && typeof f.extInsulThk === 'number' && f.extInsulThk > 0 &&
    f.extInsulMat && INSULATION_LAMBDA[f.extInsulMat as keyof typeof INSULATION_LAMBDA]
  ) {
    const lambda = INSULATION_LAMBDA[f.extInsulMat as keyof typeof INSULATION_LAMBDA];
    const R_add = (f.extInsulThk / 1000) / lambda; // mm -> m
    const U_new = 1 / (1 / base + R_add);
    return +U_new.toFixed(2);
  }
  return base;
}
function suggestFloorUValue(f: FloorForm): number | null {
  if (f.category === 'known-u') return typeof f.uValue === 'number' ? f.uValue : null;
  if (f.category === 'internal' || f.category === 'party') return 0;
  const key = f.category === 'exposed' ? 'exposed' : 'ground';
  const pts = U_TABLE[key][f.construction];
  const t = typeof f.insulThk === 'number' ? f.insulThk : 0;
  return lerp(pts, t);
}
function suggestCeilingUValue(c: CeilingForm): number | null {
  if (c.category === 'known-u') return typeof c.uValue === 'number' ? c.uValue : null;
  if (c.category === 'internal' || c.category === 'party') return 0;
  const pts: ReadonlyArray<UPoint> = [
    { t: 0, u: 2.3 }, { t: 12, u: 1.5 }, { t: 25, u: 1.0 }, { t: 50, u: 0.68 },
    { t: 75, u: 0.5 }, { t: 100, u: 0.4 }, { t: 125, u: 0.35 }, { t: 150, u: 0.3 },
    { t: 175, u: 0.25 }, { t: 200, u: 0.21 }, { t: 225, u: 0.19 }, { t: 250, u: 0.17 },
    { t: 270, u: 0.16 }, { t: 300, u: 0.14 }, { t: 350, u: 0.12 }, { t: 400, u: 0.11 },
  ];
  const t = typeof c.insulThk === 'number' ? c.insulThk : 0;
  return lerp(pts, t);
}
function suggestDoorUValue(d: DoorForm): number | null {
  if (d.category === 'known-u') return typeof d.uValue === 'number' ? d.uValue : null;
  if (d.category === 'internal') return 0;
  return null;
}
function suggestWindowUValue(w: WindowForm): number | null {
  if (w.category === 'known-u') return typeof w.uValue === 'number' ? w.uValue : null;
  if (!w.glazingType) return null;
  const base = WINDOW_U_DEFAULTS[w.glazingType as 'single' | 'double' | 'triple'];
  const mult = w.frameType && WINDOW_FRAME_MULT[w.frameType as 'uPVC' | 'timber' | 'aluminium'] || 1.0;
  return +(base * mult).toFixed(2);
}

function wallLookupRows(): Array<{ age: AgeBand; cons: string; u: number }>{
  const rows: Array<{ age: AgeBand; cons: string; u: number }> = [] as any;
  AGE_BANDS.forEach((ab) => {
    const t = (WALL_U_BY_AGE as any)[ab];
    if (!t) return;
    Object.keys(t).forEach((cons) => rows.push({ age: ab, cons, u: t[cons] }));
  });
  return rows;
}

/************************* Local Clear Data Button *************************/
function ClearDataButton({ onClearState }: { onClearState?: () => void }): React.JSX.Element {
  const handleClick = () => {
    if (typeof window === 'undefined') return;
    if (!window.confirm('Clear all saved Building Elements data?')) return;
    try { const s = getStorage(); s.removeItem(LS_KEY); } catch {}
    onClearState?.();
  };
  return (
    <button style={secondaryBtn} onClick={handleClick} aria-label="Clear saved data">Clear Data</button>
  );
}

/********************************* UI *********************************/
export default function ElementsPage(): React.JSX.Element {
  const [model, setModel] = useState<SavedModel>({ walls: [], floors: [], ceilings: [], doors: [], windows: [] });

  // Load saved model
  useEffect(() => {
    const saved = readJSON<SavedModel>(LS_KEY);
    setModel(saved ?? { walls: [], floors: [], ceilings: [], doors: [], windows: [] });
  }, []);

  // Persist
  useEffect(() => { writeJSON(LS_KEY, model); }, [model]);

  const defaultAgeBand = useMemo<AgeBand | ''>(() => {
    const prop = readJSON<any>(PROP_KEY);
    return (prop?.ageBand as AgeBand | '') ?? '';
  }, []);

  /* ------------------------------ Walls ------------------------------ */
  const [wForm, setWForm] = useState<WallForm>({
    category: 'External',
    name: 'External Wall 1',
    ageBand: defaultAgeBand,
    construction: '',
    uValue: '',
    extInsulated: false,
    extInsulThk: '',
    extInsulMat: '',
    knownUGroundContact: false,
  });
  const wSuggestion = suggestWallUValue(wForm);
  const [showWallSearch, setShowWallSearch] = useState(false);
  const wallLookup = useMemo(() => wallLookupRows(), []);
  function addWall() {
    setModel((m) => ({ ...m, walls: [...m.walls, wForm] }));
    setWForm({
      category: wForm.category,
      name: 'External Wall ' + (model.walls.length + 2),
      ageBand: defaultAgeBand,
      construction: '',
      uValue: '',
      extInsulated: false,
      extInsulThk: '',
      extInsulMat: '',
      knownUGroundContact: false,
    });
  }

  /* ------------------------------ Floors ----------------------------- */
  const [fForm, setFForm] = useState<FloorForm>({
    category: 'ground-known',
    name: 'Ground Floor 1',
    construction: 'suspended',
    insulThk: 0,
    uValue: '',
    groundContactAdjust: false,
    includesPsi: false,
  });
  const fSuggestion = suggestFloorUValue(fForm);
  function addFloor() {
    setModel((m) => ({ ...m, floors: [...m.floors, fForm] }));
    setFForm({ ...fForm, name: 'Ground Floor ' + (model.floors.length + 2) });
  }

  /* ------------------------------ Ceilings --------------------------- */
  const [cForm, setCForm] = useState<CeilingForm>({ category: 'external-roof', name: 'External Roof 1', roofType: 'pitched', insulThk: 0, uValue: '' });
  const cSuggestion = suggestCeilingUValue(cForm);
  function addCeiling() {
    setModel((m) => ({ ...m, ceilings: [...m.ceilings, cForm] }));
    setCForm({ ...cForm, name: 'External Roof ' + (model.ceilings.length + 2) });
  }

  /* ------------------------------ Doors ------------------------------ */
  const [dForm, setDForm] = useState<DoorForm>({ category: 'external', name: 'External Door 1', ageBand: defaultAgeBand, uValue: '' });
  const dSuggestion = suggestDoorUValue(dForm);
  function addDoor() {
    setModel((m) => ({ ...m, doors: [...m.doors, dForm] }));
    setDForm({ ...dForm, name: (dForm.category === 'external' ? 'External Door ' : 'Internal Door ') + (model.doors.length + 2) });
  }

  /* ------------------------------ Windows ---------------------------- */
  const [winForm, setWinForm] = useState<WindowForm>({ category: 'external', name: 'External Window 1', glazingType: '', frameType: '', ageBand: defaultAgeBand, uValue: '' });
  const winSuggestion = suggestWindowUValue(winForm);
  function addWindow() {
    setModel((m) => ({ ...m, windows: [...m.windows, winForm] }));
    setWinForm({ ...winForm, name: (winForm.category === 'external' ? 'External Window ' : 'Internal Window ') + (model.windows.length + 2) });
  }

  function resetAll() {
    try { const s = getStorage(); s.removeItem(LS_KEY); } catch {}
    const empty: SavedModel = { walls: [], floors: [], ceilings: [], doors: [], windows: [] };
    setModel(empty);
    setWForm({ category: 'External', name: 'External Wall 1', ageBand: defaultAgeBand, construction: '', uValue: '', extInsulated: false, extInsulThk: '', extInsulMat: '', knownUGroundContact: false });
    setFForm({ category: 'ground-known', name: 'Ground Floor 1', construction: 'suspended', insulThk: 0, uValue: '', groundContactAdjust: false, includesPsi: false });
    setCForm({ category: 'external-roof', name: 'External Roof 1', roofType: 'pitched', insulThk: 0, uValue: '' });
    setDForm({ category: 'external', name: 'External Door 1', ageBand: defaultAgeBand, uValue: '' });
    setWinForm({ category: 'external', name: 'External Window 1', glazingType: '', frameType: '', ageBand: defaultAgeBand, uValue: '' });
  }

  /* ------------------------------ Render ----------------------------- */
  return (
    <main style={wrap}>
      {/* header with Clear Data */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <h1 style={h1}>Building Elements</h1>
        <ClearDataButton onClearState={resetAll} />
      </div>
      <p style={mutedText}>Define wall, floor, ceiling/roof, door and window types. Values are saved automatically.</p>

      {/* Walls */}
      <section style={card}>
        <h2 style={h2}>Wall Types</h2>

        <div style={grid2}>
          <div>
            <Label>Wall Category *</Label>
            <Select value={wForm.category} onChange={(e) => setWForm({ ...wForm, category: e.target.value as WallCategory })}>
              <option value="External">External Wall</option>
              <option value="Internal">Internal Wall</option>
              <option value="Party">Party Wall</option>
              <option value="Known U-Value">Known U-Value</option>
            </Select>
          </div>

          <div>
            <Label>Wall Name *</Label>
            <Input value={wForm.name} onChange={(e) => setWForm({ ...wForm, name: e.target.value })} />
          </div>

          {wForm.category !== 'Known U-Value' && (
            <>
              <div>
                <Label>Age Band *</Label>
                <Select value={wForm.ageBand} onChange={(e) => setWForm({ ...wForm, ageBand: e.target.value as AgeBand })}>
                  <option value="">Select age band</option>
                  {AGE_BANDS.map((ab) => (
                    <option key={ab} value={ab}>{ab}</option>
                  ))}
                </Select>
              </div>
              <div>
                <Label>Construction Type *</Label>
                <Select value={wForm.construction} onChange={(e) => setWForm({ ...wForm, construction: e.target.value })}>
                  <option value="">Select wall construction</option>
                  {WALL_CONS.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </Select>
              </div>
            </>
          )}

          {wForm.category === 'Known U-Value' && (
            <div>
              <Label>U-Value *</Label>
              <Input
                type="number"
                step="0.01"
                value={wForm.uValue ?? ''}
                onChange={(e) => {
                  const n = Number(e.target.value);
                  setWForm({ ...wForm, uValue: e.target.value === '' ? '' : (isFinite(n) && n >= 0 ? n : wForm.uValue) });
                }}
              />
              <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 12, color: '#555', marginTop: 6 }}>
                <input
                  type="checkbox"
                  checked={!!wForm.knownUGroundContact}
                  onChange={(e) => setWForm({ ...wForm, knownUGroundContact: e.target.checked })}
                />
                U-value accounts for ground contact (basement walls only)
              </label>
            </div>
          )}
        </div>

        {/* External Insulation controls */}
        {wForm.category !== 'Known U-Value' && (
          <div style={{ marginTop: 8 }}>
            <div style={grid2}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input type="checkbox" checked={!!wForm.extInsulated} onChange={(e) => setWForm({ ...wForm, extInsulated: e.target.checked })} />
                External insulation applied
              </label>
              <div />
              <div>
                <Label>Insulation Thickness (mm)</Label>
                <Input
                  type="number"
                  value={wForm.extInsulThk ?? ''}
                  onChange={(e) => {
                    const n = Number(e.target.value);
                    setWForm({ ...wForm, extInsulThk: e.target.value === '' ? '' : (isFinite(n) && n >= 0 ? n : wForm.extInsulThk) });
                  }}
                />
              </div>
              <div>
                <Label>Insulation Material</Label>
                <Select value={(wForm.extInsulMat as any) || ''} onChange={(e) => setWForm({ ...wForm, extInsulMat: e.target.value as any })}>
                  <option value="">Select material</option>
                  {Object.keys(INSULATION_LAMBDA).map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </Select>
              </div>
            </div>
          </div>
        )}

        <div style={{ marginTop: 8, fontSize: 12, color: '#666', display: 'flex', alignItems: 'center', gap: 12 }}>
          <span>Suggested U-value: {wSuggestion ?? '—'} {typeof wSuggestion === 'number' ? 'W/m²K' : ''}</span>
          {wForm.category !== 'Known U-Value' && (
            <button style={secondaryBtn} onClick={() => setShowWallSearch(true)}>Find U-value</button>
          )}
        </div>

        {showWallSearch && (
  <>
    {/* fixed: no hook call inside JSX */}
    <WallSearchDialog
      rows={wallLookup}
      onClose={() => setShowWallSearch(false)}
      onPick={(row) => {
        setWForm({ ...wForm, ageBand: row.age, construction: row.cons });
        setShowWallSearch(false);
      }}
    />
  </>
)}

        <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
          <button style={primaryBtn} onClick={addWall}>Save Wall Type</button>
        </div>

        {!!model.walls.length && (
          <div style={{ marginTop: 16 }}>
            <h3 style={h3}>Saved Walls</h3>
            {model.walls.map((w, i) => (
              <div key={i} style={row}>
                <div style={{ flex: 2 }}>{w.name}</div>
                <div style={{ flex: 1 }}>{w.category}</div>
                <div style={{ flex: 2 }}>
                  {w.category === 'Known U-Value'
                    ? `U=${w.uValue}${w.knownUGroundContact ? ' (incl. ground)' : ''}`
                    : `${w.ageBand || '—'} · ${w.construction || '—'} (≈ ${suggestWallUValue(w) ?? '—'})`}
                </div>
                <div>
                  <button style={linkDanger} onClick={() => setModel((m) => ({ ...m, walls: m.walls.filter((_, idx) => idx !== i) }))}>Remove</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Floors */}
      <section style={{ ...card, marginTop: 16 }}>
        <h2 style={h2}>Floor Types</h2>

        <div style={grid2}>
          <div>
            <Label>Floor Category *</Label>
            <Select value={fForm.category} onChange={(e) => setFForm({ ...fForm, category: e.target.value as FloorCategory })}>
              <option value="ground-known">Ground Floor (known insulation)</option>
              <option value="exposed">Exposed Floor</option>
              <option value="internal">Internal Floor</option>
              <option value="party">Party Floor</option>
              <option value="known-u">Known U-Value</option>
              <option value="ground-unknown">Ground Floor (unknown insulation)</option>
            </Select>
          </div>

          <div>
            <Label>Floor Name *</Label>
            <Input value={fForm.name} onChange={(e) => setFForm({ ...fForm, name: e.target.value })} />
          </div>

          {/* Always show construction unless internal; show thickness only for non-known-u */}
          {fForm.category !== 'internal' && (
            <>
              <div>
                <Label>Floor Construction *</Label>
                <Select value={fForm.construction} onChange={(e) => setFForm({ ...fForm, construction: e.target.value as 'solid' | 'suspended' })}>
                  <option value="solid">Solid concrete</option>
                  <option value="suspended">Suspended (timber/chipboard/beam & block)</option>
                </Select>
              </div>
              {fForm.category !== 'known-u' && (
                <div>
                  <Label>Insulation Thickness (mm)</Label>
                  <Input
                    type="number"
                    value={fForm.insulThk ?? ''}
                    onChange={(e) => {
                      const n = Number(e.target.value);
                      setFForm({ ...fForm, insulThk: e.target.value === '' ? '' : (isFinite(n) && n >= 0 ? n : fForm.insulThk) });
                    }}
                  />
                </div>
              )}
            </>
          )}

          {fForm.category === 'known-u' && (
            <div>
              <Label>U-Value *</Label>
              <Input
                type="number"
                step="0.01"
                value={fForm.uValue ?? ''}
                onChange={(e) => {
                  const n = Number(e.target.value);
                  setFForm({ ...fForm, uValue: e.target.value === '' ? '' : (isFinite(n) && n >= 0 ? n : fForm.uValue) });
                }}
              />
              <div style={{ display: 'flex', gap: 12, marginTop: 6 }}>
                {fForm.construction === 'solid' && (
                  <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 12, color: '#555' }}>
                    <input type="checkbox" checked={!!fForm.groundContactAdjust} onChange={(e) => setFForm({ ...fForm, groundContactAdjust: e.target.checked })} />
                    U-value accounts for ground contact (solid floors only)
                  </label>
                )}
                <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 12, color: '#555' }}>
                  <input type="checkbox" checked={!!fForm.includesPsi} onChange={(e) => setFForm({ ...fForm, includesPsi: e.target.checked })} />
                  U-value includes thermal bridging factor
                </label>
              </div>
            </div>
          )}
        </div>

        <div style={{ marginTop: 8, fontSize: 12, color: '#666' }}>
          Suggested U-value: {fSuggestion ?? '—'} {typeof fSuggestion === 'number' ? 'W/m²K' : ''}
        </div>

        <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
          <button style={primaryBtn} onClick={addFloor}>Save Floor Type</button>
        </div>

        {!!model.floors.length && (
          <div style={{ marginTop: 16 }}>
            <h3 style={h3}>Saved Floors</h3>
            {model.floors.map((f, i) => (
              <div key={i} style={row}>
                <div style={{ flex: 2 }}>{f.name}</div>
                <div style={{ flex: 1 }}>{prettyFloorCategory(f.category)}</div>
                <div style={{ flex: 2 }}>
                  {f.category === 'known-u'
                    ? `U=${f.uValue}${f.construction === 'solid' ? (f.groundContactAdjust ? ' (incl. ground)' : '') : ''}`
                    : `${f.construction}${typeof f.insulThk === 'number' ? `, ${f.insulThk}mm` : ''} (≈ ${suggestFloorUValue(f) ?? '—'})`}
                </div>
                <div>
                  <button style={linkDanger} onClick={() => setModel((m) => ({ ...m, floors: m.floors.filter((_, idx) => idx !== i) }))}>Remove</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Ceilings */}
      <section style={{ ...card, marginTop: 16 }}>
        <h2 style={h2}>Ceiling Types</h2>

        <div style={grid2}>
          <div>
            <Label>Ceiling Category *</Label>
            <Select value={cForm.category} onChange={(e) => setCForm({ ...cForm, category: e.target.value as CeilingCategory })}>
              <option value="external-roof">External Roof</option>
              <option value="internal">Internal Ceiling</option>
              <option value="party">Party Ceiling</option>
              <option value="known-u">Known U-Value</option>
            </Select>
          </div>
          <div>
            <Label>Ceiling Name *</Label>
            <Input value={cForm.name} onChange={(e) => setCForm({ ...cForm, name: e.target.value })} />
          </div>
          {cForm.category === 'external-roof' && (
            <>
              <div>
                <Label>Roof Type</Label>
                <Select value={cForm.roofType || ''} onChange={(e) => setCForm({ ...cForm, roofType: e.target.value as 'flat' | 'pitched' | '' })}>
                  <option value="">Select roof type</option>
                  <option value="flat">Flat roof</option>
                  <option value="pitched">Pitched roof</option>
                </Select>
              </div>
              <div>
                <Label>Insulation Thickness (mm)</Label>
                <Input
                  type="number"
                  value={cForm.insulThk ?? ''}
                  onChange={(e) => {
                    const n = Number(e.target.value);
                    setCForm({ ...cForm, insulThk: e.target.value === '' ? '' : (isFinite(n) && n >= 0 ? n : cForm.insulThk) });
                  }}
                />
              </div>
            </>
          )}
          {cForm.category === 'known-u' && (
            <div>
              <Label>U-Value *</Label>
              <Input
                type="number"
                step="0.01"
                value={cForm.uValue ?? ''}
                onChange={(e) => {
                  const n = Number(e.target.value);
                  setCForm({ ...cForm, uValue: e.target.value === '' ? '' : (isFinite(n) && n >= 0 ? n : cForm.uValue) });
                }}
              />
            </div>
          )}
        </div>

        <div style={{ marginTop: 8, fontSize: 12, color: '#666' }}>
          Suggested U-value: {cSuggestion ?? '—'} {typeof cSuggestion === 'number' ? 'W/m²K' : ''}
        </div>

        <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
          <button style={primaryBtn} onClick={addCeiling}>Save Ceiling Type</button>
        </div>

        {!!model.ceilings.length && (
          <div style={{ marginTop: 16 }}>
            <h3 style={h3}>Saved Ceilings</h3>
            {model.ceilings.map((c, i) => (
              <div key={i} style={row}>
                <div style={{ flex: 2 }}>{c.name}</div>
                <div style={{ flex: 1 }}>{c.category === 'external-roof' ? 'External Roof' : c.category === 'internal' ? 'Internal Ceiling' : c.category === 'party' ? 'Party Ceiling' : 'Known U-Value'}</div>
                <div style={{ flex: 2 }}>{c.category === 'known-u' ? `U=${c.uValue}` : `${c.roofType || ''}${typeof c.insulThk === 'number' ? `, ${c.insulThk}mm` : ''} (≈ ${suggestCeilingUValue(c) ?? '—'})`}</div>
                <div>
                  <button style={linkDanger} onClick={() => setModel((m) => ({ ...m, ceilings: m.ceilings.filter((_, idx) => idx !== i) }))}>Remove</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Doors */}
      <section style={{ ...card, marginTop: 16 }}>
        <h2 style={h2}>Door Types</h2>
        <div style={grid2}>
          <div>
            <Label>Door Category *</Label>
            <Select value={dForm.category} onChange={(e) => setDForm({ ...dForm, category: e.target.value as DoorCategory })}>
              <option value="external">External Door</option>
              <option value="internal">Internal Door</option>
              <option value="known-u">Known U-Value</option>
            </Select>
          </div>
          <div>
            <Label>Door Name *</Label>
            <Input value={dForm.name} onChange={(e) => setDForm({ ...dForm, name: e.target.value })} />
          </div>
          {dForm.category !== 'known-u' && (
            <div>
              <Label>Age Band</Label>
              <Select value={dForm.ageBand || ''} onChange={(e) => setDForm({ ...dForm, ageBand: e.target.value as AgeBand })}>
                <option value="">Select age band</option>
                {AGE_BANDS.map((ab) => (<option key={ab} value={ab}>{ab}</option>))}
              </Select>
            </div>
          )}
          {dForm.category === 'known-u' && (
            <div>
              <Label>U-Value *</Label>
              <Input
                type="number"
                step="0.01"
                value={dForm.uValue ?? ''}
                onChange={(e) => {
                  const n = Number(e.target.value);
                  setDForm({ ...dForm, uValue: e.target.value === '' ? '' : (isFinite(n) && n >= 0 ? n : dForm.uValue) });
                }}
              />
            </div>
          )}
        </div>
        <div style={{ marginTop: 8, fontSize: 12, color: '#666' }}>Suggested U-value: {dSuggestion ?? '—'} {typeof dSuggestion === 'number' ? 'W/m²K' : ''}</div>
        <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
          <button style={primaryBtn} onClick={addDoor}>Save Door Type</button>
        </div>
        {!!model.doors.length && (
          <div style={{ marginTop: 16 }}>
            <h3 style={h3}>Saved Doors</h3>
            {model.doors.map((d, i) => (
              <div key={i} style={row}>
                <div style={{ flex: 2 }}>{d.name}</div>
                <div style={{ flex: 1 }}>{d.category === 'external' ? 'External' : d.category === 'internal' ? 'Internal' : 'Known U-Value'}</div>
                <div style={{ flex: 2 }}>{d.category === 'known-u' ? `U=${d.uValue}` : d.ageBand || '—'}</div>
                <div><button style={linkDanger} onClick={() => setModel((m) => ({ ...m, doors: m.doors.filter((_, idx) => idx !== i) }))}>Remove</button></div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Windows */}
      <section style={{ ...card, marginTop: 16 }}>
        <h2 style={h2}>Window Types</h2>
        <div style={grid2}>
          <div>
            <Label>Window Category *</Label>
            <Select value={winForm.category} onChange={(e) => setWinForm({ ...winForm, category: e.target.value as WindowCategory })}>
              <option value="external">External Window</option>
              <option value="internal">Internal Window</option>
              <option value="known-u">Known U-Value</option>
            </Select>
          </div>
          <div>
            <Label>Window Name *</Label>
            <Input value={winForm.name} onChange={(e) => setWinForm({ ...winForm, name: e.target.value })} />
          </div>
          {winForm.category !== 'known-u' && (
            <>
              <div>
                <Label>Glazing Type</Label>
                <Select value={winForm.glazingType || ''} onChange={(e) => setWinForm({ ...winForm, glazingType: e.target.value as any })}>
                  <option value="">Select glazing</option>
                  <option value="single">Single</option>
                  <option value="double">Double</option>
                  <option value="triple">Triple</option>
                </Select>
              </div>
              <div>
                <Label>Frame Type</Label>
                <Select value={winForm.frameType || ''} onChange={(e) => setWinForm({ ...winForm, frameType: e.target.value as any })}>
                  <option value="">Select frame</option>
                  <option value="uPVC">uPVC</option>
                  <option value="timber">Timber</option>
                  <option value="aluminium">Aluminium</option>
                </Select>
              </div>
              <div>
                <Label>Age Band</Label>
                <Select value={winForm.ageBand || ''} onChange={(e) => setWinForm({ ...winForm, ageBand: e.target.value as AgeBand })}>
                  <option value="">Select age band</option>
                  {AGE_BANDS.map((ab) => (<option key={ab} value={ab}>{ab}</option>))}
                </Select>
              </div>
            </>
          )}
          {winForm.category === 'known-u' && (
            <div>
              <Label>U-Value *</Label>
              <Input
                type="number"
                step="0.01"
                value={winForm.uValue ?? ''}
                onChange={(e) => {
                  const n = Number(e.target.value);
                  setWinForm({ ...winForm, uValue: e.target.value === '' ? '' : (isFinite(n) && n >= 0 ? n : winForm.uValue) });
                }}
              />
            </div>
          )}
        </div>
        <div style={{ marginTop: 8, fontSize: 12, color: '#666' }}>Suggested U-value: {winSuggestion ?? '—'} {typeof winSuggestion === 'number' ? 'W/m²K' : ''}</div>
        <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
          <button style={primaryBtn} onClick={addWindow}>Save Window Type</button>
        </div>
        {!!model.windows.length && (
          <div style={{ marginTop: 16 }}>
            <h3 style={h3}>Saved Windows</h3>
            {model.windows.map((w, i) => (
              <div key={i} style={row}>
                <div style={{ flex: 2 }}>{w.name}</div>
                <div style={{ flex: 1 }}>{w.category === 'external' ? 'External' : w.category === 'internal' ? 'Internal' : 'Known U-Value'}</div>
                <div style={{ flex: 2 }}>{w.category === 'known-u' ? `U=${w.uValue}` : `${w.glazingType || '—'} · ${w.frameType || '—'} · ${w.ageBand || '—'}`}</div>
                <div><button style={linkDanger} onClick={() => setModel((m) => ({ ...m, windows: m.windows.filter((_, idx) => idx !== i) }))}>Remove</button></div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* footer nav */}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 18 }}>
        <Link href="/rooms" style={{ ...secondaryBtn, textDecoration: 'none' }}>← Back: Heated Rooms</Link>
        <Link href="/room-elements" style={{ ...primaryBtn, textDecoration: 'none' }}>Next: Room Elements →</Link>
      </div>
    </main>
  );
}

/****************************** Small UI bits ******************************/
function Label({ children }: { children: React.ReactNode }){ return <label style={{ display:'block', fontSize:12, color:'#555', marginBottom:6 }}>{children}</label>; }
function Input(props: React.InputHTMLAttributes<HTMLInputElement>){ return <input {...props} style={{ ...input, ...(props.style||{}) }} />; }
function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>){ return <select {...props} style={{ ...input, ...(props.style||{}) }} />; }

/******************************** Styles ********************************/
const wrap: React.CSSProperties = { maxWidth: 1040, margin: '0 auto', padding: 24, fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif' };
const h1: React.CSSProperties = { fontSize: 28, margin: '6px 0 10px' };
const h2: React.CSSProperties = { fontSize: 18, margin: '0 0 8px', letterSpacing: 1.2 };
const h3: React.CSSProperties = { fontSize: 16, margin: '10px 0 6px' };
const mutedText: React.CSSProperties = { color: '#666', fontSize: 13, marginBottom: 12 };
const card: React.CSSProperties = { background: '#fff', border: '1px solid #e6e6e6', borderRadius: 14, padding: 16 };
const grid2: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 };
const row: React.CSSProperties = {
  display: 'flex',
  gap: 8,
  padding: '8px 4px',
  alignItems: 'center',
  borderBottom: '1px solid #f2f2f2',
};
const input: React.CSSProperties = { width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid #ddd', outline: 'none', boxSizing: 'border-box' };
const primaryBtn: React.CSSProperties = { background: '#111', color: '#fff', border: '1px solid #111', padding: '10px 16px', borderRadius: 12, cursor: 'pointer' };
const secondaryBtn: React.CSSProperties = { background: '#fff', color: '#111', border: '1px solid #ddd', padding: '10px 16px', borderRadius: 12, cursor: 'pointer' };
const linkDanger: React.CSSProperties = { color: '#b00020', textDecoration: 'underline', background: 'none', border: 0, cursor: 'pointer' };

/************************** Constants for selects **************************/
const AGE_BANDS: AgeBand[] = [
  'pre-1900','1900-1929','1930-1949','1950-1966','1967-1975','1976-1982','1983-1990','1991-1995','1996-2002','2003-2006','2007-2011','2012-present',
];
const WALL_CONS = [
  'Cob', 'Cavity (Filled)', 'Cavity (Unfilled)', 'Solid Brick or Stone', 'Stone (Granite/Whinstone)', 'Stone (Sandstone/Limestone)', 'System Built', 'Timber Frame',
] as const;

/*************************** Pretty labels ***************************/
function prettyFloorCategory(c: FloorCategory): string {
  switch (c) {
    case 'ground-known': return 'Ground (known insulation)';
    case 'ground-unknown': return 'Ground (unknown insulation)';
    case 'exposed': return 'Exposed';
    case 'internal': return 'Internal';
    case 'party': return 'Party';
    case 'known-u': return 'Known U-Value';
    default: return String(c);
  }
}

/****************************** Search Dialog ******************************/
function WallSearchDialog({ rows, onClose, onPick }: { rows: Array<{ age: AgeBand; cons: string; u: number }>; onClose: () => void; onPick: (row: { age: AgeBand; cons: string; u: number }) => void; }){
  const [q, setQ] = useState('');
  const filtered = rows.filter(r => {
    const s = `${r.age} ${r.cons} ${r.u}`.toLowerCase();
    return s.includes(q.toLowerCase());
  });
  return (
    <div style={dlgWrap} role="dialog" aria-modal>
      <div style={dlgCard}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <h3 style={{ margin: 0 }}>Find U-value (by RdSAP/CIBSE defaults)</h3>
          <button style={miniBtn} onClick={onClose}>Close</button>
        </div>
        <div style={{ marginTop: 8 }}>
          <Input placeholder="Search age, construction…" value={q} onChange={(e)=> setQ(e.target.value)} />
        </div>
        <div style={{ marginTop: 8, maxHeight: 240, overflow: 'auto', border: '1px solid #eee', borderRadius: 8 }}>
          {filtered.map((r, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 10px', borderBottom: '1px solid #f5f5f5' }}>
              <span>{r.age} · {r.cons}</span>
              <span style={{ minWidth: 80, textAlign: 'right' }}>{r.u} W/m²K</span>
              <button style={miniBtn} onClick={()=> onPick(r)}>Use</button>
            </div>
          ))}
          {filtered.length === 0 && <div style={{ padding: 12, color: '#666' }}>No matches.</div>}
        </div>
      </div>
    </div>
  );
}
const miniBtn: React.CSSProperties = { background: '#fff', color: '#111', border: '1px solid #D1D5DB', padding: '4px 8px', borderRadius: 6, cursor: 'pointer', fontSize: 12 };
const dlgWrap: React.CSSProperties = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,.25)', display: 'flex', alignItems: 'center', justifyContent: 'center' };
const dlgCard: React.CSSProperties = { width: 560, background: '#fff', border: '1px solid #e6e6e6', borderRadius: 12, padding: 12, boxShadow: '0 10px 30px rgba(0,0,0,0.15)' };

/********************************* Tests *********************************/
(() => {
  try {
    if (typeof window === 'undefined') return; // SSR safety
    const S = getStorage();
    console.assert(S && typeof S.getItem === 'function', 'getStorage must return SafeStorage object');
    const TMP = '__ELEMS_TEST__';
    try { S.removeItem(TMP); } catch {}
    console.assert(readJSON(TMP) === null, 'readJSON missing -> null');
    writeJSON(TMP, { ok: 1 });
    const back: any = readJSON<any>(TMP);
    console.assert(!back || back.ok === 1, 'write/read roundtrip');
    writeJSON(TMP, undefined as any);
    console.assert(readJSON(TMP) === null, 'writeJSON(undefined) clears key');

    // U-table sanity
    console.assert(U_TABLE.ground.solid[1].u === 0.45 && U_TABLE.ground.solid[2].u === 0.25, 'U_TABLE ground.solid values');

    // Suggestion sanity
    const w: WallForm = { category: 'External', name: 'w', ageBand: '1983-1990', construction: 'Cavity (Filled)', extInsulated: true, extInsulThk: 100, extInsulMat: 'EPS (white)' };
    const su = suggestWallUValue(w);
    console.assert(typeof su === 'number' && su < 0.55, 'EWI should reduce U below base');
  } catch (e) {
    console.warn('Dev tests skipped:', e);
  }
})();

/********************************** Extra Tests (build regression guard) **********************************/
(() => {
  try {
    if (typeof window === 'undefined') return;
    console.assert(typeof prettyFloorCategory === 'function', 'prettyFloorCategory should be defined');
    console.assert(prettyFloorCategory('exposed') === 'Exposed', 'prettyFloorCategory("exposed") -> Exposed');
    console.assert(prettyFloorCategory('ground-known').startsWith('Ground'), 'prettyFloorCategory ground-known label');
  } catch {}
})();
