'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';

/* ------------------------------------------------------------------ */
/* storage helpers                                                     */
/* ------------------------------------------------------------------ */
function readProperty<T = any>(): T | null {
  if (typeof window === 'undefined') return null;
  try { const raw = localStorage.getItem('mcs.property'); return raw ? JSON.parse(raw) : null; }
  catch { return null; }
}
function readElements<T = any>(): T | null {
  if (typeof window === 'undefined') return null;
  try { const raw = localStorage.getItem('mcs.elements'); return raw ? JSON.parse(raw) : null; }
  catch { return null; }
}
function writeElements(obj: any) {
  if (typeof window === 'undefined') return;
  try { localStorage.setItem('mcs.elements', JSON.stringify(obj)); } catch {}
}

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */
type AgeBand =
  | 'pre-1900' | '1900-1929' | '1930-1949' | '1950-1966' | '1967-1975'
  | '1976-1982' | '1983-1990' | '1991-1995' | '1996-2002' | '2003-2006'
  | '2007-2011' | '2012-present' | '';

type WallCategory = 'External Wall' | 'Internal Wall' | 'Party Wall' | 'Known U-Value';

type WallForm = {
  id?: string;
  category: WallCategory;
  name: string;
  ageBand: AgeBand;
  construction?: string;
  insulation?: string;
  uValue: number | '';          // W/m²K
  groundContact?: boolean;      // for “Known U-Value” basement use-cases
};

type ElementsState = {
  walls: WallForm[];
  // Future: floors, roofs, doors, windows…
};

/* ------------------------------------------------------------------ */
/* Minimal U-value lookups (edit/extend these with your dataset)       */
/* ------------------------------------------------------------------ */
/** Default external wall U-values by Age Band (no extra insulation).  */
/** Replace with your authoritative figures when ready.                */
const extDefaults: Record<Exclude<AgeBand, ''>, number> = {
  'pre-1900':    2.10,
  '1900-1929':   2.10,
  '1930-1949':   2.00,
  '1950-1966':   1.90,
  '1967-1975':   1.70,
  '1976-1982':   1.60,
  '1983-1990':   1.45,
  '1991-1995':   0.60,
  '1996-2002':   0.45,
  '2003-2006':   0.35,
  '2007-2011':   0.30,
  '2012-present':0.28,
};

/** Simple modifiers for construction / added insulation (illustrative). */
const constructionMods: Record<string, number> = {
  // e.g. solid brick walls often worse than default
  'Solid masonry': +0.20,
  // early cavity (uninsulated) — roughly near default, minimal change
  'Cavity (uninsulated)': +0.00,
  // insulated cavity
  'Cavity (insulated)': -0.40,
  // timber frame typical improvement
  'Timber frame': -0.20,
};
const insulationMods: Record<string, number> = {
  'None': 0,
  'Internal lining': -0.30,
  'External wall insulation': -0.50,
  'Cavity fill': -0.35,
};

/** Overall resolver – returns a suggested U-value for a wall. */
function suggestWallUValue(form: WallForm): number | null {
  if (form.category === 'Known U-Value') return (typeof form.uValue === 'number' ? form.uValue : null);
  if (!form.ageBand || form.ageBand === '') return null;

  // base by age band
  const base = extDefaults[form.ageBand as Exclude<AgeBand, ''>];
  if (typeof base !== 'number') return null;

  // modifiers
  const m1 = form.construction ? (constructionMods[form.construction] ?? 0) : 0;
  const m2 = form.insulation ? (insulationMods[form.insulation] ?? 0) : 0;

  // clamp to a sane band
  const v = Math.max(0.10, +(base + m1 + m2).toFixed(2));
  return v;
}

