'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';

/* ============================== Storage ============================== */

const LS_KEY = 'mcs.elements';

type StoredElements = {
  floors: FloorType[];
  // (you can add walls/roofs/etc here later)
};

function readElements(): StoredElements {
  if (typeof window === 'undefined') return { floors: [] };
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return { floors: [] };
    const obj = JSON.parse(raw) as StoredElements;
    return { floors: obj?.floors ?? [] };
  } catch {
    return { floors: [] };
  }
}

function writeElements(obj: StoredElements) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(obj));
  } catch {
    /* ignore quota */
  }
}

/* ============================== Types ================================ */

type FloorCategory =
  | 'ground-known-insulation' // Ground floor separated from ground; insulation level known
  | 'exposed'                 // Floor over unheated/vented/external air
  | 'internal'                // Floor between storeys (usually no fabric loss)
  | 'knownU';                 // Direct U-value input

type FloorConstruction = 'solid' | 'suspended';

type FloorType = {
  id: string;
  name: string;

  category: FloorCategory;

  // For category ≠ knownU
  construction?: FloorConstruction; // solid / suspended
  insulationMm?: number;            // for “known insulation” categories

  // U-values
  uSuggested?: number | null;       // auto-calculated suggestion (if applicable)
  uFinal: number;                   // the value to use in calc (editable)

  // Flags
  uAccountsGroundContact?: boolean; // only for solid ground floors
  uIncludesTb?: boolean;            // just a note – TB factor is separate

  // Optional TB factor
  tbFactor?: number | null;
};

/* ======================== Suggested U-value table ==================== */
/** Simple illustrative table. Replace values with your data when ready. */
const U_TABLE = {
  ground: {
    solid:     [{ t: 0, u: 1.30 }, { t: 50, u: 0.45 }, { t: 100, u: 0.25 }],
    suspended: [{ t: 0, u: 1.60 }, { t: 50, u: 0.55 }, { t: 100, u: 0.30 }],
  },
  exposed: {
    solid:     [{ t: 0, u: 1.80 }, { t: 50, u: 0.60 }, { t: 100, u: 0.35 }],
    suspended: [{ t: 0, u: 2.00 }, { t: 50, u: 0.70 }, { t: 100, u: 0.40 }],
  },
} as const;

function lerpPoints(points: { t: number; u: number }[], t: number): number {
  if (!points.length) return NaN;
  if (t <= points[0].t) return +points[0].u.toFixed(2);
  const last = points[points.length - 1];
  if (t >= last.t) return +last.u.toFixed(2);
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i], b = points[i + 1];
    if (t >= a.t && t <= b.t) {
      const x = (t - a.t) / (b.t - a.t || 1);
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

  if (!construction || insulationMm == null) return null;

  const k = category === 'ground-known-insulation' ? 'ground' : 'exposed';
  const series =
    construction === 'solid' ? U_TABLE[k].solid : U_TABLE[k].suspended;

  return lerpPoints(series, insulationMm);
}

/* ============================== Page ================================= */

