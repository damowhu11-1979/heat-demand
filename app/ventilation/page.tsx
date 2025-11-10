'use client';

import React, { useMemo, useState } from 'react';
import Link from 'next/link';

/** small UI bits kept consistent with your page.tsx */
function Label({ children }: { children: React.ReactNode }) {
  return <label style={{ display: 'block', fontSize: 12, color: '#555', marginBottom: 6 }}>{children}</label>;
}
function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} style={{ ...inputStyle, ...(props.style || {}) }} />;
}
function Button(props: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      style={{
        borderRadius: 10,
        padding: '10px 16px',
        border: '1px solid #ddd',
        background: props.disabled ? '#eee' : '#111',
        color: props.disabled ? '#888' : '#fff',
        cursor: props.disabled ? 'not-allowed' : 'pointer',
        ...(props.style as any),
      }}
    />
  );
}
const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px 12px',
  borderRadius: 10,
  border: '1px solid #ddd',
  outline: 'none',
  boxSizing: 'border-box',
};
const card: React.CSSProperties = {
  background: '#fff',
  border: '1px solid #e6e6e6',
  borderRadius: 14,
  padding: 16,
};

/** simple stepper control */
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
    <div style={{ display: 'grid', gridTemplateColumns: '48px 1fr 48px', gap: 0, alignItems: 'stretch' }}>
      <button
        type="button"
        onClick={dec}
        aria-label={`decrease ${ariaLabel || 'value'}`}
        style={{
          border: '1px solid #ddd',
          borderRadius: 10,
          background: '#fff',
          cursor: 'pointer',
        }}
      >
        –
      </button>
      <div
        style={{
          border: '1px solid #ddd',
          borderRadius: 10,
          display: 'grid',
          placeItems: 'center',
          fontSize: 18,
          fontWeight: 600,
        }}
        aria-live="polite"
      >
        {value}
      </div>
      <button
        type="button"
        onClick={inc}
        aria-label={`increase ${ariaLabel || 'value'}`}
        style={{
          border: '1px solid #ddd',
          borderRadius: 10,
          background: '#fff',
          cursor: 'pointer',
        }}
      >
        +
      </button>
    </div>
  );
}

