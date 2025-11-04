// app/page.tsx
'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

/* ---------------- storage helpers ---------------- */
const STORAGE_KEY = 'heatload:property';
const safeGet = <T,>(k: string, fb: T): T => {
  if (typeof window === 'undefined') return fb;
  try { const v = localStorage.getItem(k); return v ? JSON.parse(v) as T : fb; } catch { return fb; }
};
const safeSet = (k: string, v: unknown) => { if (typeof window !== 'undefined') try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };

/* ---------------- postcode table (accepts full/sector/outcode/area) ---------------- */
type ClimateRow = {
  // accepts any of the following (strings), exporter will fill at least one:
  postcode?: string; post_code?: string; key?: string;
  sector?: string; outcode?: string; area?: string;
  designTemp?: number; hdd?: number;
};
type RowLite = { designTemp?: number; hdd?: number };
const localCache: { map?: Map<string, RowLite> } = {};

/** Normalise: remove spaces & uppercase */
const up = (s?: string) => (s || '').toUpperCase();
/** Build key variants for a UK postcode string */
function keyVariantsFromPostcode(input: string): string[] {
  const raw = up(input).replace(/\s+/g, '');
  if (!raw) return [];
  // parse outward/inward, sector, area
  const m = raw.match(/^([A-Z]{1,2}\d[A-Z\d]?)(\d)([A-Z]{2})$/); // OUT + SECTOR + UNIT
  const out = m ? m[1] : '';               // e.g. N9
  const sector = m ? `${out} ${m[2]}` : ''; // e.g. "N9 8"
  const area = out.replace(/\d.*$/, '');    // e.g. N
  const keys: string[] = [];
  keys.push(raw);             // FULL: "N98AN"
  if (sector) keys.push(sector); // "N9 8"
  if (out) keys.push(out);    // "N9"
  if (area) keys.push(area);  // "N"
  return keys;
}

/** Load JSON and build a lookup map with many aliases */
async function loadLocalMap(): Promise<Map<string, RowLite> | null> {
  if (localCache.map) return localCache.map;
  try {
    const r = await fetch('/climate/postcode_climate.json', { cache: 'force-cache' });
    if (!r.ok) return null;
    const rows = await r.json() as ClimateRow[] | Record<string, any>;
    const map = new Map<string, RowLite>();

    const feed: ClimateRow[] = Array.isArray(rows)
      ? rows
      : Object.entries(rows).map(([k, v]: any) => ({ key: k, ...(v || {}) }));

    for (const r of feed) {
      const val: RowLite = {};
      if (isFinite(r.designTemp as number)) val.designTemp = Math.round(r.designTemp as number);
      if (isFinite(r.hdd as number)) val.hdd = Math.round(r.hdd as number);

      const possibleKeys = [
        up(r.postcode).replace(/\s+/g, ''),
        up(r.post_code).replace(/\s+/g, ''),
        up(r.key).replace(/\s+/g, ''),

        up(r.sector),                // keep space form "N9 8" if provided
        up(r.outcode),
        up(r.area)
      ].filter(Boolean) as string[];

      for (const k of possibleKeys) if (k && (val.designTemp !== undefined || val.hdd !== undefined)) {
        if (!map.has(k)) map.set(k, val);
      }
    }
    localCache.map = map;
    return map;
  } catch { return null; }
}

