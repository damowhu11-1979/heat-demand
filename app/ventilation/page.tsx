'use client';
import ClearDataButton from '@/components/ClearDataButton';

export default function Page() {
  return (
    <main style={{ maxWidth: 1040, margin: '0 auto', padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1 style={{ margin: 0 }}>Your Page Title</h1>
        <ClearDataButton />
      </div>

      {/* ...rest of your page... */}
    </main>
  );
}

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';

/* ----- tiny localStorage helpers ----- */
const VENT_KEY = 'mcs.ventilation';
const readVent = () => {
  if (typeof window === 'undefined') return null;
  try { const r = localStorage.getItem(VENT_KEY); return r ? JSON.parse(r) : null; } catch { return null; }
};
const writeVent = (obj: any) => {
  if (typeof window === 'undefined') return;
  try { localStorage.setItem(VENT_KEY, JSON.stringify(obj)); } catch {}
};

/* ----- small UI bits ----- */
function Label({ children }: { children: React.ReactNode }) {
  return <label style={{ display: 'block', fontSize: 12, color: '#555', marginBottom: 6 }}>{children}</label>;
}
const card: React.CSSProperties = { background: '#fff', border: '1px solid #e6e6e6', borderRadius: 14, padding: 16 };
const btnBox: React.CSSProperties = { border: '1px solid #ddd', borderRadius: 10, background: '#fff', cursor: 'pointer' };
const valBox: React.CSSProperties = { border: '1px solid #ddd', borderRadius: 10, display: 'grid', placeItems: 'center', fontSize: 18, fontWeight: 600 };
const primaryBtn: React.CSSProperties = { border: '1px solid #111', borderRadius: 10, padding: '12px 18px', background: '#111', color: '#fff', textDecoration: 'none' };
const secondaryBtn: React.CSSProperties = { border: '1px solid #ddd', borderRadius: 10, padding: '10px 16px', background: '#fff', color: '#111', textDecoration: 'none' };

/* ----- stepper ----- */
function Stepper({
  value, setValue, min = 0, max = 999, ariaLabel,
}: { value: number; setValue: (n: number) => void; min?: number; max?: number; ariaLabel?: string }) {
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

/* ----- page ----- */
export default function VentilationPage(): React.JSX.Element {
  // state
  const [zones, setZones] = useState<number>(1);
  const [storeys, setStoreys] = useState<number>(2);
  const [facades, setFacades] = useState<number>(4);
  const [sheltered, setSheltered] = useState<number>(0);
  type VentType = 'natural' | 'mev' | 'mv' | 'mvhr' | 'piv' | '';
  const [vtype, setVtype] = useState<VentType>('');

  // load on mount
  useEffect(() => {
    const saved = readVent();
    if (!saved) return;
    if (typeof saved.zones === 'number') setZones(saved.zones);
    if (typeof saved.storeys === 'number') setStoreys(saved.storeys);
    if (typeof saved.facades === 'number') setFacades(saved.facades);
    if (typeof saved.sheltered === 'number') setSheltered(saved.sheltered);
    if (typeof saved.vtype === 'string') setVtype(saved.vtype);
  }, []);

  // auto-save (debounced)
  useEffect(() => {
    const t = setTimeout(() => {
      writeVent({ zones, storeys, facades, sheltered, vtype });
    }, 400);
    return () => clearTimeout(t);
  }, [zones, storeys, facades, sheltered, vtype]);

  const canContinue = useMemo(() => {
    const validCounts = zones >= 1 && storeys >= 1 && facades >= 1 && sheltered >= 0 && sheltered <= facades;
    return validCounts && !!vtype;
  }, [zones, storeys, facades, sheltered, vtype]);

  return (
    <main style={{ maxWidth: 1040, margin: '0 auto', padding: 24, fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif' }}>
      <h1 style={{ fontSize: 28, margin: '6px 0 12px' }}>Ventilation</h1>

      {/* Zones */}
      <section style={card}>
        <h2 style={{ fontSize: 18, margin: 0, letterSpacing: 1.5 }}>VENTILATION ZONES</h2>
        <p style={{ color: '#666', marginTop: 8 }}>Enter the total number of ventilation zones.</p>
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
          <RadioRow id="v-natural" name="vent-type" checked={vtype === 'natural'} onChange={() => setVtype('natural')}
            title="Natural Ventilation" subtitle="Natural ventilation; may include extract fans in wet rooms." />
          <RadioRow id="v-mev" name="vent-type" checked={vtype === 'mev'} onChange={() => setVtype('mev')}
            title="Mechanical Extract Ventilation (MEV)" subtitle="Fan-assisted extract-only, unbalanced." />
          <RadioRow id="v-mv" name="vent-type" checked={vtype === 'mv'} onChange={() => setVtype('mv')}
            title="Mechanical Ventilation (MV)" subtitle="Supply + extract, balanced." />
          <RadioRow id="v-mvhr" name="vent-type" checked={vtype === 'mvhr'} onChange={() => setVtype('mvhr')}
            title="Mechanical Ventilation with Heat Recovery (MVHR)" subtitle="Whole-house HRV; efficiency required." />
          <RadioRow id="v-piv" name="vent-type" checked={vtype === 'piv'} onChange={() => setVtype('piv')}
            title="Positive Input Ventilation (PIV)" subtitle="Supply-only positive pressure." />
        </div>

        {/* Footer nav */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 18 }}>
          <Link href="/" style={secondaryBtn}>← Back</Link>
          <Link
            href={canContinue ? '/rooms' : '#'}
            onClick={(e) => { if (!canContinue) e.preventDefault(); }}
            style={{
              ...primaryBtn,
              background: canContinue ? '#111' : '#eee',
              color: canContinue ? '#fff' : '#888',
              pointerEvents: canContinue ? 'auto' : 'none',
            }}
          >
            Next: Rooms →
          </Link>
        </div>
      </section>
    </main>
  );
}

/* ----- radio row ----- */
function RadioRow({
  id, name, checked, onChange, title, subtitle,
}: { id: string; name: string; checked: boolean; onChange: () => void; title: string; subtitle: string }) {
  return (
    <label htmlFor={id} style={{ border: '1px solid #e6e6e6', borderRadius: 12, padding: 14, display: 'grid', gridTemplateColumns: '28px 1fr', gap: 12, alignItems: 'start', cursor: 'pointer' }}>
      <input id={id} name={name} type="radio" checked={checked} onChange={onChange} />
      <div>
        <div style={{ fontWeight: 600 }}>{title}</div>
        <div style={{ color: '#666', fontSize: 13, marginTop: 2 }}>{subtitle}</div>
      </div>
    </label>
  );
}
