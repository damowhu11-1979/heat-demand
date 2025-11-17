'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';

/* ----- Helpers ----- */
const readVent = () => {
  if (typeof window === 'undefined') return null;
  try {
    const r = localStorage.getItem('mcs.ventilation');
    return r ? JSON.parse(r) : null;
  } catch {
    return null;
  }
};

const writeVent = (obj: any) => {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem('mcs.ventilation', JSON.stringify(obj));
  } catch {}
};

/* ----- Small UI Bits ----- */
function Label({ children }: { children: React.ReactNode }) {
  return <label style={{ display: 'block', fontSize: 14, fontWeight: 600, marginBottom: 4 }}>{children}</label>;
}

const card: React.CSSProperties = {
  background: '#fff',
  border: '1px solid #e6e6e6',
  borderRadius: 14,
  padding: 16,
  marginBottom: 24
};

const inputRow: React.CSSProperties = { marginBottom: 16 };
const primaryBtn: React.CSSProperties = { background: '#111', color: '#fff', padding: '12px 18px', borderRadius: 12, textDecoration: 'none', border: 0 };
const secondaryBtn: React.CSSProperties = { background: '#fff', color: '#111', padding: '12px 18px', borderRadius: 12, textDecoration: 'none', border: '1px solid #ccc' };

const btnBox = {
  border: '1px solid #ccc',
  padding: '10px 12px',
  borderRadius: 8,
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  marginBottom: 8,
  fontSize: 14,
  cursor: 'pointer'
};

/* ----- Stepper component ----- */
function Stepper({ label, value, setValue, min = 0, max = 20 }: {
  label: string, value: number, setValue: (n: number) => void, min?: number, max?: number
}) {
  return (
    <div style={inputRow}>
      <Label>{label}</Label>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <button onClick={() => setValue(Math.max(min, value - 1))} style={secondaryBtn}>–</button>
        <div style={{ minWidth: 40, textAlign: 'center', fontSize: 18 }}>{value}</div>
        <button onClick={() => setValue(Math.min(max, value + 1))} style={secondaryBtn}>+</button>
      </div>
    </div>
  );
}

export default function VentilationPage(): React.JSX.Element {
  const [zones, setZones] = useState(1);
  const [storeys, setStoreys] = useState(2);
  const [facades, setFacades] = useState(4);
  const [sheltered, setSheltered] = useState(0);
  const [type, setType] = useState('natural');

  useEffect(() => {
    const saved = readVent();
    if (saved) {
      if (saved.zones !== undefined) setZones(saved.zones);
      if (saved.storeys !== undefined) setStoreys(saved.storeys);
      if (saved.facades !== undefined) setFacades(saved.facades);
      if (saved.sheltered !== undefined) setSheltered(saved.sheltered);
      if (saved.type) setType(saved.type);
    }
  }, []);

  useEffect(() => {
    writeVent({ zones, storeys, facades, sheltered, type });
  }, [zones, storeys, facades, sheltered, type]);

  return (
    <main style={{ maxWidth: 800, margin: '0 auto', padding: 24 }}>
      <h1 style={{ fontSize: 28, marginBottom: 6 }}>Ventilation</h1>
      <div style={{ fontSize: 13, color: '#666', marginBottom: 20 }}>Step 2 of 6 — Set ventilation rates</div>

      <section style={card}>
        <h2 style={{ fontSize: 18, marginBottom: 12 }}>Ventilation Zones</h2>
        <Stepper label="Number of Ventilation Zones" value={zones} setValue={setZones} />
      </section>

      <section style={card}>
        <h2 style={{ fontSize: 18, marginBottom: 12 }}>Zone 1</h2>
        <Stepper label="Number of Storeys" value={storeys} setValue={setStoreys} />
        <Stepper label="Number of External Facades" value={facades} setValue={setFacades} />
        <Stepper label="How many of these facades are sheltered from the wind?" value={sheltered} setValue={setSheltered} max={facades} />
      </section>

      <section style={card}>
        <h2 style={{ fontSize: 18, marginBottom: 12 }}>Ventilation Type</h2>
        {[
          { key: 'natural', label: 'Natural Ventilation', desc: 'May include extract fans in wet rooms.' },
          { key: 'mev', label: 'Mechanical Extract Ventilation (MEV)', desc: 'Extract-only unbalanced system.' },
          { key: 'mv', label: 'Mechanical Ventilation (MV)', desc: 'Balanced (supply + extract).' },
          { key: 'mvhr', label: 'Mechanical Ventilation with Heat Recovery (MVHR)', desc: 'Whole-house recovery, efficiency required.' },
          { key: 'piv', label: 'Positive Input Ventilation (PIV)', desc: 'Supply-only positive pressure.' }
        ].map(opt => (
          <label key={opt.key} style={btnBox}>
            <input
              type="radio"
              name="ventType"
              value={opt.key}
              checked={type === opt.key}
              onChange={() => setType(opt.key)}
              style={{ marginRight: 10 }}
            />
            <div>
              <div style={{ fontWeight: 600 }}>{opt.label}</div>
              <div style={{ fontSize: 12, color: '#666' }}>{opt.desc}</div>
            </div>
          </label>
        ))}
      </section>

      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 24 }}>
        <Link href="/" style={secondaryBtn}>← Back</Link>
        <Link href="/heated-rooms" style={primaryBtn}>Next: Heated Rooms →</Link>
      </div>
    </main>
  );
}
