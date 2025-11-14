'use client';

import React, { useEffect, useMemo, useState } from 'react';

/* ----------------------------- storage helpers ----------------------------- */
type ElementsStore = {
  floors: FloorType[];
  // ... add walls/roofs later
};

const LS_KEY = 'mcs.elements';
function readElements(): ElementsStore {
  if (typeof window === 'undefined') return { floors: [] };
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? (JSON.parse(raw) as ElementsStore) : { floors: [] };
  } catch {
    return { floors: [] };
  }
}
function writeElements(s: ElementsStore) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(s));
  } catch {}
}

/* ----------------------------------- UI ----------------------------------- */
function Label({ children }: { children: React.ReactNode }) {
  return <label style={{ display: 'block', fontSize: 12, color: '#555', marginBottom: 6 }}>{children}</label>;
}
function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} style={{ ...inputStyle, ...(props.style || {}) }} />;
}
function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} style={{ ...inputStyle, ...(props.style || {}) }} />;
}
const inputStyle: React.CSSProperties = {
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
const card: React.CSSProperties = {
  background: '#fff',
  border: '1px solid #e6e6e6',
  borderRadius: 14,
  padding: 16,
};
const grid2: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 };
const grid3: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 };

/* ----------------------------- floor data model ---------------------------- */

type FloorCategory =
  | 'ground-known-insulation' // “Ground Floor (known insulation)”
  | 'exposed'                 // over garage/outside air
  | 'internal'                // between storeys (normally ~0)
  | 'knownU';                 // user enters U directly

type FloorConstruction = 'solid' | 'suspended';

export type FloorType = {
  id: string;
  name: string;

  category: FloorCategory;
  construction?: FloorConstruction;    // required for ground/exposed
  insulationMm?: number;               // required for ground/exposed

  uSuggested?: number | null;          // auto-suggested
  uFinal: number;                      // used in calcs

  groundContact?: boolean;             // “accounts for ground contact”
  includesTB?: boolean;                // “includes thermal bridging factor”
  tbFactor?: number | '';              // separate ψ-equivalent input (optional)
};

/* ----------------------- U-value lookup & suggestion ----------------------- */

/** Small, versioned table – replace with your authoritative values when ready */
const U_TABLE = {
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
} as const;

function lerp(p: ReadonlyArray<{ t: number; u: number }>, t: number): number {
  if (!p.length) return NaN;
  if (t <= p[0].t) return p[0].u;
  const last = p[p.length - 1];
  if (t >= last.t) return last.u;
  for (let i = 0; i < p.length - 1; i++) {
    const a = p[i], b = p[i + 1];
    if (t >= a.t && t <= b.t) {
      const x = (t - a.t) / (b.t - a.t);
      return +(a.u + x * (b.u - a.u)).toFixed(2);
    }
  }
  return NaN;
}

function suggestFloorU(
  category: FloorCategory,
  construction?: FloorConstruction,
  insulationMm?: number
): number | null {
  if (category === 'knownU') return null;
  if (category === 'internal') return 0.0;
  if (!construction || insulationMm == null || !isFinite(insulationMm)) return null;

  const key = category === 'ground-known-insulation' ? 'ground' : 'exposed';
  const pts = U_TABLE[key][construction];
  return lerp(pts, insulationMm);
}

/* --------------------------------- page ---------------------------------- */

