// scripts/ods-to-json.mjs
// Usage: node scripts/ods-to-json.mjs "post codes spf data climate.ods" public/climate/postcode_climate.json
import fs from 'node:fs';
import path from 'node:path';
import xlsx from 'xlsx';

function norm(s) { return String(s ?? '').trim(); }
function up(s) { return norm(s).toUpperCase(); }
function fullNoSpace(pc) { return up(pc).replace(/\s+/g, ''); }

// Build derived keys from a postcode-like string
function keysFrom(pcMaybe) {
  const raw = fullNoSpace(pcMaybe);
  const keys = { full: raw, sector: '', outcode: '', area: '' };
  const m = raw.match(/^([A-Z]{1,2}\d[A-Z\d]?)(\d)([A-Z]{2})$/); // OUT + SECTOR + UNIT
  if (m) {
    keys.outcode = m[1];             // e.g. SL4
    keys.sector = `${m[1]} ${m[2]}`; // e.g. SL4 4
    keys.area = m[1].replace(/\d.*$/, ''); // e.g. SL
  }
  return keys;
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

const [,, srcPath, outPath] = process.argv;
if (!srcPath || !outPath) {
  console.error('Usage: node scripts/ods-to-json.mjs "input.ods" public/climate/postcode_climate.json');
  process.exit(1);
}

const wb = xlsx.readFile(srcPath);
const sheet = wb.Sheets[wb.SheetNames[0]];
const rows = xlsx.utils.sheet_to_json(sheet, { defval: '' });

// Try common header names (adjust if needed)
const HEAD = {
  postcode: ['postcode','post code','pc','sector','outcode','area','code'],
  design:   ['design','design temp','design external air temp','design ext','tex','t_ex','t design'],
  hdd:      ['hdd','heating degree days','degree days'],
};

function pick(row, keys) {
  for (const k of keys) {
    const hit = Object.keys(row).find(h => h.toString().trim().toLowerCase() === k);
    if (hit) return row[hit];
  }
  return undefined;
}

const out = [];
for (const r of rows) {
  const cell = pick(r, HEAD.postcode);
  const design = num(pick(r, HEAD.design));
  const hdd = num(pick(r, HEAD.hdd));
  if (!cell || (design === undefined && hdd === undefined)) continue;

  const k = keysFrom(cell);

  // Emit up to four records so the UI can match FULL → SECTOR → OUTCODE → AREA
  if (k.full)    out.push({ postcode: k.full, designTemp: design, hdd });
  if (k.sector)  out.push({ sector: k.sector, designTemp: design, hdd });
  if (k.outcode) out.push({ outcode: k.outcode, designTemp: design, hdd });
  if (k.area)    out.push({ area: k.area, designTemp: design, hdd });
}

// Ensure folder exists
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(out, null, 2));
console.log(`Wrote ${out.length} keys to ${outPath}`);
