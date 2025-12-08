'use client';

import React, { useEffect, useState } from 'react';
// import Link from 'next/link'; // Removed to fix the compilation error

type RoomKey = keyof typeof ROOM_LABELS;

const STORAGE_KEY = 'mcs.ventilation';

const EXTRACT_FLOW = {
  kitchen: 13,
  bathroom: 8,
  wc: 6,
  'utility room': 8,
  'en-suite': 6,
};

const INTERMITTENT_FLOW = {
  kitchen: 30,
  bathroom: 15,
  wc: 6,
  'utility room': 30,
  'en-suite': 15,
};

const SUPPLY_FLOW = { living: 10, bedroom: 8 };

const ROOM_LABELS = {
  kitchen: 'Kitchen',
  bathroom: 'Bathroom',
  wc: 'WC',
  'utility room': 'Utility Room',
  'en-suite': 'En-suite',
  living: 'Living Room',
  bedroom: 'Bedroom',
};

const DEFAULT_ROOMS: Record<RoomKey, number> = {
  kitchen: 1,
  bathroom: 1,
  wc: 1,
  'utility room': 0,
  'en-suite': 0,
  living: 0,
  bedroom: 0,
};

/* ───────── storage helpers ───────── */
const readVent = () => {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};
const writeVent = (obj: any) => {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(obj));
  } catch {}
};

/* ───────── shared UI atoms/styles ───────── */
const FONT_STACK = 'system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif';

const Label = ({ children }: { children: React.ReactNode }) => (
  <label style={{ display: 'block', fontWeight: 600, marginBottom: 4 }}>{children}</label>
);

const primaryBtn: React.CSSProperties = {
  background: '#111',
  color: '#fff',
  padding: '10px 14px',
  borderRadius: 10,
  textDecoration: 'none',
  border: 0,
  cursor: 'pointer',
};

const secondaryBtn: React.CSSProperties = {
  background: '#fff',
  color: '#111',
  padding: '10px 14px',
  borderRadius: 10,
  textDecoration: 'none',
  border: '1px solid #ccc',
  cursor: 'pointer',
};

const inputStyle: React.CSSProperties = {
  fontFamily: 'inherit', // inherit from <main> -> matches Property page
  padding: '8px 10px',
  border: '1px solid #ddd',
  borderRadius: 8,
  width: '100%',
  boxSizing: 'border-box',
};

