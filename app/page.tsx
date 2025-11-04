// app/page.tsx  (replace file)
// 'use client' UI + postcode climate loader + open-meteo fallback

'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';

/* ---------------- helpers ---------------- */
type RowLite = { designTemp?: number; hdd?: number; keys?: string[] };

const normKey = (s: string) => String(s || '').toUpperCase().replace(/\s+/g, '');
const DAYS = [31,28,31,30,31,30,31,31,30,31,30,31];

/* Load postcode climate table produced into public/climate by the workflow */
async function loadPostcodeTable(): Promise<Map<string, RowLite>> {
  const url = 'climate/postcode_climate.json'; // RELATIVE path is vital for GitHub Pages
  const r = await fetch(url, { cache: 'no-store' });
  if (!r.ok) throw new Error('postcode_climate.json missing');
  const feed: RowLite[] = await r.json();
  const map = new Map<string, RowLite>();
  for (const row of feed || []) {
    const keys = Array.isArray(row?.keys) ? row.keys! : [];
    for (const k of keys) map.set(normKey(k), { designTemp: row.designTemp, hdd: row.hdd });
  }
  return map;
}

/* When table has only HDD or only design T, compute/fallback */
function hddFromMeans(means: number[]): number {
  let sum = 0;
  for (let m = 0; m < 12; m++) sum += Math.max(0, 15.5 - (means[m] ?? 99)) * DAYS[m];
  return Math.round(sum);
}
function designFromDJF(mins: number[], altitude: number): number | null {
  const pick = [mins[11], mins[0], mins[1]].filter((x) => Number.isFinite(x));
  if (!pick.length) return null;
  const base = Math.min(...pick);
  const safety = base - 2;
  return Math.round(safety - 0.0065 * (Number(altitude) || 0));
}

/* Simple API fallbacks (only if table didn’t have a value) */
async function fetchMonthlyNormals(lat: number, lon: number) {
  const url = `https://climate-api.open-meteo.com/v1/climate?latitude=${lat}&longitude=${lon}&start_year=1991&end_year=2020&models=ERA5&monthly=temperature_2m_mean,temperature_2m_min`;
  const r = await fetch(url, { cache: 'no-store' });
  if (!r.ok) throw new Error('climate http');
  const j = await r.json();
  return {
    mean: (j?.monthly?.temperature_2m_mean ?? []) as number[],
    min: (j?.monthly?.temperature_2m_min ?? []) as number[]
  };
}
async function geocode(pc: string) {
  const raw = pc.trim().toUpperCase().replace(/\s+/g, '');
  const url = `https://api.postcodes.io/postcodes/${encodeURIComponent(raw)}`;
  const r = await fetch(url, { cache: 'no-store' });
  if (!r.ok) throw new Error('geocode http');
  const j = await r.json();
  const res = j?.result;
  return { lat: res?.latitude as number, lon: res?.longitude as number };
}

/* ---------------- small UI parts ---------------- */
function Label({ children }: { children: React.ReactNode }) {
  return <label style={{ display: 'block', fontSize: 12, color: '#555', marginBottom: 6 }}>{children}</label>;
}
function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} style={{ ...inputStyle, ...(props.style || {}) }} />;
}
function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} style={{ ...inputStyle, ...(props.style || {}) }} />;
}

