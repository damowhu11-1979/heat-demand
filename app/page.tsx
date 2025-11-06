// app/page.tsx
'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';

/* ======================== Config ======================== */
const PROPERTY_CHECKER_URL = 'https://propertychecker.co.uk/';
const MEAN_ANNUAL_DEFAULT = 10.2;

/* ==================== Climate types ===================== */
type ClimateRow = { designTemp?: number; hdd?: number };
type ClimateMap = Map<string, ClimateRow>;
type LatLon = { lat: number; lon: number };

/* ==================== Postcode helpers ================== */
function normPC(s: string): string {
  return String(s || '').toUpperCase().replace(/\s+/g, '');
}

/** Build set of keys to try for a postcode:
 * - FULL (no space), e.g. "SW1A1AA"
 * - OUTCODE, e.g. "SW1A"
 * - SECTOR, e.g. "SW1A1"
 * - AREA, e.g. "SW"
 */
function explodeQueryKeys(pc?: string): string[] {
  const raw = normPC(pc || '');
  if (!raw) return [];
  const keys = new Set<string>([raw]);

  const m = raw.match(/^([A-Z]{1,2}\d[A-Z\d]?)(\d?)([A-Z]{0,2})?$/);
  if (m) {
    const out = m[1]; // OUTCODE
    const sector = m[2]; // first inward digit
    const area = out.replace(/\d.*/, ''); // AREA

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

/* ==================== Climate loader ==================== */
async function loadClimateMap(): Promise<ClimateMap> {
  const isBrowser = typeof window !== 'undefined';
  const pathname = isBrowser && (window as any).location ? (window as any).location.pathname : '/';

  // path where this page is served; and repo root for GH Pages /<repo>/
  const curDir = pathname.replace(/[^/]*$/, '');
  const seg = pathname.split('/').filter(Boolean);
  const repoRoot = seg.length ? `/${seg[0]}/` : '/';

  const candidates = Array.from(
    new Set<string>([
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
      /* next */
    }
  }
  if (!Array.isArray(feed)) return new Map();

  const map: ClimateMap = new Map();
  for (const row of feed) {
    const { keys = [], designTemp, hdd } = row || {};
    for (const k of keys) {
      const kk = normPC(k);
      if (kk) map.set(kk, { designTemp, hdd });
    }
  }
  return map;
}

/* =================== Geocoding & altitude ================ */
function parseLatLon(s: string): LatLon | null {
  const m = String(s || '')
    .trim()
    .match(/^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/);
  if (!m) return null;
  const lat = +m[1],
    lon = +m[2];
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
        if ((j?.status as any) === 200 && j?.result) {
          return { lat: j.result.latitude, lon: j.result.longitude };
        }
      }
    } catch {
      /* fallthrough */
    }
  }

  const q = (postcode || address || '').trim();
  if (q.length < 3) throw new Error('Enter postcode or address');
  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(q)}`;
  const r2 = await fetch(url, { headers: { 'Accept-Language': 'en-GB' }, cache: 'no-store' });
  if (!r2.ok) throw new Error('Address lookup failed');
  const a = await r2.json();
  if (!a?.length) throw new Error('Address not found');
  return { lat: +a[0].lat, lon: +a[0].lon };
}

async function elevation(lat: number, lon: number): Promise<{ metres: number; provider: string }> {
  try {
    const r = await fetch(`https://api.open-elevation.com/api/v1/lookup?locations=${lat},${lon}`, { cache: 'no-store' });
    if (!r.ok) throw new Error('open-elevation http');
    const j = await r.json();
    const v = j?.results?.[0]?.elevation;
    if (!isFinite(v)) throw new Error('open-elevation no result');
    return { metres: +v, provider: 'open-elevation' };
  } catch {
    const r2 = await fetch(`https://api.opentopodata.org/v1/eudem25m?locations=${lat},${lon}`, { cache: 'no-store' });
    if (!r2.ok) throw new Error('opentopodata http');
    const j2 = await r2.json();
    const v2 = j2?.results?.[0]?.elevation;
    if (!isFinite(v2)) throw new Error('opentopodata no result');
    return { metres: +v2, provider: 'opentopodata:eudem25m' };
  }
}

