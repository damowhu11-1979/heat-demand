'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';

/* --------------------------- storage + types --------------------------- */
type ElementRow = { name: string; category: string; uValue?: number | '' };
type ElementsState = {
  walls: ElementRow[];
  floors: ElementRow[];
  ceilings: ElementRow[];
  doors: ElementRow[];
  windows: ElementRow[];
};
type SectionKey = keyof ElementsState; // <-- moved to top-level

const EMPTY: ElementsState = {
  walls: [],
  floors: [],
  ceilings: [],
  doors: [],
  windows: [],
};

function readElements(): ElementsState {
  if (typeof window === 'undefined') return EMPTY;
  try {
    const raw = localStorage.getItem('mcs.elements');
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === 'object' ? { ...EMPTY, ...parsed } : EMPTY;
  } catch {
    return EMPTY;
  }
}

function writeElements(next: ElementsState) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem('mcs.elements', JSON.stringify(next));
  } catch {}
}

/* -------------------------------- page --------------------------------- */
export default function ElementsPage(): React.JSX.Element {
  const [els, setEls] = useState<ElementsState>(EMPTY);

  // modal state
  const [showModal, setShowModal] = useState(false);
  const [section, setSection] = useState<SectionKey>('walls');
  const [form, setForm] = useState<ElementRow>({ name: '', category: '', uValue: '' });
  const [editIndex, setEditIndex] = useState<number | null>(null);

  useEffect(() => setEls(readElements()), []);
  useEffect(() => {
    const t = setTimeout(() => writeElements(els), 250);
    return () => clearTimeout(t);
  }, [els]);

  const openAdd = (sec: SectionKey) => {
    setSection(sec);
    setForm({ name: '', category: '', uValue: '' });
    setEditIndex(null);
    setShowModal(true);
  };
  const openEdit = (sec: SectionKey, idx: number) => {
    setSection(sec);
    setForm({ ...(els[sec][idx] || { name: '', category: '', uValue: '' }) });
    setEditIndex(idx);
    setShowModal(true);
  };
  const saveRow = () => {
    if (!form.name.trim() || !form.category.trim()) {
      alert('Please enter a name and select a category.');
      return;
    }
    const list = [...els[section]];
    const clean: ElementRow = {
      name: form.name.trim(),
      category: form.category.trim(),
      uValue:
        section === 'windows' && form.category === 'Known U-Value'
          ? (form.uValue === '' ? '' : Number(form.uValue))
          : undefined,
    };
    if (editIndex === null) list.push(clean);
    else list[editIndex] = clean;
    setEls({ ...els, [section]: list });
    setShowModal(false);
  };
  const removeRow = (sec: SectionKey, idx: number) => {
    const list = els[sec].filter((_, i) => i !== idx);
    setEls({ ...els, [sec]: list });
  };

  const allGood = useMemo(
    () => ({
      property: true,
      ventilation: true,
      rooms: true,
      elements: Object.values(els).some((arr) => arr.length > 0),
    }),
    [els]
  );

  return (
    <main style={wrap}>
      <h1 style={h1}>Building Elements</h1>
      <p style={subtle}>
        List all unique element types that exist within the heated envelope. You’ll select from these when
        detailing each room.
      </p>

      <Section
        title="Wall Types"
        hint="List all unique wall types that exist within the heated envelope."
        rows={els.walls}
        columns={['Name', 'Category']}
        renderRow={(r) => [r.name, r.category]}
        onAdd={() => openAdd('walls')}
        onEdit={(i) => openEdit('walls', i)}
        onRemove={(i) => removeRow('walls', i)}
      />

      <Section
        title="Floor Types"
        hint="List all unique floor types that exist within the heated envelope."
        rows={els.floors}
        columns={['Name', 'Category']}
        renderRow={(r) => [r.name, r.category]}
        onAdd={() => openAdd('floors')}
        onEdit={(i) => openEdit('floors', i)}
        onRemove={(i) => removeRow('floors', i)}
      />

      <Section
        title="Ceiling Types"
        hint="List all unique ceiling & roof types that exist within the heated envelope."
        rows={els.ceilings}
        columns={['Name', 'Category']}
        renderRow={(r) => [r.name, r.category]}
        onAdd={() => openAdd('ceilings')}
        onEdit={(i) => openEdit('ceilings', i)}
        onRemove={(i) => removeRow('ceilings', i)}
      />

      <Section
        title="Door Types"
        hint="List all unique door types that exist within the heated envelope."
        rows={els.doors}
        columns={['Name', 'Category']}
        renderRow={(r) => [r.name, r.category]}
        onAdd={() => openAdd('doors')}
        onEdit={(i) => openEdit('doors', i)}
        onRemove={(i) => removeRow('doors', i)}
      />

      <Section
        title="Window Types"
        hint="List all unique window types (external, internal partitions or known U-values)."
        rows={els.windows}
        columns={['Name', 'Category', 'U-Value (W/m²·K)']}
        renderRow={(r) => [r.name, r.category, r.uValue ?? '—']}
        onAdd={() => openAdd('windows')}
        onEdit={(i) => openEdit('windows', i)}
        onRemove={(i) => removeRow('windows', i)}
      />

      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 18 }}>
        <Link href="../rooms/" style={{ ...secondaryBtn, textDecoration: 'none' }}>
          ← Back: Heated Rooms
        </Link>
        <Link href="../room-elements/" style={{ ...primaryBtn, textDecoration: 'none' }}>
          Next: Room Elements →
        </Link>
      </div>

      {showModal && (
        <div style={modalBackdrop} onClick={() => setShowModal(false)}>
          <div style={modal} onClick={(e) => e.stopPropagation()}>
            <h2 style={{ margin: '0 0 12px' }}>
              {editIndex === null ? 'Add' : 'Edit'} {labelFor(section)}
            </h2>

            <div style={grid2}>
              <div>
                <Label>{labelFor(section)} Name *</Label>
                <Input
                  placeholder={`e.g., ${sampleName(section)}`}
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </div>

              <div>
                <Label>Category *</Label>
                <Select
                  value={form.category}
                  onChange={(e) => setForm({ ...form, category: e.target.value })}
                >
                  <option value="">Select category</option>
                  {categoriesFor(section).map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </Select>
              </div>
            </div>

            {section === 'windows' && form.category === 'Known U-Value' && (
              <div style={{ marginTop: 10 }}>
                <Label>Design / Measured U-Value (W/m²·K)</Label>
                <Input
                  type="number"
                  step="0.01"
                  placeholder="e.g., 1.30"
                  value={form.uValue}
                  onChange={(e) =>
                    setForm({ ...form, uValue: e.target.value === '' ? '' : Number(e.target.value) })
                  }
                  style={{ maxWidth: 180 }}
                />
              </div>
            )}

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 14 }}>
              <button onClick={() => setShowModal(false)} style={secondaryBtn}>
                Cancel
              </button>
              <button onClick={saveRow} style={primaryBtn}>
                {editIndex === null ? 'Save Type' : 'Update Type'}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

/* ------------------------------ Section UI ----------------------------- */
function Section(props: {
  title: string;
  hint: string;
  rows: ElementRow[];
  columns: string[];
  renderRow: (r: ElementRow) => (string | number | React.ReactNode)[];
  onAdd: () => void;
  onEdit: (i: number) => void;
  onRemove: (i: number) => void;
}) {
  const { title, hint, rows, columns, renderRow, onAdd, onEdit, onRemove } = props;
  return (
    <section style={{ ...card, marginTop: 14 }}>
      <h2 style={{ fontSize: 18, margin: 0, letterSpacing: 1.5 }}>{title.toUpperCase()}</h2>
      <p style={{ color: '#666', marginTop: 6 }}>{hint}</p>

      <div style={tableWrap}>
        <div style={thead}>
          {columns.map((c, i) => (
            <div key={i} style={{ ...thCell, flex: i === 0 ? 2 : 1 }}>
              {c}
            </div>
          ))}
          <div style={{ ...thCell, width: 120 }} />
        </div>

        {rows.map((r, i) => {
          const cols = renderRow(r);
          return (
            <div key={i} style={trow}>
              {cols.map((v, ci) => (
                <div key={ci} style={{ ...tdCell, flex: ci === 0 ? 2 : 1 }}>
                  {v as any}
                </div>
              ))}
              <div style={{ ...tdCell, width: 120, textAlign: 'right' }}>
                <button onClick={() => onEdit(i)} style={linkBtn}>
                  Edit
                </button>
                <button onClick={() => onRemove(i)} style={linkDanger}>
                  Remove
                </button>
              </div>
            </div>
          );
        })}

        {!rows.length && (
          <div style={{ ...tdCell, color: '#777', fontStyle: 'italic' }}>No items yet.</div>
        )}
      </div>

      <button onClick={onAdd} style={{ ...primaryBtn, marginTop: 10 }}>Add {title.slice(0, -6)}</button>
    </section>
  );
}

/* ------------------------------ helpers -------------------------------- */
function labelFor(sec: SectionKey): string {
  switch (sec) {
    case 'walls': return 'Wall Type';
    case 'floors': return 'Floor Type';
    case 'ceilings': return 'Ceiling Type';
    case 'doors': return 'Door Type';
    case 'windows': return 'Window Type';
  }
}
function sampleName(sec: SectionKey): string {
  switch (sec) {
    case 'walls': return 'External Wall 1';
    case 'floors': return 'Ground Floor 1';
    case 'ceilings': return 'Internal Ceiling 1';
    case 'doors': return 'Internal Door 1';
    case 'windows': return 'External Window 1';
  }
}
function categoriesFor(sec: SectionKey): string[] {
  if (sec === 'walls') return ['External Wall', 'Party Wall', 'Internal Partition', 'Roof Slope'];
  if (sec === 'floors') return ['Ground Floor', 'Intermediate Floor', 'Exposed Floor'];
  if (sec === 'ceilings') return ['Internal Ceiling', 'Ceiling to Roof', 'Ceiling to Void'];
  if (sec === 'doors') return ['External Door', 'Internal Door'];
  return ['External Window', 'Internal Window', 'Known U-Value']; // windows
}

/* -------------------------------- styles -------------------------------- */
const wrap: React.CSSProperties = {
  maxWidth: 1040, margin: '0 auto', padding: 24,
  fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif',
};
const h1: React.CSSProperties = { fontSize: 28, margin: '6px 0 8px' };
const subtle: React.CSSProperties = { color: '#666', fontSize: 13, lineHeight: 1.45 };

const card: React.CSSProperties = {
  background: '#fff', border: '1px solid #e6e6e6', borderRadius: 14, padding: 16,
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
const linkBtn: React.CSSProperties = { background: 'none', border: 0, color: '#0366d6', textDecoration: 'underline', cursor: 'pointer', marginRight: 8 };
const linkDanger: React.CSSProperties = { ...linkBtn, color: '#b00020' };

const tableWrap: React.CSSProperties = { border: '1px solid #eee', borderRadius: 12, overflow: 'hidden', marginTop: 8 };
const thead: React.CSSProperties = { display: 'flex', background: '#fafafa', borderBottom: '1px solid #eee' };
const thCell: React.CSSProperties = { padding: '10px 8px', fontSize: 12, color: '#555', fontWeight: 600 };
const trow: React.CSSProperties = { display: 'flex', borderTop: '1px solid #f5f5f5' };
const tdCell: React.CSSProperties = { padding: '10px 8px', display: 'flex', alignItems: 'center', flex: 1 };

const modalBackdrop: React.CSSProperties = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.32)', display: 'grid', placeItems: 'center', zIndex: 30 };
const modal: React.CSSProperties = {
  width: 'min(720px, 92vw)', background: '#fff', borderRadius: 16, border: '1px solid #e6e6e6',
  boxShadow: '0 20px 60px rgba(0,0,0,0.2)', padding: 18,
};
const grid2: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 };
