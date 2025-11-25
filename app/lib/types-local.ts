// app/lib/types-local.ts
export type Orientation = 'N' | 'NE' | 'E' | 'SE' | 'S' | 'SW' | 'W' | 'NW';
export type Adjacent = 'Exterior' | 'Interior (Heated)' | 'Interior (Unheated)' | 'Ground';
export type OpeningKind = 'window' | 'door' | 'roof_window';

export interface Opening { id: string; kind: OpeningKind; width: number; height: number; uValue?: number | ''; }
export interface Wall { id: string; name: string; orientation: Orientation; adjacent: Adjacent; width: number; height: number; uValue?: number | ''; openings: Opening[]; }
export interface FloorEl { id: string; name: string; adjacent: Adjacent; width: number; height: number; uValue?: number | ''; }
export interface CeilingEl { id: string; name: string; type: 'Ceiling' | 'Roof'; adjacent: Exclude<Adjacent, 'Ground'>; width: number; height: number; uValue?: number | ''; openings: Opening[]; }
export interface VentDevice { id: string; type: 'trickle_vent' | 'mvhr_supply' | 'mvhr_extract' | 'mechanical_extract' | 'passive_vent'; overrideFlow?: number | ''; notes?: string; }

export interface RoomModel {
  id?: string;
  zoneId?: string;
  name: string;
  length: number;
  width: number;
  height: number;
  volumeOverride?: number | '' | null;
  walls: Wall[];
  floors: FloorEl[];
  ceilings: CeilingEl[];
  ventilation: VentDevice[];
}
