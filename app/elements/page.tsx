'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';

/* =========================================================================
   Local storage helpers (same pattern as property/rooms pages)
   ========================================================================= */
const STORAGE_KEY = 'mcs.elements';
const PROPERTY_KEY = 'mcs.property';

function safeRead<T = any>(key: string): T | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}
function safeWrite(key: string, value: any) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}

/* =========================================================================
   Types
   ========================================================================= */
type AgeBand =
  | 'pre-1900' | '1900-1929' | '1930-1949' | '1950-1966' | '1967-1975'
  | '1976-1982' | '1983-1990' | '1991-1995' | '1996-2002' | '2003-2006'
  | '2007-2011' | '2012-present'
  | '';

type SectionKey = 'walls' | 'floors'; // (easy to extend to ceilings/doors/windows later)

type WallCategory = 'External Wall' | 'Internal Wall' | 'Known U-Value';
type WallConstruction =
  | '' | 'Solid masonry' | 'Cavity – unfilled' | 'Cavity – filled'
  | 'Timber frame' | 'Steel frame' | 'System build';

type WallForm = {
  id: string;
  name: string;
  category: WallCategory;
  ageBand: AgeBand;
  construction: WallConstruction;
  insulationExtra: '' | 'None' | 'Internal' | 'External' | 'Cavity Fill';
  uValue?: number | null; // calculated or entered (Known U-Value)
};

type FloorCategory =
  | 'Ground Floor'
  | 'Ground Floor (known insulation)'
  | 'Exposed Floor'
  | 'Internal Floor'
  | 'Known U-Value';

type FloorForm = {
  id: string;
  name: string;
  category: FloorCategory;
  ageBand: AgeBand;
  insulationLevel?: '' | 'Unknown' | 'Minimal' | 'Typical 1990s' | 'Part L (2010+)' | 'High';
  uValue?: number | null;
};

/* =========================================================================
   Saved model
   ========================================================================= */
type ElementsModel = {
  walls: WallForm[];
  floors: FloorForm[];
};
const defaultModel: ElementsModel = { walls: [], floors: [] };

/* =========================================================================
   Wall U-value suggestion (you already had this; kept intact and tidy)
   ========================================================================= */
const DefaultWallUByAge: Record<Exclude<AgeBand, ''>, number> = {
  'pre-1900': 2.10, '1900-1929': 2.10, '1930-1949': 1.95, '1950-1966': 1.70,
  '1967-1975': 1.60, '1976-1982': 1.40, '1983-1990': 1.00, '1991-1995': 0.70,
  '1996-2002': 0.60, '2003-2006': 0.45, '2007-2011': 0.35, '2012-present': 0.30,
};

const AdjustByConstruction: Partial<Record<WallConstruction, number>> = {
  'Cavity – filled': -0.35,
  'Timber frame': -0.15,
  'Steel frame': +0.05,
  'System build': -0.05,
};

const AdjustByExtraIns: Partial<Record<NonNullable<WallForm['insulationExtra']>, number>> = {
  'Internal': -0.30,
  'External': -0.35,
  'Cavity Fill': -0.45,
  'None': 0,
};

function suggestWallUValue(form: WallForm): number | null {
  if (form.category === 'Known U-Value') {
    return typeof form.uValue === 'number' ? form.uValue : null;
  }
  if (!form.ageBand) return null;

  const base = DefaultWallUByAge[form.ageBand as Exclude<AgeBand, ''>];
  if (typeof base !== 'number') return null;

  let u = base;
  if (form.construction && AdjustByConstruction[form.construction]) {
    u += AdjustByConstruction[form.construction]!;
  }
  if (form.insulationExtra && AdjustByExtraIns[form.insulationExtra]) {
    u += AdjustByExtraIns[form.insulationExtra]!;
  }
  return +Math.max(0.10, Math.min(3.5, u)).toFixed(2);
}

/* =========================================================================
   Floor U-value suggestion (simple, extensible)
   ========================================================================= */
const DefaultGroundFloorUByAge: Record<Exclude<AgeBand, ''>, number> = {
  'pre-1900': 0.90, '1900-1929': 0.90, '1930-1949': 0.85, '1950-1966': 0.75,
  '1967-1975': 0.65, '1976-1982': 0.55, '1983-1990': 0.45, '1991-1995': 0.40,
  '1996-2002': 0.35, '2003-2006': 0.30, '2007-2011': 0.25, '2012-present': 0.22,
};

