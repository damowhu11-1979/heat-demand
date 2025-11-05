#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import * as XLSX from 'xlsx';

const [, , inputPath, outputPath] = process.argv;

if (!inputPath || !outputPath) {
  console.error('Usage: node scripts/ods-to-json.mjs "<input.ods>" "<output.json>"');
  process.exit(1);
}

const slug = (h) =>
  String(h || '').trim().toLowerCase().replace(/[\s\-_/]+/g, '').replace(/[^\w]/g, '');

const H_POSTCODE = new Set([
  'postcode','postcodes','post_code','sector','outcode','district','area','pc','pcode','postcoderegion','postalcodesector'
]);
const H_DESIGN = new Set([
  'design','designtemp','externaldesigntemp','designext','tex','designc','designdegc','designoutside','designexternal','designexttemp'
]);
const H_HDD = new Set([
  'hdd','heatingdegreedays','degreedays','degree_days','hdd15','hdd155','hddb15','hddb155'
]);

function normCode(s) {
  const raw = String(s || '').toUpperCase().replace(/\s+/g, '');
  if (!raw) return null;
  const m = raw.match(/^([A-Z]{1,2}\d[A-Z\d]?)(\d?)([A-Z]{0,2})$/);
  if (!m) return raw;
  const out = m[1], sector = m[2], unit = m[3];
  if (sector && unit) return `${out} ${sector}${unit}`;
  if (sector)        return `${out} ${sector}`;
  return out;
}
function explodeKeysFromCode(s) {
  const set = new Set();
  const norm = normCode(s);
  if (!norm) return [];
  set.add(norm.replace(/\s+/g, ''));            // full, no space
  const out = norm.split(' ')[0];               // outcode
  const sector = norm.includes(' ') ? `${out} ${norm.split(' ')[1][0]}` : '';
  const area = out.replace(/\d.*/, '');
  set.add(out);
  if (sector) set.add(sector);
  if (area) set.add(area);
  return Array.from(set);
}
function parseNum(x) {
  if (x == null) return undefined;
  const n = Number(String(x).replace(/[^\d.+-]/g, ''));
  return Number.isFinite(n) ? n : undefined;
}
function objGet(o, keyLike) {
  if (!o) return undefined;
  if (keyLike in o) return o[keyLike];
  const k = Object.keys(o).find((k) => slug(k) === slug(keyLike));
  return k ? o[k] : undefined;
}
function pick(headers) {
  let pc, d, h;
  for (const hn of headers) {
    const s = slug(hn);
    if (!pc && H_POSTCODE.has(s)) pc = hn;
    if (!d  && H_DESIGN.has(s))   d  = hn;
    if (!h  && H_HDD.has(s))      h  = hn;
  }
  return { pc, d, h };
}

(async () => {
  const wb = XLSX.readFile(inputPath, { raw: true });
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
    const keys = explodeKeysFromCode(code);
    if (!keys.length) continue;

    const designTemp = d ? parseNum(objGet(r, d)) : parseNum(objGet(r, 'design'));
    const hddVal     = h ? parseNum(objGet(r, h)) : parseNum(objGet(r, 'hdd'));
    if (designTemp === undefined && hddVal === undefined) continue;

    out.push({ keys, designTemp, hdd: hddVal });
  }

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, JSON.stringify(out, null, 2), 'utf8');
  console.log(`Wrote ${out.length} rows → ${outputPath}`);
})();