/* ------------------------------------------------------------------ */
/* UI bits                                                             */
/* ------------------------------------------------------------------ */
function Label({ children }: { children: React.ReactNode }) {
  return <label style={{ display: 'block', fontSize: 12, color: '#555', margin: '10px 0 6px' }}>{children}</label>;
}
function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} style={{ ...input, ...(props.style || {}) }} />;
}
function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} style={{ ...input, ...(props.style || {}) }} />;
}
function Button(props: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      style={{
        borderRadius: 10,
        padding: '10px 14px',
        border: '1px solid #ddd',
        background: props.disabled ? '#eee' : '#111',
        color: props.disabled ? '#888' : '#fff',
        cursor: props.disabled ? 'not-allowed' : 'pointer',
        ...(props.style as any),
      }}
    />
  );
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */
export default function ElementsPage(): React.JSX.Element {
  // load previously-saved elements + age band (from page 1)
  const property = useMemo(() => readProperty() || {}, []);
  const saved = useMemo<ElementsState>(() => readElements() || { walls: [] }, []);

  const [walls, setWalls] = useState<WallForm[]>(saved.walls || []);
  const [showModal, setShowModal] = useState(false);

  // wall form
  const [form, setForm] = useState<WallForm>({
    category: 'External Wall',
    name: '',
    ageBand: (property?.ageBand as AgeBand) || '',
    construction: '',
    insulation: 'None',
    uValue: '',
    groundContact: false,
  });

  // persist
  useEffect(() => { writeElements({ walls }); }, [walls]);

  // whenever category/ageBand/construction/insulation changes, auto-set U
  useEffect(() => {
    if (form.category === 'Known U-Value') return; // user enters value
    const suggested = suggestWallUValue(form);
    setForm((f) => ({ ...f, uValue: suggested ?? '' }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.category, form.ageBand, form.construction, form.insulation]);

  const onAddWall = () => {
    setForm({
      category: 'External Wall',
      name: '',
      ageBand: (property?.ageBand as AgeBand) || '',
      construction: '',
      insulation: 'None',
      uValue: '',
      groundContact: false,
    });
    setShowModal(true);
  };

  const onSaveWall = () => {
    if (!form.name.trim()) return alert('Please enter a Wall Name.');
    if (form.category !== 'Known U-Value' && form.uValue === '') {
      return alert('U-value could not be suggested — please set Age Band or enter a value.');
    }
    const wall: WallForm = { ...form, id: form.id || crypto.randomUUID() };
    setWalls((prev) => {
      const i = prev.findIndex((w) => w.id === wall.id);
      if (i >= 0) { const copy = [...prev]; copy[i] = wall; return copy; }
      return [...prev, wall];
    });
    setShowModal(false);
  };

  const onEditWall = (w: WallForm) => { setForm({ ...w }); setShowModal(true); };
  const onDeleteWall = (id?: string) => setWalls((prev) => prev.filter((w) => w.id !== id));

  /* ---- render ---- */
  return (
    <main style={wrap}>
      <h1 style={h1}>Building Elements</h1>
      <p style={subtle}>Create reusable wall types here. U-values auto-fill from Category + Age Band, but you can override them.</p>

      {/* Walls card */}
      <section style={card}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
          <h2 style={{ fontSize: 18, margin: 0, letterSpacing: 1.2 }}>WALL TYPES</h2>
          <Button onClick={onAddWall}>+ Add Wall Type</Button>
        </div>

        {/* list */}
        <div style={{ marginTop: 10 }}>
          <div style={rowHeader}>
            <div style={{ flex: 2 }}>Name</div>
            <div style={{ width: 160 }}>Category</div>
            <div style={{ width: 140, textAlign: 'right' }}>Age Band</div>
            <div style={{ width: 120, textAlign: 'right' }}>U-value (W/m²K)</div>
            <div style={{ width: 160 }} />
          </div>

          {walls.map((w) => (
            <div key={w.id} style={row}>
              <div style={{ flex: 2 }}>{w.name}</div>
              <div style={{ width: 160 }}>{w.category}</div>
              <div style={{ width: 140, textAlign: 'right' }}>{w.ageBand || '—'}</div>
              <div style={{ width: 120, textAlign: 'right' }}>
                {typeof w.uValue === 'number' ? w.uValue.toFixed(2) : '—'}
              </div>
              <div style={{ width: 160, textAlign: 'right' }}>
                <Button onClick={() => onEditWall(w)} style={{ background: '#fff', color: '#111', border: '1px solid #ddd' }}>Edit</Button>{' '}
                <Button onClick={() => onDeleteWall(w.id)} style={{ background: '#fff', color: '#b00020', border: '1px solid #f1c4c4' }}>Delete</Button>
              </div>
            </div>
          ))}

          {!walls.length && <div style={{ ...muted, padding: '10px 4px' }}>No wall types yet.</div>}
        </div>
      </section>

      {/* nav */}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 16 }}>
        <Link href="/rooms" style={{ ...secondaryBtn, textDecoration: 'none' }}>← Back: Heated Rooms</Link>
        <Link href="/room-elements" style={{ ...primaryBtn, textDecoration: 'none' }}>Next: Room Elements →</Link>
      </div>

      {/* Add/Edit modal */}
      {showModal && (
        <div style={modalBackdrop} onClick={() => setShowModal(false)}>
          <div style={modal} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 10px' }}>{form.id ? 'Edit Wall Type' : 'Add Wall Type'}</h3>

            <div style={grid2}>
              <div>
                <Label>Wall Category *</Label>
                <Select
                  value={form.category}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, category: e.target.value as WallCategory }))
                  }
                >
                  <option>External Wall</option>
                  <option>Internal Wall</option>
                  <option>Party Wall</option>
                  <option>Known U-Value</option>
                </Select>
              </div>

              <div>
                <Label>Wall Name *</Label>
                <Input
                  placeholder={`e.g., External ${form.ageBand || 'wall'}`}
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                />
              </div>
            </div>

            <div style={grid3}>
              <div>
                <Label>Age Band *</Label>
                <Select
                  value={form.ageBand}
                  onChange={(e) => setForm((f) => ({ ...f, ageBand: e.target.value as AgeBand }))}
                >
                  <option value="">Select age band</option>
                  {[
                    'pre-1900','1900-1929','1930-1949','1950-1966','1967-1975',
                    '1976-1982','1983-1990','1991-1995','1996-2002','2003-2006',
                    '2007-2011','2012-present',
                  ].map((ab) => <option key={ab}>{ab}</option>)}
                </Select>
              </div>

              <div>
                <Label>Construction Type</Label>
                <Select
                  value={form.construction || ''}
                  onChange={(e) => setForm((f) => ({ ...f, construction: e.target.value }))}
                >
                  <option value="">Not specified</option>
                  <option>Solid masonry</option>
                  <option>Cavity (uninsulated)</option>
                  <option>Cavity (insulated)</option>
                  <option>Timber frame</option>
                </Select>
              </div>

              <div>
                <Label>Additional Insulation</Label>
                <Select
                  value={form.insulation || 'None'}
                  onChange={(e) => setForm((f) => ({ ...f, insulation: e.target.value }))}
                >
                  <option>None</option>
                  <option>Internal lining</option>
                  <option>External wall insulation</option>
                  <option>Cavity fill</option>
                </Select>
              </div>
            </div>

            <div style={grid2}>
              <div>
                <Label>U-value (W/m²K) {form.category !== 'Known U-Value' ? <span style={{ color:'#888' }}>(auto)</span> : null}</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={form.uValue}
                  onChange={(e) => setForm((f) => ({
                    ...f,
                    uValue: e.target.value === '' ? '' : Number(e.target.value)
                  }))}
                />
              </div>

              {form.category === 'Known U-Value' && (
                <div>
                  <Label>Basement / Ground contact already in U-value?</Label>
                  <Select
                    value={form.groundContact ? 'yes' : 'no'}
                    onChange={(e) => setForm((f) => ({ ...f, groundContact: e.target.value === 'yes' }))}
                  >
                    <option value="no">No</option>
                    <option value="yes">Yes</option>
                  </Select>
                </div>
              )}
            </div>

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 14 }}>
              <Button onClick={() => setShowModal(false)} style={{ background: '#fff', color:'#111', border:'1px solid #ddd' }}>Cancel</Button>
              <Button onClick={onSaveWall}>Save wall type</Button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

/* ------------------------------- styles ------------------------------- */
const wrap: React.CSSProperties = {
  maxWidth: 1040, margin: '0 auto', padding: 24,
  fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif',
};
const h1: React.CSSProperties = { fontSize: 28, margin: '6px 0 10px' };
const subtle: React.CSSProperties = { color: '#666', fontSize: 13, lineHeight: 1.45 };
const muted: React.CSSProperties = { color: '#777', fontStyle: 'normal' };

const card: React.CSSProperties = {
  background: '#fff', border: '1px solid #e6e6e6', borderRadius: 14, padding: 16,
};

const rowHeader: React.CSSProperties = {
  display: 'flex', gap: 8, padding: '8px 4px', color: '#555', fontSize: 12, borderBottom: '1px solid #eee',
};
const row: React.CSSProperties = {
  display: 'flex', gap: 8, padding: '10px 4px', alignItems: 'center', borderBottom: '1px solid #f2f2f2',
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
const grid2: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 };
const grid3: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 };