const ExposedFloorDelta = +0.10; // slightly worse than ground in same era

const FloorInsulationTrim: Partial<Record<NonNullable<FloorForm['insulationLevel']>, number>> = {
  'Minimal': -0.05,
  'Typical 1990s': -0.10,
  'Part L (2010+)': -0.15,
  'High': -0.22,
  'Unknown': 0,
  '': 0,
};

function suggestFloorUValue(f: FloorForm): number | null {
  // Known path
  if (f.category === 'Known U-Value') {
    return typeof f.uValue === 'number' ? f.uValue : null;
  }
  if (!f.ageBand) return null;

  // Choose base by category
  let base = DefaultGroundFloorUByAge[f.ageBand as Exclude<AgeBand, ''>];
  if (typeof base !== 'number') return null;

  if (f.category === 'Exposed Floor') base += ExposedFloorDelta;

  // Known insulation level tweaks (for Ground Floor (known insulation))
  if (f.category === 'Ground Floor (known insulation)' && f.insulationLevel) {
    base += FloorInsulationTrim[f.insulationLevel] ?? 0;
  }

  return +Math.max(0.10, Math.min(2.5, base)).toFixed(2);
}

/* =========================================================================
   UI
   ========================================================================= */
export default function ElementsPage(): React.JSX.Element {
  const [model, setModel] = useState<ElementsModel>(defaultModel);
  const [defaultAge, setDefaultAge] = useState<AgeBand>('');

  // read age band from Property page if present
  useEffect(() => {
    const prop = safeRead<any>(PROPERTY_KEY);
    if (prop?.ageBand) setDefaultAge(prop.ageBand as AgeBand);

    const saved = safeRead<ElementsModel>(STORAGE_KEY);
    if (saved) setModel({ walls: saved.walls ?? [], floors: saved.floors ?? [] });
  }, []);

  // auto save
  useEffect(() => {
    const id = setTimeout(() => safeWrite(STORAGE_KEY, model), 300);
    return () => clearTimeout(id);
  }, [model]);

  /* --------------------------- Walls (existing) --------------------------- */
  const [wModalOpen, setWModalOpen] = useState(false);
  const [wForm, setWForm] = useState<WallForm>({
    id: '', name: '', category: 'External Wall', ageBand: defaultAge,
    construction: '', insulationExtra: 'None', uValue: null,
  });

  function resetWallForm() {
    setWForm({
      id: '', name: '', category: 'External Wall', ageBand: defaultAge,
      construction: '', insulationExtra: 'None', uValue: null,
    });
  }
  function openWallModal() { resetWallForm(); setWModalOpen(true); }
  function saveWall() {
    const id = wForm.id || cryptoRandom();
    const next: WallForm = { ...wForm, id, uValue: suggestWallUValue(wForm) };
    setModel((m) => ({ ...m, walls: [...m.walls, next] }));
    setWModalOpen(false);
  }
  function removeWall(id: string) {
    setModel((m) => ({ ...m, walls: m.walls.filter(w => w.id !== id) }));
  }

  /* --------------------------- Floors (new) ------------------------------- */
  const [fModalOpen, setFModalOpen] = useState(false);
  const [fForm, setFForm] = useState<FloorForm>({
    id: '', name: '', category: 'Ground Floor', ageBand: defaultAge,
    insulationLevel: 'Unknown', uValue: null,
  });

  function resetFloorForm() {
    setFForm({
      id: '', name: '', category: 'Ground Floor', ageBand: defaultAge,
      insulationLevel: 'Unknown', uValue: null,
    });
  }
  function openFloorModal() { resetFloorForm(); setFModalOpen(true); }
  function saveFloor() {
    const id = fForm.id || cryptoRandom();
    const next: FloorForm = {
      ...fForm,
      id,
      uValue: suggestFloorUValue(fForm),
    };
    setModel((m) => ({ ...m, floors: [...m.floors, next] }));
    setFModalOpen(false);
  }
  function removeFloor(id: string) {
    setModel((m) => ({ ...m, floors: m.floors.filter(x => x.id !== id) }));
  }

  return (
    <main style={wrap}>
      <h1 style={h1}>Building Elements</h1>
      <p style={subtle}>List each unique element once (not per-room). You’ll assign them to rooms later.</p>

      {/* ----------------------- WALL TYPES ----------------------- */}
      <section style={card}>
        <div style={headerRow}>
          <h2 style={h2}>Wall Types</h2>
          <button onClick={openWallModal} style={primaryBtn}>Add Wall Type</button>
        </div>

        <div style={tableHeader}>
          <div style={{ flex: 2 }}>Name</div>
          <div style={{ flex: 2 }}>Category</div>
          <div style={{ width: 120, textAlign: 'right' }}>U-value (W/m²K)</div>
          <div style={{ width: 90 }} />
        </div>

        {model.walls.map((w) => (
          <div key={w.id} style={row}>
            <div style={{ flex: 2 }}>{w.name}</div>
            <div style={{ flex: 2 }}>{w.category}</div>
            <div style={{ width: 120, textAlign: 'right' }}>{w.uValue ?? '—'}</div>
            <div style={{ width: 90, textAlign: 'right' }}>
              <button onClick={() => removeWall(w.id)} style={linkDanger}>Remove</button>
            </div>
          </div>
        ))}

        {!model.walls.length && (
          <div style={{ ...muted, padding: '10px 4px' }}>
            No wall types yet.
          </div>
        )}
      </section>

      {/* ----------------------- FLOOR TYPES (NEW) ----------------------- */}
      <section style={{ ...card, marginTop: 14 }}>
        <div style={headerRow}>
          <h2 style={h2}>Floor Types</h2>
          <button onClick={openFloorModal} style={primaryBtn}>Add Floor Type</button>
        </div>

        <div style={tableHeader}>
          <div style={{ flex: 2 }}>Name</div>
          <div style={{ flex: 2 }}>Category</div>
          <div style={{ width: 120, textAlign: 'right' }}>U-value (W/m²K)</div>
          <div style={{ width: 90 }} />
        </div>

        {model.floors.map((f) => (
          <div key={f.id} style={row}>
            <div style={{ flex: 2 }}>{f.name}</div>
            <div style={{ flex: 2 }}>{f.category}</div>
            <div style={{ width: 120, textAlign: 'right' }}>{f.uValue ?? '—'}</div>
            <div style={{ width: 90, textAlign: 'right' }}>
              <button onClick={() => removeFloor(f.id)} style={linkDanger}>Remove</button>
            </div>
          </div>
        ))}

        {!model.floors.length && (
          <div style={{ ...muted, padding: '10px 4px' }}>
            No floor types yet.
          </div>
        )}
      </section>

      {/* ----------------------- Footer nav ----------------------- */}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 16 }}>
        <Link href="/rooms" style={{ ...secondaryBtn, textDecoration: 'none' }}>← Back: Heated Rooms</Link>
        <Link href="/room-elements" style={{ ...primaryBtn, textDecoration: 'none' }}>Next: Room Elements →</Link>
      </div>

      {/* ----------------------- Wall modal ----------------------- */}
      {wModalOpen && (
        <Modal onClose={() => setWModalOpen(false)} title="Add Wall Type">
          <div style={grid2}>
            <div>
              <Label>Wall Category *</Label>
              <RadioGroup
                value={wForm.category}
                onChange={(v) => setWForm({ ...wForm, category: v as WallCategory })}
                options={[
                  { value: 'External Wall', label: 'External Wall', hint: 'Separates the dwelling from the outside.' },
                  { value: 'Internal Wall', label: 'Internal Wall', hint: 'Partitions rooms within the same dwelling.' },
                  { value: 'Known U-Value', label: 'Known U-Value', hint: 'Measured/design U-value.' },
                ]}
              />
            </div>

            <div>
              <Label>Name *</Label>
              <Input
                placeholder={`e.g., External Wall 1`}
                value={wForm.name}
                onChange={(e) => setWForm({ ...wForm, name: e.target.value })}
              />
            </div>
          </div>

          <div style={grid3}>
            <div>
              <Label>Age Band *</Label>
              <Select
                value={wForm.ageBand}
                onChange={(e) => setWForm({ ...wForm, ageBand: e.target.value as AgeBand })}
              >
                <AgeBandOptions />
              </Select>
            </div>

            <div>
              <Label>Construction Type</Label>
              <Select
                value={wForm.construction}
                onChange={(e) => setWForm({ ...wForm, construction: e.target.value as WallConstruction })}
              >
                <option value=""></option>
                <option>Solid masonry</option>
                <option>Cavity – unfilled</option>
                <option>Cavity – filled</option>
                <option>Timber frame</option>
                <option>Steel frame</option>
                <option>System build</option>
              </Select>
            </div>

            <div>
              <Label>Additional Insulation</Label>
              <Select
                value={wForm.insulationExtra}
                onChange={(e) => setWForm({ ...wForm, insulationExtra: e.target.value as any })}
              >
                <option>None</option>
                <option>Internal</option>
                <option>External</option>
                <option>Cavity Fill</option>
              </Select>
            </div>
          </div>

          {/* Known U path */}
          {wForm.category === 'Known U-Value' && (
            <div style={{ marginTop: 8 }}>
              <Label>U-value (W/m²K)</Label>
              <Input
                type="number"
                step="0.01"
                value={wForm.uValue ?? ''}
                onChange={(e) =>
                  setWForm({ ...wForm, uValue: e.target.value === '' ? null : Number(e.target.value) })
                }
                style={{ maxWidth: 160 }}
              />
            </div>
          )}

          <div style={{ marginTop: 10, color: '#666', fontSize: 12 }}>
            Estimated U-value preview: <strong>{suggestWallUValue(wForm) ?? '—'}</strong>
          </div>

          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 12 }}>
            <button onClick={() => setWModalOpen(false)} style={secondaryBtn}>Cancel</button>
            <button onClick={saveWall} style={primaryBtn} disabled={!wForm.name || !wForm.ageBand}>Save Wall Type</button>
          </div>
        </Modal>
      )}

      {/* ----------------------- Floor modal (NEW) ----------------------- */}
      {fModalOpen && (
        <Modal onClose={() => setFModalOpen(false)} title="Add Floor Type">
          <div style={grid2}>
            <div>
              <Label>Floor Category *</Label>
              {/* Mirrors categories/wording in your mock-ups. filecite */}
              <RadioGroup
                value={fForm.category}
                onChange={(v) => setFForm({ ...fForm, category: v as FloorCategory })}
                options={[
                  { value: 'Ground Floor', label: 'Ground Floor', hint: 'Separates dwelling from the ground with unknown/no insulation.' },
                  { value: 'Ground Floor (known insulation)', label: 'Ground Floor (known insulation)', hint: 'Ground floor with known insulation level.' },
                  { value: 'Exposed Floor', label: 'Exposed Floor', hint: 'Separates from unheated space (e.g., garage) or outside air (flying freehold).' },
                  { value: 'Internal Floor', label: 'Internal Floor', hint: 'Separates different storeys within the same dwelling.' },
                  { value: 'Known U-Value', label: 'Known U-Value', hint: 'Measured/design U-value.' },
                ]}
              />
            </div>

            <div>
              <Label>Name *</Label>
              <Input
                placeholder="e.g., Ground Floor 1"
                value={fForm.name}
                onChange={(e) => setFForm({ ...fForm, name: e.target.value })}
              />
            </div>
          </div>

          <div style={grid3}>
            <div>
              <Label>Age Band *</Label>
              <Select
                value={fForm.ageBand}
                onChange={(e) => setFForm({ ...fForm, ageBand: e.target.value as AgeBand })}
              >
                <AgeBandOptions />
              </Select>
            </div>

            {/* Only for “known insulation” category */}
            {fForm.category === 'Ground Floor (known insulation)' && (
              <div>
                <Label>Insulation Level</Label>
                <Select
                  value={fForm.insulationLevel ?? ''}
                  onChange={(e) => setFForm({ ...fForm, insulationLevel: e.target.value as any })}
                >
                  <option value="Unknown">Unknown</option>
                  <option>Minimal</option>
                  <option>Typical 1990s</option>
                  <option>Part L (2010+)</option>
                  <option>High</option>
                </Select>
              </div>
            )}

            {/* Known U path */}
            {fForm.category === 'Known U-Value' && (
              <div>
                <Label>U-value (W/m²K)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={fForm.uValue ?? ''}
                  onChange={(e) =>
                    setFForm({ ...fForm, uValue: e.target.value === '' ? null : Number(e.target.value) })
                  }
                />
              </div>
            )}
          </div>

          <div style={{ marginTop: 10, color: '#666', fontSize: 12 }}>
            Estimated U-value preview: <strong>{suggestFloorUValue(fForm) ?? '—'}</strong>
          </div>

          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 12 }}>
            <button onClick={() => setFModalOpen(false)} style={secondaryBtn}>Cancel</button>
            <button onClick={saveFloor} style={primaryBtn} disabled={!fForm.name || !fForm.ageBand}>Save Floor Type</button>
          </div>
        </Modal>
      )}
    </main>
  );
}

