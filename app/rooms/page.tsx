'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';

/* ------------------------------ TYPES ------------------------------ */

type Room = {
  zone: number;                 // index of the zone this room belongs to
  type: string;                 // Bedroom, Kitchen, etc.
  name: string;                 // User-visible name
  maxCeiling: number;           // meters
  designTemp: number;           // °C (required)
  airChangeRate: number;        // /hr (required)

  // Optional / advanced:
  internalAirVolume?: number;   // m³
  intermittentHeatingPct?: number; // 0-100
  heatGainsW?: number;          // Watts
};

type Zone = { name: string; Rooms: Room[] };

/* ------------------------------ STORAGE ------------------------------ */

const STORAGE_VERSION = 2;
const ROOMS_KEY = 'mcs.Rooms.v2';

const safeParse = <T,>(raw: string | null): T | null => {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
};

const readRooms = (): Zone[] | null => {
  if (typeof window === 'undefined') return null;
  const parsed = safeParse<{ version: number; zones: Zone[] }>(
    localStorage.getItem(ROOMS_KEY)
  );
  if (parsed?.version === STORAGE_VERSION && Array.isArray(parsed.zones)) {
    return parsed.zones;
  }
  return null;
};

const writeRooms = (zones: Zone[]) => {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(ROOMS_KEY, JSON.stringify({ version: STORAGE_VERSION, zones }));
  } catch {}
};

/* ----------------------- AGE BAND → DEFAULTS ----------------------- */
/** Age Band written by the Property page (page 1) */
const AGE_BAND_KEY = 'mcs.AgeBand' as const;

/** Earlier bands (A) — per-room recommendations */
const RECOMMENDED_BY_ROOM_AGE_A: Record<string, number> = {
  Bathroom: 22,
  Bedroom: 18,
  'Bedroom with en-suite': 21,
  'Bedroom/study': 21,
  'Breakfast room': 21,
  'Cloakroom/WC': 18,
  'Dining Room': 21,
  'Family/morning room': 21,
  'Games room': 21,
  Hall: 18,
  'Internal room/corridor': 18,
  Kitchen: 18,
  Landing: 18,
  'Lounge/sitting room': 21,
  'Living Room': 21,
  'Shower room': 22,
  'Store room': 10,
  Study: 21,
  Toilet: 18,
  'Utility room': 15,
  Other: 21,
};

/** Newer, well-insulated bands (B onwards): 21 °C everywhere except bathrooms at 22 °C */
const RECOMMENDED_BY_ROOM_AGE_B_ONWARDS: Record<string, number> = new Proxy({}, {
  get: (_t, k: string) => (k === 'Bathroom' || k === 'Shower room' ? 22 : 21),
}) as Record<string, number>;

/** Adjust this to match your project’s “B onwards” mapping */
const AGE_B_BANDS = new Set<string>(['2012-present']);

const readAgeBand = (): string | null => {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(AGE_BAND_KEY);
};

const isAgeBandBOnwards = () => {
  const band = readAgeBand();
  return band ? AGE_B_BANDS.has(band) : false;
};

const recommendedTempFor = (roomType: string): number => {
  if (!roomType) return 21;
  return isAgeBandBOnwards()
    ? RECOMMENDED_BY_ROOM_AGE_B_ONWARDS[roomType] ?? 21
    : RECOMMENDED_BY_ROOM_AGE_A[roomType] ?? 21;
};

/* ------------------------------ HELPERS ------------------------------ */

const toNumberOr = (val: string, fallback: number | undefined) => {
  if (val === '') return undefined;
  const n = Number(val);
  return Number.isFinite(n) ? n : fallback;
};

const clamp = (n: number, min: number, max: number) => Math.min(Math.max(n, min), max);

/* ------------------------------ PAGE ------------------------------ */