export default function ElementsPage(): React.JSX.Element {
  const [floors, setFloors] = useState<FloorType[]>([]);

  // add/edit modal state
  const [showModal, setShowModal] = useState(false);
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [form, setForm] = useState<Partial<FloorType>>({
    name: 'Ground Floor 1',
    category: 'ground-known-insulation',
    construction: 'suspended',
    insulationMm: 0,
    uFinal: 0.0,
    uAccountsGroundContact: false,
    uIncludesTb: false,
    tbFactor: null,
  });

  // load previously saved
  useEffect(() => {
    const saved = readElements();
    setFloors(saved.floors || []);
  }, []);

  // persist on change
  useEffect(() => {
    writeElements({ floors });
  }, [floors]);

  const openAdd = () => {
    setEditingIdx(null);
    setForm({
      name: 'Ground Floor 1',
      category: 'ground-known-insulation',
      construction: 'suspended',
      insulationMm: 0,
      uFinal: 0.0,
      uAccountsGroundContact: false,
      uIncludesTb: false,
      tbFactor: null,
    });
    setShowModal(true);
  };

  const openEdit = (idx: number) => {
    setEditingIdx(idx);
    setForm({ ...floors[idx] });
    setShowModal(true);
  };

  const remove = (idx: number) => {
    setFloors((prev) => prev.filter((_, i) => i !== idx));
  };

  // compute live suggestion
  const uSuggestion = useMemo(() => {
    return suggestFloorU(
      (form.category as FloorCategory) || 'knownU',
      form.construction as FloorConstruction | undefined,
      typeof form.insulationMm === 'number' ? form.insulationMm : undefined
    );
  }, [form.category, form.construction, form.insulationMm]);

  const onSave = () => {
    if (!form.name?.trim()) {
      alert('Please enter a Floor Name.');
      return;
    }
    const cat = (form.category || 'knownU') as FloorCategory;

    // determine final U
    let uFinal: number;
    if (cat === 'knownU') {
      const v = Number(form.uFinal);
      if (!isFinite(v) || v <= 0) {
        alert('Please enter a valid U-value for Known U-Value.');
        return;
      }
      uFinal = +v.toFixed(3);
    } else if (cat === 'internal') {
      uFinal = 0.0;
    } else {
      const sug = uSuggestion;
      if (sug == null || !isFinite(sug)) {
        alert('Please complete construction and insulation thickness to get a U-value suggestion.');
        return;
      }
      // If user typed something custom in uFinal, keep it; else use suggestion
      const typed = Number(form.uFinal);
      uFinal = isFinite(typed) && typed > 0 ? +typed.toFixed(3) : +sug.toFixed(3);
    }

    const next: FloorType = {
      id: editingIdx != null ? floors[editingIdx].id : cryptoRandomId(),
      name: form.name!.trim(),
      category: cat,
      construction:
        cat === 'knownU' || cat === 'internal'
          ? undefined
          : (form.construction as FloorConstruction | undefined),
      insulationMm:
        cat === 'knownU' || cat === 'internal'
          ? undefined
          : typeof form.insulationMm === 'number'
          ? form.insulationMm
          : undefined,
      uSuggested: cat === 'knownU' ? null : uSuggestion ?? null,
      uFinal,

      uAccountsGroundContact:
        cat === 'ground-known-insulation' &&
        form.construction === 'solid'
          ? !!form.uAccountsGroundContact
          : false,

      uIncludesTb: !!form.uIncludesTb,
      tbFactor:
        form.tbFactor == null || form.tbFactor === ''
          ? null
          : Number(form.tbFactor),
    };

    setFloors((prev) => {
      if (editingIdx == null) return [...prev, next];
      const copy = [...prev];
      copy[editingIdx] = next;
      return copy;
    });
    setShowModal(false);
  };

  return (
    <main
      style={{
        maxWidth: 1040,
        margin: '0 auto',
        padding: 24,
        fontFamily:
          'system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif',
      }}
    >
      <h1 style={{ fontSize: 28, margin: '6px 0 12px' }}>Building Elements</h1>
      <p style={{ color: '#666' }}>
        Define the floor types (category, construction, insulation). U-value is
        suggested automatically and can be edited.
      </p>

      {/* Floors section */}
      <section style={card}>
        <h2 style={{ marginTop: 0 }}>Floor Types</h2>

        {floors.length === 0 && (
          <div style={{ color: '#777', fontSize: 13, marginBottom: 8 }}>
            No floor types yet.
          </div>
        )}

        {floors.map((f, i) => (
          <div
            key={f.id}
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 160px 120px 110px 1fr',
              gap: 8,
              padding: '10px 0',
              borderTop: i ? '1px solid #eee' : undefined,
              alignItems: 'center',
            }}
          >
            <div style={{ fontWeight: 600 }}>{f.name}</div>
            <div style={{ fontSize: 12, color: '#555' }}>{humanCategory(f.category)}</div>
            <div style={{ fontSize: 12, color: '#555' }}>
              {f.construction ?? '—'}
            </div>
            <div style={{ textAlign: 'right' }}>
              {f.uFinal.toFixed(2)} W/m²K
            </div>
            <div style={{ textAlign: 'right' }}>
              <button style={linkBtn} onClick={() => openEdit(i)}>
                Edit
              </button>{' '}
              <button style={linkDanger} onClick={() => remove(i)}>
                Remove
              </button>
            </div>
          </div>
        ))}

        <div style={{ marginTop: 14 }}>
          <button style={primaryBtn} onClick={openAdd}>
            Add Floor Type
          </button>
        </div>
      </section>

      {/* Footer nav */}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 16 }}>
        <Link href="/rooms" style={secondaryBtn}>
          ← Back: Heated Rooms
        </Link>
        <Link href="/room-elements" style={primaryBtn}>
          Next: Room Elements →
        </Link>
      </div>

      {/* Modal */}
      {showModal && (
        <div style={modalBackdrop} onClick={() => setShowModal(false)}>
          <div style={modal} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ marginTop: 0 }}>
              {editingIdx == null ? 'Add Floor Type' : 'Edit Floor Type'}
            </h3>

            {/* Category */}
            <div style={{ display: 'grid', gap: 10, marginBottom: 8 }}>
              <label style={radioRow}>
                <input
                  type="radio"
                  name="fcat"
                  checked={form.category === 'ground-known-insulation'}
                  onChange={() =>
                    setForm((s) => ({
                      ...s,
                      category: 'ground-known-insulation',
                      // sensible defaults
                      construction: s.construction ?? 'solid',
                    }))
                  }
                />
                <div>
                  <div style={{ fontWeight: 600 }}>
                    Ground Floor (known insulation)
                  </div>
                  <div style={muted}>
                    Floor separating dwelling from ground with known insulation.
                  </div>
                </div>
              </label>

              <label style={radioRow}>
                <input
                  type="radio"
                  name="fcat"
                  checked={form.category === 'exposed'}
                  onChange={() =>
                    setForm((s) => ({
                      ...s,
                      category: 'exposed',
                      construction: s.construction ?? 'suspended',
                    }))
                  }
                />
                <div>
                  <div style={{ fontWeight: 600 }}>Exposed Floor</div>
                  <div style={muted}>
                    Over unheated/vented/external air (e.g., garage).
                  </div>
                </div>
              </label>

              <label style={radioRow}>
                <input
                  type="radio"
                  name="fcat"
                  checked={form.category === 'internal'}
                  onChange={() =>
                    setForm((s) => ({
                      ...s,
                      category: 'internal',
                      construction: undefined,
                    }))
                  }
                />
                <div>
                  <div style={{ fontWeight: 600 }}>Internal Floor</div>
                  <div style={muted}>
                    Between storeys within the same dwelling (usually no fabric
                    heat loss).
                  </div>
                </div>
              </label>

              <label style={radioRow}>
                <input
                  type="radio"
                  name="fcat"
                  checked={form.category === 'knownU'}
                  onChange={() =>
                    setForm((s) => ({
                      ...s,
                      category: 'knownU',
                      construction: undefined,
                    }))
                  }
                />
                <div>
                  <div style={{ fontWeight: 600 }}>Known U-Value</div>
                  <div style={muted}>
                    Enter a measured or design U-value directly.
                  </div>
                </div>
              </label>
            </div>

            {/* Common fields */}
            <div style={grid2}>
              <div>
                <Label>Floor Name *</Label>
                <Input
                  value={form.name || ''}
                  onChange={(e) => setForm((s) => ({ ...s, name: e.target.value }))}
                />
              </div>

              {(form.category === 'ground-known-insulation' ||
                form.category === 'exposed') && (
                <div>
                  <Label>Floor Construction *</Label>
                  <Select
                    value={form.construction || 'solid'}
                    onChange={(e) =>
                      setForm((s) => ({
                        ...s,
                        construction: e.target.value as FloorConstruction,
                      }))
                    }
                  >
                    <option value="solid">Solid concrete</option>
                    <option value="suspended">
                      Suspended (timber/chipboard/beam &amp; block)
                    </option>
                  </Select>
                </div>
              )}
            </div>

            {/* Insulation + U suggestion */}
            {(form.category === 'ground-known-insulation' ||
              form.category === 'exposed') && (
              <div style={grid3}>
                <div>
                  <Label>Insulation Thickness *</Label>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <Input
                      type="number"
                      value={
                        typeof form.insulationMm === 'number'
                          ? form.insulationMm
                          : ''
                      }
                      onChange={(e) =>
                        setForm((s) => ({
                          ...s,
                          insulationMm:
                            e.target.value === ''
                              ? undefined
                              : Number(e.target.value),
                        }))
                      }
                      style={{ maxWidth: 160 }}
                    />
                    <span style={muted}>mm</span>
                  </div>
                </div>

                <div>
                  <Label>Suggested U-value</Label>
                  <Input
                    readOnly
                    value={
                      uSuggestion == null || Number.isNaN(uSuggestion)
                        ? ''
                        : uSuggestion.toFixed(2)
                    }
                    placeholder="—"
                    style={{ maxWidth: 180, background: '#f7f7f7' }}
                  />
                  <div style={{ ...muted, fontSize: 12, marginTop: 2 }}>
                    From internal table (editable final value below)
                  </div>
                </div>

                <div>
                  <Label>Final U-value (editable) *</Label>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <Input
                      type="number"
                      value={
                        form.uFinal == null ? '' : String(form.uFinal)
                      }
                      onChange={(e) =>
                        setForm((s) => ({
                          ...s,
                          uFinal:
                            e.target.value === ''
                              ? (undefined as unknown as number)
                              : Number(e.target.value),
                        }))
                      }
                      placeholder={
                        uSuggestion != null && !Number.isNaN(uSuggestion)
                          ? uSuggestion.toFixed(2)
                          : ''
                      }
                      style={{ maxWidth: 180 }}
                    />
                    <span style={muted}>W/m²K</span>
                  </div>
                </div>
              </div>
            )}

            {/* Internal floor – show zero U */}
            {form.category === 'internal' && (
              <div>
                <Label>U-value</Label>
                <Input readOnly value="0.00" style={{ maxWidth: 180, background: '#f7f7f7' }} />
                <div style={{ ...muted, fontSize: 12, marginTop: 2 }}>
                  Internal floors are not counted for fabric loss by default.
                </div>
              </div>
            )}

            {/* Known U – direct input */}
            {form.category === 'knownU' && (
              <div>
                <Label>U-value *</Label>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <Input
                    type="number"
                    value={form.uFinal == null ? '' : String(form.uFinal)}
                    onChange={(e) =>
                      setForm((s) => ({
                        ...s,
                        uFinal:
                          e.target.value === ''
                            ? (undefined as unknown as number)
                            : Number(e.target.value),
                      }))
                    }
                    style={{ maxWidth: 180 }}
                  />
                  <span style={muted}>W/m²K</span>
                </div>
              </div>
            )}

            {/* Flags */}
            {(form.category === 'ground-known-insulation' ||
              form.category === 'exposed' ||
              form.category === 'knownU') && (
              <>
                {form.category === 'ground-known-insulation' &&
                  form.construction === 'solid' && (
                    <label style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                      <input
                        type="checkbox"
                        checked={!!form.uAccountsGroundContact}
                        onChange={(e) =>
                          setForm((s) => ({
                            ...s,
                            uAccountsGroundContact: e.target.checked,
                          }))
                        }
                      />
                      <span style={{ fontSize: 13 }}>
                        U-value accounts for ground contact (solid floors only)
                      </span>
                    </label>
                  )}

                <label style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                  <input
                    type="checkbox"
                    checked={!!form.uIncludesTb}
                    onChange={(e) =>
                      setForm((s) => ({ ...s, uIncludesTb: e.target.checked }))
                    }
                  />
                  <span style={{ fontSize: 13 }}>
                    U-value includes thermal bridging factor
                  </span>
                </label>

                <div style={{ marginTop: 8, maxWidth: 300 }}>
                  <Label>Thermal Bridging Factor (optional)</Label>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <Input
                      type="number"
                      value={
                        form.tbFactor == null || form.tbFactor === ('' as any)
                          ? ''
                          : String(form.tbFactor)
                      }
                      onChange={(e) =>
                        setForm((s) => ({
                          ...s,
                          tbFactor:
                            e.target.value === '' ? null : Number(e.target.value),
                        }))
                      }
                    />
                    <span style={muted}>W/m²K</span>
                  </div>
                </div>
              </>
            )}

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 16 }}>
              <button style={secondaryBtn} onClick={() => setShowModal(false)}>
                Cancel
              </button>
              <button style={primaryBtn} onClick={onSave}>
                Save floor type
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

