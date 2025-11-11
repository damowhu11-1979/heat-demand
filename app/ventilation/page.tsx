'use client';

import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

/* ---------- base-path helpers (GH Pages / static export safe) ---------- */
function repoBase(): string {
  // e.g. /heat-demand/ when hosted at user.github.io/heat-demand
  if (typeof window === 'undefined') return '/';
  const seg = window.location.pathname.split('/').filter(Boolean);
  return seg.length ? `/${seg[0]}/` : '/';
}
function toPath(p: string): string {
  const base = repoBase();
  return `${base}${p.replace(/^\/+/, '')}`;
}

/* ---------- small UI bits ---------- */
function Label({ children }: { children: React.ReactNode }) {
  return <label style={{ display: 'block', fontSize: 12, color: '#555', marginBottom: 6 }}>{children}</label>;
}
const card: React.CSSProperties = {
  background: '#fff',
  border: '1px solid #e6e6e6',
  borderRadius: 14,
  padding: 16,
};

/* ---------- stepper ---------- */
function Stepper({
  value, setValue, min = 0, max = 999, ariaLabel,
}: {
  value: number; setValue: (n: number) => void; min?: number; max?: number; ariaLabel?: string;
}) {
  const dec = () => setValue(Math.max(min, value - 1));
  const inc = () => setValue(Math.min(max, value + 1));
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '48px 1fr 48px', gap: 0, alignItems: 'stretch' }}>
      <button type="button" onClick={dec} aria-label={`decrease ${ariaLabel || 'value'}`} style={btnBox}>–</button>
      <div style={valBox} aria-live="polite">{value}</div>
      <button type="button" onClick={inc} aria-label={`increase ${ariaLabel || 'value'}`} style={btnBox}>+</button>
    </div>
  );
}
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

/* ---------- page ---------- */
export default function VentilationPage(): React.JSX.Element {
  const router = useRouter();

  // zones
  const [zones, setZones] = useState<number>(1);

  // zone 1 numbers
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

  const saveDraft = () => {
    const payload = { zones, zone1: { storeys, facades, sheltered, vtype } };
    console.log('VENTILATION SAVE', payload);
  };

  const goNext = () => {
    if (!canContinue) return;
    saveDraft();
    // project-relative navigation (works on GitHub Pages subpath)
    router.push(toPath('rooms'));
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

      {/* Zones */}
      <section style={card}>
        <h2 style={{ fontSize: 18, margin: 0, letterSpacing: 1.5 }}>VENTILATION ZONES</h2>
        <p style={{ color: '#666', marginTop: 8 }}>
          Enter the total number of distinct ventilation zones in the property.
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
            <Label>How many facades are sheltered from the wind? *</Label>
            <Stepper value={sheltered} setValue={setSheltered} min={0} max={facades} ariaLabel="sheltered facades" />
            <div style={{ color: '#999', fontSize: 12, marginTop: 4 }}>Must be ≤ number of external facades.</div>
          </div>
        </div>
      </section>

      {/* Vent type */}
      <section style={{ ...card, marginTop: 16 }}>
        <h2 style={{ fontSize: 18, margin: 0, letterSpacing: 1.5 }}>VENTILATION TYPE</h2>
        <p style={{ color: '#666', marginTop: 8 }}>Select the ventilation system this zone uses.</p>

        <div style={{ display: 'grid', gap: 10, marginTop: 10 }}>
          <RadioRow id="v-natural" name="vent-type" checked={vtype === 'natural'} onChange={() => setVtype('natural')} title="Natural Ventilation" subtitle="Natural ventilation; may include extract fans in wet rooms." />
          <RadioRow id="v-mev"     name="vent-type" checked={vtype === 'mev'}     onChange={() => setVtype('mev')}     title="Mechanical Extract Ventilation (MEV)" subtitle="Fan-assisted extract-only, unbalanced." />
          <RadioRow id="v-mv"      name="vent-type" checked={vtype === 'mv'}      onChange={() => setVtype('mv')}      title="Mechanical Ventilation (MV)" subtitle="Supply + extract, balanced." />
          <RadioRow id="v-mvhr"    name="vent-type" checked={vtype === 'mvhr'}    onChange={() => setVtype('mvhr')}    title="Mechanical Ventilation with Heat Recovery (MVHR)" subtitle="Whole-house HRV; efficiency required." />
          <RadioRow id="v-piv"     name="vent-type" checked={vtype === 'piv'}     onChange={() => setVtype('piv')}     title="Positive Input Ventilation (PIV)" subtitle="Supply-only positive pressure." />
        </div>

        {/* Footer nav – Back + Next */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 18 }}>
          {/* Back goes to page 1 (project root) */}
          <Link
            href={toPath('')}
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

          {/* Next → Rooms (page 3) */}
          <button
            type="button"
            onClick={goNext}
            disabled={!canContinue}
            style={{
              borderRadius: 10,
              padding: '12px 18px',
              border: '1px solid #111',
              background: canContinue ? '#111' : '#eee',
              color: canContinue ? '#fff' : '#888',
              cursor: canContinue ? 'pointer' : 'not-allowed',
            }}
          >
            Save &amp; Continue →
          </button>
        </div>
      </section>
    </main>
  );
}

/* ---------- radio row ---------- */
function RadioRow({
  id, name, checked, onChange, title, subtitle,
}: {
  id: string; name: string; checked: boolean; onChange: () => void; title: string; subtitle: string;
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