/** Try: FULL -> SECTOR -> OUTCODE -> AREA */
async function lookupLocalClimate(postcode: string): Promise<{ designTemp?: number; hdd?: number; matchedKey?: string } | null> {
  const map = await loadLocalMap();
  if (!map) return null;
  const keys = keyVariantsFromPostcode(postcode);
  for (const k of keys) {
    const v = map.get(k);
    if (v) return { ...v, matchedKey: k };
  }
  return null;
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
  const ll = latlonText ? asLatLon(latlonText) : null; if (ll) return { ...ll, src: 'latlon' };
  const pc = toPC(postcode || '');
  if (pc) { try { return await geocodePostcode(pc); } catch { return await geocodeAddress(pc); } }
  if (!address || address.trim().length < 4) throw new Error('enter postcode or address');
  return await geocodeAddress(address);
}
async function elevation(lat: number, lon: number) {
  try {
    const r = await fetch(`https://api.open-elevation.com/api/v1/lookup?locations=${lat},${lon}`, { cache: 'no-store' });
    if (!r.ok) throw new Error('open-elevation http'); const j = await r.json();
    const v = j?.results?.[0]?.elevation; if (!isFinite(v)) throw new Error('open-elevation no result');
    return { metres: +v, provider: 'open-elevation' };
  } catch {
    const r2 = await fetch(`https://api.opentopodata.org/v1/eudem25m?locations=${lat},${lon}`, { cache: 'no-store' });
    if (!r2.ok) throw new Error('opentopodata http'); const j2 = await r2.json();
    const v2 = j2?.results?.[0]?.elevation; if (!isFinite(v2)) throw new Error('opentopodata no result');
    return { metres: +v2, provider: 'opentopodata:eudem25m' };
  }
}
async function fetchHDD(lat: number, lon: number): Promise<number> {
  const r = await fetch(
    `https://climate-api.open-meteo.com/v1/degree-days?latitude=${lat}&longitude=${lon}&start_year=1991&end_year=2020&base_temperature=15.5&degree_day_type=heating`,
    { cache: 'no-store' }
  );
  if (!r.ok) throw new Error('degree-days http');
  const j = await r.json();
  const arr: number[] = j?.data?.map((x: any) => x.heating_degree_days) || [];
  if (!arr.length) throw new Error('degree-days empty');
  const avg = arr.reduce((a, b) => a + b, 0) / arr.length;
  return Math.round(avg);
}
async function fetchMonthlyNormals(lat: number, lon: number) {
  const r = await fetch(
    `https://climate-api.open-meteo.com/v1/climate?latitude=${lat}&longitude=${lon}&start_year=1991&end_year=2020&models=ERA5&monthly=temperature_2m_mean,temperature_2m_min`,
    { cache: 'no-store' }
  );
  if (!r.ok) throw new Error('monthly climate http');
  const j = await r.json();
  const mean: number[] = j?.monthly?.temperature_2m_mean || [];
  const min: number[] = j?.monthly?.temperature_2m_min || [];
  if (mean.length < 12 || min.length < 12) throw new Error('monthly arrays incomplete');
  return { mean, min };
}
function hddFromMeans(means: number[]) {
  let sum = 0;
  for (let m = 0; m < 12; m++) { const T = means[m]; const d = DAYS[m]; if (isFinite(T)) sum += Math.max(0, 15.5 - T) * d; }
  return Math.round(sum);
}
function designTempFromDJF(mins: number[], altitudeMeters: number): number | null {
  const i = [11, 0, 1], vals = i.map(k => mins[k]).filter(v => isFinite(v));
  if (!vals.length) return null;
  const base = Math.min(...vals), safety = base - 2;
  return Math.round(safety - 0.0065 * (Number(altitudeMeters) || 0));
}
function designTempRegionalFallback(lat: number, altitudeMeters: number): number {
  let base = lat < 51.5 ? -2 : lat < 52.5 ? -3 : lat < 53.5 ? -4 : lat < 55 ? -5 : -6;
  return Math.round(base - 0.0065 * (Number(altitudeMeters) || 0));
}
async function autoClimateCalc(pc: string, addr: string, alt: number) {
  const geo = await geocodeAny(pc, addr);
  let hdd: number | undefined;
  try { hdd = await fetchHDD(geo.lat, geo.lon); } catch {}
  let design: number | null = null;
  try {
    const normals = await fetchMonthlyNormals(geo.lat, geo.lon);
    if (!isFinite(hdd as number)) hdd = hddFromMeans(normals.mean);
    design = designTempFromDJF(normals.min, alt);
  } catch {}
  if (!isFinite(hdd as number)) hdd = 2033;
  if (!isFinite(design as number)) design = designTempRegionalFallback(geo.lat, alt);
  return { hdd: hdd!, designTemp: design! };
}
function extractRRN(text: string): string | null {
  const m = String(text || '').match(/\b(\d{4}-\d{4}-\d{4}-\d{4}-\d{4})\b/); return m ? m[1] : null;
}

/* ---------------- UI atoms ---------------- */
const Badge = ({ label, tone = 'neutral' }: { label: string; tone?: 'neutral'|'success'|'warning' }) => (
  <span style={{
    fontSize: 11, padding: '3px 8px', borderRadius: 999, border: '1px solid',
    borderColor: tone === 'success' ? '#19a34a' : tone === 'warning' ? '#b76e00' : '#bbb',
    color: tone === 'success' ? '#0c7a35' : tone === 'warning' ? '#7a4b00' : '#666',
    background: tone === 'success' ? '#e8f7ee' : tone === 'warning' ? '#fff4e0' : '#f3f3f3',
    display: 'inline-block'
  }}>{label}</span>
);
const Label = ({ children }: { children: React.ReactNode }) =>
  <label style={{ display: 'block', fontSize: 12, color: '#555', marginBottom: 6 }}>{children}</label>;
