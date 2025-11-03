// app/page.tsx
'use client';

import React, { useState } from 'react';

/* ---------------- helpers (single-file, client only) ---------------- */
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
    catch { return await geocodeAddress(pc); } // fallback if throttled/invalid
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

/* ----- fallback design temperature when normals aren't available ----- */
function designTempRegionalFallback(lat: number, lon: number, altitudeMeters: number): number {
  // Simple UK bands by latitude (approx), then altitude correction (why: robust offline fallback).
  let base: number;
  if (lat < 51.5) base = -2;
  else if (lat < 52.5) base = -3;
  else if (lat < 53.5) base = -4;
  else if (lat < 55.0) base = -5;
  else base = -6;
  const corrected = base - 0.0065 * (Number(altitudeMeters) || 0);
  return Math.round(corrected);
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

async function autoClimateCalc(postcode: string, address: string, altitudeMeters: number) {
  const geo = await geocodeAny(postcode, address);
  let hdd: number | undefined;
  try { hdd = await fetchHDD(geo.lat, geo.lon); } catch {}

  let designTemp: number | null = null;
  try {
    const normals = await fetchMonthlyNormals(geo.lat, geo.lon);
    if (!isFinite(hdd as number)) hdd = hddFromMeans(normals.mean);
    designTemp = designTempFromDJF(normals.min, altitudeMeters);
  } catch {
    // ignore; we'll use regional fallback below
  }

  if (!isFinite(hdd as number)) hdd = 2033; // UK typical fallback
  if (!isFinite(designTemp as number)) {
    designTemp = designTempRegionalFallback(geo.lat, geo.lon, altitudeMeters);
  }

  return { hdd: hdd!, designTemp: designTemp!, lat: geo.lat, lon: geo.lon };
}

function extractRRN(text: string): string | null {
  const m = String(text || '').match(/\b(\d{4}-\d{4}-\d{4}-\d{4}-\d{4})\b/);
  return m ? m[1] : null;
}

/* --------- Property age band (guess from EPC text / heuristics) --------- */
const AGE_BANDS = [
  'pre-1900', '1900-1929', '1930-1949', '1950-1966',
  '1967-1975', '1976-1982', '1983-1990', '1991-1995',
  '1996-2002', '2003-2006', '2007-2011', '2012-present'
] as const;
type AgeBand = typeof AGE_BANDS[number];

function extractAgeBand(epcText: string, address: string): AgeBand | null {
  const t = String(epcText || '').replace(/\s+/g, ' ');
  // EPC official label
  const m1 = t.match(/Construction age band\s*[:\-]?\s*([A-Za-z0-9\- ]{4,20})/i);
  if (m1) {
    const norm = m1[1].toLowerCase();
    for (const b of AGE_BANDS) if (norm.includes(b.replace(/_/g, ''))) return b;
    // Map common EPC words to bands
    if (/before\s*1900|pre\s*1900/i.test(norm)) return 'pre-1900';
    if (/1900-1929/i.test(norm)) return '1900-1929';
    if (/1930-1949/i.test(norm)) return '1930-1949';
    if (/1950-1966/i.test(norm)) return '1950-1966';
    if (/1967-1975/i.test(norm)) return '1967-1975';
    if (/1976-1982/i.test(norm)) return '1976-1982';
    if (/1983-1990/i.test(norm)) return '1983-1990';
    if (/1991-1995/i.test(norm)) return '1991-1995';
    if (/1996-2002/i.test(norm)) return '1996-2002';
    if (/2003-2006/i.test(norm)) return '2003-2006';
    if (/2007-2011/i.test(norm)) return '2007-2011';
    if (/2012|present|after\s*2012|2013\+?/i.test(norm)) return '2012-present';
  }
  const m2 = t.match(/Built (?:in|between)\s*([0-9]{4}\s*(?:-|to)\s*[0-9]{4}|before\s*1900|after\s*2012)/i);
  if (m2) {
    const s = m2[1];
    if (/before\s*1900/i.test(s)) return 'pre-1900';
    const mm = s.match(/(\d{4}).*?(\d{4})/);
    if (mm) {
      const y1 = +mm[1], y2 = +mm[2];
      const yr = Math.round((y1 + y2) / 2);
      return yearToBand(yr);
    }
  }
  // Heuristics on address keywords (very rough; editable afterward)
  const a = String(address || '').toLowerCase();
  if (/apartment|flat|maisonette/.test(a)) return '1967-1995' as any;
  if (/terrace|row/.test(a)) return '1900-1949' as any;
  if (/new build|estate|drive|close|cul-de-sac|way/.test(a)) return '1996-2002';
  return null;
}
function yearToBand(y: number): AgeBand {
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

/* ------------------------------- UI ------------------------------- */
function AutoAltitude({
  postcode, address, onAltitude,
}: { postcode: string; address: string; onAltitude: (m: number) => void }) {
  const [latlonOverride, setLatlonOverride] = useState('');
  const [status, setStatus] = useState('');
  const run = async () => {
    try {
      setStatus('Looking up…');
      const geo = await geocodeAny(postcode, address, latlonOverride);
      const elev = await elevation(geo.lat, geo.lon);
      onAltitude(Math.round(elev.metres));
      setStatus(`${Math.round(elev.metres)} m • geo:${geo.src} • elev:${elev.provider} @ ${geo.lat.toFixed(5)},${geo.lon.toFixed(5)}`);
    } catch (e: any) {
      setStatus(`Failed: ${e?.message || String(e)}`);
    }
  };
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 6, flexWrap: 'wrap' }}>
      <button onClick={run}>Auto: Find altitude</button>
      <input
        placeholder="(optional) lat,long e.g. 51.5,-0.12"
        value={latlonOverride}
        onChange={(e) => setLatlonOverride(e.target.value)}
        style={{ minWidth: 260 }}
      />
      <span style={{ color: '#555', fontSize: 12 }}>{status}</span>
    </div>
  );
}

