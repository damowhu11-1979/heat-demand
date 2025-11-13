'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';

/* =========================================================================
   Types
   ========================================================================= */

type SectionKey = 'walls' | 'floors';

type WallCategory = 'External' | 'Internal' | 'Known U-Value';

// NOTE: these are the keys we have U-value defaults for
type ExtAgeBand =
  | 'pre-1900'
  | '1900-1929'
  | '1930-1949'
  | '1950-1966'
  | '1967-1975'
  | '1976-1982'
  | '1983-1990'
  | '1991-1995'
  | '1996-2002'
  | '2003-2006'
  | '2007-2011'
  | '2012-present';

type WallConstruction =
  | ''
  | 'Solid masonry'
  | 'Cavity – unfilled'
  | 'Cavity – filled'
  | 'Timber frame';

type WallInsulation =
  | ''
  | 'None'
  | 'Internal insulation'
  | 'External insulation'
  | 'Cavity fill';

/** IMPORTANT: `ageBand` is a string now (wider) so select/empty is valid.
 *  We guard it before using as a key. */
type WallForm = {
  category: WallCategory;
  name: string;
  ageBand: string; // <- widened from ExtAgeBand
  construction: WallConstruction;
  insulation: WallInsulation;
  uValue?: number; // used only when category === 'Known U-Value'
};

type WallType = {
  id: string;
  uValue: number; // resolved/suggested final value
} & Omit<WallForm, 'uValue'>;

/* =========================================================================
   Static data – defaults & modifiers
   ========================================================================= */

/** External wall defaults (W/m²K) per age band (illustrative values) */
const extDefaults: Record<ExtAgeBand, number> = {
  'pre-1900': 2.10,
  '1900-1929': 1.90,
  '1930-1949': 1.80,
  '1950-1966': 1.60,
  '1967-1975': 1.45,
  '1976-1982': 1.20,
  '1983-1990': 0.90,
  '1991-1995': 0.60,
  '1996-2002': 0.45,
  '2003-2006': 0.35,
  '2007-2011': 0.30,
  '2012-present': 0.28,
};

/** Construction modifiers (add to default; negative improves U) */
const constructionMods: Record<WallConstruction, number> = {
  '': 0,
  'Solid masonry': +0.20,
  'Cavity – unfilled': 0,
  'Cavity – filled': -0.30,
  'Timber frame': -0.10,
};

/** Insulation modifiers (add to default; negative improves U) */
const insulationMods: Record<WallInsulation, number> = {
  '': 0,
  'None': 0,
  'Internal insulation': -0.30,
  'External insulation': -0.35,
  'Cavity fill': -0.25,
};

/* =========================================================================
   Utilities
   ========================================================================= */

const blankWall: WallForm = {
  category: 'External',
  name: '',
  ageBand: '',
  construction: '',
  insulation: '',
  uValue: undefined,
};

function labelFor(sec: SectionKey): string {
  switch (sec) {
    case 'walls':
      return 'Wall Type';
    case 'floors':
      return 'Floor Type';
    default:
      return 'Type';
  }
}

function sampleName(sec: SectionKey): string {
  switch (sec) {
    case 'walls':
      return 'External Wall 1';
    case 'floors':
      return 'Ground Floor 1';
    default:
      return 'Element 1';
  }
}