export default function VentilationPage(): React.JSX.Element {
  // top-of-page: number of ventilation zones
  const [zones, setZones] = useState<number>(1);

  // zone 1 fields
  const [storeys, setStoreys] = useState<number>(2);
  const [facades, setFacades] = useState<number>(4);
  const [sheltered, setSheltered] = useState<number>(0);

  // ventilation type
  type VentType = 'natural' | 'mev' | 'mv' | 'mvhr' | 'piv' | '';
  const [vtype, setVtype] = useState<VentType>('');

  const canContinue = useMemo(() => {
    const validCounts = zones >= 1 && storeys >= 1 && facades >= 1 && sheltered >= 0 && sheltered <= facades;
    return validCounts && !!vtype;
  }, [zones, storeys, facades, sheltered, vtype]);

  const saveAndContinue = () => {
    // wire up to your data store if needed
    const payload = { zones, zone1: { storeys, facades, sheltered, vtype } };
    console.log('VENTILATION SAVE', payload);
    // simple client-side nav: handled by Link below
  };

  return (
    <main
      style={{
        maxWidth: 1040,
        margin: '0 auto',
        padding: 24,
        fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif',
      }}
    >
      <h1 style={{ fontSize: 28, margin: '6px 0 12px' }}>Ventilation</h1>

      {/* Ventilation Zones */}
      <section style={card}>
        <h2 style={{ fontSize: 18, margin: 0, letterSpacing: 1.5 }}>VENTILATION ZONES</h2>
        <p style={{ color: '#666', marginTop: 8 }}>
          Enter the total number of distinct ventilation zones in the property. Rooms that share the same
          ventilation system form a single zone.
        </p>

        <div style={{ marginTop: 12 }}>
          <Label>Number of Ventilation Zones *</Label>
          <Stepper value={zones} setValue={setZones} min={1} ariaLabel="number of ventilation zones" />
        </div>
      </section>

      {/* Zone 1 */}
      <section style={{ ...card, marginTop: 16 }}>
        <h2 style={{ fontSize: 18, margin: 0, letterSpacing: 1.5 }}>ZONE 1</h2>
        <p style={{ color: '#666', marginTop: 8 }}>Enter information about this ventilation zone.</p>

        <div style={{ display: 'grid', gap: 16, marginTop: 6 }}>
          <div>
            <Label>Number of Storeys *</Label>
            <Stepper value={storeys} setValue={setStoreys} min={1} ariaLabel="number of storeys" />
          </div>

          <div>
            <Label>Number of External Facades *</Label>
            <Stepper value={facades} setValue={setFacades} min={1} ariaLabel="number of external facades" />
          </div>

          <div>
            <Label>How many of these facades are sheltered from the wind? *</Label>
            <Stepper
              value={sheltered}
              setValue={setSheltered}
              min={0}
              max={facades}
              ariaLabel="sheltered facades"
            />
            <div style={{ color: '#999', fontSize: 12, marginTop: 4 }}>
              Must be ≤ number of external facades.
            </div>
          </div>
        </div>
      </section>

      {/* Ventilation Type */}
      <section style={{ ...card, marginTop: 16 }}>
        <h2 style={{ fontSize: 18, margin: 0, letterSpacing: 1.5 }}>VENTILATION TYPE</h2>
        <p style={{ color: '#666', marginTop: 8 }}>
          Select the type of ventilation system that this zone uses.
        </p>

        <div style={{ display: 'grid', gap: 10, marginTop: 10 }}>
          <RadioRow
            id="v-natural"
            name="vent-type"
            checked={vtype === 'natural'}
            onChange={() => setVtype('natural')}
            title="Natural Ventilation"
            subtitle="Natural ventilation only that may include extract fans in wet rooms."
          />
          <RadioRow
            id="v-mev"
            name="vent-type"
            checked={vtype === 'mev'}
            onChange={() => setVtype('mev')}
            title="Mechanical Extract Ventilation (MEV)"
            subtitle="Fan-assisted mechanical ventilation (extract-only) that is unbalanced."
          />
          <RadioRow
            id="v-mv"
            name="vent-type"
            checked={vtype === 'mv'}
            onChange={() => setVtype('mv')}
            title="Mechanical Ventilation (MV)"
            subtitle="Fan-assisted mechanical ventilation (supply and extract) that is balanced."
          />
          <RadioRow
            id="v-mvhr"
            name="vent-type"
            checked={vtype === 'mvhr'}
            onChange={() => setVtype('mvhr')}
            title="Mechanical Ventilation with Heat Recovery (MVHR)"
            subtitle="Whole-house heat recovery ventilation. System efficiency required."
          />
          <RadioRow
            id="v-piv"
            name="vent-type"
            checked={vtype === 'piv'}
            onChange={() => setVtype('piv')}
            title="Positive Input Ventilation (PIV)"
            subtitle="Supply-only ventilation that creates a positive pressure within the house."
          />
        </div>

        {/* Actions */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginTop: 18,
          }}
        >
          <Link
            href="/rooms"
            style={{
              border: '1px solid #ddd',
              borderRadius: 10,
              padding: '10px 16px',
              textDecoration: 'none',
              color: '#111',
              background: '#fff',
            }}
          >
            ← Back
          </Link>

          <Link
            href={canContinue ? '/results' : '#'}
            onClick={(e) => {
              if (!canContinue) e.preventDefault();
              else saveAndContinue();
            }}
            style={{
              border: '1px solid #111',
              borderRadius: 10,
              padding: '12px 18px',
              textDecoration: 'none',
              color: canContinue ? '#fff' : '#888',
              background: canContinue ? '#111' : '#eee',
              pointerEvents: canContinue ? 'auto' : 'none',
            }}
          >
            Save & Continue →
          </Link>
        </div>
      </section>
    </main>
  );
}

/** radio row helper */
function RadioRow({
  id,
  name,
  checked,
  onChange,
  title,
  subtitle,
}: {
  id: string;
  name: string;
  checked: boolean;
  onChange: () => void;
  title: string;
  subtitle: string;
}) {
  return (
    <label
      htmlFor={id}
      style={{
        border: '1px solid #e6e6e6',
        borderRadius: 12,
        padding: 14,
        display: 'grid',
        gridTemplateColumns: '28px 1fr',
        gap: 12,
        alignItems: 'start',
        cursor: 'pointer',
      }}
    >
      <input id={id} name={name} type="radio" checked={checked} onChange={onChange} />
      <div>
        <div style={{ fontWeight: 600 }}>{title}</div>
        <div style={{ color: '#666', fontSize: 13, marginTop: 2 }}>{subtitle}</div>
      </div>
    </label>
  );
}
{/* ---- Page footer nav ---- */}
<div
  style={{
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    marginTop: 16,
  }}
>
  {/* Back to page 1 */}
  <Link
    href="/"
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
    ← Back
  </Link>

  {/* Next -> Rooms (page 3) */}
  <Link
    href="/rooms"
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
    Save &amp; Continue →
  </Link>
</div>
