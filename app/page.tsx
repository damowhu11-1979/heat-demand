'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';

/* ------------------------------------------------------------------ */
/* Config                                                              */
/* ------------------------------------------------------------------ */
const PROPERTY_CHECKER_URL = 'https://propertychecker.co.uk/';

/* ------------------------------------------------------------------ */
/* Climate helpers & types                                             */
/* ------------------------------------------------------------------ */
type ClimateRow = { designTemp?: number; hdd?: number };
type ClimateMap = Map<string, ClimateRow>;

const meanAnnualDefault = 10.2;

function normPC(s: string): string {
  return String(s || '').toUpperCase().replace(/\s+/g, '');
}

function keysFor(raw: string): string[] {
  const clean = normPC(raw);
  if (!clean) return [];
  const set = new Set<string>([clean]);
  const m = clean.match(/^([A-Z]{1,2}\d[A-Z\d]?)(\d[A-Z]{2})?$/); // OUTCODE in m[1]
  const out = m?.[1] ?? '';
  if (out) set.add(out);
  const inward = clean.slice(out.length);
  const firstDigit = inward.match(/\d/);
  if (firstDigit) set.add(`${out}${firstDigit[0]}`); // sector
  const area = out.replace(/\d.*/, '');
  if (area) set.add(area);
  return Array.from(set);
}

function lookupDesign(map: ClimateMap, postcode: string): ClimateRow | undefined {
  for (const k of keysFor(postcode)) {
    const hit = map.get(k);
    if (hit) return hit;
  }
  return undefined;
}

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

  const map: ClimateMap = new Map();
  if (Array.isArray(feed)) {
    for (const row of feed) {
      const { keys = [], designTemp, hdd } = row || {};
      for (const k of keys) {
        const key = normPC(k);
        if (key) map.set(key, { designTemp, hdd });
      }
    }
  }
  return map;
}

/* ------------------------------------------------------------------ */
/* Geocoding + altitude                                                */
/* ------------------------------------------------------------------ */
type LatLon = { lat: number; lon: number };

