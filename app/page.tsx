// app/page.tsx
'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';

/* -------------------------------- helpers ------------------------------- */

type RowLite = { designTemp?: number; hdd?: number };
type ClimateMap = Map<string, RowLite>;
type LatLon = { lat: number; lon: number };

const meanAnnualDefault = 10.2;

/** Normalise any postcode-ish string to uppercase + no spaces */
function normPC(s: string): string {
  return String(s || '').toUpperCase().replace(/\s+/g, '');
}

/** Build the set of keys we’ll try for a given raw postcode */
function keysFor(raw: string): string[] {
  const clean = normPC(raw);
  if (!clean) return [];
  // FULL
  const keys = new Set<string>([clean]);

  // OUTCODE (letters+first digit sequence)
  const m = clean.match(/^([A-Z]{1,2}\d[A-Z\d]?)(\d[A-Z]{2})?$/); // SW1A1AA or SW1A
  const out = m?.[1] ?? '';
  if (out) keys.add(out);

  // SECTOR (outcode + first number after space in normal PC)
  const sector = (() => {
    // Try to infer sector from typical forms
    // If we have a 5+ length with digits, take outcode + first digit of inward
    const inward = clean.slice(out.length);
    const firstDigit = inward.match(/\d/);
    return firstDigit ? `${out}${firstDigit[0]}` : '';
  })();
  if (sector) keys.add(sector);

  // AREA (letters until first digit)
  const area = out.replace(/\d.*/, '');
  if (area) keys.add(area);

  return Array.from(keys);
}

/** Try several paths (works on GitHub Pages and locally) */
async function loadClimateMap(): Promise<ClimateMap> {
  const candidates = (() => {
    const urls = new Set<string>();
    const pathname =
      typeof window !== 'undefined' ? window.location.pathname : '/' || '/';
    const curDir = pathname.replace(/[^/]*$/, '');
    const seg = pathname.split('/').filter(Boolean);
    const repoRoot = seg.length ? `/${seg[0]}` : '/';
    urls.add(`${curDir}climate/postcode_climate.json`);
    urls.add(`${repoRoot}climate/postcode_climate.json`);
    urls.add(`/climate/postcode_climate.json`);
    urls.add(`/postcode_climate.json`);
    return Array.from(urls);
  })();

  let feed: any[] | null = null;
  for (const u of candidates) {
    try {
      const r = await fetch(u, { cache: 'no-store' });
      if (r.ok) {
        feed = await r.json();
        break;
      }
    } catch {
      /* ignore */
    }
  }
  if (!Array.isArray(feed)) return new Map();

  const map: ClimateMap = new Map();
  for (const row of feed) {
    const { keys = [], designTemp, hdd } = row || {};
    for (const k of keys) {
      const key = normPC(k);
      if (key) map.set(key, { designTemp, hdd });
    }
  }
  return map;
}

/** Look up row from climate map by trying full→outcode→sector→area */
function lookupDesign(map: ClimateMap, rawPostcode: string): RowLite | null {
  if (!map || !rawPostcode) return null;
  const tries = keysFor(rawPostcode);
  for (const k of tries) {
    const hit = map.get(k);
    if (hit) return hit;
  }
  return null;
}

