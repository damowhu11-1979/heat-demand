'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';

/* --- LocalStorage Keys --- */
const STORAGE_KEY = 'mcs.ventilation';

/* --- Airflow Requirements (L/s) --- */
const CONTINUOUS = {
  kitchen: 13,
  bathroom: 8,
  'utility room': 8,
  'en-suite': 6,
  wc: 6
};

const INTERMITTENT = {
  kitchen: 30,
  bathroom: 15,
  'utility room': 30,
  'en-suite': 15,
  wc: 6
};

const ROOM_LABELS = {
  kitchen: 'Kitchen',
  bathroom: 'Bathroom',
  wc: 'WC',
  'utility room': 'Utility Room',
  'en-suite': 'En-suite'
};

/* --- Helpers --- */
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

/* --- UI Atoms --- */
const Label = ({ children }: { children: React.ReactNode }) => (
  <label style={{ display: 'block', fontWeight: 600, marginBottom: 6 }}>{children}</label>
);

const primaryBtn = {
  background: '#111', color: '#fff', padding: '12px 18px', borderRadius: 12, textDecoration: 'none', border: 0
};

const secondaryBtn = {
  background: '#fff', color: '#111', padding: '12px 18px', borderRadius: 12, textDecoration: 'none', border: '1px solid #ccc'
};

const inputStyle = {
  padding: '10px 12px', border: '1px solid #ddd', borderRadius: 8, width: '100%', fontSize: 14
};

/* --- Main Component --- */
export default function VentilationPage() {
  const [type, setType] = useState('natural');
  const [rooms, setRooms] = useState({
    kitchen: 1,
    bathroom: 1,
    wc: 1,
    'utility room': 0,
    'en-suite': 0
  });

  const totalRequired = Object.entries(rooms).reduce((sum, [key, count]) => {
  const k = key as keyof typeof CONTINUOUS;
  const base = ['mev', 'mv', 'mvhr'].includes(type) ? CONTINUOUS[k] : INTERMITTENT[k];
  return sum + base * count;
}, 0);

  const isValid = totalRequired >= 30; // Example threshold, adjust as needed

  useEffect(() => {
    const saved = readVent();
    if (saved) {
      if (saved.type) setType(saved.type);
      if (saved.rooms) setRooms(saved.rooms);
    }
  }, []);

  useEffect(() => {
    writeVent({ type, rooms });
  }, [type, rooms]);

  return (
    <main style={{ maxWidth: 800, margin: '0 auto', padding: 24 }}>
      <h1 style={{ fontSize: 28, marginBottom: 6 }}>Ventilation</h1>
      <p style={{ color: '#666', fontSize: 13, marginBottom: 20 }}>
        Step 2 of 6 — Configure ventilation strategy and minimum air flow requirements
      </p>

      <section style={{ marginBottom: 24 }}>
        <Label>Ventilation Strategy</Label>
        <select
          value={type}
          onChange={(e) => setType(e.target.value)}
          style={inputStyle}
        >
          <option value="natural">Natural Ventilation</option>
          <option value="mev">MEV (Mechanical Extract Ventilation)</option>
          <option value="mv">MV (Mechanical Ventilation)</option>
          <option value="mvhr">MVHR (Mech. Ventilation w/ Heat Recovery)</option>
          <option value="piv">PIV (Positive Input Ventilation)</option>
        </select>
        <p style={{ fontSize: 12, color: '#666', marginTop: 6 }}>
          Strategy determines which air flow rates apply (continuous vs intermittent).
        </p>
      </section>

      <section style={{ marginBottom: 32 }}>
        <h3 style={{ fontSize: 18, marginBottom: 12 }}>Room Counts</h3>
        {Object.keys(rooms).map((roomKey) => (
          <div key={roomKey} style={{ marginBottom: 12 }}>
            <Label>{ROOM_LABELS[roomKey]}</Label>
            <input
              type="number"
              value={rooms[roomKey]}
              min={0}
              onChange={(e) =>
                setRooms({ ...rooms, [roomKey]: parseInt(e.target.value || '0') })
              }
              style={inputStyle}
            />
          </div>
        ))}
      </section>

      <section style={{ marginBottom: 28 }}>
        <h3 style={{ fontSize: 18, marginBottom: 8 }}>Total Required Ventilation</h3>
        <div style={{
          background: isValid ? '#e5ffe5' : '#ffe5e5',
          padding: 16,
          borderRadius: 10,
          fontSize: 16,
          fontWeight: 500
        }}>
          {totalRequired} L/s required ({type === 'natural' || type === 'piv' ? 'Intermittent' : 'Continuous'})<br />
          {isValid ? '✅ Meets typical minimum threshold' : '⚠️ Below expected airflow'}
        </div>
        <p style={{ fontSize: 12, color: '#666', marginTop: 6 }}>
          Based on UK regulations (e.g. Document F, BS 5250). Adjust as needed per dwelling.
        </p>
      </section>

      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <Link href="/" style={secondaryBtn}>← Back</Link>
        <Link href="/heated-rooms" style={primaryBtn}>Next: Heated Rooms →</Link>
      </div>
    </main>
  );
}
