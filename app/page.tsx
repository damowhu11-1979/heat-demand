// app/page.tsx
'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';

/* =============================================================================
   Types & helpers (postcode ⇄ keys, parsing, etc.)
============================================================================= */
type RowLite = { designTemp?: number; hdd?: number };

type LatLon = { lat: number; lon: number; src: 'postcodes.io' | 'nominatim' | 'latlon' };

const DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
const MEAN_ANNUAL = 10.2; // shown as read-only

const localCache: { map: Map<string, RowLite> | null; size: number } = { map: null, size: 0 };

const toPC = (s: string) => {
  const raw = String(s || '').toUpperCase().replace(/\s+/g, '');
  const m = raw.match(/^([A-Z]{1,2}\d[A-Z\d]?)(\d[A-Z]{2})$/);
  return m ? `${m[1]} ${m[2]}` : null;
};

const asLatLon = (s: string) => {
  const m = String(s || '').trim().match(/^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/);
  if (!m) return null;
  const lat = +m[1], lon = +m[2];
  if (!isFinite(lat) || !isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  return { lat, lon };
};

function extractKeysFromPostcode(pc: string) {
  const res = new Set<string>();
  const t = toPC(pc || '') || '';
  if (!t) return [];

  // FULL
  const full = t.toUpperCase();
  res.add(full.replace(/\s+/g, '')); // no-space version

  // OUTCODE / SECTOR / AREA
  const parts = full.split(' ');
  const outcode = parts[0]; // e.g. "E1"
  const area = outcode.replace(/\d.*/, ''); // "E"
  res.add(outcode);

  if (parts.length > 1) {
    const sectorDigit = parts[1][0];
    if (sectorDigit) res.add(`${outcode} ${sectorDigit}`); // e.g. "E1 6"
  }
  if (area) res.add(area);

  return Array.from(res);
}

/* =============================================================================
   Local postcode table (public/climate/postcode_climate.json)
   - Accepts array rows with { keys: string[], designTemp?, hdd? }
   - Tries several asset paths (GitHub Pages friendly)
============================================================================= */
async function loadLocalMap(): Promise<Map<string, RowLite> | null> {
  if (localCache.map) return localCache.map;

  // Try multiple paths – works on Pages and locally
  const candidates = (() => {
    const urls = new Set<string>();
    const pathname = (typeof window !== 'undefined' ? window.location.pathname : '/') || '/';
    const curDir = pathname.replace(/[^/]*$/, '');
    const seg = pathname.split('/').filter(Boolean);
    const repoRoot = seg.length ? `/${seg[0]}/` : '/';
    urls.add(`${curDir}climate/postcode_climate.json`);
    urls.add(`${repoRoot}climate/postcode_climate.json`);
    urls.add(`/climate/postcode_climate.json`);
    urls.add(`climate/postcode_climate.json`);
    urls.add(`/postcode_climate.json`);
    return Array.from(urls);
  })();

  let rows: any = null, hit = '';
  for (const u of candidates) {
    try {
      const r = await fetch(u, { cache: 'no-store' });
      if (r.ok) { rows = await r.json(); hit = u; break; }
    } catch {}
  }
  if (!rows) return null;
  console.info('Loaded postcode table from', hit);

  // Normalize rows: either array or object-map
  const feed: any[] = Array.isArray(rows)
    ? rows
    : Object.entries(rows).map(([k, v]: any) => ({ key: k, ...(v || {}) }));

  const map = new Map<string, RowLite>();
  for (const r of feed) {
    const designTemp = Number.isFinite(+r.designTemp) ? Math.round(+r.designTemp) : undefined;
    const hdd = Number.isFinite(+r.hdd) ? Math.round(+r.hdd) : undefined;
    if (designTemp === undefined && hdd === undefined) continue;

    // From converter: keys[]
    const fromArray = Array.isArray(r.keys) ? r.keys : [];
    // Some optional fallbacks if present
    const derived = [
      (r.postcode || r.post_code || r.key || '').toString(),
      r.sector, r.outcode, r.area,
    ].filter(Boolean);

    const keyset = new Set<string>([
      ...fromArray.map((x: string) => x.toString().toUpperCase()),
      ...derived.map((x: string) => x.toString().toUpperCase()),
    ]);

    for (const k of keyset) {
      const kNoSpace = k.replace(/\s+/g, '');
      if (!map.has(kNoSpace)) map.set(kNoSpace, { designTemp, hdd });
    }
  }
  localCache.map = map;
  localCache.size = map.size;
  return map;
}

async function lookupLocalClimate(postcode: string): Promise<RowLite | null> {
  const map = await loadLocalMap();
  if (!map) return null;
  const keys = extractKeysFromPostcode(postcode);
  for (const k of keys) {
    const hit = map.get(k.replace(/\s+/g, '').toUpperCase());
    if (hit) return hit;
  }
  return null;
}

/* =============================================================================
   Remote fallback (Open-Meteo + altitude correction) — used if table miss
============================================================================= */
async function geocodePostcode(pc: string): Promise<LatLon> {
  const url = `https://api.postcodes.io/postcodes/${encodeURIComponent(pc)}`;
  const r = await fetch(url, { cache: 'no-store' });
  if (!r.ok) throw new Error(`postcodes.io ${r.status}`);
  const j = await r.json();
  if (j.status !== 200 || !j.result) throw new Error('postcode not found');
  return { lat: j.result.latitude, lon: j.result.longitude, src: 'postcodes.io' };
}
async function geocodeAddress(addr: string): Promise<LatLon> {
  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(addr)}`;
  const r = await fetch(url, { headers: { 'Accept-Language': 'en-GB' }, cache: 'no-store' });
  if (!r.ok) throw new Error(`nominatim ${r.status}`);
  const a = await r.json();
  if (!a.length) throw new Error('address not found');
  return { lat: +a[0].lat, lon: +a[0].lon, src: 'nominatim' };
}
async function geocodeAny(postcode: string, address: string, latlonText?: string): Promise<LatLon> {
  const ll = latlonText ? asLatLon(latlonText) : null;
  if (ll) return { ...ll, src: 'latlon' };
  const pc = toPC(postcode || '');
  if (pc) {
    try { return await geocodePostcode(pc); }
    catch { return await geocodeAddress(pc); }
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
async function fetchHDD(lat: number, lon: number): Promise<number> {
  const url = `https://climate-api.open-meteo.com/v1/degree-days?latitude=${lat}&longitude=${lon}&start_year=1991&end_year=2020&base_temperature=15.5&degree_day_type=heating`;
  const r = await fetch(url, { cache: 'no-store' });
  if (!r.ok) throw new Error('degree-days http');
  const j = await r.json();
  const arr: number[] = j?.data?.map((x: any) => x.heating_degree_days) || [];
  if (!arr.length) throw new Error('degree-days empty');
  const avg = arr.reduce((a, b) => a + b, 0) / arr.length;
  return Math.round(avg);
}
async function fetchMonthlyNormals(lat: number, lon: number): Promise<{ mean: number[]; min: number[] }> {
  const url = `https://climate-api.open-meteo.com/v1/climate?latitude=${lat}&longitude=${lon}&start_year=1991&end_year=2020&models=ERA5&monthly=temperature_2m_mean,temperature_2m_min`;
  const r = await fetch(url, { cache: 'no-store' });
  if (!r.ok) throw new Error('monthly climate http');
  const j = await r.json();
  const mean: number[] = j?.monthly?.temperature_2m_mean || [];
  const min: number[] = j?.monthly?.temperature_2m_min || [];
  if (mean.length < 12 || min.length < 12) throw new Error('monthly arrays incomplete');
  return { mean, min };
}
function hddFromMeans(means: number[]): number {
  let sum = 0;
  for (let m = 0; m < 12; m++) {
    const T = means[m]; const d = DAYS[m];
    if (isFinite(T)) sum += Math.max(0, 15.5 - T) * d;
  }
  return Math.round(sum);
}
function designTempFromDJF(mins: number[], altitudeMeters: number): number | null {
  const djfIdx = [11, 0, 1];
  const djfVals = djfIdx.map((i) => mins[i]).filter((v) => isFinite(v));
  if (!djfVals.length) return null;
  const base = Math.min(...djfVals);
  const safety = base - 2;
  const lapse = safety - 0.0065 * (Number(altitudeMeters) || 0);
  return Math.round(lapse);
}
function designTempRegionalFallback(lat: number, altitudeMeters: number): number {
  let base: number;
  if (lat < 51.5) base = -2;
  else if (lat < 52.5) base = -3;
  else if (lat < 53.5) base = -4;
  else if (lat < 55.0) base = -5;
  else base = -6;
  return Math.round(base - 0.0065 * (Number(altitudeMeters) || 0));
}
async function autoClimateCalc(postcode: string, address: string, altitudeMeters: number) {
  const geo = await geocodeAny(postcode, address);
  let hdd: number | undefined;
  try { hdd = await fetchHDD(geo.lat, geo.lon); } catch {}
  let designTemp: number | null = null;
  try {
    const normals = await fetchMonthlyNormals(geo.lat, geo.lon);
    if (!isFinite(hdd as number)) hdd = hddFromMeans(normals.mean);
    designTemp = designTempFromDJF(normals.min, altitudeMeters);
  } catch {}
  if (!isFinite(hdd as number)) hdd = 2033;
  if (!isFinite(designTemp as number)) designTemp = designTempRegionalFallback(geo.lat, altitudeMeters);
  return { hdd: hdd!, designTemp: designTemp!, lat: geo.lat, lon: geo.lon };
}

