'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';

/* ------------------------------ types ------------------------------ */
type Room = {
  zone: number;
  type: string;
  name: string;
  maxCeiling: number;
  intermittentPct?: number;
  heatGainsW?: number;
  designTemp?: number;
  airChangeRate?: number;
};

type Zone = { name: string; rooms: Room[] };

/* ------------------------- localStorage helpers ------------------------- */
const ROOMS_KEY = 'mcs.rooms';

const readRooms = (): Zone[] | null => {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(ROOMS_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

const writeRooms = (zones: Zone[]) => {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(ROOMS_KEY, JSON.stringify(zones));
  } catch {}
};

/* ------------------------------ component ------------------------------ */
export default function RoomsPage(): React.JSX.Element {
  const [zones, setZones] = useState<Zone[]>([{ name: 'Zone 1', rooms: [] }]);
  const [expanded, setExpanded] = useState<Record<number, boolean>>({ 0: true });

  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState<Room>({
    zone: 0,
    type: '',
    name: '',
    maxCeiling: 2.4,
  });

  useEffect(() => {
    const saved = readRooms();
    if (saved && Array.isArray(saved) && saved.length) {
      setZones(saved);
      setExpanded({ 0: true });
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => writeRooms(zones), 400);
    return () => clearTimeout(t);
  }, [zones]);

  const roomTypes = useMemo(() => [
    'Bedroom', 'Living Room', 'Kitchen', 'Bathroom',
    'Hallway', 'Dining Room', 'Study', 'Garage',
    'Porch', 'Other'
  ], []);

  const onOpenAddRoom = () => {
    setForm({
      zone: 0,
      type: '',
      name: '',
      maxCeiling: 2.4,
      intermittentPct: undefined,
      heatGainsW: undefined,
      designTemp: undefined,
      airChangeRate: undefined,
    });
    setShowModal(true);
  };

  const onSaveRoom = () => {
    if (!form.name.trim()) {
      alert('Please enter a Room Name.');
      return;
    }
    const z = [...zones];
    z[form.zone] = { ...z[form.zone], rooms: [...z[form.zone].rooms, { ...form }] };
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
    z[zoneIdx].rooms.splice(idx, 1);
    setZones(z);
  };

  return (
    <main style={wrap}>
      <h1 style={h1}>Heated Rooms</h1>
      <p style={subtle}>List the heated rooms and ceiling heights for each zone of the property.</p>

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
                <div style={rowHeader}>
                  <div style={{ flex: 2 }}>Room Name</div>
                  <div style={{ width: 100, textAlign: 'right' }}>Ceiling (m)</div>
                  <div style={{ width: 100, textAlign: 'right' }}>Design Temp (°C)</div>
                  <div style={{ width: 120, textAlign: 'right' }}>Air Change Rate (1/h)</div>
                  <div style={{ width: 80 }} />
                </div>

                {zone.rooms.map((r, i) => (
                  <div key={i} style={row}>
                    <div style={{ flex: 2 }}>{r.name || <em style={muted}>Unnamed</em>}</div>
                    <div style={{ width: 100, textAlign: 'right' }}>{r.maxCeiling.toFixed(2)}</div>
                    <div style={{ width: 100, textAlign: 'right' }}>{r.designTemp ?? '—'}</div>
                    <div style={{ width: 120, textAlign: 'right' }}>{r.airChangeRate ?? '—'}</div>
                    <div style={{ width: 80, textAlign: 'right' }}>
                      <button onClick={() => onRemoveRoom(zi, i)} style={linkDanger}>Remove</button>
                    </div>
                  </div>
                ))}

                {!zone.rooms.length && (
                  <div style={{ ...muted, padding: '10px 4px' }}>
                    No rooms in this zone yet.
                  </div>
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

      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 16 }}>
        <Link href="/ventilation" style={secondaryBtn}>← Back: Ventilation</Link>
        <Link href="/elements" style={primaryBtn}>Next: Building Elements →</Link>
      </div>

      {showModal && (
        <div style={modalBackdrop} onClick={() => setShowModal(false)}>
          <div style={modal} onClick={(e) => e.stopPropagation()}>
            <h2>Add Room</h2>

            <div style={grid2}>
              <div>
                <Label>Ventilation Zone *</Label>
                <Select value={form.zone} onChange={(e) => setForm({ ...form, zone: Number(e.target.value) })}>
                  {zones.map((z, i) => (
                    <option key={i} value={i}>{z.name}</option>
                  ))}
                </Select>
              </div>

              <div>
                <Label>Room Type *</Label>
                <Select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                  <option value="">Select room type</option>
                  {roomTypes.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </Select>
              </div>
            </div>

            <div>
              <Label>Room Name *</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>

            <div>
              <Label>Ceiling Height</Label>
              <Input type="number" step="0.01" value={form.maxCeiling} onChange={(e) => setForm({ ...form, maxCeiling: parseFloat(e.target.value || '0') })} />
            </div>

            <h3>Advanced Usage</h3>

            <div style={grid2}>
              <div>
                <Label>Design Temperature (°C)</Label>
                <Input type="number" placeholder="Optional" value={form.designTemp ?? ''} onChange={(e) => {
                  const val = e.target.value;
                  setForm({ ...form, designTemp: val === '' ? undefined : parseFloat(val) });
                }} />
              </div>
              <div>
                <Label>Air Change Rate (1/h)</Label>
                <Input type="number" placeholder="Optional" value={form.airChangeRate ?? ''} onChange={(e) => {
                  const val = e.target.value;
                  setForm({ ...form, airChangeRate: val === '' ? undefined : parseFloat(val) });
                }} />
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16, gap: 10 }}>
              <button onClick={() => setShowModal(false)} style={secondaryBtn}>Cancel</button>
              <button onClick={onSaveRoom} style={primaryBtn}>Save Room</button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

/* ------------------------- UI Components ------------------------- */
const Label = ({ children }: { children: React.ReactNode }) => (
  <label style={{ display: 'block', fontSize: 12, color: '#555', marginBottom: 6 }}>{children}</label>
);

const Input = (props: React.InputHTMLAttributes<HTMLInputElement>) => (
  <input {...props} style={{ ...input, ...(props.style || {}) }} />
);

const Select = (props: React.SelectHTMLAttributes<HTMLSelectElement>) => (
  <select {...props} style={{ ...input, ...(props.style || {}) }} />
);

/* ------------------------------ Styles ------------------------------ */
const wrap = { maxWidth: 1040, margin: '0 auto', padding: 24 };
const h1 = { fontSize: 28, margin: '6px 0 8px' };
const muted = { color: '#777', fontStyle: 'normal' };
const subtle = { color: '#666', fontSize: 13, lineHeight: 1.45 };

const card = { background: '#fff', border: '1px solid #e6e6e6', borderRadius: 14, padding: 16 };

const rowHeader = {
  display: 'flex', gap: 8, padding: '8px 4px',
  color: '#555', fontSize: 12, borderBottom: '1px solid #eee',
};

const row = {
  display: 'flex', gap: 8, padding: '10px 4px',
  alignItems: 'center', borderBottom: '1px solid #f2f2f2',
};

const input = {
  width: '100%', padding: '10px 12px', borderRadius: 10,
  border: '1px solid #ddd', outline: 'none', boxSizing: 'border-box',
};

const primaryBtn = {
  background: '#111', color: '#fff', border: '1px solid #111',
  padding: '10px 16px', borderRadius: 12, cursor: 'pointer',
};

const secondaryBtn = {
  background: '#fff', color: '#111', border: '1px solid #ddd',
  padding: '10px 16px', borderRadius: 12, cursor: 'pointer',
};

const linkDanger = {
  color: '#b00020', textDecoration: 'underline',
  background: 'none', border: 0, cursor: 'pointer',
};

const iconBtn = {
  background: '#f6f6f6', border: '1px solid #e1e1e1',
  borderRadius: 8, padding: '4px 8px', cursor: 'pointer',
};

const grid2 = {
  display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12,
};

const modalBackdrop = {
  position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.32)',
  display: 'grid', placeItems: 'center', zIndex: 30,
};

const modal = {
  width: 'min(720px, 92vw)', background: '#fff', borderRadius: 16,
  border: '1px solid #e6e6e6', boxShadow: '0 20px 60px rgba(0,0,0,0.2)', padding: 18,
};