/* =========================================================================
   Small UI bits
   ========================================================================= */
function Label({ children }: { children: React.ReactNode }) {
  return <label style={{ display: 'block', fontSize: 12, color: '#555', marginBottom: 6 }}>{children}</label>;
}
function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} style={{ ...input, ...(props.style || {}) }} />;
}
function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} style={{ ...input, ...(props.style || {}) }} />;
}
function RadioGroup(props: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string; hint?: string }[];
}) {
  return (
    <div style={{ display: 'grid', gap: 10 }}>
      {props.options.map((o) => (
        <label key={o.value} style={radioRow}>
          <input
            type="radio"
            name="radio"
            checked={props.value === o.value}
            onChange={() => props.onChange(o.value)}
          />
          <div>
            <div style={{ fontWeight: 600 }}>{o.label}</div>
            {o.hint && <div style={{ color: '#666', fontSize: 13, marginTop: 2 }}>{o.hint}</div>}
          </div>
        </label>
      ))}
    </div>
  );
}
function AgeBandOptions() {
  return (
    <>
      <option value="">Select age band</option>
      <option>pre-1900</option><option>1900-1929</option><option>1930-1949</option>
      <option>1950-1966</option><option>1967-1975</option><option>1976-1982</option>
      <option>1983-1990</option><option>1991-1995</option><option>1996-2002</option>
      <option>2003-2006</option><option>2007-2011</option><option>2012-present</option>
    </>
  );
}
function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div style={modalBackdrop} onClick={onClose}>
      <div style={modal} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <h3 style={{ margin: 0 }}>{title}</h3>
          <button onClick={onClose} style={iconBtn}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