export default function RoomsPage(): React.JSX.Element {
  const [zones, setZones] = useState<Zone[]>([{ name: 'Zone 1', Rooms: [] }]);
  const [expanded, setExpanded] = useState<Record<number, boolean>>({ 0: true });
  const [userEditedDesignTemp, setUserEditedDesignTemp] = useState(false);

  const [showModal, setShowModal] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editingIndices, setEditingIndices] = useState<{ zoneIdx: number; roomIdx: number } | null>(null);

  const emptyForm: Room = {
    zone: 0,
    type: '',
    name: '',
    maxCeiling: 2.4,
    designTemp: 21, // neutral; will set from room type + age band on selection
    airChangeRate: 1,
    internalAirVolume: undefined,
    intermittentHeatingPct: undefined,
    heatGainsW: undefined,
  };
  const [form, setForm] = useState<Room>(emptyForm);

  /* Load existing Rooms */
  useEffect(() => {
    const saved = readRooms();
    if (saved && Array.isArray(saved) && saved.length) {
      setZones(saved);
      setExpanded({ 0: true });
    }
  }, []);

  /* Auto-save */
  useEffect(() => {
    const t = setTimeout(() => writeRooms(zones), 300);
    return () => clearTimeout(t);
  }, [zones]);

  /* Room type list (aligned with recommendation table keys) */
  const roomTypes = useMemo(
    () => [
      'Bathroom',
      'Bedroom',
      'Bedroom with en-suite',
      'Bedroom/study',
      'Breakfast room',
      'Cloakroom/WC',
      'Dining Room',
      'Family/morning room',
      'Games room',
      'Hall',
      'Internal room/corridor',
      'Kitchen',
      'Landing',
      'Lounge/sitting room',
      'Living Room',
      'Shower room',
      'Store room',
      'Study',
      'Toilet',
      'Utility room',
      'Other',
    ],
    []
  );

  /* Open Add Room */
  const onOpenAddRoom = () => {
    setIsEditing(false);
    setEditingIndices(null);
    setUserEditedDesignTemp(false);
    setForm({
      ...emptyForm,
      zone: 0,
      designTemp: 21, // neutral; will be set by room type + age band
    });
    setShowModal(true);
  };

  /* Open Edit Room */
  const onOpenEditRoom = (zoneIdx: number, roomIdx: number) => {
    const room = zones[zoneIdx].Rooms[roomIdx];
    setIsEditing(true);
    setEditingIndices({ zoneIdx, roomIdx });
    setUserEditedDesignTemp(false);
    setForm({ ...room });
    setShowModal(true);
  };

  /* Validation */
  const validate = (r: Room): string[] => {
    const errs: string[] = [];
    if (!r.name.trim()) errs.push('Room name is required.');
    if (!r.type.trim()) errs.push('Room type is required.');
    if (r.zone < 0 || r.zone >= zones.length) errs.push('Ventilation Zone is invalid.');
    if (!(Number.isFinite(r.maxCeiling) && r.maxCeiling > 0)) errs.push('Max ceiling height must be > 0.');
    if (!(Number.isFinite(r.designTemp))) errs.push('Design temperature is required.');
    if (!(Number.isFinite(r.airChangeRate) && r.airChangeRate >= 0)) errs.push('Air change rate is required (>= 0).');

    if (r.intermittentHeatingPct !== undefined) {
      const pct = clamp(r.intermittentHeatingPct, 0, 100);
      if (pct !== r.intermittentHeatingPct) errs.push('Intermittent heating must be 0–100%.');
    }
    if (r.internalAirVolume !== undefined && r.internalAirVolume < 0) {
      errs.push('Internal air volume must be >= 0.');
    }
    if (r.heatGainsW !== undefined && r.heatGainsW < 0) {
      errs.push('Heat gains must be >= 0 W.');
    }

    // Duplicate name within same zone (soft check)
    const namesInZone = new Set(
      zones[r.zone].Rooms
        .filter((_r, idx) => !(isEditing && editingIndices && r.zone === editingIndices.zoneIdx && idx === editingIndices.roomIdx))
        .map(_r => _r.name.trim().toLowerCase())
    );
    if (namesInZone.has(r.name.trim().toLowerCase())) {
      errs.push('A room with this name already exists in the selected zone.');
    }

    return errs;
  };

  /* Save Room (Create/Update) */
  const onSaveRoom = () => {
    const errs = validate(form);
    if (errs.length) {
      alert(errs.join('\n'));
      return;
    }
    const copy = [...zones];

    if (isEditing && editingIndices) {
      const { zoneIdx, roomIdx } = editingIndices;

      // If zone moved, remove from old and push into new
      if (zoneIdx !== form.zone) {
        const moved = { ...form };
        copy[zoneIdx] = {
          ...copy[zoneIdx],
          Rooms: copy[zoneIdx].Rooms.filter((_, i) => i !== roomIdx),
        };
        copy[form.zone] = {
          ...copy[form.zone],
          Rooms: [...copy[form.zone].Rooms, moved],
        };
        setExpanded((e) => ({ ...e, [form.zone]: true }));
      } else {
        // In-place update
        const roomsCopy = [...copy[zoneIdx].Rooms];
        roomsCopy[roomIdx] = { ...form };
        copy[zoneIdx] = { ...copy[zoneIdx], Rooms: roomsCopy };
      }
    } else {
      copy[form.zone] = {
        ...copy[form.zone],
        Rooms: [...copy[form.zone].Rooms, { ...form }],
      };
      setExpanded((e) => ({ ...e, [form.zone]: true }));
    }

    setZones(copy);
    setShowModal(false);
    setIsEditing(false);
    setEditingIndices(null);
  };

  /* Add zone */
  const onAddZone = () => {
    const n = zones.length + 1;
    setZones([...zones, { name: `Zone ${n}`, Rooms: [] }]);
    setExpanded((e) => ({ ...e, [zones.length]: true }));
  };

  /* Remove room */
  const onRemoveRoom = (zoneIdx: number, idx: number) => {
    const ok = confirm('Remove this room? This cannot be undone.');
    if (!ok) return;
    const copy = [...zones];
    copy[zoneIdx] = {
      ...copy[zoneIdx],
      Rooms: copy[zoneIdx].Rooms.filter((_, i) => i !== idx),
    };
    setZones(copy);
  };

  /* ------------------------------ RENDER ------------------------------ */

  return (
    <main style={wrap}>
      <h1 style={h1}>Rooms</h1>
      <p style={subtle}>List the rooms and ceiling heights for each zone of the property. Design temperature and air change rate are required.</p>

      <section style={card}>
        {zones.map((zone, zi) => (
          <div
            key={zi}
            style={{
              borderTop: zi ? '1px solid #eee' : undefined,
              paddingTop: zi ? 12 : 0,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
              <button
                onClick={() => setExpanded((e) => ({ ...e, [zi]: !e[zi] }))}
                style={iconBtn}
              >
                {expanded[zi] ? '▾' : '▸'}
              </button>
              <strong>{zone.name}</strong>
            </div>

            {expanded[zi] && (
              <div>
                <div style={rowHeader}>
                  <div style={{ flex: 2 }}>Room Name</div>
                  <div style={{ width: 160 }}>Type</div>
                  <div style={{ width: 110, textAlign: 'right' }}>Ceiling (m)</div>
                  <div style={{ width: 140, textAlign: 'right' }}>Design Temp (°C)</div>
                  <div style={{ width: 140, textAlign: 'right' }}>Air Changes (/hr)</div>
                  <div style={{ width: 80 }}></div>
                </div>

                {zone.Rooms.map((r, i) => (
                  <div key={i} style={row}>
                    <div style={{ flex: 2, overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.name}</div>
                    <div style={{ width: 160, overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.type || '-'}</div>
                    <div style={{ width: 110, textAlign: 'right' }}>{r.maxCeiling.toFixed(2)}</div>
                    <div style={{ width: 140, textAlign: 'right' }}>{r.designTemp}</div>
                    <div style={{ width: 140, textAlign: 'right' }}>{r.airChangeRate}</div>

                    <div style={{ width: 80, textAlign: 'right', display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                      <button onClick={() => onOpenEditRoom(zi, i)} style={linkBtn}>Edit</button>
                      <button onClick={() => onRemoveRoom(zi, i)} style={linkDanger}>Remove</button>
                    </div>
                  </div>
                ))}

                {!zone.Rooms.length && (
                  <div style={{ ...muted, padding: '10px 4px' }}>No rooms in this zone yet.</div>
                )}
              </div>
            )}
          </div>
        ))}

        <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
          <button onClick={onOpenAddRoom} style={primaryBtn}>Add Room</button>
          <button onClick={onAddZone} style={secondaryBtn}>Add Zone</button>
        </div>
      </section>

      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 16 }}>
        <Link href="/ventilation" style={{ ...secondaryBtn, textDecoration: 'none' }}>
          ← Back: Ventilation
        </Link>

        <Link href="/elements" style={{ ...primaryBtn, textDecoration: 'none' }}>
          Next: Building Elements →
        </Link>
      </div>

      {/* ------------------------------ MODAL ------------------------------ */}
      {showModal && (
        <div style={modalBackdrop} onClick={() => setShowModal(false)}>
          <div style={modal} onClick={(e) => e.stopPropagation()}>
            <h2 style={{ margin: '0 0 12px' }}>{isEditing ? 'Edit Room' : 'Add Room'}</h2>

            <div style={grid2}>
              <div>
                <Label>Ventilation Zone *</Label>
                <Select
                  value={form.zone}
                  onChange={(e) => setForm({ ...form, zone: Number(e.target.value) })}
                >
                  {zones.map((z, i) => (
                    <option key={i} value={i}>{z.name}</option>
                  ))}
                </Select>
              </div>

              <div>
                <Label>Room Type *</Label>
                <Select
                  value={form.type}
                  onChange={(e) => {
                    const nextType = e.target.value;
                    const next = { ...form, type: nextType };
                    if (!userEditedDesignTemp) {
                      next.designTemp = recommendedTempFor(nextType);
                    }
                    setForm(next);
                  }}
                >
                  <option value="">Select room type</option>
                  {roomTypes.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </Select>
              </div>
            </div>

            <Label>Room Name *</Label>
            <Input
              value={form.name}
              placeholder="e.g., Master Bedroom"
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />

            <div style={grid2}>
              <div>
                <Label>Max Ceiling Height (m) *</Label>
                <Input
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  value={form.maxCeiling}
                  onChange={(e) =>
                    setForm({ ...form, maxCeiling: Number(e.target.value) || 0 })
                  }
                />
              </div>

              <div>
                <Label>Design Temperature (°C) *</Label>
                <Input
                  type="number"
                  inputMode="decimal"
                  value={form.designTemp}
                  onChange={(e) => {
                    setUserEditedDesignTemp(true);
                    setForm({ ...form, designTemp: Number(e.target.value) });
                  }}
                />
                {form.type && (
                  <div style={{ fontSize: 12, color: '#666', marginTop: 6 }}>
                    Recommended for <strong>{form.type}</strong>{' '}
                    ({isAgeBandBOnwards() ? 'Age Band B onwards' : 'Earlier age bands'})
                    : <strong>{recommendedTempFor(form.type)}°C</strong>
                    {!userEditedDesignTemp &&
                      form.designTemp !== recommendedTempFor(form.type) && (
                        <>
                          {' '}
                          <button
                            style={{ ...linkBtn, marginLeft: 6 }}
                            onClick={() =>
                              setForm({ ...form, designTemp: recommendedTempFor(form.type) })
                            }
                          >
                            Apply
                          </button>
                        </>
                      )}
                  </div>
                )}
              </div>
            </div>

            <div style={grid2}>
              <div>
                <Label>Air Change Rate (/hr) *</Label>
                <Input
                  type="number"
                  inputMode="decimal"
                  step="0.1"
                  value={form.airChangeRate}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      airChangeRate: Number(e.target.value),
                    })
                  }
                />
              </div>

              <div>
                <Label>Internal Air Volume (m³)</Label>
                <Input
                  type="number"
                  inputMode="decimal"
                  step="0.1"
                  value={form.internalAirVolume ?? ''}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      internalAirVolume: toNumberOr(e.target.value, form.internalAirVolume),
                    })
                  }
                />
              </div>
            </div>

            <div style={grid2}>
              <div>
                <Label>Intermittent Heating (%)</Label>
                <Input
                  type="number"
                  inputMode="decimal"
                  step="1"
                  min={0}
                  max={100}
                  value={form.intermittentHeatingPct ?? ''}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      intermittentHeatingPct: toNumberOr(e.target.value, form.intermittentHeatingPct),
                    })
                  }
                />
              </div>

              <div>
                <Label>Heat Gains (W)</Label>
                <Input
                  type="number"
                  inputMode="decimal"
                  step="1"
                  value={form.heatGainsW ?? ''}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      heatGainsW: toNumberOr(e.target.value, form.heatGainsW),
                    })
                  }
                />
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 14 }}>
              <button onClick={() => setShowModal(false)} style={secondaryBtn}>
                Cancel
              </button>
              <button onClick={onSaveRoom} style={primaryBtn}>
                {isEditing ? 'Save changes' : 'Save room'}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