function parseLatLon(s: string): LatLon | null {
  const m = String(s || '')
    .trim()
    .match(/^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/);
  if (!m) return null;
  const lat = +m[1];
  const lon = +m[2];
  if (!isFinite(lat) || !isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  return { lat, lon };
}

async function geoByPostcodeOrAddress(
  postcode: string,
  address: string,
  latlonOverride?: string,
): Promise<LatLon> {
  const direct = latlonOverride ? parseLatLon(latlonOverride) : null;
  if (direct) return direct;

  const pc = normPC(postcode);
  if (pc) {
    try {
      const r = await fetch(`https://api.postcodes.io/postcodes/${encodeURIComponent(pc)}`, {
        cache: 'no-store',
      });
      if (r.ok) {
        const j = await r.json();
        if (j?.result?.latitude && j?.result?.longitude) {
          return { lat: j.result.latitude, lon: j.result.longitude };
        }
      }
    } catch {
      /* fall through */
    }
  }
  const q = (postcode || address || '').trim();
  if (q.length < 3) throw new Error('Enter postcode or address');
  const u = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(
    q,
  )}`;
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

/* ------------------------------------------------------------------ */
/* PropertyChecker parser                                              */
/* ------------------------------------------------------------------ */

type ParsedPC = {
  postcode?: string;
  rrn?: string;
  occupants?: number;
  ageBand?: string;
  dwelling?: string;     // Detached / Semi-detached / Terraced / Flat / Bungalow
  terraceType?: string;  // Mid / End / Corner (used when dwelling=Terraced)
};

const UK_PC_RE = /\b([A-Z]{1,2}\d[A-Z\d]?)\s*(\d[A-Z]{2})\b/i; // robust enough
const RRN_RE = /\b(\d{4}-\d{4}-\d{4}-\d{4}-\d{4})\b/;
const OCC_RE = /\b(occupants?|people|persons)\b[^0-9]{0,20}(\d{1,2})/i;

// Examples we’ll map to your select options
const AGE_MAP: { test: RegExp; value: string }[] = [
  { test: /(pre\s*[- ]?1900|before\s*1900)/i, value: 'pre-1900' },
  { test: /(1900[^0-9]?1929)/i, value: '1900-1929' },
  { test: /(1930[^0-9]?1949)/i, value: '1930-1949' },
  { test: /(1950[^0-9]?1966)/i, value: '1950-1966' },
  { test: /(1967[^0-9]?1975)/i, value: '1967-1975' },
  { test: /(1976[^0-9]?1982)/i, value: '1976-1982' },
  { test: /(1983[^0-9]?1990)/i, value: '1983-1990' },
  { test: /(1991[^0-9]?1995)/i, value: '1991-1995' },
  { test: /(1996[^0-9]?2002)/i, value: '1996-2002' },
  { test: /(2003[^0-9]?2006)/i, value: '2003-2006' },
  { test: /(2007[^0-9]?2011)/i, value: '2007-2011' },
  { test: /(2012|2013|2014|2015|2016|2017|2018|2019|202\d)/i, value: '2012-present' },
];

const DWELLING_MAP: { test: RegExp; value: string }[] = [
  { test: /detached/i, value: 'Detached' },
  { test: /semi[-\s]?detached/i, value: 'Semi-detached' },
  { test: /terrace|terraced/i, value: 'Terraced' },
  { test: /flat|apartment/i, value: 'Flat' },
  { test: /bungalow/i, value: 'Bungalow' },
];

const TERRACE_MAP: { test: RegExp; value: string }[] = [
  { test: /mid[-\s]?terrace/i, value: 'Mid' },
  { test: /end[-\s]?terrace|end[-\s]?of[-\s]?terrace/i, value: 'End' },
  { test: /corner/i, value: 'Corner' },
];

function pickAgeBandFromText(txt: string): string | undefined {
  for (const row of AGE_MAP) if (row.test.test(txt)) return row.value;
  return undefined;
}
function pickDwelling(txt: string): string | undefined {
  for (const row of DWELLING_MAP) if (row.test.test(txt)) return row.value;
  return undefined;
}
function pickTerraceType(txt: string): string | undefined {
  for (const row of TERRACE_MAP) if (row.test.test(txt)) return row.value;
  return undefined;
}

/** Parse a PropertyChecker page (plain text or HTML pasted) */
function parsePropertyChecker(source: string): ParsedPC {
  const out: ParsedPC = {};
  const txt = source.replace(/\s+/g, ' ');
  const mPC = txt.match(UK_PC_RE);
  if (mPC) out.postcode = `${mPC[1].toUpperCase()} ${mPC[2].toUpperCase()}`;
  const mRRN = txt.match(RRN_RE);
  if (mRRN) out.rrn = mRRN[1];
  const mOcc = txt.match(OCC_RE);
  if (mOcc) out.occupants = Number(mOcc[2]);

  out.ageBand = pickAgeBandFromText(txt);
  out.dwelling = pickDwelling(txt);
  out.terraceType = pickTerraceType(txt);
  return out;
}

/* ------------------------------------------------------------------ */
/* UI                                                                  */
/* ------------------------------------------------------------------ */
export default function Page(): React.JSX.Element {
  // Property info
  const [reference, setReference] = useState('');
  const [postcode, setPostcode] = useState('');
  const [country, setCountry] = useState<'England' | 'Wales' | 'Scotland' | 'Northern Ireland'>(
    'England',
  );
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
  const [terraceType, setTerraceType] = useState(''); // replaces "Attachment"
  const [ageBand, setAgeBand] = useState('');
  const [occupants, setOccupants] = useState(2);
  const [mode, setMode] = useState('Net Internal');
  const [airtight, setAirtight] = useState('Standard Method');
  const [thermalTest, setThermalTest] = useState('No Test Performed');

  // Status
  const [climStatus, setClimStatus] = useState('');
  const [altStatus, setAltStatus] = useState('');
  const [latlonOverride, setLatlonOverride] = useState('');

  // PropertyChecker import
  const [pcUrl, setPcUrl] = useState('');
  const [pcPaste, setPcPaste] = useState('');
  const [pcStatus, setPcStatus] = useState('');

  // climate map
  const climateRef = useRef<ClimateMap | null>(null);

  /* Load climate map once */
  useEffect(() => {
    (async () => {
      setClimStatus('Loading climate table…');
      const map = await loadClimateMap();
      climateRef.current = map;
      setClimStatus(
        map.size ? `Climate table loaded (${map.size} keys).` : 'No climate table found.',
      );
    })();
  }, []);

  /* Apply postcode lookups */
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

  /* Altitude lookup */
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

  /* PropertyChecker helpers */
  const tryFetchPcUrl = async () => {
    if (!pcUrl.trim()) return;
    setPcStatus('Fetching URL… (if this hangs, copy/paste the page content below instead)');
    try {
      const r = await fetch(pcUrl, { cache: 'no-store' }); // likely CORS-blocked
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const html = await r.text();
      setPcPaste(html);
      setPcStatus('Fetched. Now click Parse to import fields.');
    } catch (err: any) {
      setPcStatus(`Fetch failed (CORS likely). Copy & paste the page HTML/text, then Parse. ${String(err)}`);
    }
  };

  const onParsePc = () => {
    const src = pcPaste || '';
    if (!src.trim()) {
      setPcStatus('Paste the PropertyChecker page text/HTML first.');
      return;
    }
    const parsed = parsePropertyChecker(src);
    const fills: string[] = [];
    if (parsed.postcode) {
      setPostcode(parsed.postcode);
      fills.push(`PC ${parsed.postcode}`);
    }
    if (parsed.rrn) {
      setEpcNo(parsed.rrn);
      fills.push(`EPC ${parsed.rrn}`);
    }
    if (typeof parsed.occupants === 'number') {
      setOccupants(parsed.occupants);
      fills.push(`Occ ${parsed.occupants}`);
    }
    if (parsed.ageBand) {
      setAgeBand(parsed.ageBand);
      fills.push(`Age ${parsed.ageBand}`);
    }
    if (parsed.dwelling) {
      setDwelling(parsed.dwelling);
      fills.push(`Type ${parsed.dwelling}`);
    }
    if (parsed.terraceType) {
      setTerraceType(parsed.terraceType);
      fills.push(`Terrace ${parsed.terraceType}`);
    }
    setPcStatus(fills.length ? `Imported: ${fills.join(', ')}` : 'Nothing recognised. Paste the full page HTML.');
  };

  /* Save (placeholder) */
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
      terraceType,
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

      {/* PropertyChecker import */}
      <section style={{ ...card, marginBottom: 14 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 10 }}>
          <strong>Import from </strong>
          <a href={PROPERTY_CHECKER_URL} target="_blank" rel="noreferrer" style={{ fontWeight: 600 }}>
            PropertyChecker.co.uk
          </a>
          <span style={{ color: '#666' }}>(optional)</span>
        </div>

        <div style={grid3}>
          <div>
            <Label>PropertyChecker URL (optional)</Label>
            <Input
              placeholder="https://propertychecker.co.uk/..."
              value={pcUrl}
              onChange={(e) => setPcUrl(e.target.value)}
            />
            <div style={{ marginTop: 8 }}>
              <Button onClick={tryFetchPcUrl}>Try fetch page</Button>
              <span style={{ marginLeft: 8, fontSize: 12, color: '#666' }}>
                (If blocked by CORS, paste the page below then click Parse)
              </span>
            </div>
          </div>
          <div style={{ gridColumn: 'span 2' }}>
            <Label>Paste PropertyChecker page text/HTML here</Label>
            <textarea
              rows={6}
              placeholder="Paste the full page text (Ctrl+A, Ctrl+C on the page) then click Parse"
              value={pcPaste}
              onChange={(e) => setPcPaste(e.target.value)}
              style={{ width: '100%', ...inputStyle, height: 140, resize: 'vertical' }}
            />
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 8 }}>
              <Button onClick={onParsePc}>Parse</Button>
              <span style={{ color: '#666', fontSize: 12 }}>{pcStatus}</span>
            </div>
          </div>
        </div>
      </section>

      {/* Main card */}
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
            <Select
              value={country}
              onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                setCountry(e.target.value as typeof country)
              }
            >
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
                  Uses postcodes.io / Nominatim and Open-Elevation (fallback OpenTopoData).
                  You can also enter <em>lat,long</em> override:
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
            <Input
              type="number"
              value={tex}
              onChange={(e) => setTex(e.target.value === '' ? '' : Number(e.target.value))}
            />
          </div>

          <div>
            <Label>Mean Annual External Air Temp (°C)</Label>
            <Input type="number" value={meanAnnual} readOnly />
          </div>

          <div>
            <Label>Heating Degree Days (HDD, base 15.5°C)</Label>
            <Input
              type="number"
              value={hdd}
              onChange={(e) => setHdd(e.target.value === '' ? '' : Number(e.target.value))}
            />
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
            <Label>Terrace Type</Label>
            <Select value={terraceType} onChange={(e) => setTerraceType(e.target.value)}>
              <option value="">Select terrace type</option>
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
            <Input
              type="number"
              value={occupants}
              onChange={(e) => setOccupants(Number(e.target.value || 0)))}
            />
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

        {/* Status rows */}
        <div style={{ marginTop: 12, fontSize: 12, color: '#666' }}>
          Auto climate ✓ {climStatus}
        </div>

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

/* ------------------------------------------------------------------ */
/* Small UI bits                                                       */
/* ------------------------------------------------------------------ */
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

/* ------------------------------------------------------------------ */
/* Styles                                                              */
/* ------------------------------------------------------------------ */

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
  border: '1px solid #111', // fixed
  padding: '12px 18px',
  borderRadius: 12,
  cursor: 'pointer',
};
