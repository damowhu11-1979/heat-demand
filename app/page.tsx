 'use client';
import Link from 'next/link';
import ClearDataButton from '@/components/ClearDataButton';
import React, { useEffect, useRef, useState } from 'react';

/* ──────────────────── storage helpers (safe on static export) ──────────────────── */
function readProperty(): any {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem('mcs.property');
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
function writeProperty(obj: any) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem('mcs.property', JSON.stringify(obj));
  } catch {
    /* ignore quota errors */
  }
}

/* ───────────────────────────── Config & helpers ───────────────────────────── */
const PROPERTY_CHECKER_URL = 'https://propertychecker.co.uk/';
const EPC_BASE = 'https://find-energy-certificate.service.gov.uk';
const meanAnnualDefault = 10.2;

type ClimateRow = { designTemp?: number; hdd?: number };
type ClimateMap = Map<string, ClimateRow>;
type LatLon = { lat: number; lon: number };

/** Normalise postcode to uppercase, no spaces */
function normPC(s: string): string {
  return String(s || '').toUpperCase().replace(/\s+/g, '');
}
/** Try FULL, OUTCODE, SECTOR, AREA keys for postcode lookup */
function explodeQueryKeys(pc?: string): string[] {
  const raw = normPC(pc || '');
  if (!raw) return [];
  const keys = new Set<string>([raw]);
  const m = raw.match(/^([A-Z]{1,2}\d[A-Z\d]?)(\d?)([A-Z]{0,2})?$/);
  if (m) {
    const out = m[1];
    const sector = m[2];
    const area = out.replace(/\d.*/, '');
    keys.add(out);
    if (sector) keys.add(`${out}${sector}`);
    if (area) keys.add(area);
  }
  return Array.from(keys);
}
function lookupDesign(map: ClimateMap, postcode: string): ClimateRow | undefined {
  for (const k of explodeQueryKeys(postcode)) {
    const hit = map.get(k);
    if (hit) return hit;
  }
  return undefined;
}
/** Load climate JSON from likely locations (local or GH Pages) */
async function loadClimateMap(): Promise<ClimateMap> {
  const isBrowser = typeof window !== 'undefined';
  const pathname = isBrowser && window.location ? window.location.pathname : '/';
  const curDir = pathname.replace(/[^/]*$/, '');
  const seg = pathname.split('/').filter(Boolean);
  const repoRoot = seg.length ? `/${seg[0]}/` : '/';

  const candidates = Array.from(
    new Set([
      `${curDir}climate/postcode_climate.json`,
      `${repoRoot}climate/postcode_climate.json`,
      `/climate/postcode_climate.json`,
      `/postcode_climate.json`,
    ])
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
      /* try next */}
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
        if ((j?.status as number) === 200 && j?.result) {
          return { lat: j.result.latitude, lon: j.result.longitude };
        }
      }
    } catch { /* fall back */ }
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

