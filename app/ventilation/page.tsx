'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';

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

const SUPPLY_FLOW = {
  living: 10,
  bedroom: 8,
};

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

const Label = ({ children }: { children: React.ReactNode }) => (
  <label style={{ display: 'block', fontWeight: 600, marginBottom: 6 }}>{children}</label>
);

const primaryBtn = {
  background: '#111',
  color: '#fff',
  padding: '12px 18px',
  borderRadius: 12,
  textDecoration: 'none',
  border: 0,
};

const secondaryBtn = {
  background: '#fff',
  color: '#111',
  padding: '12px 18px',
  borderRadius: 12,
  textDecoration: 'none',
  border: '1px solid #ccc',
};

const inputStyle = {
  padding: '10px 12px',
  border: '1px solid #ddd',
  borderRadius: 8,
  width: '100%',
  fontSize: 14,
};

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

  return (
    <main style={{ maxWidth: 800, margin: '0 auto', padding: 24 }}>
      <h1 style={{ fontSize: 28, marginBottom: 6 }}>Ventilation</h1>
      <p style={{ color: '#666', fontSize: 13, marginBottom: 20 }}>
        Step 2 of 6 — Configure ventilation strategy and minimum air flow requirements
      </p>

      <section style={{ marginBottom: 24 }}>
        <h3 style={{ fontSize: 18, marginBottom: 12 }}>Ventilation Zone Info</h3>

        <div style={{ marginBottom: 12 }}>
          <Label>Number of Ventilation Zones</Label>
          <input
            type="number"
            min={1}
            value={ventilationZones}
            onChange={(e) => setVentilationZones(parseInt(e.target.value || '1'))}
            style={inputStyle}
          />
        </div>

        <div style={{ marginBottom: 12 }}>
          <Label>Number of Storeys</Label>
          <input
            type="number"
            min={1}
            value={storeys}
            onChange={(e) => setStoreys(parseInt(e.target.value || '1'))}
            style={inputStyle}
          />
        </div>

        <div style={{ marginBottom: 12 }}>
          <Label>Number of External Facades</Label>
          <input
            type="number"
            min={0}
            value={externalFacades}
            onChange={(e) => setExternalFacades(parseInt(e.target.value || '0'))}
            style={inputStyle}
          />
        </div>

        <div style={{ marginBottom: 12 }}>
          <Label>How many are sheltered from wind?</Label>
          <input
            type="number"
            min={0}
            max={externalFacades}
            value={shelteredFacades}
            onChange={(e) => setShelteredFacades(parseInt(e.target.value || '0'))}
            style={inputStyle}
          />
        </div>
      </section>

      <section style={{ marginBottom: 24 }}>
        <Label>Ventilation Strategy</Label>
        <select value={type} onChange={(e) => setType(e.target.value)} style={inputStyle}>
          <option value="natural">Natural Ventilation</option>
          <option value="mev">MEV (Mechanical Extract Ventilation)</option>
          <option value="mv">MV (Mechanical Ventilation)</option>
          <option value="mvhr">MVHR (Mech. Ventilation w/ Heat Recovery)</option>
          <option value="piv">PIV (Positive Input Ventilation)</option>
        </select>
        <p style={{ fontSize: 12, color: '#666', marginTop: 6 }}>
          Strategy determines airflow types required (intermittent vs continuous, extract vs supply).
        </p>
      </section>

      <section style={{ marginBottom: 32 }}>
        <h3 style={{ fontSize: 18, marginBottom: 12 }}>Room Counts</h3>
        {Object.keys(ROOM_LABELS).map((roomKey) => {
          const key = roomKey as RoomKey;
          return (
            <div key={key} style={{ marginBottom: 12 }}>
              <Label>{ROOM_LABELS[key]}</Label>
              <input
                type="number"
                value={rooms[key]}
                onChange={(e) =>
                  setRooms({ ...rooms, [key]: parseInt(e.target.value || '0') })
                }
                min={0}
                style={inputStyle}
              />
            </div>
          );
        })}
      </section>

      <section style={{ marginBottom: 28 }}>
        <h3 style={{ fontSize: 18, marginBottom: 8 }}>Required Ventilation</h3>

        <div
          style={{
            background: extractOK ? '#e5ffe5' : '#ffe5e5',
            padding: 16,
            borderRadius: 10,
            fontSize: 14,
            marginBottom: 8,
          }}
        >
          <strong>{totalExtract} L/s extract</strong> ({['mev', 'mv', 'mvhr'].includes(type) ? 'Continuous' : 'Intermittent'})<br />
          {extractOK ? '✅ Meets extract flow requirement' : '⚠️ Below extract threshold'}
        </div>

        {totalSupply > 0 && (
          <div
            style={{
              background: supplyOK ? '#e5ffe5' : '#ffe5e5',
              padding: 16,
              borderRadius: 10,
              fontSize: 14,
            }}
          >
            <strong>{totalSupply} L/s supply</strong> to habitable rooms<br />
            {supplyOK ? '✅ Meets supply flow requirement' : '⚠️ Below supply flow threshold'}
          </div>
        )}

        <p style={{ fontSize: 12, color: '#666', marginTop: 6 }}>
          Based on UK ventilation standards (e.g. Document F, BS 5250). You can edit room counts above.
        </p>
      </section>

      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <Link href="/" style={secondaryBtn}>← Back</Link>
        <Link href="/rooms" style={primaryBtn}>Next: Heated Rooms →</Link>
      </div>
    </main>
  );
}