/* ============================== UI bits ============================== */

function Label({ children }: { children: React.ReactNode }) {
  return (
    <label style={{ display: 'block', fontSize: 12, color: '#555', marginBottom: 6 }}>
      {children}
    </label>
  );
}
function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} style={{ ...input, ...(props.style || {}) }} />;
}
function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} style={{ ...input, ...(props.style || {}) }} />;
}

const input: React.CSSProperties = {
  width: '100%',
  padding: '10px 12px',
  borderRadius: 10,
  border: '1px solid #ddd',
  outline: 'none',
  boxSizing: 'border-box',
};

const card: React.CSSProperties = {
  background: '#fff',
  border: '1px solid #e6e6e6',
  borderRadius: 14,
  padding: 16,
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
const linkBtn: React.CSSProperties = {
  color: '#2255aa',
  textDecoration: 'underline',
  background: 'none',
  border: 0,
  padding: 0,
  cursor: 'pointer',
};
const linkDanger: React.CSSProperties = {
  color: '#b00020',
  textDecoration: 'underline',
  background: 'none',
  border: 0,
  padding: 0,
  cursor: 'pointer',
};

const muted: React.CSSProperties = { color: '#666' };
const radioRow: React.CSSProperties = {
  border: '1px solid #e6e6e6',
  borderRadius: 12,
  padding: 12,
  display: 'grid',
  gridTemplateColumns: '24px 1fr',
  gap: 12,
  alignItems: 'start',
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
  width: 'min(760px, 96vw)',
  background: '#fff',
  borderRadius: 16,
  border: '1px solid #e6e6e6',
  boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
  padding: 18,
};

/* ============================== Utils =============================== */

function humanCategory(cat: FloorCategory): string {
  switch (cat) {
    case 'ground-known-insulation':
      return 'Ground (known insulation)';
    case 'exposed':
      return 'Exposed';
    case 'internal':
      return 'Internal';
    case 'knownU':
      return 'Known U-value';
  }
}

function cryptoRandomId(): string {
  try {
    // @ts-ignore
    if (crypto?.randomUUID) return crypto.randomUUID();
  } catch {}
  return 'id-' + Math.random().toString(36).slice(2, 10);
}
