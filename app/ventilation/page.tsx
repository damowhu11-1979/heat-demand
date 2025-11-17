'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';

/* --- Room Config --- */
const EXTRACT_FLOW = {
  kitchen: 13,
  bathroom: 8,
  'utility room': 8,
  'en-suite': 6,
  wc: 6
};

const INTERMITTENT_FLOW = {
  kitchen: 30,
  bathroom: 15,
  'utility room': 30,
  'en-suite': 15,
  wc: 6
};

const SUPPLY_FLOW = {
  living: 10,
  bedroom: 8
};

const ROOM_LABELS = {
  kitchen: 'Kitchen',
  bathroom: 'Bathroom',
  wc: 'WC',
  'utility room': 'Utility Room',
  'en-suite': 'En-suite',
  living: 'Living Room',
  bedroom: 'Bedroom'
};

type RoomKey = keyof typeof ROOM_LABELS;

/* --- Storage Helpers --- */
const STORAGE_KEY = 'mcs.ventilation';

const readVent = () => {
  if (typeof window === 'undefined') return null;
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '');
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
  const [rooms, setRooms] = useState<Record<RoomKey, number>>({
    kitchen: 1,
    bathroom: 1,
    wc: 1,
    'utility room': 0,
    'en-suite': 0,
    living: 1,
    bedroom: 2
  });

  // Which systems need supply calc
  const supplyRequired = ['mv', 'mvhr', 'piv'].includes(type);

  const extractTotal = Object.entries(rooms).reduce((sum, [key, count]) => {
    const k = key as RoomKey;
    if (k in EXTRACT_FLOW || k in INTERMITTENT_FLOW) {
      const flow = ['mev', 'mv', 'mvhr'].includes(type) ? EXTRACT_FLOW[k] : INTERMITTENT_FLOW[k];
      return sum + flow * count;
    }
    return sum;
  }, 0);

  const supplyTotal = Object.entries(rooms).reduce((sum, [key, count]) => {
    const k = key as RoomKey;
    if (!supplyRequired) return 0;
    if (k in SUPPLY_FLOW) {
      return sum + SUPPLY_FLOW[k] * count;
    }
    return sum;
  }, 0);

  useEffect(() => {
    const saved = readVent();
    if (saved?.type) setType(saved.type);
    if (saved?.rooms) setRooms(saved.rooms);
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

      {/* Strategy */}
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
          Strategy determines if both exhaust and supply are required.
        </p>
      </section>

      {/* Room Counts */}
      <section style={{ marginBottom: 32 }}>
        <h3 style={{ fontSize: 18, marginBottom: 12 }}>Room Counts</h3>
        {Object.keys(rooms).map((roomKey) => {
          const key = roomKey as RoomKey;
          return (
            <div key={key} style={{ marginBottom: 12 }}>
              <Label>{ROOM_LABELS[key]}</Label>
              <input
                type="number"
                min={0}
                value={rooms[key]}
                onChange={(e) => setRooms({ ...rooms, [key]: parseInt(e.target.value || '0') })}
                style={inputStyle}
              />
            </div>
          );
        })}
      </section>

      {/* Summary */}
      <section style={{ marginBottom: 28 }}>
        <h3 style={{ fontSize: 18, marginBottom: 8 }}>Required Ventilation Summary</h3>

        {/* Extract */}
        <div style={{
          background: extractTotal >= 30 ? '#e5ffe5' : '#ffe5e5',
          padding: 14,
          borderRadius: 10,
          fontSize: 15,
          marginBottom: 12
        }}>
          <strong>{extractTotal} L/s extract</strong> ({type === 'natural' || type === 'piv' ? 'Intermittent' : 'Continuous'})<br />
          {extractTotal >= 30 ? '✅ Meets exhaust threshold' : '⚠️ Below expected extract airflow'}
        </div>

        {/* Supply */}
        {supplyRequired && (
          <div style={{
            background: supplyTotal >= 20 ? '#e5ffe5' : '#ffe5e5',
            padding: 14,
            borderRadius: 10,
            fontSize: 15
          }}>
            <strong>{supplyTotal} L/s supply</strong><br />
            {supplyTotal >= 20 ? '✅ Meets supply threshold' : '⚠️ Below expected supply airflow'}
          </div>
        )}

        <p style={{ fontSize: 12, color: '#666', marginTop: 6 }}>
          Based on UK regulations (e.g. Document F, BS 5250). Supply applies to MV, MVHR, PIV systems.
        </p>
      </section>

      {/* Navigation */}
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <Link href="/" style={secondaryBtn}>← Back</Link>
        <Link href="/heated-rooms" style={primaryBtn}>Next: Heated Rooms →</Link>
      </div>
    </main>
  );
}
