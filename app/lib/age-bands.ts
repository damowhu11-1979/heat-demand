// app/lib/age-bands.ts
import type { AgeBand } from './vent-rates';

/** The detailed labels you use across the app (UI + localStorage) */
export type PropertyAgeBandLabel =
  | 'pre-1900' | '1900-1929' | '1930-1949' | '1950-1966'
  | '1967-1975' | '1976-1982' | '1983-1990' | '1991-1995'
  | '1996-2002' | '2003-2006' | '2007-2011' | '2012-present';

export const PROPERTY_AGE_BANDS: PropertyAgeBandLabel[] = [
  'pre-1900','1900-1929','1930-1949','1950-1966',
  '1967-1975','1976-1982','1983-1990','1991-1995',
  '1996-2002','2003-2006','2007-2011','2012-present',
];

/**
 * Mapping from detailed labels → calc tiers used by computeRoomLoss.
 * NOTE: If you later add a separate "2021+" detailed label, map that to 'y2021_plus'.
 */
export const AGE_BAND_TO_TIER: Record<PropertyAgeBandLabel, AgeBand> = {
  'pre-1900': 'pre_2003',
  '1900-1929': 'pre_2003',
  '1930-1949': 'pre_2003',
  '1950-1966': 'pre_2003',
  '1967-1975': 'pre_2003',
  '1976-1982': 'pre_2003',
  '1983-1990': 'pre_2003',
  '1991-1995': 'pre_2003',
  '1996-2002': 'pre_2003',
  '2003-2006': 'y2003_2010',
  '2007-2011': 'y2010_2021',
  '2012-present': 'y2010_2021', // best fit given your current UI
};

/** Coerce any stored string to a valid PropertyAgeBandLabel (fallback sensible) */
export function coercePropertyAgeBandLabel(v: string | null): PropertyAgeBandLabel {
  const s = (v || '').trim();
  if (PROPERTY_AGE_BANDS.includes(s as PropertyAgeBandLabel)) {
    return s as PropertyAgeBandLabel;
  }
  // Legacy/free-form: infer from year if present
  const yr = Number((s.match(/\d{4}/) || [])[0]);
  if (!Number.isFinite(yr)) return '2012-present';
  if (yr < 1900) return 'pre-1900';
  if (yr <= 1929) return '1900-1929';
  if (yr <= 1949) return '1930-1949';
  if (yr <= 1966) return '1950-1966';
  if (yr <= 1975) return '1967-1975';
  if (yr <= 1982) return '1976-1982';
  if (yr <= 1990) return '1983-1990';
  if (yr <= 1995) return '1991-1995';
  if (yr <= 2002) return '1996-2002';
  if (yr <= 2006) return '2003-2006';
  if (yr <= 2011) return '2007-2011';
  return '2012-present';
}
