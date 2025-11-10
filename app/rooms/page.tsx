 'use client';

import React, { useMemo, useState } from 'react';
import Link from 'next/link';

/* ------------------------------ types ------------------------------ */
type Room = {
  zone: number;             // 0-based zone index
  type: string;             // e.g., Bedroom, Living, etc
  name: string;             // free text
  maxCeiling: number;       // metres
  intermittentPct?: number; // %
  heatGainsW?: number;      // W
};

type Zone = { name: string; rooms: Room[] };

/* ------------------------------ page ------------------------------- */
export default function RoomsPage(): React.JSX.Element {
  // zones & rooms
  const [zones, setZones] = useState<Zone[]>([
    { name: 'Zone 1', rooms: [] },
  ]);
  const [expanded, setExpanded] = useState<Record<number, boolean>>({ 0: true });

  // add-room modal
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState<Room>({
    zone: 0,
    type: '',
    name: '',
    maxCeiling: 2.4,
    intermittentPct: undefined,
    heatGainsW: undefined,
  });

  const roomTypes = useMemo(
    () => [
      'Bedroom',
      'Living Room',
      'Kitchen',
      'Bathroom',
      'Hallway',
      'Dining Room',
      'Study',
      'Garage',
      'Porch',
      'Other',
    ],
    []
  );

  const onOpenAddRoom = () => {
    setForm({
      zone: 0,
      type: '',
      name: '',
      maxCeiling: 2.4,
      intermittentPct: undefined,
      heatGainsW: undefined,
    });
    setShowModal(true);
  };

  const onSaveRoom = () => {
    if (!form.name.trim()) {
      alert('Please enter a Room Name.');
      return;
    }
    const z = [...zones];
    z[form.zone] = {
      ...z[form.zone],
      rooms: [...z[form.zone].rooms, { ...form }],
    };
    setZones(z);
    setExpanded((e) => ({ ...e, [form.zone]: true }));
    setShowModal(false);
  };

  const onAddZone = () => {
    const n = zones.length + 1;
    setZones([...zones, { name: `Zone ${n}`, rooms: [] }]);
    setExpanded((e) => ({ ...e, [zones.length]: true }));
  };

  const onRemoveRoom = (zoneIdx: number, idx: number) => {
    const z = [...zones];
    z[zoneIdx] = { ...z[zoneIdx], rooms: z[zoneIdx].rooms.filter((_, i) => i !== idx) };
    setZones(z);
  };

  return (
    <main style={wrap}>
      <h1 style={h1}>Heated Rooms</h1>
      <p style={subtle}>
        List the heated rooms and ceiling heights for each zone of the property.
      </p>

      {/* zones & rooms */}
      <section style={card}>
        {zones.map((zone, zi) => (
          <div key={zi} style={{ borderTop: zi ? '1px solid #eee' : undefined, paddingTop: zi ? 12 : 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
              <button
                onClick={() => setExpanded((e) => ({ ...e, [zi]: !e[zi] }))}
                style={iconBtn}
                aria-label="Toggle zone"
              >
                {expanded[zi] ? '▾' : '▸'}
              </button>
              <strong>{zone.name}</strong>
            </div>

            {expanded[zi] && (
              <div>
                {/* header row */}
                <div style={rowHeader}>
                  <div style={{ flex: 2 }}>Room Name</div>
                  <div style={{ width: 140, textAlign: 'right' }}>Ceiling Height (m)</div>
                  <div style={{ width: 80 }} />
                </div>

                {/* rooms */}
                {zone.rooms.map((r, i) => (
                  <div key={i} style={row}>
                    <div style={{ flex: 2 }}>{r.name || <em style={muted}>Unnamed</em>}</div>
                    <div style={{ width: 140, textAlign: 'right' }}>{r.maxCeiling.toFixed(2)}</div>
                    <div style={{ width: 80, textAlign: 'right' }}>
                      <button onClick={() => onRemoveRoom(zi, i)} style={linkDanger}>Remove</button>
                    </div>
                  </div>
                ))}

                {/* empty state */}
                {!zone.rooms.length && (
                  <div style={{ ...muted, padding: '10px 4px' }}>No rooms in this zone yet.</div>
                )}
              </div>
            )}
          </div>
        ))}

        <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
          <button onClick={onOpenAddRoom} style={primaryBtn}>Add Room</button>
          <button onClick={onAddZone} style={secondaryBtn}>Add Zone</button>
        </div>
      </section>

      {/* nav */}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 16 }}>
        <Link href="/ventilation" style={{ ...secondaryBtn, textDecoration: 'none' }}>← Back</Link>
        <Link href="/elements" style={{ ...primaryBtn, textDecoration: 'none' }}>Next: Building Elements →</Link>
      </div>

      {/* add-room modal */}
      {showModal && (
        <div style={modalBackdrop} onClick={() => setShowModal(false)}>
          <div style={modal} onClick={(e) => e.stopPropagation()}>
            <h2 style={{ margin: '0 0 10px' }}>Add Room</h2>
           <p style={{ margin: '6px 0 12px', color: '#555' }}>
  Enter information about this room.
</p>
            {/* Ventilation Zone */}
            <div style={grid2}>
              <div>
                <Label>Ventilation Zone *</Label>
                <Select
                  value={form.zone}
                  onChange={(e) => setForm({ ...form, zone: Number(e.target.value) })}
                >
                  {zones.map((z, i) => (
                    <option key={i} value={i}>{z.name}</option>
                  ))}
                </Select>
              </div>

              {/* Room Type */}
              <div>
                <Label>Room Type *</Label>
                <Select
                  value={form.type}
                  onChange={(e) => setForm({ ...form, type: e.target.value })}
                >
                  <option value="">Select room type</option>
                  {roomTypes.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </Select>
              </div>
            </div>

            {/* Room Name */}
            <div>
              <Label>Room Name *</Label>
              <Input
                placeholder="e.g., Bedroom 1"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>

            {/* Max Ceiling Height (m) */}
            <div>
              <Label>Max Ceiling Height</Label>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <Input
                  type="number"
                  step="0.01"
                  value={form.maxCeiling}
                  onChange={(e) => setForm({ ...form, maxCeiling: Number(e.target.value || 0) })}
                  style={{ maxWidth: 160 }}
                />
                <span style={{ ...muted, minWidth: 14 }}>m</span>
              </div>
            </div>

            <h3 style={{ margin: '12px 0 6px' }}>Advanced usage</h3>

            {/* Intermittent Heating (%) */}
            <div>
              <Label>Intermittent Heating</Label>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <Input
                  type="number"
                  placeholder="Optional"
                  value={form.intermittentPct ?? ''}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      intermittentPct:
                        e.target.value === '' ? undefined : Number(e.target.value),
                    })
                  }
                  style={{ maxWidth: 160 }}
                />
                <span style={{ ...muted, minWidth: 14 }}>%</span>
              </div>
              <p style={hint}>
                Adds an additional allowance for heating up to the space heating load.
                Calculated as a percentage of fabric heat loss.
              </p>
            </div>

            {/* Heat Gains (W) */}
            <div>
              <Label>Heat Gains</Label>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <Input
                  type="number"
                  placeholder="Optional"
                  value={form.heatGainsW ?? ''}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      heatGainsW:
                        e.target.value === '' ? undefined : Number(e.target.value),
                    })
                  }
                  style={{ maxWidth: 160 }}
                />
                <span style={{ ...muted, minWidth: 14 }}>W</span>
              </div>
              <p style={hint}>
                Add any additional heat gain sources such as high occupancy, machinery or
                solar gains through windows.
              </p>
            </div>

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 10 }}>
              <button onClick={() => setShowModal(false)} style={secondaryBtn}>Cancel</button>
              <button onClick={onSaveRoom} style={primaryBtn}>Save room</button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