/* ================= PropertyChecker parsing ================= */
const reRRN = /\b(\d{4}-\d{4}-\d{4}-\d{4}-\d{4})\b/i;
const reOccupants = /occupants?\s*[:=]?\s*(\d+)/i;
const reAgeBand =
  /(pre-1900|1900-1929|1930-1949|1950-1966|1967-1975|1976-1982|1983-1990|1991-1995|1996-2002|2003-2006|2007-2011|2012\s*-\s*present|2012\s*to\s*present)/i;
const reTerrace =
  /(mid[-\s]?terrace|end[-\s]?terrace|corner[-\s]?terrace|semi[-\s]?detached|detached|flat|bungalow)/i;

function match1(re: RegExp, s: string) {
  const m = re.exec(s);
  return m ? m[1] : '';
}
function normaliseAgeBand(s: string) {
  const t = s.toLowerCase().replace(/\s+/g, '');
  if (t.startsWith('pre-1900') || t.startsWith('pre1900')) return 'pre-1900';
  const map: Record<string, string> = {
    '1900-1929': '1900-1929',
    '1930-1949': '1930-1949',
    '1950-1966': '1950-1966',
    '1967-1975': '1967-1975',
    '1976-1982': '1976-1982',
    '1983-1990': '1983-1990',
    '1991-1995': '1991-1995',
    '1996-2002': '1996-2002',
    '2003-2006': '2003-2006',
    '2007-2011': '2007-2011',
    '2012-present': '2012-present',
    '2012topresent': '2012-present',
  };
  return map[t] ?? '';
}
function normaliseTerraceLabel(det: string) {
  const t = det.toLowerCase();
  if (t.includes('mid')) return 'Terraced (mid)';
  if (t.includes('end')) return 'Terraced (end)';
  if (t.includes('corner')) return 'Terraced (corner)';
  if (t.includes('semi')) return 'Semi-detached';
  if (t.includes('detached')) return 'Detached';
  if (t.includes('flat')) return 'Flat';
  if (t.includes('bungalow')) return 'Bungalow';
  return '';
}

