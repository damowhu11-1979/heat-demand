// app/page.tsx
'use client';

import React, { useEffect, useRef, useState } from 'react';

/* ============================== Config ============================== */

const PROPERTY_CHECKER_URL = 'https://propertychecker.co.uk/'; // link only
const MEAN_ANNUAL_DEFAULT = 10.2;

/* ========================= Types & Helpers ========================== */

type ClimateRow = { designTemp?: number; hdd?: number };
type ClimateMap = Map<string, ClimateRow>;
type LatLon = { lat: number; lon: number };
type Dwelling = 'Detached' | 'Semi-detached' | 'Terraced' | 'Flat' | 'Bungalow';
type TerraceType = 'Mid-terrace' | 'End-terrace' | 'Corner-terrace' | 'Not terraced';

/* ---------- postcode normalisers ---------- */
function normPC(s: string): string {
  return String(s || '').toUpperCase().replace(/\s+/g, '');
}

/** Keys we’ll try in the climate map for a raw postcode string */
function keysFor(raw: string): string[] {
  const clean = normPC(raw);
  if (!clean) return [];
  const keys = new Set<string>([clean]);

  // OUTCODE (letters + 1-2 digits + optional letter)
  const m = clean.match(/^([A-Z]{1,2}\d[A-Z\d]?)(\d[A-Z]{2})?$/); // e.g., SW1A1AA or SW1A
  const out = m?.[1] ?? '';
  if (out) keys.add(out);

  // SECTOR: outcode + first digit of inward part
  const inward = clean.slice(out.length);
  const firstDigit = inward.match(/\d/);
  if (firstDigit) keys.add(`${out}${firstDigit[0]}`);

  // AREA: letters until first digit
  const area = out.replace(/\d.*/, '');
  if (area) keys.add(area);

  return Array.from(keys);
}

