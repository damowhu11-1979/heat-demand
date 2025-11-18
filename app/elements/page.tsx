'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
// use a relative import so it works in static/GitHub Pages builds
import ClearDataButton from '../components/ClearDataButton';

/* ============================================================================
   Persistence helpers
============================================================================ */
const LS_KEY = 'mcs.elements.v1';
const PROP_KEY = 'mcs.property'; // used only to read ageBand you set on page 1

function readJSON<T>(k: string): T | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(k);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}
function writeJSON(k: string, v: unknown) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(k, JSON.stringify(v));
  } catch {
    /* ignore quota errors */
  }
}

/* ============================================================================
   Types
============================================================================ */
type SectionKey = 'walls' | 'floors';

type AgeBand =
  | 'pre-1900' | '1900-1929' | '1930-1949' | '1950-1966'
  | '1967-1975' | '1976-1982' | '1983-1990' | '1991-1995'
  | '1996-2002' | '2003-2006' | '2007-2011' | '2012-present';

type WallCategory = 'External' | 'Internal' | 'Known U-Value';
type FloorCategory = 'ground-unknown' | 'ground-known' | 'exposed' | 'internal' | 'known-u';

type WallForm = {
  category: WallCategory;
  name: string;
  ageBand: AgeBand | '';
  construction: string; // e.g., Cavity (Filled), Solid Brick etc.
  uValue?: number | ''; // for Known U-Value
};

type FloorForm = {
  category: FloorCategory;
  name: string;
  construction: 'solid' | 'suspended';
  insulThk?: number | ''; // mm – only for ground-known
  uValue?: number | '';   // for known-u
  groundContactAdjust?: boolean; // cosmetic flag only
  includesPsi?: boolean;         // cosmetic flag only
};

type SavedModel = {
  walls: WallForm[];
  floors: FloorForm[];
};

/* ============================================================================
   U-value tables (illustrative) + interpolation
   NOTE: arrays are readonly; lerp accepts ReadonlyArray<UPoint>
============================================================================ */
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

/** Default U profiles by floor exposure + construction. */
const U_TABLE: {
  ground: { solid: ReadonlyArray<UPoint>; suspended: ReadonlyArray<UPoint> };
  exposed: { solid: ReadonlyArray<UPoint>; suspended: ReadonlyArray<UPoint> };
  internal: { solid: ReadonlyArray<UPoint>; suspended: ReadonlyArray<UPoint> };
} = {
  ground: {
    solid:     [{ t: 0, u: 1.30 }, { t: 50, u: 0.45 }, { t: 100, u: 0.25 }],
    suspended: [{ t: 0, u: 1.60 }, { t: 50, u: 0.55 }, { t: 100, u: 0.30 }],
  },
  exposed: {
    solid:     [{ t: 0, u: 1.80 }, { t: 50, u: 0.60 }, { t: 100, u: 0.35 }],
    suspended: [{ t: 0, u: 2.00 }, { t: 50, u: 0.70 }, { t: 100, u: 0.40 }],
  },
  internal: {
    solid:     [{ t: 0, u: 0.00 }],
    suspended: [{ t: 0, u: 0.00 }],
  },
};

/** Quick defaults by Age Band for walls (illustrative only). */
const WALL_U_BY_AGE: Record<
  Exclude<AgeBand, ''>,
  { [construction: string]: number }
