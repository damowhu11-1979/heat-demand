#!/usr/bin/env node
/**
 * Convert "post codes spf data climate.ods" to public/climate/postcode_climate.json
 * - Accepts many header spellings (postcode/sector/outcode/area, design temp, HDD)
 * - Derives FULL, SECTOR, OUTCODE, AREA keys from whatever is present
 * - Writes an array of { keys: string[], designTemp?: number, hdd?: number }
 *
 * Usage:
 *   node scripts/ods-to-json.mjs "post codes spf data climate.ods" public/climate/postcode_climate.json
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import * as XLSX from 'xlsx';

const [, , inFileArg, outFileArg] = process.argv;

if (!inFileArg || !outFileArg) {
  console.error('Usage: node scripts/ods-to-json.mjs "<input.ods>" "<output.json>"');
  process.exit(1);
}

const INPUT = inFileArg;
const OUTPUT = outFileArg;

function slug(h) {
  return String(h || '')
    .trim()
    .toLowerCase()
    .replace(/[\s\-_/]+/g, '')
    .replace(/[^\w]/g, '');
}
const H_POSTCODE = new Set([
  'postcode', 'postcodes', 'post_code', 'postcodesector', 'sector', 'outcode',
  'district', 'area', 'pc', 'pcode', 'postcoderegion', 'postalcodesector',
]);
const H_DESIGN = new Set([
  'design', 'designtemp', 'externaldesigntemp', 'designext', 'tex', 'designc',
  'designdegc', 'designoutside', 'designexternal', 'designexttemp',
]);
const H_HDD = new Set([
  'hdd', 'heatingdegreedays', 'degreedays', 'degree_days', 'hdd15', 'hdd155',
  'hddb15', 'hddb155',
]);

function normCode(s) {
  const raw = String(s || '').toUpperCase().replace(/\s+/g, '').trim();
  if (!raw) return null;
  // Try to format "OUTCODE SECTORUNIT" back to spaced form
  const m = raw.match(/^([A-Z]{1,2}\d[A-Z\d]?)(\d?)([A-Z]{0,2})$/);
  if (!m) return raw; // keep raw as key
  const out = m[1];
  const sector = m[2];
  const unit = m[3];
  if (sector && unit) return `${out} ${sector}${unit}`; // FULL
  if (sector) return `${out} ${sector}`;                // SECTOR
  return out;                                          // OUTCODE
}

// Produce all useful key variants from any code-ish string
function explodeKeysFromCode(s) {
  const out = new Set();
  const norm = normCode(s);
  if (!norm) return [];

  const fullNoSpace = norm.replace(/\s+/g, '');
  out.add(fullNoSpace); // FULL no-space

  const fullParts = norm.split(' ');
  const outcode = fullParts[0];               // e.g. "E1"
  const sector = fullParts.length > 1 ? `${outcode} ${fullParts[1][0]}` : ''; // "E1 6"
  const area = outcode.replace(/\d.*/, '');   // "E"

  out.add(outcode); if (sector) out.add(sector); if (area) out.add(area);
  return Array.from(out);
}

function parseNum(x) {
  if (x == null) return undefined;
  const n = Number(String(x).replace(/[^\d.+-]/g, ''));
  return Number.isFinite(n) ? n : undefined;
}

function pickColumnNames(headers) {
  let pc, d, h;
  for (const hname of headers) {
    const s = slug(hname);
    if (!pc && H_POSTCODE.has(s)) pc = hname;
    if (!d && H_DESIGN.has(s)) d = hname;
    if (!h && H_HDD.has(s)) h = hname;
  }
  return { pc, d, h };
}

function objGet(o, keyLike) {
  if (!o) return undefined;
  if (keyLike in o) return o[keyLike];
  // tolerate slight header differences (trimmed, different spacing)
  const k = Object.keys(o).find((k) => slug(k) === slug(keyLike));
  return k ? o[k] : undefined;
}

(async () => {
  const wb = XLSX.readFile(INPUT, { raw: true });
  const sheetName = wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];

  const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });
  if (!rows.length) {
    console.error('ODS contained no rows:', INPUT);
    await fs.mkdir(path.dirname(OUTPUT), { recursive: true });
    await fs.writeFile(OUTPUT, '[]', 'utf8');
    process.exit(0);
  }

  const headers = Object.keys(rows[0] || {});
  const picked = pickColumnNames(headers);

  // If we can't detect anything, still try best-effort
  if (!picked.pc) {
    // heuristic: first header that looks like text-ish postcode column
    const maybe = headers.find((h) => /post|code|out|sector|area/i.test(h));
    if (maybe) picked.pc = maybe;
  }

  const out = [];
  for (const r of rows) {
    const cellPC = picked.pc ? objGet(r, picked.pc) : undefined;

    // if sheet separates area/outcode/sector across several columns,
    // attempt to concatenate
    let combined = cellPC;
    if (!combined) {
      const area = objGet(r, 'area') || objGet(r, 'Area');
      const outcode = objGet(r, 'outcode') || objGet(r, 'Outcode') || objGet(r, 'district');
      const sector = objGet(r, 'sector') || objGet(r, 'Sector') || objGet(r, 'sect');
      const unit = objGet(r, 'unit') || objGet(r, 'Unit');
      const concat = [area || outcode || '', sector || '', unit || ''].join('').trim();
      if (concat) combined = concat;
    }

    const keys = explodeKeysFromCode(combined);
    if (!keys.length) continue;

    const designTemp = picked.d ? parseNum(objGet(r, picked.d)) : parseNum(objGet(r, 'design'));
    const hdd = picked.h ? parseNum(objGet(r, picked.h)) : parseNum(objGet(r, 'hdd'));

    // Skip row only if we have neither measure
    if (designTemp === undefined && hdd === undefined) continue;

    out.push({ keys, designTemp, hdd });
  }

  await fs.mkdir(path.dirname(OUTPUT), { recursive: true });
  await fs.writeFile(OUTPUT, JSON.stringify(out, null, 2), 'utf8');

  console.log(`Converted ${rows.length} sheet rows -> ${out.length} climate rows`);
  console.log(`Wrote: ${OUTPUT}`);
})();