/* ---------- climate table loader (SSR-safe) ---------- */
async function loadClimateMap(): Promise<ClimateMap> {
  const isBrowser = typeof window !== 'undefined';
  const pathname = isBrowser && window.location ? window.location.pathname : '/';

  const curDir = pathname.replace(/[^/]*$/, ''); // current directory
  const seg = pathname.split('/').filter(Boolean);
  const repoRoot = seg.length ? `/${seg[0]}/` : '/'; // GitHub Pages repo root

  const candidates = Array.from(
    new Set([
      `${curDir}climate/postcode_climate.json`,
      `${repoRoot}climate/postcode_climate.json`,
      `/climate/postcode_climate.json`,
      `/postcode_climate.json`,
    ]),
  );

  let feed: any[] | null = null;
  for (const u of candidates) {
    try {
      const r = await fetch(u, { cache: 'no-store' });
      if (r.ok) {
        feed = await r.json();
        break;
      }
    } catch {
      /* try next */
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

/** Lookup best match in climate map */
function lookupDesign(map: ClimateMap, postcode: string): ClimateRow | undefined {
  for (const k of keysFor(postcode)) {
    const hit = map.get(normPC(k));
    if (hit) return hit;
  }
  return undefined;
}

/* ---------- geocoding + altitude ---------- */
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
        if (j?.result?.latitude && j?.result?.longitude) {
          return { lat: j.result.latitude, lon: j.result.longitude };
        }
      }
    } catch { /* continue to nominatim */ }
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

/* ===================== PropertyChecker importer ===================== */

function extractPostcode(text: string): string | undefined {
  const m = text.match(/\b([A-Z]{1,2}\d[A-Z\d]?)\s*(\d[A-Z]{2})\b/i);
  if (!m) return;
  return `${m[1].toUpperCase()} ${m[2].toUpperCase()}`;
}

function extractEpc(text: string): string | undefined {
  const m = text.match(/\b(\d{4}-\d{4}-\d{4}-\d{4}-\d{4})\b/);
  return m?.[1];
}

function extractOccupants(text: string): number | undefined {
  const m =
    text.match(/\boccupants?\s*[:\-]?\s*(\d{1,2})\b/i) ||
    text.match(/\bpeople\s*[:\-]?\s*(\d{1,2})\b/i) ||
    text.match(/\b(occupancy|household size)\s*[:\-]?\s*(\d{1,2})\b/i);
  const n = m ? Number(m[1]) : NaN;
  return Number.isFinite(n) ? n : undefined;
}

/** Map labels/years into your select bands */
function normaliseAgeBand(label: string): string | undefined {
  const s = label.toLowerCase();
  const bands = [
    'pre-1900','1900-1929','1930-1949','1950-1966',
    '1967-1975','1976-1982','1983-1990','1991-1995',
    '1996-2002','2003-2006','2007-2011','2012-present'
  ];
  for (const b of bands) if (s.includes(b)) return b;
  const y = Number((s.match(/\b(18|19|20)\d{2}\b/) || [])[0]);
  if (y) {
    if (y < 1900) return 'pre-1900';
    if (y <= 1929) return '1900-1929';
    if (y <= 1949) return '1930-1949';
    if (y <= 1966) return '1950-1966';
    if (y <= 1975) return '1967-1975';
    if (y <= 1982) return '1976-1982';
    if (y <= 1990) return '1983-1990';
    if (y <= 1995) return '1991-1995';
    if (y <= 2002) return '1996-2002';
    if (y <= 2006) return '2003-2006';
    if (y <= 2011) return '2007-2011';
    return '2012-present';
  }
  return;
}

function inferDwelling(text: string): Dwelling | undefined {
  const t = text.toLowerCase();
  if (/semi[-\s]?detached/.test(t)) return 'Semi-detached';
  if (/\bterrace|terraced\b/.test(t)) return 'Terraced';
  if (/\bflat|apartment\b/.test(t)) return 'Flat';
  if (/bungalow\b/.test(t)) return 'Bungalow';
  if (/detached\b/.test(t)) return 'Detached';
  return;
}

function inferTerraceType(text: string): TerraceType | undefined {
  const t = text.toLowerCase();
  if (/mid[-\s]?terrace/.test(t)) return 'Mid-terrace';
  if (/end[-\s]?terrace/.test(t)) return 'End-terrace';
  if (/corner[-\s]?terrace/.test(t)) return 'Corner-terrace';
  if (/\bterrace|terraced\b/.test(t)) return 'Mid-terrace';
  return;
}

function parsePropertyCheckerBlob(text: string) {
  const postcode = extractPostcode(text);
  const epc = extractEpc(text);
  const occupants = extractOccupants(text);

  const ageLabel = (text.match(/(construction\s*age\s*band|age\s*band)\s*[:\-]?\s*([^\n<]+)/i) || [])[2];
  const ageBand = ageLabel ? normaliseAgeBand(ageLabel) : undefined;

  const dwelling = inferDwelling(text);
  const terraceType = inferTerraceType(text) || (dwelling === 'Terraced' ? 'Mid-terrace' : 'Not terraced');

  const address =
    (text.match(/address\s*[:\-]?\s*([^\n<]+)/i) || [])[1] ||
    (text.match(/Property\s*address\s*[:\-]?\s*([^\n<]+)/i) || [])[1];

  return { postcode, ageBand, dwelling, terraceType, address, epc, occupants };
}

/* ============================== Component ============================== */

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
  const meanAnnual = MEAN_ANNUAL_DEFAULT;

  // Details
  const [dwelling, setDwelling] = useState<Dwelling | ''>('');
  const [terraceType, setTerraceType] = useState<TerraceType | ''>('');
  const [ageBand, setAgeBand] = useState('');
  const [occupants, setOccupants] = useState(2);
  const [mode, setMode] = useState('Net Internal');
  const [airtight, setAirtight] = useState('Standard Method');
  const [thermalTest, setThermalTest] = useState('No Test Performed');

  // Status / local
  const [climStatus, setClimStatus] = useState('');
  const [altStatus, setAltStatus] = useState('');
  const [latlonOverride, setLatlonOverride] = useState('');
  const climateRef = useRef<ClimateMap | null>(null);

  // Import UI
  const [pcUrl, setPcUrl] = useState('');
  const [pcPaste, setPcPaste] = useState('');
  const [pcImportStatus, setPcImportStatus] = useState('');

  // Load climate map once
  useEffect(() => {
    (async () => {
      setClimStatus('Loading climate table…');
      const map = await loadClimateMap();
      climateRef.current = map;
      setClimStatus(map.size ? `Climate table loaded (${map.size} keys).` : 'No climate table found (using manual/API).');
    })();
  }, []);

  // Update design temp/HDD from climate map on postcode changes
  useEffect(() => {
    const map = climateRef.current;
    if (!map || !postcode) return;
    const hit = lookupDesign(map, postcode);
    if (hit) {
      if (typeof hit.designTemp === 'number') setTex(hit.designTemp);
      if (typeof hit.hdd === 'number') setHdd(hit.hdd);
      setClimStatus(`Auto climate ✓ matched ${keysFor(postcode).join(' → ')}`);
    } else {
      setClimStatus('Auto climate: no match in table (you can override).');
    }
  }, [postcode]);

  // Altitude lookup
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
      dwelling, terraceType, ageBand, occupants, mode, airtight, thermalTest,
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
        {/* Import banner */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#f7f7f7', padding: 12, borderRadius: 10, marginBottom: 14 }}>
          <strong>Import from</strong>
          <a href={PROPERTY_CHECKER_URL} target="_blank" rel="noreferrer" style={{ fontWeight: 600, textDecoration: 'underline' }}>
            PropertyChecker.co.uk
          </a>
          <span style={{ color: '#666' }}>(optional)</span>
        </div>

        {/* ---- PropertyChecker importer ---- */}
        <div style={{ border: '1px dashed #ddd', background: '#fafafa', padding: 12, borderRadius: 10, marginBottom: 16 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ fontWeight: 600 }}>Auto-fill from PropertyChecker</span>
            <a href={PROPERTY_CHECKER_URL} target="_blank" rel="noreferrer" style={{ textDecoration: 'underline' }}>
              Open site →
            </a>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '2fr auto', gap: 8, marginTop: 8 }}>
            <input
              value={pcUrl}
              onChange={(e) => setPcUrl(e.target.value)}
              placeholder="Paste PropertyChecker URL (optional)"
              style={{ ...inputStyle }}
            />
            <button
              onClick={async () => {
                if (!pcUrl) { setPcImportStatus('Enter a URL or use the paste box below.'); return; }
                try {
                  setPcImportStatus('Fetching URL…');
                  // Note: may be blocked by CORS; fallback is paste box below.
                  const r = await fetch(pcUrl, { mode: 'cors' });
                  const html = await r.text();
                  const parsed = parsePropertyCheckerBlob(html);
                  console.log('[PC parsed URL]', parsed);
                  let applied = 0;
                  if (parsed.postcode) { setPostcode(parsed.postcode); applied++; }
                  if (parsed.ageBand) { setAgeBand(parsed.ageBand); applied++; }
                  if (parsed.dwelling) { setDwelling(parsed.dwelling); applied++; }
                  if (parsed.terraceType) { setTerraceType(parsed.terraceType); applied++; }
                  if (parsed.address) { setAddress(parsed.address); }
                  if (parsed.epc) { setEpcNo(parsed.epc); applied++; }
                  if (parsed.occupants && parsed.occupants > 0) { setOccupants(parsed.occupants); applied++; }
                  setPcImportStatus(applied ? `Filled ${applied} field(s).` : 'Couldn’t detect fields. Try copy/paste below.');
                } catch {
                  setPcImportStatus('Browser blocked cross-site fetch. Copy the page → paste it below → Parse.');
                }
              }}
              style={primaryBtn}
            >
              Fetch & Parse
            </button>
          </div>

          <div style={{ marginTop: 8 }}>
            <textarea
              value={pcPaste}
              onChange={(e) => setPcPaste(e.target.value)}
              placeholder="Or paste PropertyChecker page text/HTML here and click Parse"
              rows={5}
              style={{ ...inputStyle, width: '100%', resize: 'vertical' }}
            />
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <button
                onClick={() => {
                  const parsed = parsePropertyCheckerBlob(pcPaste);
                  console.log('[PC parsed paste]', parsed);
                  let applied = 0;
                  if (parsed.postcode) { setPostcode(parsed.postcode); applied++; }
                  if (parsed.ageBand) { setAgeBand(parsed.ageBand); applied++; }
                  if (parsed.dwelling) { setDwelling(parsed.dwelling); applied++; }
                  if (parsed.terraceType) { setTerraceType(parsed.terraceType); applied++; }
                  if (parsed.address) { setAddress(parsed.address); }
                  if (parsed.epc) { setEpcNo(parsed.epc); applied++; }
                  if (parsed.occupants && parsed.occupants > 0) { setOccupants(parsed.occupants); applied++; }
                  setPcImportStatus(applied ? `Filled ${applied} field(s).` : 'Couldn’t detect fields. Check the pasted content.');
                }}
                style={secondaryBtn}
              >
                Parse pasted content
              </button>
              <span style={{ color: '#666', fontSize: 12 }}>{pcImportStatus}</span>
            </div>
          </div>
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
                  Uses postcodes.io / Nominatim and Open-Elevation (fallback OpenTopoData). You can also enter <em>lat,long</em> override:
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
            <Select value={dwelling} onChange={(e) => setDwelling(e.target.value as Dwelling)}>
              <option value="">Select</option>
              <option>Detached</option><option>Semi-detached</option><option>Terraced</option>
              <option>Flat</option><option>Bungalow</option>
            </Select>
          </div>
          <div>
            <Label>Terrace Type</Label>
            <Select value={terraceType} onChange={(e) => setTerraceType(e.target.value as TerraceType)}>
              <option value="">Select terrace type</option>
              <option>Mid-terrace</option><option>End-terrace</option><option>Corner-terrace</option>
              <option>Not terraced</option>
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

        {/* Status */}
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

/* ============================== UI bits ============================== */

function Label({ children }: { children: React.ReactNode }) {
  return <label style={{ display: 'block', fontSize: 12, color: '#555', marginBottom: 6 }}>{children}</label>;
}
function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} style={{ ...inputStyle, ...(props.style || {}) }} />;
}
function Select(props: React.SelectHTMLSelectElement) {
  // TS type narrow fix for inline file: use any to avoid DOM types mismatch in some setups
  return <select {...(props as any)} style={{ ...inputStyle, ...(props.style || {}) }} />;
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

/* ============================== styles ============================== */

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
const secondaryBtn: React.CSSProperties = {
  background: '#fff',
  color: '#111',
  border: '1px solid #ddd',
  padding: '12px 18px',
  borderRadius: 12,
  cursor: 'pointer',
};
