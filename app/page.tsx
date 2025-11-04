// app/page.tsx
'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

/* ------------ local persistence ------------ */
const STORAGE_KEY = 'heatload:property';
const lsGet = <T,>(k: string, fb: T): T => {
  if (typeof window === 'undefined') return fb;
  try { const v = localStorage.getItem(k); return v ? (JSON.parse(v) as T) : fb; } catch { return fb; }
};
const lsSet = (k: string, v: unknown) => { try { if (typeof window !== 'undefined') localStorage.setItem(k, JSON.stringify(v)); } catch {} };

/* ------------ postcode table (local json) ------------ */
type RowLite = { designTemp?: number; hdd?: number };
const localCache: { map?: Map<string, RowLite>; size?: number } = {};

const up = (s?: string) => (s || '').toUpperCase();
const fullNoSpace = (s?: string) => up(s).replace(/\s+/g, '');

function keyVariantsFromPostcode(input: string): string[] {
  const raw = fullNoSpace(input);
  if (!raw) return [];
  const m = raw.match(/^([A-Z]{1,2}\d[A-Z\d]?)(\d)([A-Z]{2})$/); // OUT + SECTOR + UNIT
  const out = m ? m[1] : '';
  const sector = m ? `${out} ${m[2]}` : '';
  const area = out.replace(/\d.*$/, '');
  const keys: string[] = [];
  keys.push(raw);                // FULL: "E16AN"
  if (sector) keys.push(sector); // "E1 6"
  if (out) keys.push(out);       // "E1"
  if (area) keys.push(area);     // "E"
  return keys;
}

async function loadLocalMap(): Promise<Map<string, RowLite> | null> {
  if (localCache.map) return localCache.map;

  // WHY: GH Pages serves under /<repo>/, so absolute "/climate/..." 404s.
  const candidates = (() => {
    const urls = new Set<string>();
    const pathname = (typeof window !== 'undefined' ? window.location.pathname : '/') || '/';
    const curDir = pathname.replace(/[^/]*$/, '');                // current dir with trailing slash
    const seg = pathname.split('/').filter(Boolean);
    const repoRoot = seg.length ? `/${seg[0]}/` : '/';            // "/repo/" for GH Pages; "/" for user pages

    urls.add(`${curDir}climate/postcode_climate.json`);           // relative (best)
    urls.add(`${repoRoot}climate/postcode_climate.json`);         // repo root
    urls.add(`/climate/postcode_climate.json`);                   // site root
    urls.add(`climate/postcode_climate.json`);                    // plain relative
    urls.add(`/postcode_climate.json`);                           // fallback

    return Array.from(urls);
  })();

  let rows: any = null;
  for (const u of candidates) {
    try { const r = await fetch(u, { cache: 'no-store' }); if (r.ok) { rows = await r.json(); break; } } catch {}
  }
  if (!rows) return null;

  const feed: any[] = Array.isArray(rows)
    ? rows
    : Object.entries(rows).map(([k, v]: any) => ({ key: k, ...(v || {}) }));

  const map = new Map<string, RowLite>();
  for (const r of feed) {
    const designTemp = Number.isFinite(+r.designTemp) ? Math.round(+r.designTemp) : undefined;
    const hdd = Number.isFinite(+r.hdd) ? Math.round(+r.hdd) : undefined;
    if (designTemp === undefined && hdd === undefined) continue;
    const keys = [
      fullNoSpace(r.postcode), fullNoSpace(r.post_code), fullNoSpace(r.key),
      up(r.sector), up(r.outcode), up(r.area),
    ].filter(Boolean) as string[];
    for (const k of keys) if (!map.has(k)) map.set(k, { designTemp, hdd });
  }

  localCache.map = map;
  localCache.size = map.size;
  return map;
}

async function lookupLocalClimate(postcode: string): Promise<{ designTemp?: number; hdd?: number; matchedKey?: string } | null> {
  const map = await loadLocalMap();
  if (!map) return null;
  for (const k of keyVariantsFromPostcode(postcode)) {
    const v = map.get(k);
    if (v) return { ...v, matchedKey: k };
  }
  return null;
}

/* ------------ geocoding & API fallback ------------ */
type LatLon = { lat: number; lon: number; src: 'postcodes.io' | 'nominatim' | 'latlon' };
const DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

