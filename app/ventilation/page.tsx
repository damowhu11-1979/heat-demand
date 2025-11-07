'use client';

import React, { useState } from 'react';

/** Small shared UI bits (kept local to this page for now) */
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

type VentType = 'Natural' | 'MEV' | 'MV' | 'MVHR' | 'PIV';

export default function VentilationPage(): React.JSX.Element {
  // Ventilation zones
  const [zones, setZones] = useState<number>(1);

  // Zone 1 (we can extend to multiple zones later with an array)
  const [storeys, setStoreys] = useState<number>(2);
  const [facades, setFacades] = useState<number>(4);
  const [sheltered, setSheltered] = useState<number>(0);

  // Ventilation type
  const [ventType, setVentType] = useState<VentType | ''>('');

  const step = (setter: (v: number) => void, value: number, delta: number, min = 0) => {
    const n = Math.max(min, (value || 0) + delta);
    setter(n);
  };

  const canContinue =
    zones >= 1 &&
    storeys >= 1 &&
    facades >= 0 &&
    sheltered >= 0 &&
    sheltered <= facades &&
    !!ventType;

  const onBack = () => {
    // simple client-side back; you can wire to router if needed
    history.back();
  };

  const onSaveContinue = () => {
    if (!canContinue) {
      alert('Please complete all required ventilation fields before continuing.');
      return;
    }
    const payload = {
      zones,
      zone1: { storeys, facades, sheltered },
      ventType,
    };
    console.log('VENTILATION PAGE SAVE', payload);
    // navigate to next route if you have one, e.g.:
    // router.push('/heated-rooms');
    alert('Saved (see console). Proceeding to next step is up to router wiring.');
  };

  return (
    <main style={page}>
      <h1 style={{ letterSpacing: 2, marginBottom: 10 }}>VENTILATION</h1>

      {/* Ventilation Zones */}
      <section style={card}>
        <h3 style={sectionTitle}>Ventilation Zones</h3>
        <p style={muted}>
          Enter the total number of distinct ventilation zones in the property. Rooms that share the
          same ventilation system form a single zone.
        </p>

        <div style={{ marginTop: 10 }}>
          <Label>Number of Ventilation Zones *</Label>
          <div style={stepperRow}>
            <Button onClick={() => step(setZones, zones, -1, 1)} aria-label="decrease zones">
              –
            </Button>
            <div style={stepperValue}>{zones}</div>
            <Button onClick={() => step(setZones, zones, +1, 1)} aria-label="increase zones">
              +
            </Button>
          </div>
        </div>
      </section>

      {/* Zone 1 */}
      <section style={{ ...card, marginTop: 16 }}>
        <h3 style={sectionTitle}>Zone 1</h3>
        <p style={muted}>Enter information about this ventilation zone.</p>

        <div style={grid3}>
          <div>
            <Label>Number of Storeys *</Label>
            <div style={stepperRow}>
              <Button onClick={() => step(setStoreys, storeys, -1, 1)}>–</Button>
              <div style={stepperValue}>{storeys}</div>
              <Button onClick={() => step(setStoreys, storeys, +1, 1)}>+</Button>
            </div>
          </div>

          <div>
            <Label>Number of External Facades *</Label>
            <div style={stepperRow}>
              <Button onClick={() => step(setFacades, facades, -1, 0)}>–</Button>
              <div style={stepperValue}>{facades}</div>
              <Button onClick={() => step(setFacades, facades, +1, 0)}>+</Button>
            </div>
          </div>

          <div>
            <Label>How many of these facades are sheltered from the wind? *</Label>
            <div style={stepperRow}>
              <Button onClick={() => step(setSheltered, sheltered, -1, 0)}>–</Button>
              <div style={stepperValue}>{sheltered}</div>
              <Button
                onClick={() => step(setSheltered, sheltered, +1, 0)}
                disabled={sheltered >= facades}
                title={sheltered >= facades ? 'Cannot exceed total facades' : ''}
              >
                +
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Ventilation Type */}
      <section style={{ ...card, marginTop: 16 }}>
        <h3 style={sectionTitle}>Ventilation Type</h3>
        <p style={muted}>Select the type of ventilation system that this zone uses.</p>

        <div role="radiogroup" aria-label="Ventilation Type" style={{ display: 'grid', gap: 10 }}>
          <RadioCard
            name="ventType"
            checked={ventType === 'Natural'}
            onChange={() => setVentType('Natural')}
            title="Natural Ventilation"
            desc="Natural ventilation only that may include extract fans in wet rooms."
          />
          <RadioCard
            name="ventType"
            checked={ventType === 'MEV'}
            onChange={() => setVentType('MEV')}
            title="Mechanical Extract Ventilation (MEV)"
            desc="Fan-assisted mechanical ventilation (extract-only) that is unbalanced."
          />
          <RadioCard
            name="ventType"
            checked={ventType === 'MV'}
            onChange={() => setVentType('MV')}
            title="Mechanical Ventilation (MV)"
            desc="Fan-assisted mechanical ventilation (supply and extract) that is balanced."
          />
          <RadioCard
            name="ventType"
            checked={ventType === 'MVHR'}
            onChange={() => setVentType('MVHR')}
            title="Mechanical Ventilation with Heat Recovery (MVHR)"
            desc="Whole-house heat recovery ventilation. System efficiency required."
          />
          <RadioCard
            name="ventType"
            checked={ventType === 'PIV'}
            onChange={() => setVentType('PIV')}
            title="Positive Input Ventilation (PIV)"
            desc="Supply-only ventilation that creates a positive pressure within the house."
          />
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 22 }}>
          <Button onClick={onBack} style={{ background: '#fff', color: '#111' }}>
            ◀ Back
          </Button>
          <Button onClick={onSaveContinue} disabled={!canContinue}>
            Save & Continue ▶
          </Button>
        </div>
      </section>
    </main>
  );
}