/* ========================= UI ============================ */
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
  const [dwelling, setDwelling] = useState('');
  const [attach, setAttach] = useState(''); // terrace/subtype
  const [ageBand, setAgeBand] = useState('');
  const [occupants, setOccupants] = useState(2);
  const [mode, setMode] = useState('Net Internal');
  const [airtight, setAirtight] = useState('Standard Method');
  const [thermalTest, setThermalTest] = useState('No Test Performed');

  // Local status
  const [climStatus, setClimStatus] = useState('');
  const [altStatus, setAltStatus] = useState('');
  const [latlonOverride, setLatlonOverride] = useState('');

  // PropertyChecker paste
  const [pcPaste, setPcPaste] = useState('');

  // Climate map
  const climateRef = useRef<ClimateMap | null>(null);

  // Load postcode climate map (once)
  useEffect(() => {
    (async () => {
      setClimStatus('Loading climate table…');
      const map = await loadClimateMap();
      climateRef.current = map;
      setClimStatus(map.size ? `Climate table loaded (${map.size} keys).` : 'No climate table found (using manual/API).');
    })();
  }, []);

  // Auto update from postcode if climate table present
  useEffect(() => {
    const map = climateRef.current;
    if (!map) return;
    if (!postcode) return;

    const hit = lookupDesign(map, postcode);
    if (hit) {
      if (typeof hit.designTemp === 'number') setTex(hit.designTemp);
      if (typeof hit.hdd === 'number') setHdd(hit.hdd);
      setClimStatus(`Auto climate ✓ matched ${explodeQueryKeys(postcode).join(' → ')}`);
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

  // PropertyChecker parse
  const onParsePropertyChecker = () => {
    const txt = String(pcPaste || '');
    if (!txt.trim()) return;

    const rrn = match1(reRRN, txt);
    if (rrn) setEpcNo(rrn);

    const occ = match1(reOccupants, txt);
    if (occ) setOccupants(Number(occ));

    const age = normaliseAgeBand(match1(reAgeBand, txt));
    if (age) setAgeBand(age);

    const terr = normaliseTerraceLabel(match1(reTerrace, txt));
    if (terr) setAttach(terr);

    // Optional postcode capture
    const pcMatch = txt.match(/\b([A-Z]{1,2}\d[A-Z\d]?)\s*(\d[A-Z]{2})\b/i);
    if (pcMatch) setPostcode(`${pcMatch[1].toUpperCase()} ${pcMatch[2].toUpperCase()}`);
  };

  // Save placeholder
  const onSave = () => {
    const payload = {
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

      {/* Import block */}
      <section style={{ ...card, marginBottom: 12 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
          <strong>Import from PropertyChecker.co.uk</strong>
          <span>(optional)</span>
          <a href={PROPERTY_CHECKER_URL} target="_blank" rel="noreferrer">
            <Button type="button">Open site →</Button>
          </a>
        </div>

        <Label>Paste PropertyChecker page (text or HTML)</Label>
        <textarea
          rows={5}
          value={pcPaste}
          onChange={(e) => setPcPaste(e.target.value)}
          placeholder="Paste the page here, then click Parse"
          style={{ width: '100%', ...inputStyle, height: 140, resize: 'vertical' }}
        />
        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          <Button type="button" onClick={onParsePropertyChecker}>
            Parse
          </Button>
          <span style={{ fontSize: 12, color: '#666' }}>Fills EPC number, occupants, terrace type, and age band when found.</span>
        </div>
      </section>

      {/* Main form */}
      <section style={card}>
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
            <Select value={country} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setCountry(e.target.value)}>
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
            <Select value={dwelling} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setDwelling(e.target.value)}>
              <option value="">Select</option>
              <option>Detached</option>
              <option>Semi-detached</option>
              <option>Terraced</option>
              <option>Flat</option>
              <option>Bungalow</option>
            </Select>
          </div>

          <div>
            <Label>Terrace / Dwelling subtype</Label>
            <Select value={attach} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setAttach(e.target.value)}>
              <option value="">Select terrace type</option>
              <option>Terraced (mid)</option>
              <option>Terraced (end)</option>
              <option>Terraced (corner)</option>
              <option>Semi-detached</option>
              <option>Detached</option>
              <option>Flat</option>
              <option>Bungalow</option>
            </Select>
          </div>

          <div>
            <Label>Age Band</Label>
            <Select value={ageBand} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setAgeBand(e.target.value)}>
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
            <Input
              type="number"
              value={occupants}
              onChange={(e) => setOccupants(Number(e.target.value || 0))}
            />
          </div>
        </div>

        {/* Dimension spec */}
        <h3 style={{ marginTop: 18, marginBottom: 8 }}>Dimension Specification</h3>
        <div style={grid3}>
          <div>
            <Label>Mode</Label>
            <Select value={mode} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setMode(e.target.value)}>
              <option>Net Internal</option>
              <option>Gross Internal</option>
            </Select>
          </div>
          <div>
            <Label>Airtightness Method</Label>
            <Select value={airtight} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setAirtight(e.target.value)}>
              <option>Standard Method</option>
              <option>Measured n50</option>
            </Select>
          </div>
          <div>
            <Label>Thermal Performance Test</Label>
            <Select value={thermalTest} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setThermalTest(e.target.value)}>
              <option>No Test Performed</option>
              <option>Thermal Imaging</option>
              <option>Co-heating</option>
            </Select>
          </div>
        </div>

        {/* Status + actions */}
        <div style={{ marginTop: 12, fontSize: 12, color: '#666' }}>Auto climate ✓ {climStatus}</div>

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 22 }}>
          <button onClick={onSave} style={primaryBtn}>
            Save
          </button>
        </div>
      </section>
    </main>
  );
}

/* ======================= Small UI bits ======================= */
function Label({ children }: { children: React.ReactNode }) {
  return (
    <label style={{ display: 'block', fontSize: 12, color: '#555', marginBottom: 6 }}>
      {children}
    </label>
  );
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

/* ========================= Styles =========================== */
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