/* =============================================================================
   Tiny UI atoms
============================================================================= */
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

/* =============================================================================
   Main page
============================================================================= */
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
  const [hdd, setHdd] = useState<number | ''>(2033);

  // Details
  const [dwelling, setDwelling] = useState('');
  const [attach, setAttach] = useState('');
  const [ageBand, setAgeBand] = useState('');
  const [occupants, setOccupants] = useState(2);
  const [mode, setMode] = useState('Net Internal');
  const [airtight, setAirtight] = useState('Standard Method');
  const [thermalTest, setThermalTest] = useState('No Test Performed');

  // Status
  const [climStatus, setClimStatus] = useState('');   // where values came from
  const [altStatus, setAltStatus] = useState('');     // altitude lookup
  const [epcPaste, setEpcPaste] = useState('');

  const debounce = useRef<number | null>(null);

  // Try LOCAL TABLE first whenever postcode changes; if missing, fall back to Open-Meteo auto
  useEffect(() => {
    const p = postcode && toPC(postcode);
    if (!p && !address) return;

    if (debounce.current) window.clearTimeout(debounce.current);
    debounce.current = window.setTimeout(async () => {
      // 1) Local table
      const local = p ? await lookupLocalClimate(p) : null;
      if (local) {
        if (isFinite(local.designTemp as number)) setTex(local.designTemp!);
        if (isFinite(local.hdd as number)) setHdd(local.hdd!);
        setClimStatus(`Local table ✓ (from postcode list)`);
        return;
      }

      // 2) Fallback to API calc
      try {
        setClimStatus('Auto climate: looking up…');
        const res = await autoClimateCalc(postcode, address, Number(altitude) || 0);
        setHdd(res.hdd);
        setTex(res.designTemp);
        setClimStatus(`Auto climate ✓  HDD ${res.hdd}, DesignT ${res.designTemp}°C`);
      } catch (e: any) {
        setClimStatus(`Auto climate failed: ${e?.message || e}`);
      }
    }, 600);

    return () => {
      if (debounce.current) window.clearTimeout(debounce.current);
    };
  }, [postcode, address, altitude]);

  // Altitude button
  const [latlonOverride, setLatlonOverride] = useState('');
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

  // EPC parse (RRN)
  const extractRRN = (text: string) => {
    const m = String(text || '').match(/\b(\d{4}-\d{4}-\d{4}-\d{4}-\d{4})\b/);
    return m ? m[1] : null;
  };
  const onParseEpc = () => {
    const rrn = extractRRN(epcPaste);
    if (rrn) setEpcNo(rrn);
  };

  // Reset & Save
  const resetAll = () => {
    setReference('');
    setPostcode('');
    setCountry('England');
    setAddress('');
    setEpcNo('');
    setUprn('');
    setAltitude(0);
    setTex(-3);
    setHdd(2033);
    setDwelling('');
    setAttach('');
    setAgeBand('');
    setOccupants(2);
    setMode('Net Internal');
    setAirtight('Standard Method');
    setThermalTest('No Test Performed');
    setClimStatus('');
    setAltStatus('');
    setLatlonOverride('');
    setEpcPaste('');
  };

  const savePayload = useMemo(
    () => ({
      reference, postcode, country, address, epcNo, uprn,
      altitude, tex, meanAnnual: MEAN_ANNUAL, hdd,
      dwelling, attach, ageBand, occupants,
      mode, airtight, thermalTest,
    }),
    [reference, postcode, country, address, epcNo, uprn, altitude, tex, hdd, dwelling, attach, ageBand, occupants, mode, airtight, thermalTest]
  );

  const onSave = () => {
    console.log('SAVE', savePayload);
    alert('Saved locally (console). Wire to your backend when ready.');
  };
  const onSaveContinue = () => {
    console.log('SAVE & CONTINUE', savePayload);
    alert('Saved. Next pages (Ventilation → Heated Rooms) can be wired next.');
  };

  return (
    <main style={{ maxWidth: 1040, margin: '0 auto', padding: 24, fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif' }}>
      <h1 style={{ fontSize: 28, margin: '6px 0 12px' }}>Heat Load Calculator (MCS-style)</h1>
      <div style={{ color: '#888', fontSize: 12, marginBottom: 14 }}>
        Property → Ventilation → Heated Rooms → Building Elements → Room Elements → Results
      </div>

      <section style={card}>
        {/* Import hint */}
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
            <Input
              placeholder="e.g., E1 6AN (London)"
              value={postcode}
              onChange={(e) => setPostcode(e.target.value)}
            />
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
                <summary style={{ cursor: 'pointer', color: '#333' }}>Get altitude from getthedata.com</summary>
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
            <Input type="number" value={MEAN_ANNUAL} readOnly />
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
        <div style={{ marginTop: 12, fontSize: 12, color: '#666' }}>{climStatus}</div>

        {/* EPC parse */}
        <div style={{ marginTop: 18 }}>
          <h3 style={{ margin: '4px 0 8px' }}>EPC finder (from address)</h3>
          <div style={{ ...row, marginBottom: 8 }}>
            <a href="https://www.gov.uk/find-energy-certificate" target="_blank" rel="noreferrer">
              <Button>Open GOV.UK EPC search →</Button>
            </a>
            <span style={{ color: '#666', fontSize: 12 }}>
              Find address → copy certificate page → paste → Parse.
            </span>
          </div>
          <textarea
            rows={6}
            placeholder="Paste EPC page text here"
            value={epcPaste}
            onChange={(e) => setEpcPaste(e.target.value)}
            style={{ width: '100%', ...inputStyle, height: 140, resize: 'vertical' }}
          />
          <div style={{ ...row, marginTop: 8 }}>
            <Button onClick={onParseEpc}>Parse pasted text</Button>
            <span style={{ fontFamily: 'ui-monospace', fontSize: 12 }}>Detected EPC: {epcNo || '—'}</span>
          </div>
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 22 }}>
          <button onClick={resetAll} style={secondaryBtn}>Reset</button>
          <button onClick={onSave} style={secondaryBtn}>Save</button>
          <button onClick={onSaveContinue} style={primaryBtn}>Save & Continue →</button>
        </div>
      </section>
    </main>
  );
}

/* =============================================================================
   Styles
============================================================================= */
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
const secondaryBtn: React.CSSProperties = {
  background: '#fff',
  color: '#111',
  border: '1px solid #ddd',
  padding: '12px 18px',
  borderRadius: 12,
  cursor: 'pointer',
};
