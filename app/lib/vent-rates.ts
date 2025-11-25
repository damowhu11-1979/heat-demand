// app/lib/vent-rates.ts
export type AgeBand = 'pre_2003' | 'y2003_2010' | 'y2010_2021' | 'y2021_plus';
export type RoomType = 'kitchen' | 'utility' | 'bathroom' | 'wc' | 'habitable' | 'bedroom' | 'living';

// Example defaults; edit to match your chosen guidance
export const VentRates_lps: Record<AgeBand, Record<RoomType, number>> = {
  pre_2003:   { kitchen: 30, utility: 15, bathroom: 15, wc: 6, habitable: 10, bedroom: 8, living: 10 },
  y2003_2010: { kitchen: 30, utility: 15, bathroom: 15, wc: 6, habitable: 10, bedroom: 8, living: 10 },
  y2010_2021: { kitchen: 30, utility: 15, bathroom: 15, wc: 6, habitable: 10, bedroom: 8, living: 10 },
  y2021_plus: { kitchen: 36, utility: 18, bathroom: 15, wc: 8, habitable: 12, bedroom: 10, living: 12 },
};

export function getBaseVentRate_lps(age: AgeBand, roomType: RoomType): number {
  const a = VentRates_lps[age] || VentRates_lps.y2021_plus;
  return a[roomType] ?? 10;
}