/* -------------------- Page -------------------- */
export default function Page(): React.JSX.Element {
  // Property info
  const [reference, setReference] = useState('');
  const [postcode, setPostcode] = useState('SW1A 1AA'); // default: London random
  const [country, setCountry] = useState('England');
  const [address, setAddress] = useState('');
  const [epcNo, setEpcNo] = useState('');
  const [uprn, setUprn] = useState('');

  // Climate data
  const [altitude, setAltitude] = useState<number | ''>(0);
  const [tex, setTex] = useState<number | ''>(-3);
  const [hdd, setHdd] = useState<number | ''>(2033);
  const meanAnnual = 10.2;

  // Other form bits
  const [dwelling, setDwelling] = useState('');
  const [attach, setAttach] = useState('');
  const [ageBand, setAgeBand] = useState('');
  const [occupants, setOccupants] = useState(2);
  const [mode, setMode] = useState('Net Internal');
  const [airtight, setAirtight] = useState('Standard Method');
  const [thermalTest, setThermalTest] = useState('No Test Performed');

  const [climStatus, setClimStatus] = useState('');
  const debounce = useRef<number | null>(null);
  const tableRef = useRef<Map<string, RowLite> | null>(null);

  // Load the postcode table once
  useEffect(() => {
    (async () => {
      try {
        tableRef.current = await loadPostcodeTable();
        console.log('postcode table loaded');
      } catch (e: any) {
        console.warn('postcode table not found / failed', e?.message || e);
      }
    })();
  }, []);

  // Debounced auto climate whenever postcode or altitude changes
  useEffect(() => {
    if (!postcode) return;
    if (debounce.current) window.clearTimeout(debounce.current);
    debounce.current = window.setTimeout(async () => {
      try {
        setClimStatus('Auto climate: using postcode table…');
        const key = normKey(postcode);
        const table = tableRef.current;

        let row: RowLite | undefined;
        if (table) {
          row = table.get(key)
            ?? table.get(key.replace(/\d[A-Z]{2}$/, ''))       // outcode
            ?? table.get(key.replace(/[0-9].*$/, ''));         // area
        }

        let outTex = row?.designTemp;
        let outHdd = row?.hdd;

        if (outTex == null || outHdd == null) {
          setClimStatus('Auto climate: API fallback…');
          try {
            const { lat, lon } = await geocode(postcode);
            const normals = await fetchMonthlyNormals(lat, lon);
            if (outHdd == null && normals.mean?.length >= 12) outHdd = hddFromMeans(normals.mean);
            if (outTex == null && normals.min?.length >= 12)  outTex = designFromDJF(normals.min, Number(altitude) || 0) ?? outTex;
          } catch { /* swallow, we still set whatever we have */ }
        }

        if (outHdd != null) setHdd(outHdd);
        if (outTex != null) setTex(outTex);
        setClimStatus(`Auto climate ✓ ${outTex != null ? `DesignT ${outTex}°C` : ''} ${outHdd != null ? `HDD ${outHdd}` : ''}`.trim());
      } catch (e: any) {
        setClimStatus(`Auto climate failed: ${e?.message || e}`);
      }
    }, 600);

    return () => { if (debounce.current) window.clearTimeout(debounce.current); };
  }, [postcode, altitude]);

  const savePayload = useMemo(() => ({
    reference, postcode, country, address, epcNo, uprn,
    altitude, tex, meanAnnual, hdd,
    dwelling, attach, ageBand, occupants,
    mode, airtight, thermalTest
  }), [reference, postcode, country, address, epcNo, uprn, altitude, tex, hdd, dwelling, attach, ageBand, occupants, mode, airtight, thermalTest]);

  const onSave = () => { console.log('SAVE', savePayload); alert('Saved locally (console).'); };

  return (
    <main style={{ maxWidth: 1040, margin: '0 auto', padding: 24, fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif' }}>
      <h1 style={{ fontSize: 28, margin: '6px 0 12px' }}>Heat Load Calculator (MCS-style)</h1>
      <div style={{ color: '#888', fontSize: 12, marginBottom: 14 }}>
        Property → Ventilation → Heated Rooms → Building Elements → Room Elements → Results
      </div>

      <section style={card}>
        <div style={{ marginBottom: 14, padding: 12, borderRadius: 10, background: '#f7f7f7' }}>
          <strong>Import from PropertyChecker.co.uk</strong> <span>(optional)</span>
        </div>

        <div style={grid3}>
          <div>
            <Label>Reference *</Label>
            <Input placeholder="e.g., Project ABC - v1" value={reference} onChange={(e) => setReference(e.target.value)} />
          </div>
          <div>
            <Label>Postcode *</Label>
            <Input placeholder="e.g., SW1A 1AA" value={postcode} onChange={(e) => setPostcode(e.target.value)} />
          </div>
          <div>
            <Label>Country</Label>
            <Select value={country} onChange={(e) => setCountry(e.target.value)}>
              <option>England</option><option>Wales</option><option>Scotland</option><option>Northern Ireland</option>
            </Select>
          </div>

          <div>
            <Label>Address (editable)</Label>
            <Input placeholder="e.g., 10 Example Road, Town" value={address} onChange={(e) => setAddress(e.target.value)} />
          </div>
          <div>
            <Label>EPC Number *</Label>
            <Input placeholder="e.g., 1234-5678-9012-3456-7890" value={epcNo} onChange={(e) => setEpcNo(e.target.value)} />
          </div>
          <div>
            <Label>UPRN (optional)</Label>
            <Input placeholder="Unique Property Reference Number" value={uprn} onChange={(e) => setUprn(e.target.value)} />
          </div>
        </div>

        <h3 style={{ marginTop: 18, marginBottom: 8 }}>Location Data</h3>
        <div style={grid4}>
          <div>
            <Label>Altitude (m)</Label>
            <Input type="number" value={altitude} onChange={(e) => setAltitude(e.target.value === '' ? '' : Number(e.target.value))} />
          </div>
          <div>
            <Label>Design External Air Temp (°C)</Label>
            <Input type="number" value={tex} onChange={(e) => setTex(e.target.value === '' ? '' : Number(e.target.value))} />
          </div>
          <div>
            <Label>Mean Annual External Air Temp (°C)</Label>
            <Input type="number" value={meanAnnual} readOnly />
          </div>
          <div>
            <Label>Heating Degree Days (HDD, base 15.5°C)</Label>
            <Input type="number" value={hdd} onChange={(e) => setHdd(e.target.value === '' ? '' : Number(e.target.value))} />
          </div>
        </div>

        <h3 style={{ marginTop: 18, marginBottom: 8 }}>Property Details</h3>
        <div style={grid4}>
          <div>
            <Label>Dwelling Type</Label>
            <Select value={dwelling} onChange={(e) => setDwelling(e.target.value)}>
              <option value="">Select</option>
              <option>Detached</option><option>Semi-detached</option><option>Terraced</option>
              <option>Flat</option><option>Bungalow</option>
            </Select>
          </div>
          <div>
            <Label>Attachment (what is this?)</Label>
            <Select value={attach} onChange={(e) => setAttach(e.target.value)}>
              <option value="">Select attachment</option>
              <option>Mid</option><option>End</option><option>Corner</option>
            </Select>
          </div>
          <div>
            <Label>Age Band</Label>
            <Select value={ageBand} onChange={(e) => setAgeBand(e.target.value)}>
              <option value="">Select age band</option>
              <option>pre-1900</option><option>1900-1929</option><option>1930-1949</option>
              <option>1950-1966</option><option>1967-1975</option><option>1976-1982</option>
              <option>1983-1990</option><option>1991-1995</option><option>1996-2002</option>
              <option>2003-2006</option><option>2007-2011</option><option>2012-present</option>
            </Select>
          </div>
          <div>
            <Label>Occupants</Label>
            <Input type="number" value={occupants} onChange={(e) => setOccupants(Number(e.target.value || 0))} />
          </div>
        </div>

        <h3 style={{ marginTop: 18, marginBottom: 8 }}>Dimension Specification</h3>
        <div style={grid3}>
          <div>
            <Label>Mode</Label>
            <Select value={mode} onChange={(e) => setMode(e.target.value)}>
              <option>Net Internal</option><option>Gross Internal</option>
            </Select>
          </div>
          <div>
            <Label>Airtightness Method</Label>
            <Select value={airtight} onChange={(e) => setAirtight(e.target.value)}>
              <option>Standard Method</option><option>Measured n50</option>
            </Select>
          </div>
          <div>
            <Label>Thermal Performance Test</Label>
            <Select value={thermalTest} onChange={(e) => setThermalTest(e.target.value)}>
              <option>No Test Performed</option><option>Thermal Imaging</option><option>Co-heating</option>
            </Select>
          </div>
        </div>

        <div style={{ marginTop: 12, fontSize: 12, color: '#666' }}>{climStatus}</div>

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 22 }}>
          <button onClick={onSave} style={secondaryBtn}>Save</button>
        </div>
      </section>
    </main>
  );
}

/* ---------------- styles ---------------- */
const card: React.CSSProperties = {
  background: '#fff',
  border: '1px solid #e6e6e6',
  borderRadius: 14,
  padding: 16,
};
const grid3: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 };
const grid4: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 };
const inputStyle: React.CSSProperties = {
  width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid #ddd', outline: 'none', boxSizing: 'border-box',
};
const secondaryBtn: React.CSSProperties = {
  background: '#fff', color: '#111', border: '1px solid #ddd', padding: '12px 18px', borderRadius: 12, cursor: 'pointer',
};
