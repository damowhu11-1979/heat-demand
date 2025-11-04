// app/page.tsx
'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

/* ---------------- storage helpers ---------------- */
const STORAGE_KEY = 'heatload:property';
const safeGet = <T,>(k: string, fallback: T): T => {
  if (typeof window === 'undefined') return fallback;
  try { const v = window.localStorage.getItem(k); return v ? (JSON.parse(v) as T) : fallback; } catch { return fallback; }
};
const safeSet = (k: string, v: unknown) => { if (typeof window !== 'undefined') try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };

/* ---------------- postcode table (local first) ---------------- */
type LocalClimateRow = { outcode: string; designTemp?: number; hdd?: number };
const localClimateCache: { rows?: LocalClimateRow[] } = {};
async function loadLocalClimate(): Promise<LocalClimateRow[] | null> {
  if (localClimateCache.rows) return localClimateCache.rows;
  try {
    const r = await fetch('/climate/postcode_climate.json', { cache: 'no-store' });
    if (!r.ok) return null;
    const rows = (await r.json()) as LocalClimateRow[];
    localClimateCache.rows = rows;
    return rows;
  } catch { return null; }
}
const normalizeOutcode = (pc: string): { full?: string; area?: string } => {
  const m = (pc || '').toUpperCase().replace(/\s+/g, '').match(/^([A-Z]{1,2}\d[A-Z\d]?)/);
  if (!m) return {};
  const full = m[1];                                   // e.g. SS8
  const area = full.replace(/\d.*$/, '');              // e.g. SS
  return { full, area };
};
async function lookupLocalClimate(postcode: string): Promise<{ designTemp?: number; hdd?: number } | null> {
  const table = await loadLocalClimate();
  if (!table) return null;
  const { full, area } = normalizeOutcode(postcode);
  const hit =
    (full && table.find(r => r.outcode.toUpperCase() === full)) ||
    (area && table.find(r => r.outcode.toUpperCase() === area)) ||
    null;
  if (!hit) return null;
  return { designTemp: hit.designTemp, hdd: hit.hdd };
}

/* ---------------- core helpers (fallback APIs) ---------------- */
type LatLon = { lat: number; lon: number; src: 'postcodes.io' | 'nominatim' | 'latlon' };
const DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

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

async function geocodePostcode(pc: string): Promise<LatLon> {
  const url = `https://api.postcodes.io/postcodes/${encodeURIComponent(pc)}`;
  const r = await fetch(url, { cache: 'no-store' }); if (!r.ok) throw new Error(`postcodes.io ${r.status}`);
  const j = await r.json(); if (j.status !== 200 || !j.result) throw new Error('postcode not found');
  return { lat: j.result.latitude, lon: j.result.longitude, src: 'postcodes.io' };
}
async function geocodeAddress(addr: string): Promise<LatLon> {
  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(addr)}`;
  const r = await fetch(url, { headers: { 'Accept-Language': 'en-GB' }, cache: 'no-store' });
  if (!r.ok) throw new Error(`nominatim ${r.status}`);
  const a = await r.json(); if (!a.length) throw new Error('address not found');
  return { lat: +a[0].lat, lon: +a[0].lon, src: 'nominatim' };
}
async function geocodeAny(postcode: string, address: string, latlonText?: string): Promise<LatLon> {
  const ll = latlonText ? asLatLon(latlonText) : null;
  if (ll) return { ...ll, src: 'latlon' };
  const pc = toPC(postcode || '');
  if (pc) { try { return await geocodePostcode(pc); } catch { return await geocodeAddress(pc); } }
  if (!address || address.trim().length < 4) throw new Error('enter postcode or address');
  return await geocodeAddress(address);
}
async function elevation(lat: number, lon: number): Promise<{ metres: number; provider: string }> {
  try {
    const u = `https://api.open-elevation.com/api/v1/lookup?locations=${lat},${lon}`;
    const r = await fetch(u, { cache: 'no-store' });
    if (!r.ok) throw new Error('open-elevation http');
    const j = await r.json(); const v = j?.results?.[0]?.elevation;
    if (!isFinite(v)) throw new Error('open-elevation no result');
    return { metres: +v, provider: 'open-elevation' };
  } catch {
    const u2 = `https://api.opentopodata.org/v1/eudem25m?locations=${lat},${lon}`;
    const r2 = await fetch(u2, { cache: 'no-store' });
    if (!r2.ok) throw new Error('opentopodata http');
    const j2 = await r2.json(); const v2 = j2?.results?.[0]?.elevation;
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
  for (let m = 0; m < 12; m++) { const T = means[m]; const d = DAYS[m]; if (isFinite(T)) sum += Math.max(0, 15.5 - T) * d; }
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
function extractRRN(text: string): string | null {
  const m = String(text || '').match(/\b(\d{4}-\d{4}-\d{4}-\d{4}-\d{4})\b/); return m ? m[1] : null;
}

/* ---------------- UI atoms ---------------- */
function Label({ children }: { children: React.ReactNode }) {
  return <label style={{ display: 'block', fontSize: 12, color: '#555', marginBottom: 6 }}>{children}</label>;
}
function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} style={{ ...inputStyle, ...(props.style || {}) }} />;
}
function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} style={{ ...inputStyle, ...(props.style || {}) }} />;
}