function uid(prefix = 'w'): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 8)}`;
}

/** guard: is string a valid external wall age band key */
function isExtAgeBand(v: any): v is ExtAgeBand {
  return typeof v === 'string' && v in extDefaults;
}

/** SUGGESTION ENGINE – walls
 *  - returns a numeric U-value or null if we don't have enough info
 */
function suggestWallUValue(form: WallForm): number | null {
  // user supplies a known value
  if (form.category === 'Known U-Value') {
    return typeof form.uValue === 'number' ? form.uValue : null;
  }

  // only external walls have defaults here; internal walls are set by user or use a simple constant
  if (form.category === 'Internal') {
    // typical internal partitions ~2.00 W/m²K (little impact on fabric load paths)
    return 2.0;
  }

  // External: require valid age-band
  if (!isExtAgeBand(form.ageBand)) return null;

  const base = extDefaults[form.ageBand];
  const m1 = constructionMods[form.construction] ?? 0;
  const m2 = insulationMods[form.insulation] ?? 0;

  // clamp to sensible lower bound
  return Math.max(0.10, +(base + m1 + m2).toFixed(2));
}

/* =========================================================================
   Local storage (persist the list)
   ========================================================================= */

const STORE_KEY = 'mcs.elements.v1';

function saveStore(payload: { walls: WallType[] }) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(payload));
  } catch {
    /* ignore */
  }
}

function loadStore(): { walls: WallType[] } {
  if (typeof window === 'undefined') return { walls: [] };
  try {
    const raw = localStorage.getItem(STORE_KEY);
    return raw ? JSON.parse(raw) : { walls: [] };
  } catch {
    return { walls: [] };
  }
}

/* =========================================================================
   Page
   ========================================================================= */

export default function ElementsPage(): React.JSX.Element {
  // list of wall types
  const [walls, setWalls] = useState<WallType[]>([]);

  // modal state
  const [showWallModal, setShowWallModal] = useState(false);
  const [form, setForm] = useState<WallForm>(blankWall);
  const [suggested, setSuggested] = useState<number | null>(null);

  // initial load
  useEffect(() => {
    const s = loadStore();
    setWalls(s.walls ?? []);
  }, []);

  // auto-suggest whenever inputs change
  useEffect(() => {
    setSuggested(suggestWallUValue(form));
  }, [form]);

  // autosave
  useEffect(() => {
    saveStore({ walls });
  }, [walls]);

  function openAddWall() {
    setForm(blankWall);
    setSuggested(null);
    setShowWallModal(true);
  }

  function saveWallFromForm() {
    const uFinal =
      form.category === 'Known U-Value'
        ? form.uValue
        : suggested;

    if (typeof uFinal !== 'number') {
      alert('Please provide enough info to determine a U-value.');
      return;
    }
    if (!form.name.trim()) {
      alert('Please enter a name for this wall type.');
      return;
    }

    const entry: WallType = {
      id: uid('wall'),
      name: form.name.trim(),
      category: form.category,
      ageBand: form.ageBand,
      construction: form.construction,
      insulation: form.insulation,
      uValue: uFinal,
    };

    setWalls((prev) => [...prev, entry]);
    setShowWallModal(false);
  }

  function removeWall(id: string) {
    setWalls((prev) => prev.filter((w) => w.id !== id));
  }

  return (
    <main
      style={{
        maxWidth: 1040,
        margin: '0 auto',
        padding: 24,
        fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif',
      }}
    >
      <h1 style={{ fontSize: 28, margin: '6px 0 12px' }}>Building Elements</h1>
      <p style={{ color: '#666', marginTop: 0 }}>
        Define the wall and floor types used in the building. U-values are suggested automatically from
        age band, construction and insulation; you can also enter a known U-value.
      </p>

      {/* Walls card */}
      <section style={card}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h2 style={{ margin: 0, fontSize: 18 }}>Walls</h2>
          <button onClick={openAddWall} style={primaryBtn}>Add Wall Type</button>
        </div>

        {walls.length === 0 ? (
          <div style={{ color: '#777', marginTop: 12 }}>No wall types yet.</div>
        ) : (
          <div style={{ marginTop: 10 }}>
            <div style={rowHeader}>
              <div style={{ flex: 2 }}>Name</div>
              <div style={{ flex: 1 }}>Category</div>
              <div style={{ flex: 1 }}>Age band</div>
              <div style={{ flex: 1 }}>Construction</div>
              <div style={{ flex: 1 }}>Insulation</div>
              <div style={{ width: 110, textAlign: 'right' }}>U (W/m²K)</div>
              <div style={{ width: 80 }} />
            </div>
            {walls.map((w) => (
              <div key={w.id} style={row}>
                <div style={{ flex: 2 }}>{w.name}</div>
                <div style={{ flex: 1 }}>{w.category}</div>
                <div style={{ flex: 1 }}>{w.ageBand || '—'}</div>
                <div style={{ flex: 1 }}>{w.construction || '—'}</div>
                <div style={{ flex: 1 }}>{w.insulation || '—'}</div>
                <div style={{ width: 110, textAlign: 'right' }}>{w.uValue.toFixed(2)}</div>
                <div style={{ width: 80, textAlign: 'right' }}>
                  <button onClick={() => removeWall(w.id)} style={linkDanger}>Remove</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Footer nav */}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 16 }}>
        <Link href="/rooms" style={{ ...secondaryBtn, textDecoration: 'none' }}>
          ← Back: Heated Rooms
        </Link>
        <Link href="/room-elements" style={{ ...primaryBtn, textDecoration: 'none' }}>
          Next: Room Elements →
        </Link>
      </div>

      {/* Add Wall Modal */}
      {showWallModal && (
        <div style={modalBackdrop} onClick={() => setShowWallModal(false)}>
          <div style={modal} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 10px' }}>Add Wall Type</h3>

            {/* Category choice */}
            <div style={grid3}>
              <label style={radioCard(form.category === 'External')} onClick={() => setForm((f) => ({ ...f, category: 'External' }))}>
                <input type="radio" checked={form.category === 'External'} readOnly /> External Wall
                <div style={radioSub}>Separates dwelling from outside.</div>
              </label>
              <label style={radioCard(form.category === 'Internal')} onClick={() => setForm((f) => ({ ...f, category: 'Internal' }))}>
                <input type="radio" checked={form.category === 'Internal'} readOnly /> Internal Wall
                <div style={radioSub}>Partitions rooms within the dwelling.</div>
              </label>
              <label style={radioCard(form.category === 'Known U-Value')} onClick={() => setForm((f) => ({ ...f, category: 'Known U-Value' }))}>
                <input type="radio" checked={form.category === 'Known U-Value'} readOnly /> Known U-Value
                <div style={radioSub}>Use measured or design U-value.</div>
              </label>
            </div>

            <div style={{ height: 10 }} />

            <div style={grid2}>
              <div>
                <Label>{labelFor('walls')} Name *</Label>
                <Input
                  placeholder={`e.g., ${sampleName('walls')}`}
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                />
              </div>

              {form.category === 'Known U-Value' ? (
                <div>
                  <Label>U-value (W/m²K) *</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={form.uValue ?? ''}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        uValue: e.target.value === '' ? undefined : Number(e.target.value),
                      }))
                    }
                  />
                </div>
              ) : (
                <div>
                  <Label>Suggested U-value</Label>
                  <Input readOnly value={suggested == null ? '' : suggested.toFixed(2)} />
                </div>
              )}
            </div>

            {form.category !== 'Known U-Value' && (
              <>
                <div style={grid3}>
                  <div>
                    <Label>Age Band *</Label>
                    <Select
                      value={form.ageBand}
                      onChange={(e) => setForm((f) => ({ ...f, ageBand: e.target.value }))}
                    >
                      <option value="">Select age band</option>
                      {(
                        [
                          'pre-1900',
                          '1900-1929',
                          '1930-1949',
                          '1950-1966',
                          '1967-1975',
                          '1976-1982',
                          '1983-1990',
                          '1991-1995',
                          '1996-2002',
                          '2003-2006',
                          '2007-2011',
                          '2012-present',
                        ] as ExtAgeBand[]
                      ).map((ab) => (
                        <option key={ab} value={ab}>
                          {ab}
                        </option>
                      ))}
                    </Select>
                  </div>

                  <div>
                    <Label>Construction</Label>
                    <Select
                      value={form.construction}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, construction: e.target.value as WallConstruction }))
                      }
                    >
                      {(['', 'Solid masonry', 'Cavity – unfilled', 'Cavity – filled', 'Timber frame'] as WallConstruction[]).map(
                        (c) => (
                          <option key={c} value={c}>
                            {c || '—'}
                          </option>
                        ),
                      )}
                    </Select>
                  </div>

                  <div>
                    <Label>Additional Insulation</Label>
                    <Select
                      value={form.insulation}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, insulation: e.target.value as WallInsulation }))
                      }
                    >
                      {(['', 'None', 'Internal insulation', 'External insulation', 'Cavity fill'] as WallInsulation[]).map(
                        (i) => (
                          <option key={i} value={i}>
                            {i || '—'}
                          </option>
                        ),
                      )}
                    </Select>
                  </div>
                </div>
              </>
            )}

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 14 }}>
              <button onClick={() => setShowWallModal(false)} style={secondaryBtn}>
                Cancel
              </button>
              <button onClick={saveWallFromForm} style={primaryBtn}>
                Save wall type
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

/* =========================================================================
   Tiny UI bits (keep in-file to avoid “Cannot find name 'Label'” errors)
   ========================================================================= */

function Label({ children }: { children: React.ReactNode }) {
  return <label style={{ display: 'block', fontSize: 12, color: '#555', margin: '12px 0 6px' }}>{children}</label>;
}
function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} style={{ ...input, ...(props.style || {}) }} />;
}
function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} style={{ ...input, ...(props.style || {}) }} />;
}

/* =========================================================================
   Styles
   ========================================================================= */

const card: React.CSSProperties = {
  background: '#fff',
  border: '1px solid #e6e6e6',
  borderRadius: 14,
  padding: 16,
};

const rowHeader: React.CSSProperties = {
  display: 'flex',
  gap: 8,
  padding: '8px 4px',
  color: '#555',
  fontSize: 12,
  borderBottom: '1px solid #eee',
  marginTop: 8,
};

const row: React.CSSProperties = {
  display: 'flex',
  gap: 8,
  padding: '10px 4px',
  alignItems: 'center',
  borderBottom: '1px solid #f2f2f2',
};

const input: React.CSSProperties = {
  width: '100%',
  padding: '10px 12px',
  borderRadius: 10,
  border: '1px solid #ddd',
  outline: 'none',
  boxSizing: 'border-box',
};

const primaryBtn: React.CSSProperties = {
  background: '#111',
  color: '#fff',
  border: '1px solid #111',
  padding: '10px 16px',
  borderRadius: 12,
  cursor: 'pointer',
};

const secondaryBtn: React.CSSProperties = {
  background: '#fff',
  color: '#111',
  border: '1px solid #ddd',
  padding: '10px 16px',
  borderRadius: 12,
  cursor: 'pointer',
};

const linkDanger: React.CSSProperties = {
  color: '#b00020',
  textDecoration: 'underline',
  background: 'none',
  border: 0,
  cursor: 'pointer',
};

const grid2: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(2, 1fr)',
  gap: 12,
};

const grid3: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(3, 1fr)',
  gap: 12,
};

const modalBackdrop: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0,0,0,0.32)',
  display: 'grid',
  placeItems: 'center',
  zIndex: 30,
};

const modal: React.CSSProperties = {
  width: 'min(760px, 92vw)',
  background: '#fff',
  borderRadius: 16,
  border: '1px solid #e6e6e6',
  boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
  padding: 18,
};

function radioCard(active: boolean): React.CSSProperties {
  return {
    border: active ? '1px solid #111' : '1px solid #ddd',
    borderRadius: 12,
    padding: 14,
    display: 'block',
    cursor: 'pointer',
    userSelect: 'none',
  };
}
const radioSub: React.CSSProperties = { color: '#666', fontSize: 12, marginTop: 4 };