function parseLatLon(s: string): LatLon | null {
  const m = String(s || '').trim().match(/^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/);
  if (!m) return null;
  const lat = +m[1], lon = +m[2];
  if (!isFinite(lat) || !isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  return { lat, lon };
}

async function geoByPostcodeOrAddress(postcode: string, address: string, latlonOverride?: string): Promise<LatLon> {
  const direct = latlonOverride ? parseLatLon(latlonOverride) : null;
  if (direct) return direct;

  const pc = normPC(postcode);
  if (pc) {
    try {
      const r = await fetch(`https://api.postcodes.io/postcodes/${encodeURIComponent(pc)}`, { cache: 'no-store' });
      if (r.ok) {
        const j = await r.json();
        if (j?.status === 200?.toString() || j?.status === 200) {
          return { lat: j.result.latitude, lon: j.result.longitude };
        }
      }
    } catch {
      /* ignore and fall through */
    }
  }
  const q = (postcode || address || '').trim();
  if (q.length < 3) throw new Error('Enter postcode or address');
  const u = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(q)}`;
  const r2 = await fetch(u, { headers: { 'Accept-Language': 'en-GB' }, cache: 'no-store' });
  if (!r2.ok) throw new Error('Address lookup failed');
  const a = await r2.json();
  if (!a?.length) throw new Error('Address not found');
  return { lat: +a[0].lat, lon: +a[0].lon };
}

async function elevation(lat: number, lon: number): Promise<{ metres: number; provider: string }> {
  try {
    const u = `https://api.open-elevation.com/api/v1/lookup?locations=${lat},${lon}`;
    const r = await fetch(u, { cache: 'no-store' });
    if (!r.ok) throw new Error('open-elevation http');
    const j = await r.json();
    const v = j?.results?.[0]?.elevation;
    if (!isFinite(v)) throw new Error('open-elevation no result');
    return { metres: +v, provider: 'open-elevation' };
  } catch {
    const u2 = `https://api.opentopodata.org/v1/eudem25m?locations=${lat},${lon}`;
    const r2 = await fetch(u2, { cache: 'no-store' });
    if (!r2.ok) throw new Error('opentopodata http');
    const j2 = await r2.json();
    const v2 = j2?.results?.[0]?.elevation;
    if (!isFinite(v2)) throw new Error('opentopodata no result');
    return { metres: +v2, provider: 'opentopodata:eudem25m' };
  }
}

/* ---------------------------------- UI ---------------------------------- */

