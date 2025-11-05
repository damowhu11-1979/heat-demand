#!/usr/bin/env node
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

// helpers
const slug = (h) => String(h || '').trim().toLowerCase().replace(/[\s\-_/]+/g, '').replace(/[^\w]/g, '');
const H_POSTCODE = new Set(['postcode','postcodes','post_code','sector','outcode','district','area','pc','pcode','postcoderegion','postalcodesector']);
const H_DESIGN   = new Set(['design','designtemp','externaldesigntemp','designext','tex','designc','designdegc','designoutside','designexternal','designexttemp']);
const H_HDD      = new Set(['hdd','heatingdegreedays','degreedays','degree_days','hdd15','hdd155','hddb15','hddb155']);

const norm = (s) => String(s || '').toUpperCase().replace(/\s+/g, '');
const parseNum = (x) => {
  if (x == null) return undefined;
  const n = Number(String(x).replace(/[^\d.+-]/g, ''));
  return Number.isFinite(n) ? n : undefined;
};
const objGet = (o, keyLike) => {
  if (!o) return undefined;
  if (keyLike in o) return o[keyLike];
  const k = Object.keys(o).find((k) => slug(k) === slug(keyLike));
  return k ? o[k] : undefined;
};
const pick = (headers) => {
  let pc, d, h;
  for (const hn of headers) {
    const s = slug(hn);
    if (!pc && H_POSTCODE.has(s)) pc = hn;
    if (!d  && H_DESIGN.has(s))   d  = hn;
    if (!h  && H_HDD.has(s))      h  = hn;
  }
  return { pc, d, h };
};

const wb = XLSX.readFile(INPUT, { raw: true });
const ws = wb.Sheets[wb.SheetNames[0]];
const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });
const headers = Object.keys(rows[0] || {});
const { pc, d, h } = pick(headers);

const out = [];
for (const r of rows) {
  let code = pc ? objGet(r, pc) : undefined;
  if (!code) {
    const area = objGet(r, 'area') || objGet(r, 'Area');
    const outc = objGet(r, 'outcode') || objGet(r, 'Outcode') || objGet(r, 'district');
    const sec  = objGet(r, 'sector') || objGet(r, 'Sector') || objGet(r, 'sect');
    const unit = objGet(r, 'unit') || objGet(r, 'Unit');
    const concat = [area || outc || '', sec || '', unit || ''].join('').trim();
    if (concat) code = concat;
  }
  const raw = norm(code);
  if (!raw) continue;

  // build keys (FULL no space, OUTCODE, AREA)
  const keys = new Set([raw]);
  const m = raw.match(/^([A-Z]{1,2}\d[A-Z\d]?)(\d?)([A-Z]{0,2})?$/);
  if (m) {
    const outcode = m[1];
    keys.add(outcode);
    const area = outcode.replace(/\d.*/, '');
    if (area) keys.add(area);
  }

  const designTemp = d ? parseNum(objGet(r, d)) : undefined;
  const hddVal     = h ? parseNum(objGet(r, h)) : undefined;
  if (designTemp === undefined && hddVal === undefined) continue;

  out.push({ keys: Array.from(keys), designTemp, hdd: hddVal });
}

await fs.mkdir(path.dirname(OUTPUT), { recursive: true });
await fs.writeFile(OUTPUT, JSON.stringify(out, null, 2), 'utf8');
console.log(`Wrote ${out.length} rows → ${OUTPUT}`);
