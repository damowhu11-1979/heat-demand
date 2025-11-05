// app/page.tsx
'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';

/** ------------------------ Helpers & types ------------------------ */
type ClimateRow = { designTemp?: number; hdd?: number };
type LatLon = { lat: number; lon: number; src: 'postcodes.io' | 'nominatim' | 'latlon' };

const localCache: {
  map: Map<string, ClimateRow> | null;
} = { map: null };

function toPC(s: string) {
  const raw = String(s || '').toUpperCase().replace(/\s+/g, '');
  return raw || null;
}
function pcKeysForLookup(input: string): string[] {
  // FULL (no spaces), OUTCODE, SECTOR, AREA
  const raw = String(input || '').toUpperCase().trim();
  if (!raw) return [];
  const nospace = raw.replace(/\s+/g, '');

  // Try to split into OUTCODE + INCODE if present
  // UK brk: OUTCODE = letters+digits (1-4 chars), INCODE 3 chars
  let outcode = '';
  let sector = '';
  let area = '';

  // Simple heuristic to get OUTCODE/AREA/SECTOR
  // E.g. "SW1A 1AA" -> outcode "SW1A", area "SW", sector "SW1A 1"
  const m = nospace.match(/^([A-Z]{1,2}\d[A-Z\d]?)(\d[A-Z]{2})?$/);
  if (m) {
    outcode = m[1] ?? '';
    area = outcode.replace(/\d.*/, '');
    if (m[2]) {
      const secDigit = m[2].charAt(0); // first digit of incode
      sector = `${outcode} ${secDigit}`;
    }
  } else {
    // Fallback: try the first block before space as outcode
    const parts = raw.split(/\s+/);
    outcode = parts[0] || '';
    area = outcode.replace(/\d.*/, '');
    if (parts[1]) {
      sector = `${outcode} ${parts[1][0]}`;
    }
  }

  const keys: string[] = [];
  if (nospace) keys.push(nospace);
  if (outcode) keys.push(outcode);
  if (sector) keys.push(sector);
  if (area) keys.push(area);
  return Array.from(new Set(keys)).filter(Boolean);
}

async function loadClimateMap(): Promise<Map<string, ClimateRow>> {
  if (localCache.map) return localCache.map;

  // Try multiple paths so it works locally and on GitHub Pages
  const candidates = (() => {
    const urls = new Set<string>();
    const pathname =
      typeof window !== 'undefined' ? window.location.pathname : '/' || '/';
    const seg = pathname.split('/').filter(Boolean);
    const repoRoot = seg.length ? `/${seg[0]}/` : '/';

    urls.add(`${repoRoot}climate/postcode_climate.json`);
    urls.add(`climate/postcode_climate.json`);
    urls.add(`${repoRoot}postcode_climate.json`);
    urls.add(`postcode_climate.json`);
    return Array.from(urls);
  })();

  let rows: any = null;
  let hit: string | null = null;
  for (const u of candidates) {
    try {
      const r = await fetch(u, { cache: 'no-store' });
      if (r.ok) {
        rows = await r.json();
        hit = u;
        break;
      }
    } catch {
      /* ignore */
    }
  }
  if (!Array.isArray(rows)) return (localCache.map = new Map());

  const map = new Map<string, ClimateRow>();
  for (const row of rows) {
    const keys: string[] = Array.isArray(row?.keys) ? row.keys : [];
    for (const k of keys) {
      map.set(String(k).toUpperCase(), {
        designTemp: isFinite(row?.designTemp) ? Number(row.designTemp) : undefined,
        hdd: isFinite(row?.hdd) ? Number(row.hdd) : undefined,
      });
    }
  }
  // eslint-disable-next-line no-console
  console.info('Loaded postcode climate table from', hit);
  localCache.map = map;
  return map;
}

const asLatLon = (s: string) => {
  const m = String(s || '')
    .trim()
    .match(/^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/);
  if (!m) return null;
  const lat = +m[1],
    lon = +m[2];
  if (!isFinite(lat) || !isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180)
    return null;
  return { lat, lon };
};

