'use client';

import React, { useEffect, useRef, useState } from 'react';

/* ------------------------------ Config ------------------------------ */
const PROPERTY_CHECKER_URL = 'https://propertychecker.co.uk/';
const GOV_EPC_SEARCH = 'https://www.gov.uk/find-energy-certificate';
const epcDirectUrl = (rrn: string) =>
  `https://find-energy-certificate.service.gov.uk/energy-certificate/${String(rrn || '')
    .replace(/\s+/g, '')
    .trim()}`;
const isLikelyRRN = (s: string) =>
  /\b\d{4}-\d{4}-\d{4}-\d{4}-\d{4}\b/.test(String(s || '').trim());

/* --------------------------- Helpers & Types ------------------------ */
type ClimateRow = { designTemp?: number; hdd?: number };
type ClimateMap = Map<string, ClimateRow>;
type LatLon = { lat: number; lon: number };

const meanAnnualDefault = 10.2;

function normPC(s: string): string {
  return String(s || '').toUpperCase().replace(/\s+/g, '');
}
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
    } catch {}
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
async function geoByPostcodeOrAddress(
  postcode: string,
  address: string,
  latlonOverride?: string
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
        if ((j?.status as number) === 200 && j?.result) {
          return { lat: j.result.latitude, lon: j.result.longitude };
        }
      }
    } catch {}
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