/* ---------------------------------- UI ---------------------------------- */
export default function Page(): React.JSX.Element {
  const router = useRouter();

  // hydrate
  const initial = safeGet(STORAGE_KEY, null as any);
  const [reference, setReference] = useState(initial?.reference ?? '');
  const [postcode, setPostcode] = useState(initial?.postcode ?? '');
  const [country, setCountry] = useState(initial?.country ?? 'England');
  const [address, setAddress] = useState(initial?.address ?? '');
  const [epcNo, setEpcNo] = useState(initial?.epcNo ?? '');
  const [uprn, setUprn] = useState(initial?.uprn ?? '');

  const [altitude, setAltitude] = useState<number | ''>(initial?.altitude ?? 0);
  const [tex, setTex] = useState<number | ''>(initial?.tex ?? -3);
  const [hdd, setHdd] = useState<number | ''>(initial?.hdd ?? 2033);
  const meanAnnual = 10.2;

  const [dwelling, setDwelling] = useState(initial?.dwelling ?? '');
  const [attach, setAttach] = useState(initial?.attach ?? '');
  const [ageBand, setAgeBand] = useState(initial?.ageBand ?? '');
  const [occupants, setOccupants] = useState<number>(initial?.occupants ?? 2);
  const [mode, setMode] = useState(initial?.mode ?? 'Net Internal');
  const [airtight, setAirtight] = useState(initial?.airtight ?? 'Standard Method');
  const [thermalTest, setThermalTest] = useState(initial?.thermalTest ?? 'No Test Performed');

  const [climStatus, setClimStatus] = useState('');
  const [altStatus, setAltStatus] = useState('');
  const [epcPaste, setEpcPaste] = useState('');
  const [latlonOverride, setLatlonOverride] = useState('');

  const debounceClimate = useRef<number | null>(null);
  const debounceSave = useRef<number | null>(null);

  // 1) LOCAL LOOKUP on postcode change (instant)
  useEffect(() => {
    let canceled = false;
    (async () => {
      if (!postcode) return;
      const local = await lookupLocalClimate(postcode);
      if (canceled || !local) return;
      if (isFinite(local.designTemp as number)) setTex(local.designTemp!);
      if (isFinite(local.hdd as number)) setHdd(local.hdd!);
      setClimStatus('Climate from local table ✓');
    })();
    return () => { canceled = true; };
  }, [postcode]);

  // 2) Fallback: full auto climate (geocode + open-meteo) on postcode/address/altitude
  useEffect(() => {
    if (!postcode && !address) return;
    if (debounceClimate.current) window.clearTimeout(debounceClimate.current);
    debounceClimate.current = window.setTimeout(async () => {
      try {
        // If local already filled both values, skip heavy call.
        const local = await lookupLocalClimate(postcode);
        const hasLocalBoth = local && isFinite(local.designTemp as number) && isFinite(local.hdd as number);
        if (!hasLocalBoth) {
          setClimStatus('Auto climate: looking up…');
          const res = await autoClimateCalc(postcode, address, Number(altitude) || 0);
          if (!isFinite(local?.designTemp as number)) setTex(res.designTemp);
          if (!isFinite(local?.hdd as number)) setHdd(res.hdd);
          setClimStatus('Auto climate ✓');
        }
      } catch (e: any) {
        setClimStatus(`Auto climate failed: ${e?.message || e}`);
      }
    }, 700);
    return () => { if (debounceClimate.current) window.clearTimeout(debounceClimate.current); };
  }, [postcode, address, altitude]);

  // Auto-save
  const snapshot = useMemo(() => ({
    reference, postcode, country, address, epcNo, uprn,
    altitude, tex, meanAnnual, hdd, dwelling, attach, ageBand, occupants,
    mode, airtight, thermalTest,
  }), [reference, postcode, country, address, epcNo, uprn, altitude, tex, hdd, dwelling, attach, ageBand, occupants, mode, airtight, thermalTest]);

  useEffect(() => {
    if (debounceSave.current) window.clearTimeout(debounceSave.current);
    debounceSave.current = window.setTimeout(() => safeSet(STORAGE_KEY, snapshot), 300);
    return () => { if (debounceSave.current) window.clearTimeout(debounceSave.current); };
  }, [snapshot]);

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
  const onParseEpc = () => { const rrn = extractRRN(epcPaste); if (rrn) setEpcNo(rrn); };

  const onSave = () => { safeSet(STORAGE_KEY, snapshot); alert('Saved to browser (localStorage).'); };
  const onSaveContinue = () => { safeSet(STORAGE_KEY, snapshot); router.push('/ventilation'); };
  const resetAll = () => {
    setReference(''); setPostcode(''); setCountry('England'); setAddress('');
    setEpcNo(''); setUprn(''); setAltitude(0); setTex(-3); setHdd(2033);
    setDwelling(''); setAttach(''); setAgeBand(''); setOccupants(2);
    setMode('Net Internal'); setAirtight('Standard Method'); setThermalTest('No Test Performed');
    setClimStatus(''); setAltStatus(''); setLatlonOverride(''); setEpcPaste('');
    safeSet(STORAGE_KEY, {});
  };

  return (
    <main style={{ maxWidth: 1040, margin: '0 auto', padding: 24, fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif' }}>
      <h1 style={{ fontSize: 28, margin: '6px 0 12px' }}>Heat Load Calculator (MCS-style)</h1>
      <div style={{ color: '#888', fontSize: 12, marginBottom: 14 }}>
        Property → Ventilation → Heated Rooms → Building Elements → Room Elements → Results
      </div>

      <section style={card}>
        <div style={{ display: 'flex', gap: 8, marginBottom: 14, padding: 12, borderRadius: 10, background: '#f7f7f7' }}>
          <strong>Import from PropertyChecker.co.uk</strong> <span>(optional)</span>
        </div>

        <div style={grid3}>
          <div>
            <Label>Reference *</Label>
            <Input placeholder="e.g., Project ABC - v1" value={reference} onChange={(e) => setReference(e.target.value)} />
          </div>
          <div>
            <Label>Postcode *</Label>
            <Input placeholder="e.g., SS8 9HB" value={postcode} onChange={(e) => setPostcode(e.target.value)} />
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
            <div style={{ marginTop: 8 }}>
              <details>
                <summary style={{ cursor: 'pointer', color: '#333' }}>Get altitude from getthedata.com</summary>
                <div style={{ marginTop: 6, color: '#666', fontSize: 12 }}>
                  Uses postcodes.io / Nominatim and Open-Elevation (fallback OpenTopoData). You can also enter
                  <em> lat,long </em> override:
                </div>
              </details>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 8 }}>
                <button onClick={onFindAltitude} style={secondaryBtn}>Get altitude</button>
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

        <div style={{ marginTop: 18 }}>
          <h3 style={{ margin: '4px 0 8px' }}>EPC finder (from address)</h3>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8, flexWrap: 'wrap' }}>
            <a href="https://www.gov.uk/find-energy-certificate" target="_blank" rel="noreferrer">
              <button style={secondaryBtn}>Open GOV.UK EPC search →</button>
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
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 8, flexWrap: 'wrap' }}>
            <button onClick={onParseEpc} style={secondaryBtn}>Parse pasted text</button>
            <span style={{ fontFamily: 'ui-monospace', fontSize: 12 }}>Detected EPC: {epcNo || '—'}</span>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 22 }}>
          <button onClick={resetAll} style={secondaryBtn}>Reset</button>
          <button onClick={onSave} style={secondaryBtn}>Save</button>
          <button onClick={onSaveContinue} style={primaryBtn}>Save & Continue →</button>
        </div>
      </section>
    </main>
  );
}

/* ------------------------------ styles ------------------------------ */
const card: React.CSSProperties = { background: '#fff', border: '1px solid #e6e6e6', borderRadius: 14, padding: 16 };
const grid3: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 };
const grid4: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 };
const inputStyle: React.CSSProperties = {
  width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid #ddd', outline: 'none', boxSizing: 'border-box',
};
const primaryBtn: React.CSSProperties = {
  background: '#111', color: '#fff', border: '1px solid #111', padding: '12px 18px', borderRadius: 12, cursor: 'pointer',
};
const secondaryBtn: React.CSSProperties = {
  background: '#fff', color: '#111', border: '1px solid #ddd', padding: '12px 18px', borderRadius: 12, cursor: 'pointer',
};
