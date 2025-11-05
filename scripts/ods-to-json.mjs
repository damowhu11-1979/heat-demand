#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import * as XLSX from 'xlsx';

const [, , inFile = 'post codes spf data climate.ods',
            outFile = 'public/climate/postcode_climate.json'] = process.argv;

const slug = s => String(s || '').trim().toLowerCase().replace(/[\s\-_\/]+/g,'').replace(/[^\w]/g,'');
const H_PC   = new Set(['postcode','postcodes','post_code','sector','outcode','district','area','pc','pcode','postcoderegion','postalcodesector']);
const H_DES  = new Set(['design','designtemp','externaldesigntemp','designext','tex','designc','designdegc','designoutside','designexternal','designexttemp']);
const H_HDD  = new Set(['hdd','heatingdegreedays','degreedays','degree_days','hdd15','hdd155','hddb15','hddb155']);

const pcNorm = s => String(s || '').toUpperCase().replace(/\s+/g,''); // no spaces

const wb = XLSX.readFile(inFile, { raw: true });
const ws = wb.Sheets[wb.SheetNames[0]];
const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });
if (!rows.length) {
  console.error('No rows found in first sheet.');
  process.exit(1);
}

const headers = Object.keys(rows[0] || {});
let pcCol, desCol, hddCol;
for (const h of headers) {
  const s = slug(h);
  if (!pcCol  && H_PC.has(s))  pcCol  = h;
  if (!desCol && H_DES.has(s)) desCol = h;
  if (!hddCol && H_HDD.has(s)) hddCol = h;
}

const out = [];
for (const r of rows) {
  // best-effort postcode-ish code (allows sector/outcode/area combos)
  let code = r[pcCol] ?? '';
  if (!code) {
    const area  = r['area'] || r['Area'];
    const outc  = r['outcode'] || r['Outcode'] || r['district'];
    const sect  = r['sector'] || r['Sector'] || r['sect'];
    const unit  = r['unit'] || r['Unit'];
    const combo = [area || outc || '', sect || '', unit || ''].join('');
    if (combo.trim()) code = combo;
  }
  code = pcNorm(code);
  if (!code) continue;

  const keys = new Set([code]);
  const outcode = (code.match(/^([A-Z]{1,2}\d[A-Z\d]?)/) || [])[1] || '';
  if (outcode) {
    keys.add(outcode);
    const inward = code.slice(outcode.length);
    const firstDigit = inward.match(/\d/);
    if (firstDigit) keys.add(outcode + firstDigit[0]);
    keys.add(outcode.replace(/\d.*/, '')); // area
  }

  const designTemp = desCol ? Number(String(r[desCol]).replace(/[^\d.+-]/g,'')) : undefined;
  const hdd        = hddCol ? Number(String(r[hddCol]).replace(/[^\d.+-]/g,''))  : undefined;

  // include row if at least one value present
  if (!Number.isFinite(designTemp) && !Number.isFinite(hdd)) continue;

  out.push({ keys: Array.from(keys), designTemp: Number.isFinite(designTemp) ? designTemp : undefined,
                                hdd: Number.isFinite(hdd) ? hdd : undefined });
}

if (!out.length) {
  console.error('ODS parsed but produced 0 usable rows. Check column headers and values.');
  process.exit(1);
}

await fs.mkdir(path.dirname(outFile), { recursive: true });
await fs.writeFile(outFile, JSON.stringify(out, null, 2));
console.log(`Wrote ${out.length} rows -> ${outFile}`);