/* -------------------- Checker paste parser ------------------- */
function parseChecker(text: string): {
  epc?: string;
  uprn?: string;
  occupants?: number;
  ageBand?: string;
  postcode?: string;
  address?: string;
} {
  const out: {
    epc?: string;
    uprn?: string;
    occupants?: number;
    ageBand?: string;
    postcode?: string;
    address?: string;
  } = {};
  const t = String(text || '');

  const mEpc = t.match(/\b(\d{4}-\d{4}-\d{4}-\d{4}-\d{4})\b/);
  if (mEpc) out.epc = mEpc[1];

  const mUprn =
    t.match(/\bUPRN\s*[:=]?\s*(\d{8,13})\b/i) ||
    t.match(/\bUnique\s+Property\s+Reference\s+Number\s*[:=]?\s*(\d{8,13})\b/i);
  if (mUprn) out.uprn = mUprn[1];

  const mOcc = t.match(/(?:\bno\.?\s*of\s*)?occupants?\s*[:=]?\s*(\d{1,2})/i);
  if (mOcc) out.occupants = Number(mOcc[1]);

const AGE_BANDS = [
  { label: 'pre-1900',  from: -Infinity, to: 1899 },
  { label: '1900-1929', from: 1900,      to: 1929 },
  { label: '1930-1949', from: 1930,      to: 1949 },
  { label: '1950-1966', from: 1950,      to: 1966 },
  { label: '1967-1975', from: 1967,      to: 1975 },
  { label: '1976-1982', from: 1976,      to: 1982 },
  { label: '1983-1990', from: 1983,      to: 1990 },
  { label: '1991-1995', from: 1991,      to: 1995 },
  { label: '1996-2002', from: 1996,      to: 2002 },
  { label: '2003-2006', from: 2003,      to: 2006 },
  { label: '2007-2011', from: 2007,      to: 2011 },
  { label: '2012-present', from: 2012,   to: Infinity },
] as const;

function bandForYear(y: number): string | undefined {
  for (const b of AGE_BANDS) if (y >= b.from && y <= b.to) return b.label;
  return undefined;
}

function normaliseText(s: string) {
  return s
    .replace(/\u2013|\u2014/g, '-')   // en/em dashes -> hyphen
    .replace(/\s+/g, ' ')             // collapse whitespace
    .trim();
}

/** Try hard to read an age band from free text */
function extractAgeBand(text: string): string | undefined {
  const t = normaliseText(text.toLowerCase());

  // 1) Direct label matches (fast path)
  for (const b of AGE_BANDS) {
    const label = b.label.toLowerCase().replace(/\s+/g, '');
    const re = new RegExp(`\\b${label.replace('-', '')}\\b|\\b${label}\\b`,'i');
    if (re.test(t)) return b.label;
  }
  // Also tolerate "pre 1900", "pre1900"
  if (/\bpre[-\s]?1900\b/i.test(t)) return 'pre-1900';

  // Common headings: “construction age band: 1930-1949”, “age band 1967–1975” etc.
  const mDirectBand = t.match(/\bage\s*band\b[:\s-]*([0-9]{4})\s*[-–]\s*([0-9]{2,4})/i)
                    || t.match(/\bconstruction\s+age\s+band\b[:\s-]*([0-9]{4})\s*[-–]\s*([0-9]{2,4})/i);
  if (mDirectBand) {
    const start = parseInt(mDirectBand[1], 10);
    const endRaw = mDirectBand[2];
    const end = endRaw.length === 2 ? parseInt(String(start).slice(0,2) + endRaw, 10) : parseInt(endRaw, 10);
    const mid = Math.round((start + end) / 2);
    const band = bandForYear(mid);
    if (band) return band;
  }

  // 2) Plain numeric year(s)
  // Examples: “built in 1978”, “construction year: 1935”, “year of build 2016”
  const yearHits = [...t.matchAll(/\b(18\d{2}|19\d{2}|20\d{2})\b/g)]
      .map(m => parseInt(m[1], 10))
      .filter(y => y >= 1800 && y <= 2100);

  if (yearHits.length) {
    // Prefer the first “build-ish” year if it’s near words like built/constructed/age
    const buildish = [...t.matchAll(/\b(built|build|constructed?|construction|year\s*of\s*build|approx(?:\.|imate)?\s*build)\b.{0,20}?(18\d{2}|19\d{2}|20\d{2})/gi)]
      .map(m => parseInt(m[2], 10))
      .filter(y => y >= 1800 && y <= 2100);

    const y = (buildish[0] ?? yearHits[0]);
    const band = bandForYear(y);
    if (band) return band;
  }

  // 3) Ranges written loosely, e.g. “1930-49”, “67–75”
  const mLooseRange = t.match(/\b(18\d{2}|19\d{2}|20\d{2})\s*[-–]\s*(\d{2,4})\b/);
  if (mLooseRange) {
    const start = parseInt(mLooseRange[1], 10);
    const endRaw = mLooseRange[2];
    const end = endRaw.length === 2 ? parseInt(String(start).slice(0,2) + endRaw, 10) : parseInt(endRaw, 10);
    const mid = Math.round((start + end) / 2);
    const band = bandForYear(mid);
    if (band) return band;
  }

  return undefined;
}

/**
 * Extract EPC, UPRN, occupants, age band, postcode, and address
 * from a pasted PropertyChecker page.
 */
function parsePropertyChecker(text: string): {
  epc?: string;
  uprn?: string;
  occupants?: number;
  ageBand?: string;
  postcode?: string;
  address?: string;
} {
  const out: {
    epc?: string;
    uprn?: string;
    occupants?: number;
    ageBand?: string;
    postcode?: string;
    address?: string;
  } = {};
  const t = String(text || '');

  // EPC number like 1234-5678-9012-3456-7890
  const mEpc = t.match(/\b(\d{4}-\d{4}-\d{4}-\d{4}-\d{4})\b/);
  if (mEpc) out.epc = mEpc[1];

  // UPRN
  const mUprn =
    t.match(/\bUPRN\s*[:=]?\s*(\d{8,13})\b/i) ||
    t.match(/\bUnique\s+Property\s+Reference\s+Number\s*[:=]?\s*(\d{8,13})\b/i);
  if (mUprn) out.uprn = mUprn[1];

  // Occupants
  const mOcc = t.match(/(?:\bno\.?\s*of\s*)?occupants?\s*[:=]?\s*(\d{1,2})/i);
  if (mOcc) out.occupants = Number(mOcc[1]);

  // Age band (robust)
  const band = extractAgeBand(t);
  if (band) out.ageBand = band;

  // Postcode
  const pcRe = /\b([A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2})\b/i;
  const mPc = t.match(pcRe);
  if (mPc) out.postcode = mPc[1].toUpperCase().replace(/\s+/, ' ');

  // Address
  let addr: string | undefined;
  const mAddrLabel = t.match(/^\s*address\s*[:\-]\s*(.+)$/im);
  if (mAddrLabel) {
    addr = mAddrLabel[1].trim();
  } else if (mPc) {
    const lines = t.split(/\r?\n/);
    const line = lines.find((ln) => pcRe.test(ln));
    if (line) addr = line.trim();
  }
  if (addr) out.address = addr;

  return out;
}

/* ------------------------------- UI ---------------------------------- */
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

  useEffect(() => {
    (async () => {
      setClimStatus('Loading climate table…');
      const map = await loadClimateMap();
      climateRef.current = map;
      setClimStatus(map.size ? `Climate table loaded (${map.size} keys).` : 'No climate table found (using manual/API).');
    })();
  }, []);

  useEffect(() => {
    const map = climateRef.current;
    if (!map || !postcode) return;
    const hit = lookupDesign(map, postcode);
    if (hit) {
      if (typeof hit.designTemp === 'number') setTex(hit.designTemp);
      if (typeof hit.hdd === 'number') setHdd(hit.hdd);
      setClimStatus(`Auto climate ✓ matched ${explodeQueryKeys(postcode).join(' → ')}`);
    } else {
      setClimStatus('Auto climate: no match in table (you can override).');
    }
  }, [postcode]);

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

  const onParsePropertyChecker = () => {
    const res = parsePropertyChecker(pcPaste);
    if (res.epc) setEpcNo(res.epc);
    if (res.uprn) setUprn(res.uprn);
    if (typeof res.occupants === 'number') setOccupants(res.occupants);
    if (res.ageBand) setAgeBand(res.ageBand);
    if (res.postcode) setPostcode(res.postcode);
    if (res.address) setAddress(res.address);
  };

  useEffect(() => {
    if (dwelling !== 'Terraced') setSubtype('');
  }, [dwelling]);

  const onSave = () => {
    const payload = {
      reference, postcode, country, address, epcNo, uprn,
      altitude, tex, meanAnnual, hdd,
      dwelling, subtype, ageBand, occupants, mode, airtight, thermalTest,
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
              Will fill EPC number, UPRN, occupants, age band, address and postcode.
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
          <div>
            <Label>EPC Number *</Label>
            <Input placeholder="e.g., 1234-5678-9012-3456-7890" value={epcNo} onChange={(e) => setEpcNo(e.target.value)} />
          </div>
          <div>
            <Label>UPRN (optional)</Label>
            <Input placeholder="Unique Property Reference Number" value={uprn} onChange={(e) => setUprn(e.target.value)} />
          </div>
        </div>

        {/* EPC quick links */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 8, flexWrap: 'wrap' }}>
          <a href={GOV_EPC_SEARCH} target="_blank" rel="noreferrer">
            <Button type="button" title="Open the GOV.UK EPC search">Open EPC search ↗</Button>
          </a>
          {isLikelyRRN(epcNo) && (
            <a href={epcDirectUrl(epcNo)} target="_blank" rel="noreferrer">
              <Button type="button" title="Open this EPC certificate">Open this EPC certificate ↗</Button>
            </a>
          )}
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
                  Uses postcodes.io / Nominatim and Open-Elevation (fallback OpenTopoData). You can also enter <em>lat,long</em> override:
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
              <option>Detached</option>
              <option>Semi-detached</option>
              <option>Terraced</option>
              <option>Flat</option>
              <option>Bungalow</option>
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

        {/* Auto climate status */}
        <div style={{ marginTop: 12, fontSize: 12, color: '#666' }}>{climStatus}</div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 22 }}>
          <button onClick={onSave} style={primaryBtn}>Save</button>
        </div>
      </section>
    </main>
  );
}

/* ------------------------------- UI bits ------------------------------ */
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
        border: '1px solid #ddd',          // ✅ fixed line
        background: props.disabled ? '#eee' : '#111',
        color: props.disabled ? '#888' : '#fff',
        cursor: props.disabled ? 'not-allowed' : 'pointer',
        ...(props.style as any),
      }}
    />
  );
}

/* ------------------------------- styles ------------------------------- */
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
  padding: '10px 16px',
  borderRadius: 10,
  cursor: 'pointer',
};
