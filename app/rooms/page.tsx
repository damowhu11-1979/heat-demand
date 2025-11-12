'use client';

import React, { useMemo, useState } from 'react';
import Link from 'next/link';

/* ------------------------------ types ------------------------------ */
type Room = {
  zone: number;             // 0-based zone index
  type: string;             // Bedroom, Living, etc
  name: string;             // free text
  maxCeiling: number;       // metres (m)
  designTemp: number;       // °C
  ach: number;              // air changes per hour (1/h)
};

type Zone = { name: string; rooms: Room[] };

/* ------------------------------ page ------------------------------- */
export default function RoomsPage(): React.JSX.Element {
  // zones & rooms
  const [zones, setZones] = useState<Zone[]>([
    { name: 'Zone 1', rooms: [] },
  ]);
  const [expanded, setExpanded] = useState<Record<number, boolean>>({ 0: true });

  // modal state (add/edit)
  const [showModal, setShowModal] = useState(false);
  const [editRef, setEditRef] = useState<{ zi: number; ri: number } | null>(null);

  const [form, setForm] = useState<Room>({
    zone: 0,
    type: '',
    name: '',
    maxCeiling: 2.4,
    designTemp: 18,
    ach: 1.0,
  });

  const roomTypes = useMemo(
    () => [
      'Bedroom',
      'Living Room',
      'Kitchen',
      'toilet (WC)',
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

  function openAddRoom() {
    setEditRef(null);
    setForm({
      zone: 0,
      type: '',
      name: '',
      maxCeiling: 2.4,
      designTemp: 18,
      ach: 1.0,
    });
    setShowModal(true);
  }

  function openEditRoom(zi: number, ri: number) {
    const r = zones[zi].rooms[ri];
    setEditRef({ zi, ri });
    setForm({ ...r });
    setShowModal(true);
  }

  function saveRoom() {
    if (!form.name.trim()) {
      alert('Please enter a Room Name.');
      return;
    }
    const z = [...zones];

    if (editRef) {
      // update existing
      const { zi, ri } = editRef;
      const list = [...z[zi].rooms];
      list[ri] = { ...form };
      z[zi] = { ...z[zi], rooms: list };
    } else {
      // add new
      z[form.zone] = { ...z[form.zone], rooms: [...z[form.zone].rooms, { ...form }] };
    }

    setZones(z);
    setExpanded((e) => ({ ...e, [form.zone]: true }));
    setShowModal(false);
  }

  function removeRoom(zi: number, ri: number) {
    const z = [...zones];
    z[zi] = { ...z[zi], rooms: z[zi].rooms.filter((_, i) => i !== ri) };
    setZones(z);
  }

  function addZone() {
    const n = zones.length + 1;
    setZones([...zones, { name: `Zone ${n}`, rooms: [] }]);
    setExpanded((e) => ({ ...e, [zones.length]: true }));
  }

  return (
    <main style={wrap}>
      <h1 style={h1}>Heated Rooms</h1>
      <p style={subtle}>
        List the heated rooms and conditioned spaces within each zone of the property.
      </p>

      {/* zones & rooms */}
      <section style={card}>
        {/* table header */}
        <div style={tableHeader}>
          <div style={{ flex: 2 }}>Room Name</div>
          <div style={{ width: 120, textAlign: 'right' }}>Ceiling Height<br/>(m)</div>
          <div style={{ width: 120, textAlign: 'right' }}>Design Temp<br/>(°C)</div>
          <div style={{ width: 120, textAlign: 'right' }}>Air Change Rate<br/>(1/h)</div>
          <div style={{ width: 140 }} />
        </div>

        {zones.map((zone, zi) => (
          <div
            key={zi}
            style={{ borderTop: zi ? '1px solid #eee' : undefined, paddingTop: zi ? 12 : 0 }}
          >
            {/* zone row */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '10px 0 6px' }}>
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
                {/* rooms */}
                {zone.rooms.map((r, i) => (
                  <div key={i} style={row}>
                    <div style={{ flex: 2 }}>{r.name || <em style={muted}>Unnamed</em>}</div>
                    <div style={{ width: 120, textAlign: 'right' }}>{r.maxCeiling.toFixed(2)}</div>
                    <div style={{ width: 120, textAlign: 'right' }}>{r.designTemp.toFixed(1)}</div>
                    <div style={{ width: 120, textAlign: 'right' }}>{r.ach.toFixed(1)}</div>
                    <div style={{ width: 140, display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                      <button onClick={() => openEditRoom(zi, i)} style={chipBtn}>✎ Edit</button>
                      <button onClick={() => removeRoom(zi, i)} style={chipDanger}>🗑 Delete</button>
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
          <button onClick={openAddRoom} style={primaryBtn}>+ Add Room</button>
          <button onClick={addZone} style={secondaryBtn}>+ Add Zone</button>
        </div>
      </section>

      {/* page footer nav – relative URLs so GH Pages subpath works */}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 16 }}>
        <Link href="../ventilation/" style={{ ...secondaryBtn, textDecoration: 'none' }}>
          ← Back
        </Link>
        <Link href="../elements/" style={{ ...primaryBtn, textDecoration: 'none' }}>
          Save &amp; Continue →
        </Link>
      </div>

      {/* modal */}
      {showModal && (
        <div style={modalBackdrop} onClick={() => setShowModal(false)}>
          <div style={modal} onClick={(e) => e.stopPropagation()}>
            <h2 style={{ margin: '0 0 10px' }}>{editRef ? 'Edit Room' : 'Add Room'}</h2>
            <p style={{ margin: '6px 0 12px', color: '#555' }}>
              Enter information about this room.
            </p>

            {/* Zone + Room Type */}
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

            {/* Ceiling / Design temp / ACH */}
            <div style={grid3}>
              <div>
                <Label>Max Ceiling Height (m)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={form.maxCeiling}
                  onChange={(e) => setForm({ ...form, maxCeiling: Number(e.target.value || 0) })}
                />
              </div>

              <div>
                <Label>Design Temp (°C)</Label>
                <Input
                  type="number"
                  step="0.1"
                  value={form.designTemp}
                  onChange={(e) => setForm({ ...form, designTemp: Number(e.target.value || 0) })}
                />
              </div>

              <div>
                <Label>Air Change Rate (1/h)</Label>
                <Input
                  type="number"
                  step="0.1"
                  value={form.ach}
                  onChange={(e) => setForm({ ...form, ach: Number(e.target.value || 0) })}
                />
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 12 }}>
              <button onClick={() => setShowModal(false)} style={secondaryBtn}>Cancel</button>
              <button onClick={saveRoom} style={primaryBtn}>
                {editRef ? 'Save changes' : 'Save room'}
              </button>
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
  maxWidth: 1040,
  margin: '0 auto',
  padding: 24,
  fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif',
};
const h1: React.CSSProperties = { fontSize: 28, margin: '6px 0 8px' };
const muted: React.CSSProperties = { color: '#777', fontStyle: 'normal' };
const subtle: React.CSSProperties = { color: '#666', fontSize: 13, lineHeight: 1.45 };

const card: React.CSSProperties = {
  background: '#fff',
  border: '1px solid #e6e6e6',
  borderRadius: 14,
  padding: 16,
};

const tableHeader: React.CSSProperties = {
  display: 'flex',
  gap: 8,
  padding: '8px 4px',
  color: '#555',
  fontSize: 12,
  borderBottom: '1px solid #eee',
  fontWeight: 600,
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
  display: 'inline-block',
};
const chipBtn: React.CSSProperties = {
  background: '#fff',
  color: '#111',
  border: '1px solid #bbb',
  padding: '6px 10px',
  borderRadius: 10,
  cursor: 'pointer',
};
const chipDanger: React.CSSProperties = {
  background: '#fff',
  color: '#b00020',
  border: '1px solid #e3a3a8',
  padding: '6px 10px',
  borderRadius: 10,
  cursor: 'pointer',
};

const iconBtn: React.CSSProperties = {
  background: '#f6f6f6',
  border: '1px solid #e1e1e1',
  borderRadius: 8,
  padding: '4px 8px',
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