/* ───────────── PropertyChecker paste parser (epc/uprn/age/occupants/etc) ───────────── */
function parsePropertyChecker(text: string): {
  epc?: string; uprn?: string; occupants?: number; ageBand?: string; postcode?: string; address?: string;
} {
  const out: { epc?: string; uprn?: string; occupants?: number; ageBand?: string; postcode?: string; address?: string } = {};
  const t = String(text || '');

  const mEpc = t.match(/\b(\d{4}-\d{4}-\d{4}-\d{4}-\d{4})\b/);
  if (mEpc) out.epc = mEpc[1];

  const mUprn =
    t.match(/\bUPRN\s*[:=]?\s*(\d{8,13})\b/i) ||
    t.match(/\bUnique\s+Property\s+Reference\s+Number\s*[:=]?\s*(\d{8,13})\b/i);
  if (mUprn) out.uprn = mUprn[1];

  const mOcc = t.match(/(?:\bno\.?\s*of\s*)?occupants?\s*[:=]?\s*(\d{1,2})/i);
  if (mOcc) out.occupants = Number(mOcc[1]);

  const ageBandOptions = [
    'pre-1900','1900-1929','1930-1949','1950-1966','1967-1975','1976-1982',
    '1983-1990','1991-1995','1996-2002','2003-2006','2007-2011','2012-present',
  ];
  for (const ab of ageBandOptions) {
    const re = new RegExp(`\\b${ab.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
    if (re.test(t)) { out.ageBand = ab; break; }
  }

  const pcRe = /\b([A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2})\b/i;
  const mPc = t.match(pcRe);
  if (mPc) out.postcode = mPc[1].toUpperCase().replace(/\s+/, ' ');
  let addr: string | undefined;
  const mAddrLabel = t.match(/^\s*address\s*[:\-]\s*(.+)$/im);
  if (mAddrLabel) addr = mAddrLabel[1].trim();
  else if (mPc) {
    const lines = t.split(/\r?\n/);
    const line = lines.find((ln) => pcRe.test(ln));
    if (line) addr = line.trim();
  }
  if (addr) out.address = addr;

  return out;
}

/* ─────────────────────────────────── UI ─────────────────────────────────── */
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

  // Property details
  const [dwelling, setDwelling] = useState('');
  const [subtype, setSubtype] = useState('');
  const [ageBand, setAgeBand] = useState('');
  const [occupants, setOccupants] = useState(2);
  const [mode, setMode] = useState('Net Internal');
  const [airtight, setAirtight] = useState('Standard Method');
  const [thermalTest, setThermalTest] = useState('No Test Performed');

  // Status & imported stuff
  const [climStatus, setClimStatus] = useState('');
  const [altStatus, setAltStatus] = useState('');
  const [latlonOverride, setLatlonOverride] = useState('');
  const [pcPaste, setPcPaste] = useState('');
  const climateRef = useRef<ClimateMap | null>(null);

  /* ─────────────── side effects (TOP-LEVEL — not inside JSX) ─────────────── */

  // Load postcode climate map once
  useEffect(() => {
    (async () => {
      setClimStatus('Loading climate table…');
      const map = await loadClimateMap();
      climateRef.current = map;
      setClimStatus(map.size ? `Climate table loaded (${map.size} keys).` : 'No climate table found (using manual/API).');
    })();
  }, []);

  // Update design temp/HDD when postcode changes and table exists
  useEffect(() => {
    const map = climateRef.current;
    if (!map || !postcode) return;
    const hit = lookupDesign(map, postcode);
    if (hit) {
      if (typeof hit.designTemp === 'number') setTex(hit.designTemp);
      if (typeof hit.hdd === 'number') setHdd(hit.hdd);
      setClimStatus(`Auto climate matched ${explodeQueryKeys(postcode).join(' → ')}`);
    } else {
      setClimStatus('Auto climate: no match in table (you can override).');
    }
  }, [postcode]);

  // Clear subtype unless Terraced
  useEffect(() => {
    if (dwelling !== 'Terraced') setSubtype('');
  }, [dwelling]);

  // Load saved values on mount
  useEffect(() => {
    const saved = readProperty();
    if (!saved) return;

    if (typeof saved.reference === 'string') setReference(saved.reference);
    if (typeof saved.postcode === 'string') setPostcode(saved.postcode);
    if (typeof saved.country === 'string') setCountry(saved.country);
    if (typeof saved.address === 'string') setAddress(saved.address);
    if (typeof saved.epcNo === 'string') setEpcNo(saved.epcNo);
    if (typeof saved.uprn === 'string') setUprn(saved.uprn);

    if (typeof saved.altitude === 'number') setAltitude(saved.altitude);
    if (typeof saved.tex === 'number') setTex(saved.tex);
    if (typeof saved.hdd === 'number') setHdd(saved.hdd);

    if (typeof saved.dwelling === 'string') setDwelling(saved.dwelling);
    if (typeof saved.subtype === 'string') setSubtype(saved.subtype);
    if (typeof saved.ageBand === 'string') setAgeBand(saved.ageBand);
    if (typeof saved.occupants === 'number') setOccupants(saved.occupants);
    if (typeof saved.mode === 'string') setMode(saved.mode);
    if (typeof saved.airtight === 'string') setAirtight(saved.airtight);
    if (typeof saved.thermalTest === 'string') setThermalTest(saved.thermalTest);
  }, []);

  // Auto-save to localStorage (debounced)
  useEffect(() => {
    const payload = {
      reference, postcode, country, address, epcNo, uprn,
      altitude: altitude === '' ? undefined : altitude,
      tex:      tex      === '' ? undefined : tex,
      hdd:      hdd      === '' ? undefined : hdd,
      dwelling, subtype, ageBand, occupants, mode, airtight, thermalTest,
    };
    const t = setTimeout(() => writeProperty(payload), 400);
    return () => clearTimeout(t);
  }, [
    reference, postcode, country, address, epcNo, uprn,
    altitude, tex, hdd, dwelling, subtype, ageBand, occupants, mode, airtight, thermalTest
  ]);

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

  // PropertyChecker paste → parse
  const onParsePropertyChecker = () => {
    const res = parsePropertyChecker(pcPaste);
    if (res.epc) setEpcNo(res.epc);
    if (res.uprn) setUprn(res.uprn);
    if (typeof res.occupants === 'number') setOccupants(res.occupants);
    if (res.ageBand) setAgeBand(res.ageBand);
    if (res.postcode) setPostcode(res.postcode);
    if (res.address) setAddress(res.address);
    console.log('Parsed PropertyChecker:', res);
    alert('Saved locally (console).');
  };

  // Manual save button (also useful for debugging)
  const onSave = () => {
    const payload = {
      reference, postcode, country, address, epcNo, uprn,
      altitude, tex, meanAnnual, hdd,
      dwelling, subtype, ageBand, occupants, mode, airtight, thermalTest,
    };
    console.log('SAVE', payload);
    alert('Saved locally (console).');
  };

  /* ────────────────────────────────── JSX ────────────────────────────────── */
  return (
    <main style={{ maxWidth: 1040, margin: '0 auto', padding: 24, fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif' }}>
      <h1 style={{ fontSize: 28, margin: '6px 0 12px' }}>Heat Load Calculator (MCS-style)</h1>
      <div style={{ color: '#888', fontSize: 12, marginBottom: 14 }}>
        Property → Ventilation → Heated Rooms → Building Elements → Room Elements → Results
      </div>

      {/* Import from PropertyChecker */}
      <section style={card}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10 }}>
          <strong>Import from </strong>
          <a href={PROPERTY_CHECKER_URL} target="_blank" rel="noreferrer">PropertyChecker.co.uk</a>
          <span>(optional)</span>
        </div>

        <div style={{ marginBottom: 12 }}>
          <Label>Paste PropertyChecker page text</Label>
          <textarea
            rows={4}
            value={pcPaste}
            onChange={(e) => setPcPaste(e.target.value)}
            placeholder="Paste the PropertyChecker property page (or details section) here, then click Parse"
            style={{ width: '100%', ...inputStyle, height: 120, resize: 'vertical' }}
          />
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 8 }}>
            <button onClick={onParsePropertyChecker} style={secondaryBtn}>Parse</button>
            <span style={{ color: '#666', fontSize: 12 }}>
              Will fill EPC, UPRN, occupants, age band, address and postcode.
            </span>
          </div>
        </div>
      </section>

      {/* Main form */}
      <section style={{ ...card, marginTop: 12 }}>
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

          {/* EPC Number */}
          <div>
            <Label>EPC Number *</Label>
            <Input
              placeholder="e.g., 1234-5678-9012-3456-7890"
              value={epcNo}
              onChange={(e) => setEpcNo(e.target.value)}
            />
            <div style={{ marginTop: 6, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <a
                href="https://www.gov.uk/find-energy-certificate"
                target="_blank"
                rel="noreferrer noopener"
                style={{ ...primaryBtn, textDecoration: 'none', display: 'inline-block' }}
              >
                Get EPC certificate
              </a>
              <a
                href={`${EPC_BASE}/energy-certificate/${encodeURIComponent(epcNo)}`}
                target="_blank"
                rel="noreferrer noopener"
                style={{
                  ...secondaryBtn,
                  textDecoration: 'none',
                  display: /^\d{4}-\d{4}-\d{4}-\d{4}-\d{4}$/.test(epcNo) ? 'inline-block' : 'none',
                }}
                title="Open EPC certificate (requires full RRN)"
              >
                Open this certificate
              </a>
              <a
                href={`${EPC_BASE}/search?postcode=${encodeURIComponent(postcode || '')}`}
                target="_blank"
                rel="noreferrer noopener"
                style={{ fontSize: 12, color: '#3366cc', textDecoration: 'underline' }}
                title="Search EPCs by postcode"
              >
                Search EPCs by postcode
              </a>
            </div>
          </div>

          {/* UPRN */}
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
            <Input
              type="number"
              value={altitude}
              onChange={(e) => setAltitude(e.target.value === '' ? '' : Number(e.target.value))}
            />
            <div style={{ marginTop: 8 }}>
              <details>
                <summary style={{ cursor: 'pointer', color: '#333' }}>Get altitude</summary>
                <div style={{ marginTop: 6, color: '#666', fontSize: 12 }}>
                  Uses postcodes.io / Nominatim and Open-Elevation (fallback OpenTopoData). You can also enter <em>lat,long</em>:
                </div>
              </details>
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
            <Label>Terrace / Dwelling subtype</Label>
            <Select
              value={subtype}
              onChange={(e) => setSubtype(e.target.value)}
              disabled={dwelling !== 'Terraced'}
              title={dwelling !== 'Terraced' ? 'Only applies when dwelling type = Terraced' : ''}
            >
              <option value="">—</option>
              <option>Terraced (mid)</option>
              <option>Terraced (end)</option>
              <option>Terraced (corner)</option>
            </Select>
          </div>

          <div>
            <Label>Age Band</Label>
            <Select value={ageBand} onChange={(e) => setAgeBand(e.target.value)}>
              <option value="">Select age band</option>
              <option>pre-1900</option><option>1900-1929</option><option>1930-1949</option><option>1950-1966</option>
              <option>1967-1975</option><option>1976-1982</option><option>1983-1990</option><option>1991-1995</option>
              <option>1996-2002</option><option>2003-2006</option><option>2007-2011</option><option>2012-present</option>
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
        <div style={{ marginTop: 12, fontSize: 12, color: '#666' }}>{climStatus}</div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 22 }}>
          {/* Go to Ventilation (page 2) */}
          <Link href="/ventilation" style={{ ...primaryBtn, textDecoration: 'none', display: 'inline-block', lineHeight: '20px' }}>
            Next: Ventilation →
          </Link>
          <button onClick={onSave} style={primaryBtn}>Save</button>
        </div>
      </section>
    </main>
  );
}

/* ─────────────────────────── UI atoms & styles ─────────────────────────── */
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
        ...(props.style as any),
      }}
    />
  );
}

const card: React.CSSProperties = { background: '#fff', border: '1px solid #e6e6e6', borderRadius: 14, padding: 16 };
const grid3: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 };
const grid4: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 };
const inputStyle: React.CSSProperties = { width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid #ddd', outline: 'none', boxSizing: 'border-box' };
const primaryBtn: React.CSSProperties = { background: '#111', color: '#fff', border: '1px solid #111', padding: '12px 18px', borderRadius: 12, cursor: 'pointer' };
const secondaryBtn: React.CSSProperties = { background: '#fff', color: '#111', border: '1px solid #ddd', padding: '10px 16px', borderRadius: 10, cursor: 'pointer' };
