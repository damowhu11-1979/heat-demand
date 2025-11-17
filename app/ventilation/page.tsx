'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';

/* ----- tiny localStorage helpers ----- */
const VENT_KEY = 'mcs.ventilation';

const readVent = () => {
  if (typeof window === 'undefined') return null;
  try {
    const r = localStorage.getItem(VENT_KEY);
    return r ? JSON.parse(r) : null;
  } catch {
    return null;
  }
};

const writeVent = (obj: any) => {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(VENT_KEY, JSON.stringify(obj));
  } catch {
    // ignore
  }
};

/* ----- small UI bits ----- */
function Label({ children }: { children: React.ReactNode }) {
  return (
    <label
      style={{
        display: 'block',
        fontSize: 12,
        color: '#555',
        marginBottom: 6,
      }}
    >
      {children}
    </label>
  );
}

const card: React.CSSProperties = {
  background: '#fff',
  border: '1px solid #e6e6e6',
  borderRadius: 14,
  padding: 16,
};

const btnBox: React.CSSProperties = {
  border: '1px solid #ddd',
  borderRadius: 10,
  background: '#fff',
  cursor: 'pointer',
};

const valBox: React.CSSProperties = {
  border: '1px solid #ddd',
  borderRadius: 10,
  display: 'grid',
  placeItems: 'center',
  fontSize: 18,
  fontWeight: 600,
};

const primaryBtn: React.CSSProperties = {
  border: '1px solid #111',
  borderRadius: 10,
  padding: '12px 18px',
  background: '#111',
  color: '#fff',
  textDecoration: 'none',
};

const secondaryBtn: React.CSSProperties = {
  border: '1px solid #ddd',
  borderRadius: 10,
  padding: '10px 16px',
  background: '#fff',
  color: '#111',
  textDecoration: 'none',
};

/* ----- Stepper component ----- */
function Stepper({
  value,
  setValue,
  min = 0,
  max = 999,
  ariaLabel,
}: {
  value: number;
  setValue: (n: number) => void;
  min?: number;
  max?: number;
  ariaLabel?: string;
}) {
  const dec = () => setValue(Math.max(min, value - 1));
  const inc = () => setValue(Math.min(max, value + 1));

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '48px 1fr 48px',
        gap: 0,
        alignItems: 'stretch',
      }}
    >
      <button
        type="button"
        onClick={dec}
        aria-label={`decrease ${ariaLabel || 'value'}`}
        style={btnBox}
      >
        –
      </button>
      <div style={valBox} aria-live="polite">
        {value}
      </div>
      <button
        type="button"
        onClick={inc}
        aria-label={`increase ${ariaLabel || 'value'}`}
        style={btnBox}
      >
        +
      </button>
    </div>
  );
}

/* ----- ✅ Default Page Component Export ----- */
export default function VentilationPage(): React.JSX.Element {
  const [ventRate, setVentRate] = useState(5);

  // Load on mount
  useEffect(() => {
    const saved = readVent();
    if (saved?.ventRate !== undefined) {
      setVentRate(saved.ventRate);
    }
  }, []);

  // Save when value changes
  useEffect(() => {
    writeVent({ ventRate });
  }, [ventRate]);

  return (
    <main style={{ maxWidth: 800, margin: '0 auto', padding: 24 }}>
      <h1 style={{ fontSize: 28, marginBottom: 12 }}>Ventilation</h1>
      <div style={{ color: '#888', fontSize: 12, marginBottom: 18 }}>
        Step 2 of 6 — Set ventilation rates
      </div>

      <section style={card}>
        <Label>Ventilation Rate (litres/second)</Label>
        <Stepper
          value={ventRate}
          setValue={setVentRate}
          min={0}
          max={50}
          ariaLabel="ventilation rate"
        />
      </section>

      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 24 }}>
        <Link href="/" style={secondaryBtn}>← Back</Link>
        <Link href="/heated-rooms" style={primaryBtn}>Next: Heated Rooms →</Link>
      </div>
    </main>
  );
}