const Input = (p: React.InputHTMLAttributes<HTMLInputElement>) => <input {...p} style={{ ...inputStyle, ...(p.style||{}) }} />;
const Select = (p: React.SelectHTMLAttributes<HTMLSelectElement>) => <select {...p} style={{ ...inputStyle, ...(p.style||{}) }} />;

/* ---------------- Page ---------------- */
export default function Page(): React.JSX.Element {
  const router = useRouter();
  const initial = safeGet(STORAGE_KEY, null as any);

  // Property info
  const [reference, setReference] = useState(initial?.reference ?? '');
  const [postcode, setPostcode] = useState(initial?.postcode ?? '');
  const [country, setCountry] = useState(initial?.country ?? 'England');
  const [address, setAddress] = useState(initial?.address ?? '');
  const [epcNo, setEpcNo] = useState(initial?.epcNo ?? '');
  const [uprn, setUprn] = useState(initial?.uprn ?? '');

  // Climate
  const [altitude, setAltitude] = useState<number | ''>(initial?.altitude ?? 0);
  const [tex, setTex] = useState<number | ''>(initial?.tex ?? -3);
  const [hdd, setHdd] = useState<number | ''>(initial?.hdd ?? 2033);
  const meanAnnual = 10.2;

  // Details
  const [dwelling, setDwelling] = useState(initial?.dwelling ?? '');
  the const [attach, setAttach] = useState(initial?.attach ?? ''); // NOTE: keep fields intact
  const [ageBand, setAgeBand] = useState(initial?.ageBand ?? '');
  const [occupants, setOccupants] = useState<number>(initial?.occupants ?? 2);
  const [mode, setMode] = useState(initial?.mode ?? 'Net Internal');
  const [airtight, setAirtight] = useState(initial?.airtight ?? 'Standard Method');
  const [thermalTest, setThermalTest] = useState(initial?.thermalTest ?? 'No Test Performed');

  // Status
  const [climStatus, setClimStatus] = useState('');
  const [altStatus, setAltStatus] = useState('');
  const [epcPaste, setEpcPaste] = useState('');
  const [latlonOverride, setLatlonOverride] = useState('');
  const [source, setSource] = useState<'Local table' | 'API fallback' | 'Manual override' | ''>(initial?.source ?? '');

  const debounceClimate = useRef<number | null>(null);
  const debounceSave = useRef<number | null>(null);

  /* LOCAL lookup first (matches FULL, SECTOR, OUTCODE, AREA) */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!postcode) return;
      const hit = await lookupLocalClimate(postcode);
      if (cancelled || !hit) return;
      if (isFinite(hit.designTemp as number)) setTex(hit.designTemp!);
      if (isFinite(hit.hdd as number)) setHdd(hit.hdd!);
      setClimStatus(`Climate from local table ✓ (${hit.matchedKey})`);
      setSource('Local table');
    })();
    return () => { cancelled = true; };
  }, [postcode]);

  /* Fallback to API if any missing */
  useEffect(() => {
    if (!postcode && !address) return;
    if (debounceClimate.current) window.clearTimeout(debounceClimate.current);
    debounceClimate.current = window.setTimeout(async () => {
      try {
        const hit = await lookupLocalClimate(postcode);
        const needDesign = !(hit && isFinite(hit.designTemp as number));
        const needHdd = !(hit && isFinite(hit.hdd as number));
        if (needDesign || needHdd) {
          setClimStatus('Auto climate: looking up…');
          const res = await autoClimateCalc(postcode, address, Number(altitude) || 0);
          if (needDesign) setTex(res.designTemp);
          if (needHdd) setHdd(res.hdd);
          setClimStatus('Auto climate ✓');
          setSource('API fallback');
        }
      } catch (e: any) { setClimStatus(`Auto climate failed: ${e?.message || e}`); }
    }, 600);
    return () => { if (debounceClimate.current) window.clearTimeout(debounceClimate.current); };
  }, [postcode, address, altitude]);

  // Manual override badge
  const onManualTex = (v: string) => { setTex(v === '' ? '' : Number(v)); setSource('Manual override'); };
  const onManualHdd = (v: string) => { setHdd(v === '' ? '' : Number(v)); setSource('Manual override'); };

  // Auto-save
  const snapshot = useMemo(() => ({
    reference, postcode, country, address, epcNo, uprn,
    altitude, tex, meanAnnual, hdd, dwelling, attach, ageBand, occupants,
    mode, airtight, thermalTest, source
  }), [reference, postcode, country, address, epcNo, uprn, altitude, tex, hdd, dwelling, attach, ageBand, occupants, mode, airtight, thermalTest, source]);
  useEffect(() => {
    if (debounceSave.current) window.clearTimeout(debounceSave.current);
    debounceSave.current = window.setTimeout(() => safeSet(STORAGE_KEY, snapshot), 300);
    return () => { if (debounceSave.current) window.clearTimeout(debounceSave.current); };
  }, [snapshot]);

  // Altitude
  const onFindAltitude = async () => {
    try {
      setAltStatus('Looking up…');
      const geo = await geocodeAny(postcode, address, latlonOverride);
      const elev = await elevation(geo.lat, geo.lon);
      setAltitude(Math.round(elev.metres));
      setAltStatus(`Found ${Math.round(elev.metres)} m • ${elev.provider}`);
    } catch (e: any) { setAltStatus(`Failed: ${e?.message || String(e)}`); }
  };

  const onParseEpc = () => { const rrn = extractRRN(epcPaste); if (rrn) setEpcNo(rrn); };
  const onSave = () => { safeSet(STORAGE_KEY, snapshot); alert('Saved to browser (localStorage).'); };
  const onSaveContinue = () => { safeSet(STORAGE_KEY, snapshot); router.push('/ventilation'); };
  const resetAll = () => {
    setReference(''); setPostcode(''); setCountry('England'); setAddress('');
    setEpcNo(''); setUprn(''); setAltitude(0); setTex(-3); setHdd(2033);
    setDwelling(''); setAttach(''); setAgeBand(''); setOccupants(2);
    setMode('Net Internal'); setAirtight('Standard Method'); setThermalTest('No Test Performed');
    setClimStatus(''); setAltStatus(''); setLatlonOverride(''); setEpcPaste(''); setSource('');
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

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
          <div>
            <Label>Reference *</Label>
            <Input placeholder="e.g., Project ABC - v1" value={reference} onChange={(e) => setReference(e.target.value)} />
          </div>

          <div>
            {/* Example postcode changed to a random London one */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <Label>Postcode *</Label>
              {source && <Badge label={source} tone={source === 'Local table' ? 'success' : source === 'API fallback' ? 'neutral' : 'warning'} />}
            </div>
            <Input placeholder="e.g., E1 6AN" value={postcode} onChange={(e) => setPostcode(e.target.value)} />
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
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
          <div>
            <Label>Altitude (m)</Label>
            <Input type="number" value={altitude} onChange={(e) => setAltitude(e.target.value === '' ? '' : Number(e.target.value))} />
            <div style={{ marginTop: 8 }}>
              <details>
                <summary style={{ cursor: 'pointer', color: '#333' }}>Get altitude from getthedata.com</summary>
                <div style={{ marginTop: 6, color: '#666', fontSize: 12 }}>
                  Uses postcodes.io / Nominatim and Open-Elevation (fallback OpenTopoData). You can also enter <em>lat,long</em>:
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
            <Input type="number" value={tex} onChange={(e) => onManualTex(e.target.value)} />
          </div>

          <div>
            <Label>Mean Annual External Air Temp (°C)</Label>
            <Input type="number" value={meanAnnual} readOnly />
          </div>

          <div>
            <Label>Heating Degree Days (HDD, base 15.5°C)</Label>
            <Input type="number" value={hdd} onChange={(e) => onManualHdd(e.target.value)} />
          </div>
        </div>

        <div style={{ marginTop: 12, fontSize: 12, color: '#666' }}>{climStatus}</div>

        <h3 style={{ marginTop: 18, marginBottom: 8 }}>Property Details</h3>
        {/* ... rest of your form unchanged ... */}

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 22 }}>
          <button onClick={resetAll} style={secondaryBtn}>Reset</button>
          <button onClick={onSave} style={secondaryBtn}>Save</button>
          <button onClick={onSaveContinue} style={primaryBtn}>Save & Continue →</button>
        </div>
      </section>
    </main>
  );
}

/* ---------------- styles ---------------- */
const card: React.CSSProperties = { background: '#fff', border: '1px solid #e6e6e6', borderRadius: 14, padding: 16 };
const inputStyle: React.CSSProperties = { width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid #ddd', outline: 'none', boxSizing: 'border-box' };
const primaryBtn: React.CSSProperties = { background: '#111', color: '#fff', border: '1px solid '#111', padding: '12px 18px', borderRadius: 12, cursor: 'pointer' };
const secondaryBtn: React.CSSProperties = { background: '#fff', color: '#111', border: '1px solid #ddd', padding: '12px 18px', borderRadius: 12, cursor: 'pointer' };
