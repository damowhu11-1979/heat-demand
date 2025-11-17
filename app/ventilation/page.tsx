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

/* ----- stepper ----- */
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

/* ----- radio row ----- */