async function geocodePostcode(pc: string): Promise<LatLon> {
  const url = `https://api.postcodes.io/postcodes/${encodeURIComponent(pc)}`;
  const r = await fetch(url, { cache: 'no-store' });
  if (!r.ok) throw new Error(`postcodes.io ${r.status}`);
  const j = await r.json();
  if (j.status !== 200 || !j.result) throw new Error('postcode not found');
  return { lat: j.result.latitude, lon: j.result.longitude, src: 'postcodes.io' };
}
async function geocodeAddress(addr: string): Promise<LatLon> {
  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(
    addr,
  )}`;
  const r = await fetch(url, {
    headers: { 'Accept-Language': 'en-GB' },
    cache: 'no-store',
  });
  if (!r.ok) throw new Error(`nominatim ${r.status}`);
  const a = await r.json();
  if (!a.length) throw new Error('address not found');
  return { lat: +a[0].lat, lon: +a[0].lon, src: 'nominatim' };
}
async function geocodeAny(postcode: string, address: string, latlonText?: string) {
  const ll = latlonText ? asLatLon(latlonText) : null;
  if (ll) return { ...ll, src: 'latlon' as const };
  const pc = toPC(postcode || '');
  if (pc) {
    try {
      return await geocodePostcode(pc);
    } catch {
      return await geocodeAddress(pc);
    }
  }
  if (!address || address.trim().length < 4) throw new Error('enter postcode or address');
  return await geocodeAddress(address);
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

/** ------------------------ UI atoms ------------------------ */
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

/** ------------------------ Page ------------------------ */
export default function Page(): React.JSX.Element {
  // Property info
  const [reference, setReference] = useState('');
  const [postcode, setPostcode] = useState('');
  const [country, setCountry] = useState('England');
  const [address, setAddress] = useState('');
  const [epcNo, setEpcNo] = useState('');
  const [uprn, setUprn] = useState('');

  // Location / climate
  const [altitude, setAltitude] = useState<number | ''>(0);
  const [tex, setTex] = useState<number | ''>(-3);
  const [hdd, setHdd] = useState<number | ''>(2033);
  const meanAnnual = 10.2;

  // UI statuses
  const [climStatus, setClimStatus] = useState('');
  const [altStatus, setAltStatus] = useState('');
  const [latlonOverride, setLatlonOverride] = useState('');

  // Property details (kept but not used here)
  const [dwelling, setDwelling] = useState('');
  const [attach, setAttach] = useState('');
  const [ageBand, setAgeBand] = useState('');
  const [occupants, setOccupants] = useState(2);
  const [mode, setMode] = useState('Net Internal');
  const [airtight, setAirtight] = useState('Standard Method');
  const [thermalTest, setThermalTest] = useState('No Test Performed');

  // Debounce
  const debounce = useRef<number | null>(null);

  /** Auto-fill design temp & HDD from postcode JSON */
  useEffect(() => {
    if (!postcode) return;

    if (debounce.current) window.clearTimeout(debounce.current);
    debounce.current = window.setTimeout(async () => {
      try {
        setClimStatus('Auto climate: loading table…');
        const map = await loadClimateMap();
        const keys = pcKeysForLookup(postcode);

        let match: ClimateRow | undefined;
        for (const k of keys) {
          const row = map.get(k.toUpperCase());
          if (row) {
            match = row;
            break;
          }
        }
        if (match?.designTemp !== undefined) setTex(match.designTemp);
        if (match?.hdd !== undefined) setHdd(match.hdd);
        setClimStatus(
          match
            ? `Auto climate ✓ matched ${keys.find(k => map.has(k.toUpperCase()))}`
            : 'Auto climate: no local match (using current values)',
        );
      } catch (e: any) {
        setClimStatus(`Auto climate failed: ${e?.message || e}`);
      }
    }, 400);

    return () => {
      if (debounce.current) window.clearTimeout(debounce.current);
    };
  }, [postcode]);

  /** Altitude finder */
  const onFindAltitude = async () => {
    try {
      setAltStatus('Looking up…');
      const geo = await geocodeAny(postcode, address, latlonOverride);
      const elev = await elevation(geo.lat, geo.lon);
      setAltitude(Math.round(elev.metres));
      setAltStatus(`Found ${Math.round(elev.metres)} m • geo:${geo.src} • elev:${elev.provider}`);
    } catch (e: any) {
      setAltStatus(`Failed: ${e?.message || String(e)}`);
    }
  };

  const savePayload = useMemo(
    () => ({
      reference,
      postcode,
      country,
      address,
      epcNo,
      uprn,
      altitude,
      tex,
      meanAnnual,
      hdd,
      dwelling,
      attach,
      ageBand,
      occupants,
      mode,
      airtight,
      thermalTest,
    }),
    [
      reference,
      postcode,
      country,
      address,
      epcNo,
      uprn,
      altitude,
      tex,
      hdd,
      dwelling,
      attach,
      ageBand,
      occupants,
      mode,
      airtight,
      thermalTest,
    ],
  );

  const onSave = () => {
    // eslint-disable-next-line no-console
    console.log('SAVE', savePayload);
    alert('Saved locally (console). Wire to your backend when ready.');
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
      <h1 style={{ fontSize: 28, margin: '6px 0 12px' }}>Heat Load Calculator (MCS-style)</h1>
      <div style={{ color: '#888', fontSize: 12, marginBottom: 14 }}>
        Property → Ventilation → Heated Rooms → Building Elements → Room Elements → Results
      </div>

      <section style={card}>
        {/* Import banner */}
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
              <option>England</option>
              <option>Wales</option>
              <option>Scotland</option>
              <option>Northern Ireland</option>
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
                  Uses postcodes.io / Nominatim and Open-Elevation (fallback OpenTopoData). You can also enter{' '}
                  <em>lat,long</em> override:
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 8 }}>
                  <Button onClick={onFindAltitude}>Get altitude</Button>
                  <Input
                    placeholder="(optional) 51.5,-0.12"
                    value={latlonOverride}
                    onChange={(e) => setLatlonOverride(e.target.value)}
                    style={{ maxWidth: 180 }}
                  />
                  <span style={{ color: '#666', fontSize: 12 }}>{altStatus}</span>
                </div>
              </details>
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
              <option>Detached</option>
              <option>Semi-detached</option>
              <option>Terraced</option>
              <option>Flat</option>
              <option>Bungalow</option>
            </Select>
          </div>

          <div>
            <Label>Attachment (what is this?)</Label>
            <Select value={attach} onChange={(e) => setAttach(e.target.value)}>
              <option value="">Select attachment</option>
              <option>Mid</option>
              <option>End</option>
              <option>Corner</option>
            </Select>
          </div>

          <div>
            <Label>Age Band</Label>
            <Select value={ageBand} onChange={(e) => setAgeBand(e.target.value)}>
              <option value="">Select age band</option>
              <option>pre-1900</option>
              <option>1900-1929</option>
              <option>1930-1949</option>
              <option>1950-1966</option>
              <option>1967-1975</option>
              <option>1976-1982</option>
              <option>1983-1990</option>
              <option>1991-1995</option>
              <option>1996-2002</option>
              <option>2003-2006</option>
              <option>2007-2011</option>
              <option>2012-present</option>
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
              <option>Net Internal</option>
              <option>Gross Internal</option>
            </Select>
          </div>

          <div>
            <Label>Airtightness Method</Label>
            <Select value={airtight} onChange={(e) => setAirtight(e.target.value)}>
              <option>Standard Method</option>
              <option>Measured n50</option>
            </Select>
          </div>

          <div>
            <Label>Thermal Performance Test</Label>
            <Select value={thermalTest} onChange={(e) => setThermalTest(e.target.value)}>
              <option>No Test Performed</option>
              <option>Thermal Imaging</option>
              <option>Co-heating</option>
            </Select>
          </div>
        </div>

        {/* Status */}
        <div style={{ marginTop: 12, fontSize: 12, color: '#666' }}>{climStatus || 'Auto climate ✓'}</div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 22 }}>
          <button onClick={onSave} style={primaryBtn}>
            Save
          </button>
        </div>
      </section>
    </main>
  );
}

/** ------------------------ styles ------------------------ */
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
