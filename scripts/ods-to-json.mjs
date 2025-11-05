#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import * as XLSX from 'xlsx'; // ESM: use read(buffer) not readFile()

const [, , inFileArg, outFileArg] = process.argv;
const inFile  = inFileArg  || 'post codes spf data climate.ods';
const outFile = outFileArg || 'public/climate/postcode_climate.json';

const slug = s => String(s || '').trim().toLowerCase().replace(/[\s\-_\/]+/g,'').replace(/[^\w]/g,'');
const H_PC  = new Set(['postcode','postcodes','post_code','sector','outcode','district','area','pc','pcode','postcoderegion','postalcodesector']);
const H_DES = new Set(['design','designtemp','externaldesigntemp','designext','tex','designc','designdegc','designoutside','designexternal','designexttemp']);
const H_HDD = new Set(['hdd','heatingdegreedays','degreedays','degree_days','hdd15','hdd155','hddb15','hddb155']);

const pcNorm = s => String(s || '').toUpperCase().replace(/\s+/g,'');

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
    if (firstDigit) keys.add(out + firstDigit[0]);  // SECTOR
    keys.add(out.replace(/\d.*/, ''));             // AREA
  }
  return Array.from(keys);
}

(async () => {
  // ---- read workbook via Buffer (ESM-friendly) ----
  const buf = await fs.readFile(inFile);
  const wb  = XLSX.read(buf, { type: 'buffer', raw: true });

  const ws    = wb.Sheets[wb.SheetNames[0]];
  const rows  = XLSX.utils.sheet_to_json(ws, { defval: '' });
  if (!rows.length) {
    console.error('No rows found in the first sheet.');
    process.exit(1);
  }

  // pick column headers flexibly
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
    let code = r?.[pcCol] ?? '';
    if (!code) {
      const area = r['area'] || r['Area'];
      const outc = r['outcode'] || r['Outcode'] || r['district'];
      const sect = r['sector'] || r['Sector'] || r['sect'];
      const unit = r['unit'] || r['Unit'];
      const combo = [area || outc || '', sect || '', unit || ''].join('');
      if (combo.trim()) code = combo;
    }
    const keys = keysFor(code);
    if (!keys.length) continue;

    const parseNum = v => {
      const n = Number(String(v).replace(/[^\d.+-]/g,''));
      return Number.isFinite(n) ? n : undefined;
    };
    const designTemp = parseNum(desCol ? r[desCol] : undefined);
    const hdd        = parseNum(hddCol ? r[hddCol] : undefined);

    if (designTemp === undefined && hdd === undefined) continue;
    out.push({ keys, designTemp, hdd });
  }

  if (!out.length) {
    console.error('ODS parsed but produced 0 usable rows. Check column names/values.');
    process.exit(1);
  }

  await fs.mkdir(path.dirname(outFile), { recursive: true });
  await fs.writeFile(outFile, JSON.stringify(out, null, 2));
  console.log(`Wrote ${out.length} rows -> ${outFile}`);
})();