/* ───────── page ───────── */
export default function VentilationPage() {
  const [type, setType] = useState('natural');
  const [rooms, setRooms] = useState<Record<RoomKey, number>>(DEFAULT_ROOMS);
  const [ventilationZones, setVentilationZones] = useState(1);
  const [storeys, setStoreys] = useState(1);
  const [externalFacades, setExternalFacades] = useState(4);
  const [shelteredFacades, setShelteredFacades] = useState(0);

  const totalExtract = Object.entries(rooms).reduce((sum, [key, count]) => {
    const k = key as RoomKey;
    if (k in EXTRACT_FLOW || k in INTERMITTENT_FLOW) {
      const isContinuous = ['mev', 'mv', 'mvhr'].includes(type);
      const flow = isContinuous
        ? (EXTRACT_FLOW as Record<string, number>)[k] ?? 0
        : (INTERMITTENT_FLOW as Record<string, number>)[k] ?? 0;
      return sum + flow * count;
    }
    return sum;
  }, 0);

  const totalSupply = Object.entries(rooms).reduce((sum, [key, count]) => {
    const k = key as RoomKey;
    const flow = Object.prototype.hasOwnProperty.call(SUPPLY_FLOW, k)
      ? SUPPLY_FLOW[k as keyof typeof SUPPLY_FLOW]
      : 0;
    return sum + flow * count;
  }, 0);

  const extractOK = totalExtract >= 30;
  const supplyOK = totalSupply >= 15;

  useEffect(() => {
    const saved = readVent();
    if (saved) {
      if (saved.type) setType(saved.type);
      if (saved.rooms) setRooms((prev) => ({ ...prev, ...saved.rooms }));
      if (saved.ventilationZones) setVentilationZones(saved.ventilationZones);
      if (saved.storeys) setStoreys(saved.storeys);
      if (saved.externalFacades) setExternalFacades(saved.externalFacades);
      if (saved.shelteredFacades) setShelteredFacades(saved.shelteredFacades);
    }
  }, []);

  useEffect(() => {
    writeVent({ type, rooms, ventilationZones, storeys, externalFacades, shelteredFacades });
  }, [type, rooms, ventilationZones, storeys, externalFacades, shelteredFacades]);

  const twoCol: React.CSSProperties = {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: 12,
  };

  const roomGrid: React.CSSProperties = {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: 10,
  };

  const roomItem: React.CSSProperties = {
    display: 'grid',
    gridTemplateColumns: '1fr 64px',
    alignItems: 'center',
    gap: 8,
  };

  return (
    <main style={{ maxWidth: 900, margin: '0 auto', padding: 20, fontFamily: FONT_STACK }}>
      {/* Sticky summary so users don't scroll to see results */}
      <div
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 10,
          background: '#fff',
          padding: '10px 12px',
          margin: '-8px 0 12px',
          border: '1px solid #eee',
          borderRadius: 10,
          boxShadow: '0 2px 6px rgba(0,0,0,0.04)',
          display: 'flex',
          gap: 12,
          flexWrap: 'wrap',
          alignItems: 'center',
        }}
      >
        <strong style={{ marginRight: 8 }}>Ventilation</strong>
        <span
          style={{
            background: extractOK ? '#e5ffe5' : '#ffe5e5',
            padding: '6px 10px',
            borderRadius: 999,
            fontSize: 13,
          }}
        >
          {totalExtract} L/s extract ({['mev', 'mv', 'mvhr'].includes(type) ? 'Continuous' : 'Intermittent'})
        </span>
        {totalSupply > 0 && (
          <span
            style={{
              background: supplyOK ? '#e5ffe5' : '#ffe5e5',
              padding: '6px 10px',
              borderRadius: 999,
              fontSize: 13,
            }}
          >
            {totalSupply} L/s supply
          </span>
        )}
      </div>

      <h1 style={{ fontSize: 28, marginBottom: 6 }}>Ventilation</h1>
      <p style={{ color: '#666', fontSize: 13, marginBottom: 12 }}>
        Step 2 of 6 — Configure ventilation strategy and minimum air flow requirements
      </p>

      <section style={{ marginBottom: 16 }}>
        <div style={twoCol}>
          <div>
            <Label>Ventilation Strategy</Label>
            <select value={type} onChange={(e) => setType(e.target.value)} style={inputStyle}>
              <option value="natural">Natural Ventilation</option>
              <option value="mev">MEV (Mechanical Extract Ventilation)</option>
              <option value="mv">MV (Mechanical Ventilation)</option>
              <option value="mvhr">MVHR (Mech. Ventilation w/ Heat Recovery)</option>
              <option value="piv">PIV (Positive Input Ventilation)</option>
            </select>
            <p style={{ fontSize: 12, color: '#666', marginTop: 4 }}>
              Strategy determines airflow types required.
            </p>
          </div>

          {/* Collapsible “advanced” zone info */}
          <details open>
            <summary style={{ cursor: 'pointer', fontWeight: 600, marginBottom: 8 }}>
              Ventilation Zone Info
            </summary>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <Label>Number of Ventilation Zones</Label>
                <input
                  type="number"
                  min={1}
                  value={ventilationZones}
                  onChange={(e) => setVentilationZones(parseInt(e.target.value || '1'))}
                  style={inputStyle}
                />
              </div>
              <div>
                <Label>Number of Storeys</Label>
                <input
                  type="number"
                  min={1}
                  value={storeys}
                  onChange={(e) => setStoreys(parseInt(e.target.value || '1'))}
                  style={inputStyle}
                />
              </div>
              <div>
                <Label>Number of External Facades</Label>
                <input
                  type="number"
                  min={0}
                  value={externalFacades}
                  onChange={(e) => setExternalFacades(parseInt(e.target.value || '0'))}
                  style={inputStyle}
                />
              </div>
              <div>
                <Label>How many facades are sheltered from wind?</Label>
                <input
                  type="number"
                  min={0}
                  max={externalFacades}
                  value={shelteredFacades}
                  onChange={(e) => setShelteredFacades(parseInt(e.target.value || '0'))}
                  style={inputStyle}
                />
              </div>
            </div>
          </details>
        </div>
      </section>

      <section style={{ marginBottom: 16 }}>
        <h3 style={{ fontSize: 18, marginBottom: 8 }}>Room Counts</h3>
        <div style={roomGrid}>
          {Object.keys(ROOM_LABELS).map((roomKey) => {
            const key = roomKey as RoomKey;
            return (
              <div key={key} style={roomItem}>
                <label style={{ fontSize: 14 }}>{ROOM_LABELS[key]}</label>
                <input
                  type="number"
                  value={rooms[key]}
                  onChange={(e) => setRooms({ ...rooms, [key]: parseInt(e.target.value || '0') })}
                  min={0}
                  style={{ ...inputStyle, width: '64px', justifySelf: 'end' }}
                />
              </div>
            );
          })}
        </div>
        <p style={{ fontSize: 12, color: '#666', marginTop: 6 }}>
          Based on UK ventilation standards (e.g. Document F, BS 5250).
        </p>
      </section>

      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          position: 'sticky',
          bottom: 0,
          background: '#fff',
          paddingTop: 8,
        }}
      >
        {/* Replaced Link with standard <a> tag */}
        <a href="/" style={secondaryBtn}>
          ← Back
        </a>
        {/* Replaced Link with standard <a> tag AND updated href to the correct path: /rooms */}
        <a href="/rooms" style={primaryBtn}>
          Next: Rooms →
        </a>
      </div>
    </main>
  );
}