/* ------------------------------ UI COMPONENTS ------------------------------ */

function Label({ children }: { children: React.ReactNode }) {
  return <label style={{ display: 'block', margin: '12px 0 6px', color: '#555', fontSize: 12 }}>{children}</label>;
}

function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} style={{ ...input, ...(props.style || {}) }} />;
}

function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} style={{ ...input, ...(props.style || {}) }} />;
}

/* ------------------------------ STYLES ------------------------------ */

const wrap: React.CSSProperties = {
  maxWidth: 1040,
  margin: '0 auto',
  padding: 24,
};

const h1: React.CSSProperties = { fontSize: 28, margin: '6px 0 12px' };

const subtle: React.CSSProperties = { fontSize: 13, color: '#666', marginBottom: 16 };

const muted: React.CSSProperties = { color: '#777' };

const card: React.CSSProperties = {
  background: '#fff',
  border: '1px solid #eee',
  borderRadius: 14,
  padding: 16,
};

const rowHeader: React.CSSProperties = {
  display: 'flex',
  padding: '8px 4px',
  borderBottom: '1px solid #eee',
  fontSize: 12,
  color: '#555',
};

const row: React.CSSProperties = {
  display: 'flex',
  padding: '10px 4px',
  alignItems: 'center',
  borderBottom: '1px solid #f4f4f4',
  gap: 8,
};