> = {
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

/* ============================================================================
   Suggestion helpers
============================================================================ */
function suggestWallUValue(f: WallForm): number | null {
  if (f.category === 'Known U-Value') {
    return typeof f.uValue === 'number' ? f.uValue : null;
  }
  if (!f.ageBand || !f.construction) return null;
  const table = WALL_U_BY_AGE[f.ageBand as Exclude<AgeBand, ''>];
  const v = table?.[f.construction];
  return typeof v === 'number' ? v : null;
}

function suggestFloorUValue(f: FloorForm): number | null {
  if (f.category === 'known-u') {
    return typeof f.uValue === 'number' ? f.uValue : null;
  }
  if (f.category === 'internal') return 0; // partitions within dwelling

  const key =
    f.category === 'exposed' ? 'exposed'
    : f.category === 'ground-known' ? 'ground'
    : 'ground'; // fallback for ground-unknown

  const pts = U_TABLE[key][f.construction];
  const t = typeof f.insulThk === 'number' ? f.insulThk : 0;
  return lerp(pts, t);
}

/* ============================================================================
   UI component (SINGLE DEFAULT EXPORT)
============================================================================ */
export default function ElementsPage(): React.JSX.Element {
  const [model, setModel] = useState<SavedModel>({ walls: [], floors: [] });

  // Load saved model
  useEffect(() => {
    const saved = readJSON<SavedModel>(LS_KEY);
    setModel(saved ?? { walls: [], floors: [] });
  }, []);

  // Persist
  useEffect(() => {
    writeJSON(LS_KEY, model);
  }, [model]);

  // default age band from Property page
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
  });
  const wSuggestion = suggestWallUValue(wForm);
  function addWall() {
    setModel((m) => ({ ...m, walls: [...m.walls, wForm] }));
    setWForm({
      category: wForm.category,
      name: 'External Wall ' + (model.walls.length + 2),
      ageBand: defaultAgeBand,
      construction: '',
      uValue: '',
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

  /* ------------------------------ Render ----------------------------- */
  return (
    <main style={wrap}>
      {/* header with Clear Data */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <h1 style={h1}>Building Elements</h1>
        <ClearDataButton onClearState={() => {}} />
      </div>
      <p style={mutedText}>Define wall and floor types. Values are saved automatically.</p>

      {/* Walls */}
      <section style={card}>
        <h2 style={h2}>Wall Types</h2>

        <div style={grid2}>
          <div>
            <Label>Wall Category *</Label>
            <Select
              value={wForm.category}
              onChange={(e) => setWForm({ ...wForm, category: e.target.value as WallCategory })}
            >
              <option value="External">External Wall</option>
              <option value="Internal">Internal Wall</option>
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
                <Select
                  value={wForm.ageBand}
                  onChange={(e) => setWForm({ ...wForm, ageBand: e.target.value as AgeBand })}
                >
                  <option value="">Select age band</option>
                  {AGE_BANDS.map((ab) => (
                    <option key={ab} value={ab}>{ab}</option>
                  ))}
                </Select>
              </div>

              <div>
                <Label>Construction Type *</Label>
                <Select
                  value={wForm.construction}
                  onChange={(e) => setWForm({ ...wForm, construction: e.target.value })}
                >
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
                onChange={(e) =>
                  setWForm({ ...wForm, uValue: e.target.value === '' ? '' : Number(e.target.value) })
                }
              />
            </div>
          )}
        </div>

        <div style={{ marginTop: 8, fontSize: 12, color: '#666' }}>
          Suggested U-value: {wSuggestion ?? '—'} {typeof wSuggestion === 'number' ? 'W/m²K' : ''}
        </div>

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
                    ? `U=${w.uValue}`
                    : `${w.ageBand || '—'} · ${w.construction || '—'} (≈ ${suggestWallUValue(w) ?? '—'})`}
                </div>
                <div>
                  <button
                    style={linkDanger}
                    onClick={() =>
                      setModel((m) => ({ ...m, walls: m.walls.filter((_, idx) => idx !== i) }))
                    }
                  >
                    Remove
                  </button>
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
            <Select
              value={fForm.category}
              onChange={(e) => setFForm({ ...fForm, category: e.target.value as FloorCategory })}
            >
              <option value="ground-known">Ground Floor (known insulation)</option>
              <option value="exposed">Exposed Floor</option>
              <option value="internal">Internal Floor</option>
              <option value="known-u">Known U-Value</option>
              <option value="ground-unknown">Ground Floor (unknown insulation)</option>
            </Select>
          </div>

          <div>
            <Label>Floor Name *</Label>
            <Input value={fForm.name} onChange={(e) => setFForm({ ...fForm, name: e.target.value })} />
          </div>

          {fForm.category !== 'known-u' && fForm.category !== 'internal' && (
            <>
              <div>
                <Label>Floor Construction *</Label>
                <Select
                  value={fForm.construction}
                  onChange={(e) => setFForm({ ...fForm, construction: e.target.value as 'solid' | 'suspended' })}
                >
                  <option value="solid">Solid concrete</option>
                  <option value="suspended">Suspended (timber/chipboard/beam & block)</option>
                </Select>
              </div>

              <div>
                <Label>Insulation Thickness (mm)</Label>
                <Input
                  type="number"
                  value={fForm.insulThk ?? ''}
                  onChange={(e) =>
                    setFForm({ ...fForm, insulThk: e.target.value === '' ? '' : Number(e.target.value) })
                  }
                />
              </div>
            </>
          )}

          {fForm.category === 'known-u' && (
            <div>
              <Label>U-Value *</Label>
              <Input
                type="number"
                step="0.01"
                value={fForm.uValue ?? ''}
                onChange={(e) =>
                  setFForm({ ...fForm, uValue: e.target.value === '' ? '' : Number(e.target.value) })
                }
              />
              <div style={{ display: 'flex', gap: 12, marginTop: 6 }}>
                <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 12, color: '#555' }}>
                  <input
                    type="checkbox"
                    checked={!!fForm.groundContactAdjust}
                    onChange={(e) => setFForm({ ...fForm, groundContactAdjust: e.target.checked })}
                  />
                  U-value accounts for ground contact (solid floors only)
                </label>
                <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 12, color: '#555' }}>
                  <input
                    type="checkbox"
                    checked={!!fForm.includesPsi}
                    onChange={(e) => setFForm({ ...fForm, includesPsi: e.target.checked })}
                  />
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
                    ? `U=${f.uValue}`
                    : `${f.construction}${typeof f.insulThk === 'number' ? `, ${f.insulThk}mm` : ''} (≈ ${suggestFloorUValue(f) ?? '—'})`}
                </div>
                <div>
                  <button
                    style={linkDanger}
                    onClick={() =>
                      setModel((m) => ({ ...m, floors: m.floors.filter((_, idx) => idx !== i) }))
                    }
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* footer nav */}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 18 }}>
        <Link href="/rooms" style={{ ...secondaryBtn, textDecoration: 'none' }}>
          ← Back: Heated Rooms
        </Link>
        <Link href="/room-elements" style={{ ...primaryBtn, textDecoration: 'none' }}>
          Next: Room Elements →
        </Link>
      </div>
    </main>
  );
}