/** Re-usable radio card */
function RadioCard(props: {
  name: string;
  title: string;
  desc: string;
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <label
      style={{
        display: 'grid',
        gridTemplateColumns: '24px 1fr',
        gap: 10,
        alignItems: 'start',
        padding: '12px 14px',
        border: '1px solid #e6e6e6',
        borderRadius: 12,
        cursor: 'pointer',
      }}
    >
      <input
        type="radio"
        name={props.name}
        checked={props.checked}
        onChange={props.onChange}
        style={{ width: 18, height: 18, marginTop: 3 }}
      />
      <div>
        <div style={{ fontWeight: 600 }}>{props.title}</div>
        <div style={{ color: '#666', fontSize: 13, marginTop: 2 }}>{props.desc}</div>
      </div>
    </label>
  );
}

/* --------------- styles ---------------- */
const page: React.CSSProperties = {
  maxWidth: 1040,
  margin: '0 auto',
  padding: 24,
  fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif',
};

const card: React.CSSProperties = {
  background: '#fff',
  border: '1px solid #e6e6e6',
  borderRadius: 14,
  padding: 16,
};

const sectionTitle: React.CSSProperties = {
  textTransform: 'uppercase',
  letterSpacing: 1,
  margin: 0,
  marginBottom: 8,
};

const muted: React.CSSProperties = { color: '#666', fontSize: 13, marginTop: 6, marginBottom: 6 };

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px 12px',
  borderRadius: 10,
  border: '1px solid #ddd',
  outline: 'none',
  boxSizing: 'border-box',
};

const grid3: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(3, 1fr)',
  gap: 12,
};

const stepperRow: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '48px 1fr 48px',
  gap: 8,
  alignItems: 'center',
};

const stepperValue: React.CSSProperties = {
  border: '1px solid #ddd',
  borderRadius: 10,
  textAlign: 'center',
  padding: '10px 12px',
  fontWeight: 600,
};
