#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import * as XLSX from 'xlsx';

const [, , inFileArg, outFileArg] = process.argv;
const INPUT  = inFileArg  || 'post codes spf data climate.ods';
const OUTPUT = outFileArg || 'public/climate/postcode_climate.json';

// Optional explicit mapping via env (use the exact header text from your sheet)
const OV_PC  = process.env.ODS_PC;      // e.g. "Postcode"
const OV_DES = process.env.ODS_DESIGN;  // e.g. "Design temp (°C)"
const OV_HDD = process.env.ODS_HDD;     // e.g. "HDD (base 15.5C)"

const slug = s => String(s || '').trim().toLowerCase().replace(/[\s\-_\/]+/g,'').replace(/[^\w]/g,'');
const pcNorm = s => String(s || '').toUpperCase().replace(/\s+/g,'');

// Return likely key set (full, outcode, sector, area)
function keysFor(code) {
  const clean = pcNorm(code);
  if (!clean) return [];
  const keys = new Set([clean]);

  const m = clean.match(/^([A-Z]{1,2}\d[A-Z\d]?)/); // OUTCODE
  const out = m?.[1] || '';
  if (out) {
    keys.add(out);
    const inward = clean.slice(out.length);
    const firstDigit = inward.match(/\d/);
    if (firstDigit) keys.add(out + firstDigit[0]); // SECTOR
    keys.add(out.replace(/\d.*/, ''));             // AREA
  }
  return Array.from(keys);
}

// Robust numeric parse: handle unicode minus and blanks
function toNumber(v) {
  const s = String(v ?? '')
    .trim()
    .replace(/[, ]+/g, '')
    .replace(/[\u2212\u2012-\u2015]/g, '-'); // convert “−”, “–” etc to '-'
  if (s === '') return undefined;
  const n = Number(s);
  return Number.isFinite(n) ? n : undefined;
}

// Heuristic: score how much a numeric column looks like a design-temp or HDD
function scoreColumns(rows, headers) {
  const stats = {};
  for (const h of headers) {
    let nums = [];
    for (const r of rows) {
      const n = toNumber(r[h]);
      if (n !== undefined) nums.push(n);
      if (nums.length >= 120) break; // sample up to 120 rows
    }
    if (!nums.length) continue;
    nums.sort((a,b)=>a-b);
    const p = q => nums[Math.min(nums.length-1, Math.max(0, Math.floor(q*(nums.length-1))))];
    const min = nums[0], max = nums[nums.length-1], med = p(0.5);

    // simple scores
    const looksDesign = (min >= -30 && max <= 15);             // plausible °C range
    const looksHdd    = (min >= 300 && max <= 6000 && med>600);// plausible HDD range
    stats[h] = { min, max, med, count: nums.length, looksDesign, looksHdd };
  }
  return stats;
}

// Try to pick header candidates
function pickHeaders(rows) {
  const headers = Object.keys(rows[0] || {});
  console.log('[ods-to-json] Headers:', headers);

  // If explicit overrides are set, honour them
  if (OV_PC || OV_DES || OV_HDD) {
    return {
      pc:  OV_PC  ?? null,
      des: OV_DES ?? null,
      hdd: OV_HDD ?? null,
    };
  }

  // 1) postcode-like
  let pc = null;
  for (const h of headers) {
    let score = 0, seen = 0;
    for (const r of rows.slice(0,200)) {
      const v = String(r[h] ?? '').trim();
      if (!v) continue;
      seen++;
      const s = pcNorm(v);
      if (/^[A-Z]{1,2}\d[A-Z\d]?/.test(s)) score++;
    }
    if (seen && score/Math.max(1,seen) > 0.5) { pc = h; break; }
  }

  // 2) try header-name matches
  const H_PC  = new Set(['postcode','postcodes','post_code','sector','outcode','district','area','pc','pcode','postcoderegion','postalcodesector']);
  const H_DES = new Set(['design','designtemp','externaldesigntemp','designext','tex','designc','designdegc','designoutside','designexternal','designexttemp']);
  const H_HDD = new Set(['hdd','heatingdegreedays','degreedays','degree_days','hdd15','hdd155','hddb15','hddb155']);

  let des = null, hdd = null;
  for (const h of headers) {
    const s = slug(h);
    if (!pc  && H_PC.has(s))  pc  = h;
    if (!des && H_DES.has(s)) des = h;
    if (!hdd && H_HDD.has(s)) hdd = h;
  }

  // 3) Heuristics on numeric distributions if still missing
  const dist = scoreColumns(rows, headers);
  if (!des) {
    const candidates = Object.entries(dist)
      .filter(([,st]) => st.looksDesign)
      .sort((a,b)=> (b[1].count - a[1].count) || (Math.abs(-3 - b[1].med) - Math.abs(-3 - a[1].med)));
    if (candidates.length) des = candidates[0][0];
  }
  if (!hdd) {
    const candidates = Object.entries(dist)
      .filter(([,st]) => st.looksHdd)
      .sort((a,b)=> (b[1].count - a[1].count) || (b[1].med - a[1].med));
    if (candidates.length) hdd = candidates[0][0];
  }

  console.log('[ods-to-json] Using columns -> pc:', pc ?? 'n/a', ', design:', des ?? 'n/a', ', hdd:', hdd ?? 'n/a');
  return { pc, des, hdd };
}

(async () => {
  const buf = await fs.readFile(INPUT);
  const wb  = XLSX.read(buf, { type: 'buffer', raw: false }); // read as text
  const ws  = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { defval: '', raw: false });
  if (!rows.length) {
    console.error('No rows found in sheet.');
    process.exit(1);
  }

  const { pc, des, hdd } = pickHeaders(rows);

  const out = [];
  for (const r of rows) {
    const code = r?.[pc] ?? '';
    const keys = keysFor(code);
    if (!keys.length) continue;

    const designTemp = des ? toNumber(r[des]) : undefined;
    const hddVal     = hdd ? toNumber(r[hdd]) : undefined;

    // Only keep rows that actually carry data
    if (designTemp === undefined && hddVal === undefined) continue;

    out.push({ keys, designTemp, hdd: hddVal });
  }

  if (!out.length) {
    console.error('ODS parsed but produced 0 usable rows (check column names & values).');
    process.exit(1);
  }

  await fs.mkdir(path.dirname(OUTPUT), { recursive: true });
  await fs.writeFile(OUTPUT, JSON.stringify(out, null, 2));
  console.log(`Wrote ${out.length} rows -> ${OUTPUT}`);
})();