export default function Page() {
  const [reference, setReference] = useState('');
  const [postcode, setPostcode] = useState('');
  const [address, setAddress] = useState('');
  const [epcNo, setEpcNo] = useState('');
  const [altitude, setAltitude] = useState<number | ''>(0);
  const [tex, setTex] = useState<number | ''>('');
  const [hdd, setHdd] = useState<number | ''>('');
  const [climStatus, setClimStatus] = useState('');
  const [epcPaste, setEpcPaste] = useState('');
  const [epcDbg, setEpcDbg] = useState('—');
  const [ageBand, setAgeBand] = useState<AgeBand | ''>('');

  const onClimate = async () => {
    try {
      setClimStatus('Looking up…');
      const res = await autoClimateCalc(postcode, address, Number(altitude) || 0);
      setHdd(res.hdd);
      setTex(res.designTemp);
      setClimStatus(`OK • HDD=${res.hdd}, DesignT=${res.designTemp}°C @ ${res.lat.toFixed(4)},${res.lon.toFixed(4)}`);
    } catch (e: any) {
      setClimStatus(`Failed: ${e?.message || String(e)}`);
    }
  };
  const onParseEpc = () => {
    const rrn = extractRRN(epcPaste);
    setEpcDbg(rrn || 'not found');
    if (rrn) setEpcNo(rrn);
  };
  const onGuessAge = () => {
    const g = extractAgeBand(epcPaste, address);
    setAgeBand((g as AgeBand) || '');
  };

  return (
    <main style={{ maxWidth: 1100, margin: '0 auto', padding: 20, fontFamily: 'system-ui' }}>
      <h1 style={{ margin: 0, fontSize: 22 }}>Heat Demand Calculator (MCS-style)</h1>
      <p style={{ color: '#555', marginTop: 4, fontSize: 12 }}>
        Property → Ventilation → Heated Rooms → Building Elements → Room Elements → Results
      </p>

      <section style={card}>
        <h2>Property Information</h2>

        <div style={grid3}>
          <div>
            <label>Reference *</label>
            <input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Project ref" />
          </div>
          <div>
            <label>Postcode *</label>
            <input value={postcode} onChange={(e) => setPostcode(e.target.value)} placeholder="SS8 9HB" />
          </div>
          <div>
            <label>EPC Number *</label>
            <input value={epcNo} onChange={(e) => setEpcNo(e.target.value)} placeholder="1234-5678-9012-3456-7890" />
          </div>
        </div>

        <div style={{ ...grid3, marginTop: 8 }}>
          <div>
            <label>Address</label>
            <input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="10 Example Rd, Town" />
          </div>
          <div>
            <label>Property Age Band</label>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <select value={ageBand} onChange={(e) => setAgeBand(e.target.value as AgeBand)}>
                <option value="">— select —</option>
                {AGE_BANDS.map((b) => (<option key={b} value={b}>{b}</option>))}
              </select>
              <button onClick={onGuessAge}>Smart guess</button>
              <span style={{ color: '#666', fontSize: 12 }}>Editable override</span>
            </div>
          </div>
          <div>
            <label>UPRN (optional)</label>
            <input />
          </div>
        </div>

        <h3 style={{ marginTop: 16 }}>Location & Climate</h3>
        <div style={grid4}>
          <div>
            <label>Altitude (m)</label>
            <input
              type="number"
              value={altitude}
              onChange={(e) => setAltitude(e.target.value === '' ? '' : Number(e.target.value))}
            />
            <AutoAltitude postcode={postcode} address={address} onAltitude={(m) => setAltitude(Math.round(m))} />
          </div>
          <div>
            <label>Design External Air Temp (°C)</label>
            <input type="number" value={tex} onChange={(e) => setTex(e.target.value === '' ? '' : Number(e.target.value))} />
          </div>
          <div>
            <label>Mean Annual External Air Temp (°C)</label>
            <input type="number" value={10.2} readOnly />
          </div>
          <div>
            <label>Heating Degree Days (base 15.5°C)</label>
            <input type="number" value={hdd} onChange={(e) => setHdd(e.target.value === '' ? '' : Number(e.target.value))} />
          </div>
        </div>

        <div style={lightCard}>
          <h3>Auto climate from Postcode/Address</h3>
          <div style={row}>
            <button onClick={onClimate}>Auto: Fill Design Temp & HDD</button>
            <span style={{ color: '#666', fontSize: 12 }}>{climStatus}</span>
          </div>
          <div style={{ color: '#666', fontSize: 12 }}>
            HDD via Open-Meteo normals. Design temp from DJF monthly minima with altitude correction (−0.0065 °C/m). 
            If unavailable, a regional fallback is applied automatically. All values can be overridden.
          </div>
        </div>

        <div style={lightCard}>
          <h3>EPC finder (from address)</h3>
          <div style={row}>
            <a href="https://www.gov.uk/find-energy-certificate" target="_blank" rel="noreferrer">
              <button>Open GOV.UK EPC search →</button>
            </a>
            <span style={{ color: '#666', fontSize: 12 }}>Find address → copy certificate page → paste → Parse.</span>
          </div>
          <textarea
            rows={6}
            placeholder="Paste EPC page text here"
            value={epcPaste}
            onChange={(e) => setEpcPaste(e.target.value)}
            style={{ width: '100%' }}
          />
          <div style={row}>
            <button onClick={onParseEpc}>Parse pasted text</button>
            <span style={{ fontFamily: 'ui-monospace', fontSize: 12 }}>Detected EPC: {epcDbg}</span>
          </div>
        </div>
      </section>
    </main>
  );
}

/* ----------------------------- inline styles ----------------------------- */
const card: React.CSSProperties = { background: '#fff', border: '1px solid #e6e6e6', borderRadius: 14, padding: 16 };
const lightCard: React.CSSProperties = { ...card, marginTop: 12 };
const grid3: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 };
const grid4: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 };
const row: React.CSSProperties = { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' };