export default function Page(): React.JSX.Element {
  // Property info
  const [reference, setReference] = useState('');
  const [postcode, setPostcode] = useState('');
  const [country, setCountry] = useState('England');
  const [address, setAddress] = useState('');
  const [epcNo, setEpcNo] = useState('');
  const [uprn, setUprn] = useState('');

  // Location/climate
  const [altitude, setAltitude] = useState<number | ''>(0);
  const [tex, setTex] = useState<number | ''>(-3);
  const [hdd, setHdd] = useState<number | ''>(2100);
  const meanAnnual = meanAnnualDefault;

  // Details
  const [dwelling, setDwelling] = useState('');
  const [attach, setAttach] = useState('');
  const [ageBand, setAgeBand] = useState('');
  const [occupants, setOccupants] = useState(2);
  const [mode, setMode] = useState('Net Internal');
  const [airtight, setAirtight] = useState('Standard Method');
  const [thermalTest, setThermalTest] = useState('No Test Performed');

  // Local data
  const [climStatus, setClimStatus] = useState('');
  const [altStatus, setAltStatus] = useState('');
  const [latlonOverride, setLatlonOverride] = useState('');
  const climateRef = useRef<ClimateMap | null>(null);

  // Load postcode climate map once
  useEffect(() => {
    (async () => {
      setClimStatus('Loading climate table…');
      const map = await loadClimateMap();
      climateRef.current = map;
      setClimStatus(map.size ? `Climate table loaded (${map.size} keys).` : 'No climate table found (using manual/API).');
    })();
  }, []);

  // Update design temp/HDD when postcode changes (if we have a table)
  useEffect(() => {
    const map = climateRef.current;
    if (!map) return;
    if (!postcode) return;

    const hit = lookupDesign(map, postcode);
    if (hit) {
      if (typeof hit.designTemp === 'number') setTex(hit.designTemp);
      if (typeof hit.hdd === 'number') setHdd(hit.hdd);
      setClimStatus(`Auto climate ✓ matched ${keysFor(postcode).join(' → ')}`);
    } else {
      setClimStatus('Auto climate: no match in table (you can override).');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [postcode]);

  // Altitude button
  const onFindAltitude = async () => {
    try {
      setAltStatus('Looking up…');
      const geo = await geoByPostcodeOrAddress(postcode, address, latlonOverride);
      const elev = await elevation(geo.lat, geo.lon);
      setAltitude(Math.round(elev.metres));
      setAltStatus(`Found ${Math.round(elev.metres)} m • ${elev.provider}`);
    } catch (e: any) {
      setAltStatus(`Failed: ${e?.message || String(e)}`);
    }
  };

  // Save (placeholder)
  const onSave = () => {
    const payload = {
      reference, postcode, country, address, epcNo, uprn,
      altitude, tex, meanAnnual, hdd,
      dwelling, attach, ageBand, occupants, mode, airtight, thermalTest,
    };
    console.log('SAVE', payload);
    alert('Saved locally (console).');
  };

  return (
    <main style={{ maxWidth: 1040, margin: '0 auto', padding: 24, fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif' }}>
      <h1 style={{ fontSize: 28, margin: '6px 0 12px' }}>Heat Load Calculator (MCS-style)</h1>
      <div style={{ color: '#888', fontSize: 12, marginBottom: 14 }}>
        Property → Ventilation → Heated Rooms → Building Elements → Room Elements → Results
      </div>

      <section style={card}>
        <div style={{ ...row, marginBottom: 14, padding: 12, borderRadius: 10, background: '#f7f7f7' }}>
          <strong>Import from PropertyChecker.co.uk</strong> <span>(optional)</span>
        </div>

        {/* Top grid */}
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

        {/* Location Data */}
        <h3 style={{ marginTop: 18, marginBottom: 8 }}>Location Data</h3>
        <div style={grid4}>
          <div>
            <Label>Altitude (m)</Label>
            <Input type="number" value={altitude} onChange={(e) => setAltitude(e.target.value === '' ? '' : Number(e.target.value))} />
            <div style={{ marginTop: 8 }}>
              <details>
                <summary style={{ cursor: 'pointer', color: '#333' }}>Get altitude</summary>
                <div style={{ marginTop: 6, color: '#666', fontSize: 12 }}>
                  Uses postcodes.io / Nominatim and Open-Elevation (fallback OpenTopoData). You can also enter
                  <em> lat,long </em> override:
                </div>
              </details>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 8 }}>
                <Button onClick={onFindAltitude}>Get altitude</Button>
                <Input placeholder="(optional) 51.5,-0.12" value={latlonOverride} onChange={(e) => setLatlonOverride(e.target.value)} style={{ maxWidth: 180 }} />
                <span style={{ color: '#666', fontSize: 12 }}>{altStatus}</span>
              </div>
            </div>
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

        {/* Property details */}
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

        {/* Dimension spec */}
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

        {/* Auto climate status */}
        <div style={{ marginTop: 12, fontSize: 12, color: '#666' }}>
          Auto climate ✓ {climStatus}
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 22 }}>
          <button onClick={onSave} style={primaryBtn}>Save</button>
        </div>
      </section>
    </main>
  );
}

/* ------------------------------ small UI bits ------------------------------ */

function Label({ children }: { children: React.ReactNode }) {
  return <label style={{ display: 'block', fontSize: 12, color: '#555', marginBottom: 6 }}>{children}</label>;
}
function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} style={{ ...inputStyle, ...(props.style || {}) }} />;
}
function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} style={{ ...inputStyle, ...(props.style || {}) }} />;
}
function Button(props: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      style={{
        borderRadius: 10,
        padding: '10px 14px',
        border: '1px solid #ddd',
        background: props.disabled ? '#eee' : '#111',
        color: props.disabled ? '#888' : '#fff',
        cursor: props.disabled ? 'not-allowed' : 'pointer',
        ...props.style,
      }}
    />
  );
}

/* ------------------------------ styles ------------------------------ */

const card: React.CSSProperties = {
  background: '#fff',
  border: '1px solid #e6e6e6',
  borderRadius: 14,
  padding: 16,
};
const grid3: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(3, 1fr)',
  gap: 12,
};
const grid4: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(4, 1fr)',
  gap: 12,
};
const row: React.CSSProperties = { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' };
const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px 12px',
  borderRadius: 10,
  border: '1px solid #ddd',
  outline: 'none',
  boxSizing: 'border-box',
};
const primaryBtn: React.CSSProperties = {
  background: '#111',
  color: '#fff',
  border: '1px solid #111',
  padding: '12px 18px',
  borderRadius: 12,
  cursor: 'pointer',
};