const normalisePC = (s: string) => {
  const raw = String(s || '').toUpperCase().replace(/\s+/g, '');
  const m = raw.match(/^([A-Z]{1,2}\d[A-Z\d]?)(\d[A-Z]{2})$/);
  return m ? `${m[1]} ${m[2]}` : null;
};
const parseLatLon = (s: string) => {
  const m = String(s || '').trim().match(/^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/);
  if (!m) return null;
  const lat = +m[1], lon = +m[2];
  if (!isFinite(lat) || !isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  return { lat, lon };
};

async function geocodePostcode(pc: string): Promise<LatLon> {
  const r = await fetch(`https://api.postcodes.io/postcodes/${encodeURIComponent(pc)}`, { cache: 'no-store' });
  if (!r.ok) throw new Error(`postcodes.io ${r.status}`);
  const j = await r.json();
  if (j.status !== 200 || !j.result) throw new Error('postcode not found');
  return { lat: j.result.latitude, lon: j.result.longitude, src: 'postcodes.io' };
}
async function geocodeAddress(addr: string): Promise<LatLon> {
  const r = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(addr)}`,
    { headers: { 'Accept-Language': 'en-GB' }, cache: 'no-store' });
  if (!r.ok) throw new Error(`nominatim ${r.status}`);
  const a = await r.json();
  if (!a.length) throw new Error('address not found');
  return { lat: +a[0].lat, lon: +a[0].lon, src: 'nominatim' };
}
async function geocodeAny(postcode: string, address: string, latlonText?: string): Promise<LatLon> {
  const ll = latlonText ? parseLatLon(latlonText) : null;
  if (ll) return { ...ll, src: 'latlon' };
  const pc = normalisePC(postcode || '');
  if (pc) { try { return await geocodePostcode(pc); } catch { return await geocodeAddress(pc); } }
  if (!address || address.trim().length < 4) throw new Error('enter postcode or address');
  return await geocodeAddress(address);
}
async function elevation(lat: number, lon: number) {
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
async function fetchHDD(lat: number, lon: number): Promise<number> {
  const r = await fetch(
    `https://climate-api.open-meteo.com/v1/degree-days?latitude=${lat}&longitude=${lon}&start_year=1991&end_year=2020&base_temperature=15.5&degree_day_type=heating`,
    { cache: 'no-store' }
  );
  if (!r.ok) throw new Error('degree-days http');
  const j = await r.json();
  const arr: number[] = j?.data?.map((x: any) => x.heating_degree_days) || [];
  if (!arr.length) throw new Error('degree-days empty');
  return Math.round(arr.reduce((a, b) => a + b, 0) / arr.length);
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
  const DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  let sum = 0;
  for (let m = 0; m < 12; m++) if (isFinite(means[m])) sum += Math.max(0, 15.5 - means[m]) * DAYS[m];
  return Math.round(sum);
}
function designTempFromDJF(mins: number[], altitudeMeters: number): number | null {
  const djf = [mins[11], mins[0], mins[1]].filter((v) => isFinite(v));
  if (!djf.length) return null;
  const base = Math.min(...djf);
  return Math.round(base - 2 - 0.0065 * (Number(altitudeMeters) || 0));
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
  const m = String(text || '').match(/\b(\d{4}-\d{4}-\d{4}-\d{4}-\d{4})\b/);
  return m ? m[1] : null;
}

/* ------------ small UI atoms ------------ */
const Badge = ({ label, tone = 'neutral' }: { label: string; tone?: 'neutral' | 'success' | 'warning' }) => (
  <span
    style={{
      fontSize: 11, padding: '3px 8px', borderRadius: 999, border: '1px solid',
      borderColor: tone === 'success' ? '#19a34a' : tone === 'warning' ? '#b76e00' : '#bbb',
      color: tone === 'success' ? '#0c7a35' : tone === 'warning' ? '#7a4b00' : '#666',
      background: tone === 'success' ? '#e8f7ee' : tone === 'warning' ? '#fff4e0' : '#f3f3f3',
      display: 'inline-block',
    }}
  >{label}</span>
);
const Label = ({ children }: { children: React.ReactNode }) => <label style={{ display: 'block', fontSize: 12, color: '#555', marginBottom: 6 }}>{children}</label>;
const Input = (p: React.InputHTMLAttributes<HTMLInputElement>) => <input {...p} style={{ ...inputStyle, ...(p.style || {}) }} />;
const Select = (p: React.SelectHTMLAttributes<HTMLSelectElement>) => <select {...p} style={{ ...inputStyle, ...(p.style || {}) }} />;