export default function ElementsPage(): React.JSX.Element {
  const [store, setStore] = useState<ElementsStore>({ floors: [] });
  const [showFloorModal, setShowFloorModal] = useState(false);
  const [editing, setEditing] = useState<FloorType | null>(null);

  // load
  useEffect(() => {
    setStore(readElements());
  }, []);
  // save
  useEffect(() => {
    writeElements(store);
  }, [store]);

  const onAddFloor = () => {
    setEditing({
      id: cryptoRandomId(),
      name: 'Ground Floor 1',
      category: 'ground-known-insulation',
      construction: 'suspended',
      insulationMm: 0,
      uSuggested: suggestFloorU('ground-known-insulation', 'suspended', 0),
      uFinal: suggestFloorU('ground-known-insulation', 'suspended', 0) ?? 1.6,
      groundContact: true,
      includesTB: false,
      tbFactor: '',
    });
    setShowFloorModal(true);
  };

  const onEditFloor = (f: FloorType) => {
    setEditing({ ...f });
    setShowFloorModal(true);
  };

  const onSaveFloor = (f: FloorType) => {
    setStore((s) => {
      const exists = s.floors.some((x) => x.id === f.id);
      const floors = exists ? s.floors.map((x) => (x.id === f.id ? f : x)) : [...s.floors, f];
      return { ...s, floors };
    });
    setShowFloorModal(false);
  };

  const onRemoveFloor = (id: string) => {
    setStore((s) => ({ ...s, floors: s.floors.filter((f) => f.id !== id) }));
  };

  return (
    <main style={{ maxWidth: 1040, margin: '0 auto', padding: 24, fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif' }}>
      <h1 style={{ fontSize: 28, margin: '6px 0 10px' }}>Building Elements</h1>
      <p style={{ color: '#666', fontSize: 13 }}>Define floor types. U-values are auto-suggested and editable.</p>

      {/* Floors list */}
      <section style={{ ...card, marginTop: 10 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <strong>Floors</strong>
          <button onClick={onAddFloor} style={primaryBtn}>Add Floor Type</button>
        </div>

        {store.floors.length === 0 && (
          <div style={{ color: '#777', marginTop: 10 }}>No floor types yet.</div>
        )}

        {store.floors.map((f) => (
          <div key={f.id} style={{ borderTop: '1px solid #eee', marginTop: 12, paddingTop: 12 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr auto', gap: 10, alignItems: 'center' }}>
              <div><div style={{ fontSize: 12, color: '#666' }}>Name</div><div>{f.name}</div></div>
              <div><div style={{ fontSize: 12, color: '#666' }}>Category</div><div>{labelForCategory(f.category)}</div></div>
              <div><div style={{ fontSize: 12, color: '#666' }}>Construction</div><div>{f.construction ?? '—'}</div></div>
              <div>
                <div style={{ fontSize: 12, color: '#666' }}>U-value (W/m²K)</div>
                <div>{f.uFinal.toFixed(2)}{f.uSuggested != null ? <span style={{ color: '#777' }}> (suggested {f.uSuggested.toFixed(2)})</span> : null}</div>
              </div>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button onClick={() => onEditFloor(f)} style={secondaryBtn}>Edit</button>
                <button onClick={() => onRemoveFloor(f.id)} style={{ ...secondaryBtn, color: '#b00020', borderColor: '#f1c7c7' }}>Remove</button>
              </div>
            </div>
          </div>
        ))}
      </section>

      {/* Floor modal */}
      {showFloorModal && editing && (
        <FloorModal
          value={editing}
          onChange={setEditing}
          onCancel={() => setShowFloorModal(false)}
          onSave={() => onSaveFloor(editing)}
        />
      )}
    </main>
  );
}

/* -------------------------------- modal -------------------------------- */

function FloorModal({
  value,
  onChange,
  onCancel,
  onSave,
}: {
  value: FloorType;
  onChange: (v: FloorType) => void;
  onCancel: () => void;
  onSave: () => void;
}) {
  // recompute suggestion when inputs change
  const uSuggested = useMemo(() => {
    return suggestFloorU(value.category, value.construction, value.insulationMm);
  }, [value.category, value.construction, value.insulationMm]);

  useEffect(() => {
    // keep fields consistent with category switch
    if (value.category === 'knownU') {
      onChange({ ...value, uSuggested: null, construction: undefined, insulationMm: undefined, groundContact: false });
      return;
    }
    if (value.category === 'internal') {
      const sug = suggestFloorU('internal');
      onChange({ ...value, uSuggested: sug, uFinal: typeof sug === 'number' ? sug : value.uFinal, construction: undefined, insulationMm: undefined, groundContact: false });
      return;
    }
    // ground/exposed need construction + thickness
    const sug = uSuggested;
    if (typeof sug === 'number' && !isNaN(sug)) {
      // only auto-apply if user hasn’t edited uFinal away from previous suggestion
      const isFollowingSuggestion = value.uSuggested == null || Math.abs((value.uFinal ?? 0) - (value.uSuggested ?? 0)) < 1e-9;
      onChange({ ...value, uSuggested: sug, uFinal: isFollowingSuggestion ? sug : value.uFinal });
    } else {
      onChange({ ...value, uSuggested: null });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value.category, value.construction, value.insulationMm]);

  const canSave =
    !!value.name &&
    (value.category === 'knownU'
      ? typeof value.uFinal === 'number' && isFinite(value.uFinal)
      : value.category === 'internal'
      ? true
      : !!value.construction && value.insulationMm != null && isFinite(Number(value.insulationMm)));

  return (
    <div style={modalBackdrop} onClick={onCancel}>
      <div style={modal} onClick={(e) => e.stopPropagation()}>
        <h2 style={{ margin: '0 0 10px' }}>Add Floor Type</h2>

        {/* Category */}
        <div style={{ display: 'grid', gap: 10 }}>
          <RadioCard
            checked={value.category === 'ground-known-insulation'}
            onChange={() => onChange({ ...value, category: 'ground-known-insulation' })}
            title="Ground Floor (known insulation)"
            subtitle="A floor that separates the dwelling from the ground with known insulation level."
          />
          <RadioCard
            checked={value.category === 'exposed'}
            onChange={() => onChange({ ...value, category: 'exposed' })}
            title="Exposed Floor"
            subtitle="A floor that separates the dwelling from an unheated space (e.g. garage) or outside air (flying freehold)."
          />
          <RadioCard
            checked={value.category === 'internal'}
            onChange={() => onChange({ ...value, category: 'internal' })}
            title="Internal Floor"
            subtitle="A floor that separates different storeys within the same dwelling."
          />
          <RadioCard
            checked={value.category === 'knownU'}
            onChange={() => onChange({ ...value, category: 'knownU' })}
            title="Known U-Value"
            subtitle="A floor that has a measured or design U-value."
          />
        </div>

        {/* Name */}
        <div style={{ marginTop: 14 }}>
          <Label>Floor Name *</Label>
          <Input value={value.name} onChange={(e) => onChange({ ...value, name: e.target.value })} />
        </div>

        {/* Category-specific fields */}
        {value.category === 'ground-known-insulation' || value.category === 'exposed' ? (
          <div style={{ ...grid3, marginTop: 10 }}>
            <div>
              <Label>Floor Construction *</Label>
              <Select
                value={value.construction ?? ''}
                onChange={(e) => onChange({ ...value, construction: (e.target.value as FloorConstruction) || undefined })}
              >
                <option value="">Select floor construction</option>
                <option value="solid">Solid concrete</option>
                <option value="suspended">Suspended (timber/chipboard/beam & block)</option>
              </Select>
            </div>

            <div>
              <Label>Insulation Thickness *</Label>
              <Input
                type="number"
                placeholder="mm"
                value={value.insulationMm ?? ''}
                onChange={(e) =>
                  onChange({ ...value, insulationMm: e.target.value === '' ? undefined : Number(e.target.value) })
                }
              />
            </div>

            <div>
              <Label>Suggested U-value (editable)</Label>
              <Input
                type="number"
                step="0.01"
                value={value.uFinal}
                onChange={(e) => onChange({ ...value, uFinal: Number(e.target.value || 0) })}
              />
              <div style={{ color: '#777', fontSize: 12, marginTop: 4 }}>
                {typeof value.uSuggested === 'number' ? `Suggested: ${value.uSuggested.toFixed(2)} W/m²K` : '—'}
              </div>
            </div>
          </div>
        ) : null}

        {value.category === 'internal' ? (
          <div style={{ marginTop: 10 }}>
            <Label>U-value (fixed)</Label>
            <Input type="number" step="0.01" value={value.uFinal} readOnly />
            <div style={{ color: '#777', fontSize: 12, marginTop: 4 }}>Internal floors typically do not contribute to fabric losses.</div>
          </div>
        ) : null}

        {value.category === 'knownU' ? (
          <div style={{ marginTop: 10 }}>
            <Label>U-Value *</Label>
            <Input
              type="number"
              step="0.01"
              value={value.uFinal}
              onChange={(e) => onChange({ ...value, uFinal: Number(e.target.value || 0) })}
            />
          </div>
        ) : null}

        {/* Flags / TB factor */}
        <div style={{ ...grid2, marginTop: 12 }}>
          <div>
            <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 14 }}>
              <input
                type="checkbox"
                checked={!!value.groundContact}
                disabled={!(value.category === 'ground-known-insulation' && value.construction === 'solid')}
                onChange={(e) => onChange({ ...value, groundContact: e.target.checked })}
              />
              U-value accounts for ground contact (solid floors only)
            </label>
          </div>
          <div>
            <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 14 }}>
              <input
                type="checkbox"
                checked={!!value.includesTB}
                onChange={(e) => onChange({ ...value, includesTB: e.target.checked })}
              />
              U-value includes thermal bridging factor
            </label>
          </div>
        </div>

        <div style={{ marginTop: 10, ...grid2 }}>
          <div>
            <Label>Thermal Bridging Factor</Label>
            <Input
              type="number"
              step="0.001"
              placeholder="Optional"
              value={value.tbFactor ?? ''}
              onChange={(e) =>
                onChange({ ...value, tbFactor: e.target.value === '' ? '' : Number(e.target.value) })
              }
            />
          </div>
        </div>

        {/* actions */}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 16 }}>
          <button onClick={onCancel} style={secondaryBtn}>Cancel</button>
          <button onClick={onSave} disabled={!canSave} style={{ ...primaryBtn, opacity: canSave ? 1 : 0.6 }}>
            Save floor type
          </button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------ tiny helpers ------------------------------ */
function RadioCard({
  checked,
  onChange,
  title,
  subtitle,
}: {
  checked: boolean;
  onChange: () => void;
  title: string;
  subtitle: string;
}) {
  return (
    <label
      onClick={onChange}
      style={{
        border: '1px solid ' + (checked ? '#111' : '#e6e6e6'),
        borderRadius: 12,
        padding: 12,
        cursor: 'pointer',
        display: 'grid',
        gridTemplateColumns: '28px 1fr',
        gap: 10,
        alignItems: 'start',
      }}
    >
      <input type="radio" checked={checked} readOnly />
      <div>
        <div style={{ fontWeight: 600 }}>{title}</div>
        <div style={{ color: '#666', fontSize: 13, marginTop: 2 }}>{subtitle}</div>
      </div>
    </label>
  );
}
function labelForCategory(c: FloorCategory): string {
  switch (c) {
    case 'ground-known-insulation': return 'Ground (known insulation)';
    case 'exposed': return 'Exposed';
    case 'internal': return 'Internal';
    case 'knownU': return 'Known U-Value';
  }
}
function cryptoRandomId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return Math.random().toString(36).slice(2);
}

/* --------------------------------- modal UI -------------------------------- */
const modalBackdrop: React.CSSProperties = {
  position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.32)', display: 'grid', placeItems: 'center', zIndex: 30,
};
const modal: React.CSSProperties = {
  width: 'min(760px, 96vw)', background: '#fff', borderRadius: 16, border: '1px solid #e6e6e6',
  boxShadow: '0 20px 60px rgba(0,0,0,0.2)', padding: 18, maxHeight: '90vh', overflow: 'auto',
};