const input: React.CSSProperties = {
  width: '100%',
  padding: '10px 12px',
  borderRadius: 10,
  border: '1px solid #ddd',
  outline: 'none',
};

const primaryBtn: React.CSSProperties = {
  background: '#111',
  color: '#fff',
  border: '1px solid #111',   // ✅ fixed
  padding: '10px 16px',
  borderRadius: 12,
  cursor: 'pointer',
};

const secondaryBtn: React.CSSProperties = {
  background: '#fff',
  color: '#111',
  border: '1px solid #ddd',
  padding: '10px 16px',
  borderRadius: 12,
  cursor: 'pointer',
};

const linkBtn: React.CSSProperties = {
  color: '#0a58ca',
  cursor: 'pointer',
  textDecoration: 'underline',
  background: 'none',
  border: 0,
  padding: 0,
};

const linkDanger: React.CSSProperties = {
  color: '#b00020',
  cursor: 'pointer',
  textDecoration: 'underline',
  background: 'none',
  border: 0,
  padding: 0,
};

const iconBtn: React.CSSProperties = {
  padding: '4px 10px',
  borderRadius: 8,
  border: '1px solid #ccc',
  cursor: 'pointer',
  background: '#fafafa',
};

const grid2: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(2, 1fr)',
  gap: 12,
};

const modalBackdrop: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0,0,0,0.3)',
  display: 'grid',
  placeItems: 'center',
  zIndex: 50,
};

const modal: React.CSSProperties = {
  background: '#fff',
  width: 'min(720px, 92vw)',
  borderRadius: 14,
  border: '1px solid #e6e6e6',
  padding: 20,
  boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
};