/* ============================================================================
   Small utilities / constants
============================================================================ */
const AGE_BANDS: AgeBand[] = [
  'pre-1900','1900-1929','1930-1949','1950-1966',
  '1967-1975','1976-1982','1983-1990','1991-1995',
  '1996-2002','2003-2006','2007-2011','2012-present',
];

const WALL_CONS = [
  'Cob',
  'Cavity (Filled)',
  'Cavity (Unfilled)',
  'Solid Brick or Stone',
  'Stone (Granite/Whinstone)',
  'Stone (Sandstone/Limestone)',
  'System Built',
  'Timber Frame',
] as const;

function prettyFloorCategory(c: FloorCategory): string {
  switch (c) {
    case 'ground-known': return 'Ground (known insulation)';
    case 'ground-unknown': return 'Ground (unknown insulation)';
    case 'exposed': return 'Exposed';
    case 'internal': return 'Internal';
    case 'known-u': return 'Known U-Value';
  }
}

/* ============================================================================
   Tiny UI bits
============================================================================ */
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
   Styles
============================================================================ */
const wrap: React.CSSProperties = {
  maxWidth: 1040, margin: '0 auto', padding: 24,
  fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif',
};
const h1: React.CSSProperties = { fontSize: 28, margin: '6px 0 10px' };
const h2: React.CSSProperties = { fontSize: 18, margin: '0 0 8px', letterSpacing: 1.2 };
const h3: React.CSSProperties = { fontSize: 16, margin: '10px 0 6px' };
const mutedText: React.CSSProperties = { color: '#666', fontSize: 13, marginBottom: 12 };

const card: React.CSSProperties = {
  background: '#fff', border: '1px solid #e6e6e6', borderRadius: 14, padding: 16,
};
const grid2: React.CSSProperties = {
  display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12,
};
const row: React.CSSProperties = {
  display: 'flex', gap: 8, padding: '8px 4px', alignItems: 'center', borderBottom: '1px solid #f2f2f2',
};

const input: React.CSSProperties = {
  width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid #ddd',
  outline: 'none', boxSizing: 'border-box',
};
const primaryBtn: React.CSSProperties = {
  background: '#111', color: '#fff', border: '1px solid #111',
  padding: '10px 16px', borderRadius: 12, cursor: 'pointer',
};
const secondaryBtn: React.CSSProperties = {
  background: '#fff', color: '#111', border: '1px solid #ddd',
  padding: '10px 16px', borderRadius: 12, cursor: 'pointer',
};
const linkDanger: React.CSSProperties = {
  color: '#b00020', textDecoration: 'underline', background: 'none',
  border: 0, cursor: 'pointer',
};