/* ------------ page ------------ */
export default function Page(): React.JSX.Element {
  const router = useRouter();
  const initial = lsGet(STORAGE_KEY, null as any);

  // Property
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
  const [attach, setAttach] = useState(initial?.attach ?? '');
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
  const [source, setSource] = useState<'Local table' | 'API fallback' | 'Manual override' | 'No table' | ''>(initial?.source ?? '');
  const [debug, setDebug] = useState({ tableSize: localCache.size ?? 0, matchedKey: '' });

  const debounceClimate = useRef<number | null>(null);
  const debounceSave = useRef<number | null>(null);

  // Local table try-first on postcode change
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const map = await loadLocalMap();
      if (cancelled) return;
      setDebug((d) => ({ ...d, tableSize: map?.size ?? 0 }));
      if (!postcode) {
        setSource(map ? '' : 'No table');
        return;
      }
      if (map) {
        const hit = await lookupLocalClimate(postcode);
        if (cancelled) return;
        if (hit) {
          if (isFinite(hit.designTemp as number)) setTex(hit.designTemp!);
          if (isFinite(hit.hdd as number)) setHdd(hit.hdd!);
          setClimStatus(`Local table ✓ matched: ${hit.matchedKey}`);
          setSource('Local table');
          setDebug((d) => ({ ...d, matchedKey: hit.matchedKey || '' }));
        } else {
          setDebug((d) => ({ ...d, matchedKey: '' }));
        }
      } else {
        setSource('No table');
        setClimStatus('No local climate table found.');
      }
    })();
    return () => { cancelled = true; };
  }, [postcode]);

  // Fallback API if local missing any needed value
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
          setSource((s) => (s === 'No table' ? 'No table' : 'API fallback'));
        }
      } catch (e: any) {
        setClimStatus(`Auto climate failed: ${e?.message || e}`);
      }
    }, 600);
    return () => { if (debounceClimate.current) window.clearTimeout(debounceClimate.current); };
  }, [postcode, address, altitude]);

  // Manual override
  const onManualTex = (v: string) => { setTex(v === '' ? '' : Number(v)); setSource('Manual override'); };
  const onManualHdd = (v: string) => { setHdd(v === '' ? '' : Number(v)); setSource('Manual override'); };

  // Persist
  const snapshot = useMemo(
    () => ({
      reference, postcode, country, address, epcNo, uprn,
      altitude, tex, meanAnnual, hdd,
      dwelling, attach, ageBand, occupants, mode, airtight, thermalTest, source,
    }),
    [reference, postcode, country, address, epcNo, uprn, altitude, tex, hdd, dwelling, attach, ageBand, occupants, mode, airtight, thermalTest, source]
  );
  useEffect(() => {
    if (debounceSave.current) window.clearTimeout(debounceSave.current);
    debounceSave.current = window.setTimeout(() => lsSet(STORAGE_KEY, snapshot), 300);
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
    } catch (e: any) {
      setAltStatus(`Failed: ${e?.message || String(e)}`);
    }
  };

  // EPC parse
  const onParseEpc = () => { const rrn = extractRRN(epcPaste); if (rrn) setEpcNo(rrn); };

  const onSave = () => { lsSet(STORAGE_KEY, snapshot); alert('Saved to browser (localStorage).'); };
  const onSaveContinue = () => { lsSet(STORAGE_KEY, snapshot); router.push('/ventilation'); };
  const resetAll = () => {
    setReference(''); setPostcode(''); setCountry('England'); setAddress('');
    setEpcNo(''); setUprn(''); setAltitude(0); setTex(-3); setHdd(2033);
    setDwelling(''); setAttach(''); setAgeBand(''); setOccupants(2);
    setMode('Net Internal'); setAirtight('Standard Method'); setThermalTest('No Test Performed');
    setClimStatus(''); setAltStatus(''); setLatlonOverride(''); setEpcPaste(''); setSource('');
    lsSet(STORAGE_KEY, {});
  };

  const sourceTone = source === 'Local table' ? 'success' : source === 'Manual override' ? 'warning' : 'neutral';

  return (
    <main style={{ maxWidth: 1040, margin: '0 auto', padding: 24, fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif' }}>
      <h1 style={{ fontSize: 28, margin: '6px 0 12px' }}>Heat Load Calculator (MCS-style)</h1>
      <div style={{ color: '#888', fontSize: 12, marginBottom: 14 }}>Property → Ventilation → Heated Rooms → Building Elements → Room Elements → Results</div>

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
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <Label>Postcode *</Label>
              {source && <Badge label={`${source}${localCache.size ? ` (${localCache.size})` : ''}`} tone={sourceTone as any} />}
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
                <div style={{ marginTop: 6, color: '#666', fontSize: 12 }}>Uses postcodes.io / Nominatim and Open-Elevation (fallback OpenTopoData). Enter lat,long override if needed.</div>
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

        <div style={{ marginTop: 8, fontSize: 12, color: '#666' }}>
          {climStatus}
          {localCache.size !== undefined && (
            <span style={{ marginLeft: 8, color: '#999' }}>
              • table size: {localCache.size ?? 0} {debug.matchedKey ? `• matched: ${debug.matchedKey}` : ''}
            </span>
          )}
        </div>

        <h3 style={{ marginTop: 18, marginBottom: 8 }}>Property Details</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
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
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
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

        <div style={{ marginTop: 18 }}>
          <h3 style={{ margin: '4px 0 8px' }}>EPC finder (from address)</h3>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
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
            style={{ width: '100%', ...inputStyle, height: 140, resize: 'vertical' as const }}
          />
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 8 }}>
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

/* ------------ styles ------------ */
const card: React.CSSProperties = { background: '#fff', border: '1px solid #e6e6e6', borderRadius: 14, padding: 16 };
const inputStyle: React.CSSProperties = { width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid #ddd', outline: 'none', boxSizing: 'border-box' };
const primaryBtn: React.CSSProperties = { background: '#111', color: '#fff', border: '1px solid #111', padding: '12px 18px', borderRadius: 12, cursor: 'pointer' };
const secondaryBtn: React.CSSProperties = { background: '#fff', color: '#111', border: '1px solid #ddd', padding: '12px 18px', borderRadius: 12, cursor: 'pointer' };