/* ------------------------------ UI bits ------------------------------ */
function Label({ children }: { children: React.ReactNode }) {
  return <label style={{ display: 'block', fontSize: 12, color: '#555', margin: '12px 0 6px' }}>{children}</label>;
}
function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} style={{ ...input, ...(props.style || {}) }} />;
}
function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} style={{ ...input, ...(props.style || {}) }} />;
}

/* ------------------------------ styles ------------------------------- */
const wrap: React.CSSProperties = {
  maxWidth: 1040, margin: '0 auto', padding: 24,
  fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif',
};
const h1: React.CSSProperties = { fontSize: 28, margin: '6px 0 8px' };
const muted: React.CSSProperties = { color: '#777', fontStyle: 'normal' };
const subtle: React.CSSProperties = { color: '#666', fontSize: 13, lineHeight: 1.45 };
const hint: React.CSSProperties = { color: '#777', fontSize: 12, marginTop: 4, lineHeight: 1.4 };

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
const linkDanger: React.CSSProperties = { color: '#b00020', textDecoration: 'underline', background: 'none', border: 0, cursor: 'pointer' };
const iconBtn: React.CSSProperties = { background: '#f6f6f6', border: '1px solid #e1e1e1', borderRadius: 8, padding: '4px 8px', cursor: 'pointer' };

const grid2: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 };

const modalBackdrop: React.CSSProperties = {
  position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.32)', display: 'grid', placeItems: 'center', zIndex: 30,
};
const modal: React.CSSProperties = {
  width: 'min(720px, 92vw)', background: '#fff', borderRadius: 16, border: '1px solid #e6e6e6',
  boxShadow: '0 20px 60px rgba(0,0,0,0.2)', padding: 18,
};
{/* Page footer navigation */}
<div
  style={{
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    justifyContent: 'space-between',
    marginTop: 22,
  }}
>
  <Link
    href="/ventilation"
    style={{
      textDecoration: 'none',
      background: '#fff',
      color: '#111',
      border: '1px solid #ddd',
      padding: '10px 16px',
      borderRadius: 10,
      display: 'inline-block',
    }}
  >
    ← Back: Ventilation
  </Link>

  <Link
    href="/elements"
    style={{
      textDecoration: 'none',
      background: '#111',
      color: '#fff',
      border: '1px solid #111',
      padding: '12px 18px',
      borderRadius: 12,
      display: 'inline-block',
    }}
  >
    Next: Building Elements →
  </Link>
</div>