/* =========================================================================
   Utils + styles
   ========================================================================= */
function cryptoRandom() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `id_${Math.random().toString(36).slice(2, 10)}`;
}

const wrap: React.CSSProperties = {
  maxWidth: 1040, margin: '0 auto', padding: 24,
  fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif',
};
const h1: React.CSSProperties = { fontSize: 28, margin: '6px 0 12px' };
const h2: React.CSSProperties = { fontSize: 18, margin: 0, letterSpacing: 1.5 };
const subtle: React.CSSProperties = { color: '#666', fontSize: 13, lineHeight: 1.45 };
const muted: React.CSSProperties = { color: '#777' };

const card: React.CSSProperties = {
  background: '#fff', border: '1px solid #e6e6e6', borderRadius: 14, padding: 16,
};
const headerRow: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 };

const tableHeader: React.CSSProperties = {
  display: 'flex', gap: 8, padding: '8px 4px', color: '#555', fontSize: 12, borderBottom: '1px solid #eee',
};
const row: React.CSSProperties = {
  display: 'flex', gap: 8, padding: '10px 4px', alignItems: 'center', borderBottom: '1px solid #f2f2f2',
};
const grid2: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 };
const grid3: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 };

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
const linkDanger: React.CSSProperties = { color: '#b00020', textDecoration: 'underline', background: 'none', border: 0, cursor: 'pointer' };
const iconBtn: React.CSSProperties = { background: '#f6f6f6', border: '1px solid #e1e1e1', borderRadius: 8, padding: '4px 8px', cursor: 'pointer' };

const modalBackdrop: React.CSSProperties = {
  position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.32)', display: 'grid', placeItems: 'center', zIndex: 30,
};
const modal: React.CSSProperties = {
  width: 'min(760px, 92vw)', background: '#fff', borderRadius: 16, border: '1px solid #e6e6e6',
  boxShadow: '0 20px 60px rgba(0,0,0,0.2)', padding: 18,
};
const radioRow: React.CSSProperties = {
  border: '1px solid #e6e6e6', borderRadius: 12, padding: 14,
  display: 'grid', gridTemplateColumns: '28px 1fr', gap: 12, alignItems: 'start', cursor: 'pointer',
};
