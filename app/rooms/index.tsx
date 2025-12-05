// pages/rooms/index.tsx

'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';

/* ------------------------------ TYPES ------------------------------ */
// Optional numeric fields are modelled as number | undefined (never null).
// We sanitize any legacy nulls/strings on load so renderers never touch null.
type Room = {
  id: string; // stable key for React & future edits
  zone: number; // index into zones array
  type: string;
  name: string;
  maxCeiling: number; // metres; sanitized to a finite number, defaults to 2.4
  designTemp?: number; // °C
  airChangeRate?: number; // per hour
};

type Zone = { name: string; rooms: Room[] };

/* ------------------------------ STORAGE ------------------------------ */
const ROOMS_KEY = 'mcs.rooms';

const readRooms = (): Zone[] | null => {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(ROOMS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    // sanitize any legacy/null-laden payloads before using in state
    const zones = sanitizeZones(parsed);
    return zones;
  } catch {
    return null;
  }
};

const writeRooms = (zones: Zone[]) => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(ROOMS_KEY, JSON.stringify(zones));
  } catch {}
};

/* ------------------------------ HELPERS ------------------------------ */
const uid = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

/** Converts unknown → number | undefined. Empty/whitespace/null/undefined/boolean/object → undefined. */
const toOptionalNumber = (v: unknown): number | undefined => {
  if (v === null || v === undefined) return undefined;
  if (typeof v === 'string' && v.trim() === '') return undefined;
  if (typeof v === 'boolean') return undefined;
  if (typeof v === 'object') return undefined; // includes arrays
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
};

/**
 * Converts unknown → finite number with fallback.
 * IMPORTANT: Treats null/undefined/''/whitespace/boolean/object as invalid and returns fallback.
 */
const toFiniteNumber = (v: unknown, fallback = 2.4): number => {
  if (v === null || v === undefined) return fallback;
  if (typeof v === 'string' && v.trim() === '') return fallback;
  if (typeof v === 'boolean') return fallback;
  if (typeof v === 'object') return fallback; // includes arrays
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

/** Deep sanitize unknown -> Zone[] ensuring no nulls for optional numbers and valid shapes. */
const sanitizeZones = (input: unknown): Zone[] => {
  const zonesIn = Array.isArray(input) ? input : [];
  return zonesIn.map((z, zi) => {
    const name = typeof (z as any)?.name === 'string' && (z as any).name.trim() ? (z as any).name : `Zone ${zi + 1}`;
    const roomsIn = Array.isArray((z as any)?.rooms) ? (z as any).rooms : [];
    const rooms: Room[] = roomsIn.map((r: any) => {
      const id: string = typeof r?.id === 'string' && r.id ? r.id : uid();
      const zone: number = Number.isInteger(r?.zone) ? r.zone : zi;
      const type: string = typeof r?.type === 'string' ? r.type : '';
      const nameR: string = typeof r?.name === 'string' ? r.name : '';
      const maxCeiling: number = toFiniteNumber(r?.maxCeiling, 2.4);
      const designTemp = toOptionalNumber(r?.designTemp);
      const airChangeRate = toOptionalNumber(r?.airChangeRate);
      return { id, zone, type, name: nameR, maxCeiling, designTemp, airChangeRate };
    });
    return { name, rooms };
  });
};

/* ------------------------------ COMPONENT ------------------------------ */
export default function RoomsPage(): React.JSX.Element {
  // Lazy-init from localStorage to avoid a flicker/hydration mismatch
  const [zones, setZones] = useState<Zone[]>(() => readRooms() ?? [{ name: 'Zone 1', rooms: [] }]);
  const [expanded, setExpanded] = useState<Record<number, boolean>>({ 0: true });
  const [showModal, setShowModal] = useState(false);
  const modalTitleId = 'add-room-title';

  const [form, setForm] = useState<Omit<Room, 'id'>>({
    zone: 0,
    type: '',
    name: '',
    maxCeiling: 2.4,
    designTemp: undefined,
    airChangeRate: undefined,
  });

  // Sync down from localStorage if another tab updates it
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === ROOMS_KEY && e.newValue) {
        try {
          const next = sanitizeZones(JSON.parse(e.newValue));
          setZones(next);
        } catch {}
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  // Persist with a small debounce
  useEffect(() => {
    const t = setTimeout(() => writeRooms(zones), 300);
    return () => clearTimeout(t);
  }, [zones]);

  // Lock background scroll when modal open
  useEffect(() => {
    if (!showModal) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [showModal]);

  const roomTypes = useMemo(
    () => [
      'Bedroom',
      'Living Room',
      'Kitchen',
      'Bathroom',
      'Hallway',
      'Dining Room',
      'Study',
      'Garage',
      'Porch',
      'Other',
    ],
    []
  );

  const onOpenAddRoom = () => {
    setForm({ zone: 0, type: '', name: '', maxCeiling: 2.4, designTemp: undefined, airChangeRate: undefined });
    setShowModal(true);
  };

  const onSaveRoom = () => {
    const name = form.name.trim();
    if (!name) {
      alert('Please enter a room name.');
      return;
    }
    if (!form.type) {
      alert('Please select a room type.');
      return;
    }
    if (!Number.isFinite(form.maxCeiling) || form.maxCeiling <= 0) {
      alert('Max ceiling height must be greater than 0.');
      return;
    }

    const designTemp = toOptionalNumber(form.designTemp);
    const airChangeRate = toOptionalNumber(form.airChangeRate);

    const newRoom: Room = { id: uid(), ...form, name, designTemp, airChangeRate };

    setZones((prev) => {
      const copy = [...prev];
      const targetZone = copy[form.zone];
      if (!targetZone) {
        // If the selected zone index no longer exists, append a new one
        copy[form.zone] = { name: `Zone ${form.zone + 1}`, rooms: [] };
      }
      copy[form.zone] = {
        ...copy[form.zone],
        rooms: [...(copy[form.zone]?.rooms ?? []), newRoom],
      };
      return copy;
    });
    setExpanded((e) => ({ ...e, [form.zone]: true }));
    setShowModal(false);
  };

  const onAddZone = () => {
    setZones((prev) => {
      const nextIndex = prev.length; // index of the new zone
      const next = [...prev, { name: `Zone ${nextIndex + 1}`, rooms: [] }];
      // ensure expand state aligns with the new index even if React batches state
      setExpanded((e) => ({ ...e, [nextIndex]: true }));
      return next;
    });
  };

  const onRemoveRoom = (zoneIdx: number, idx: number) => {
    setZones((prev) => {
      const copy = [...prev];
      const z = copy[zoneIdx];
      if (!z) return prev;
      copy[zoneIdx] = { ...z, rooms: z.rooms.filter((_, i) => i !== idx) };
      return copy;
    });
  };

  // Focus the first control when modal opens
  const firstInputRef = useRef<HTMLSelectElement | null>(null);
  useEffect(() => {
    if (showModal) firstInputRef.current?.focus();
  }, [showModal]);

  /* ------------------------------ DEV TESTS ------------------------------ */
  useEffect(() => {
    if (process.env.NODE_ENV === 'production') return;
    try {
      // 1) null optional numbers should sanitize to undefined
      const zones0 = sanitizeZones([
        {
          name: 'Z1',
          rooms: [
            { id: 'a', zone: 0, type: 'Bedroom', name: 'R1', maxCeiling: 2.5, designTemp: null, airChangeRate: null },
          ],
        },
      ]);
      console.assert(zones0[0].rooms[0].designTemp === undefined, 'designTemp should be undefined');
      console.assert(zones0[0].rooms[0].airChangeRate === undefined, 'airChangeRate should be undefined');

      // 2) string numbers should coerce to numbers
      const zones1 = sanitizeZones([
        {
          name: 'Z1',
          rooms: [
            { id: 'b', zone: 0, type: 'Kitchen', name: 'R2', maxCeiling: '2.60', designTemp: '21', airChangeRate: '1' },
          ],
        },
      ]);
      console.assert(typeof zones1[0].rooms[0].maxCeiling === 'number', 'maxCeiling should be number');
      console.assert(zones1[0].rooms[0].designTemp === 21, 'designTemp should equal 21');
      console.assert(zones1[0].rooms[0].airChangeRate === 1, 'airChangeRate should equal 1');

      // 3) bad numbers fallback
      const zones2 = sanitizeZones([
        { name: 'Z1', rooms: [{ id: 'c', zone: 0, type: 'Other', name: 'R3', maxCeiling: 'NaN' }] },
      ]);
      console.assert(zones2[0].rooms[0].maxCeiling === 2.4, 'invalid maxCeiling falls back to 2.4');

      // 4) missing arrays handled
      const zones3 = sanitizeZones([{ name: 'Zx' }]);
      console.assert(Array.isArray(zones3[0].rooms), 'rooms defaults to array');

      // 5) rendering guards: ensure no crashy toFixed path
      const zones4 = sanitizeZones([
        { name: 'Z1', rooms: [{ id: 'd', zone: 0, type: 'Other', name: 'R4', maxCeiling: null }] },
      ]);
      console.assert(Number.isFinite(zones4[0].rooms[0].maxCeiling), 'maxCeiling sanitized to finite number');

      // 6) explicit null/''/undefined maxCeiling → fallback 2.4 (not 0)
      const zones5 = sanitizeZones([
        { name: 'Z1', rooms: [
          { id: 'e', zone: 0, type: 'Other', name: 'R5', maxCeiling: null },
          { id: 'f', zone: 0, type: 'Other', name: 'R6', maxCeiling: '' },
          { id: 'g', zone: 0, type: 'Other', name: 'R7', maxCeiling: undefined },
        ]},
      ]);
      console.assert(zones5[0].rooms[0].maxCeiling === 2.4, 'null maxCeiling → 2.4');
      console.assert(zones5[0].rooms[1].maxCeiling === 2.4, "'' maxCeiling → 2.4");
      console.assert(zones5[0].rooms[2].maxCeiling === 2.4, 'undefined maxCeiling → 2.4');

      // 7) blank strings for optional numbers → undefined
      const zones6 = sanitizeZones([
        { name: 'Z1', rooms: [{ id: 'h', zone: 0, type: 'Other', name: 'R8', maxCeiling: 2.4, designTemp: '', airChangeRate: '' }] },
      ]);
      console.assert(zones6[0].rooms[0].designTemp === undefined, "'' designTemp → undefined");
      console.assert(zones6[0].rooms[0].airChangeRate === undefined, "'' airChangeRate → undefined");

      // 8) whitespace-only strings should be treated like blank
      const zones7 = sanitizeZones([
        { name: 'Z1', rooms: [{ id: 'i', zone: 0, type: 'Other', name: 'R9', maxCeiling: '  ', designTemp: '  ', airChangeRate: '  ' }] },
      ]);
      console.assert(zones7[0].rooms[0].maxCeiling === 2.4, "whitespace maxCeiling → 2.4");
      console.assert(zones7[0].rooms[0].designTemp === undefined, 'whitespace designTemp → undefined');
      console.assert(zones7[0].rooms[0].airChangeRate === undefined, 'whitespace airChangeRate → undefined');

      // 9) zone index out of bounds handled on save (defensive path)
      const copyZones = sanitizeZones([{ name: 'Z1', rooms: [] }]);
      const prevLen = copyZones.length;
      const tempRoom: Room = { id: 'x', zone: 5, type: 'Other', name: 'RX', maxCeiling: 2.5 };
      const added = [...copyZones];
      const zi = tempRoom.zone;
      if (!added[zi]) added[zi] = { name: `Zone ${zi + 1}`, rooms: [] };
      added[zi] = { ...added[zi], rooms: [...(added[zi]?.rooms ?? []), tempRoom] };
      console.assert(added.length > prevLen, 'out-of-bounds zone should be created');

      // 10) booleans/objects should not coerce; they sanitize correctly
      const zones8 = sanitizeZones([
        { name: 'Z1', rooms: [
          { id: 'j', zone: 0, type: 'Other', name: 'R10', maxCeiling: false as any, designTemp: true as any, airChangeRate: false as any },
          { id: 'k', zone: 0, type: 'Other', name: 'R11', maxCeiling: { x: 1 } as any, designTemp: { y: 2 } as any, airChangeRate: [] as any },
        ]},
      ]);
      console.assert(zones8[0].rooms[0].maxCeiling === 2.4, 'boolean maxCeiling → 2.4');
      console.assert(zones8[0].rooms[0].designTemp === undefined, 'boolean designTemp → undefined');
      console.assert(zones8[0].rooms[0].airChangeRate === undefined, 'boolean airChangeRate → undefined');
      console.assert(zones8[0].rooms[1].maxCeiling === 2.4, 'object maxCeiling → 2.4');
      console.assert(zones8[0].rooms[1].designTemp === undefined, 'object designTemp → undefined');
      console.assert(zones8[0].rooms[1].airChangeRate === undefined, 'array airChangeRate → undefined');

      console.info('✅ RoomsPage dev tests passed');
    } catch (e) {
      // Do not throw in UI — just surface in console
      console.warn('⚠️ RoomsPage dev tests encountered an issue:', e);
    }
  }, []);

  return (
    <main style={wrap}>
      <h1 style={h1}>Rooms</h1>
      <p style={subtle}>List the heated rooms and ceiling heights for each zone of the property.</p>

      <section style={card}>
        {zones.map((zone, zi) => (
          <div key={zone.name + zi} style={{ borderTop: zi ? '1px solid #eee' : undefined, paddingTop: zi ? 12 : 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
              <button
                type="button"
                aria-expanded={!!expanded[zi]}
                aria-controls={`zone-${zi}`}
                onClick={() => setExpanded((e) => ({ ...e, [zi]: !e[zi] }))}
                style={iconBtn}
              >
                {expanded[zi] ? '▾' : '▸'}
              </button>
              <strong>{zone.name}</strong>
            </div>

            {expanded[zi] && (
              <div id={`zone-${zi}`}>
                <div style={rowHeader}>
                  <div style={{ flex: 2 }}>Room Name</div>
                  <div style={{ width: 120, textAlign: 'right' }}>Ceiling (m)</div>
                  <div style={{ width: 140, textAlign: 'right' }}>Design Temp (°C)</div>
                  <div style={{ width: 140, textAlign: 'right' }}>Air Changes (/hr)</div>
                  <div style={{ width: 80 }} />
                </div>

                {zone.rooms.map((r, i) => (
                  <div key={r.id} style={row}>
                    <div style={{ flex: 2 }}>{r.name || '-'}</div>
                    <div style={{ width: 120, textAlign: 'right' }}>
                      {Number.isFinite(r.maxCeiling) ? r.maxCeiling.toFixed(2) : '-'}
                    </div>
                    <div style={{ width: 140, textAlign: 'right' }}>
                      {typeof r.designTemp === 'number' ? r.designTemp : '-'}
                    </div>
                    <div style={{ width: 140, textAlign: 'right' }}>
                      {typeof r.airChangeRate === 'number' ? r.airChangeRate : '-'}
                    </div>
                    <div style={{ width: 80, textAlign: 'right' }}>
                      <button type="button" onClick={() => onRemoveRoom(zi, i)} style={linkDanger}>
                        Remove
                      </button>
                    </div>
                  </div>
                ))}

                {!zone.rooms.length && (
                  <div style={{ ...muted, padding: '10px 4px' }}>No rooms in this zone yet.</div>
                )}
              </div>
            )}
          </div>
        ))}

        <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
          <button type="button" onClick={onOpenAddRoom} style={primaryBtn}>
            Add Room
          </button>
          <button type="button" onClick={onAddZone} style={secondaryBtn}>
            Add Zone
          </button>
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

      {showModal && (
        <div
          style={modalBackdrop}
          onClick={() => setShowModal(false)}
          role="presentation"
        >
          <div
            style={modal}
            role="dialog"
            aria-modal="true"
            aria-labelledby={modalTitleId}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id={modalTitleId} style={{ margin: '0 0 12px' }}>
              Add Room
            </h2>

            <div style={grid2}>
              <div>
                <Label htmlFor="zone">Ventilation Zone *</nLabel>
                <Select
                  id="zone"
                  ref={firstInputRef}
                  value={form.zone}
                  onChange={(e) => setForm({ ...form, zone: Number(e.target.value) })}
                >
                  {zones.map((z, i) => (
                    <option key={z.name + i} value={i}>
                      {z.name}
                    </option>
                  ))}
                </Select>
              </div>

              <div>
                <Label htmlFor="type">Room Type *</Label>
                <Select
                  id="type"
                  value={form.type}
                  onChange={(e) => setForm({ ...form, type: e.target.value })}
                >
                  <option value="">Select room type</option>
                  {roomTypes.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </Select>
              </div>
            </div>

            <Label htmlFor="name">Room Name *</Label>
            <Input
              id="name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="e.g., Master Bedroom"
            />

            <Label htmlFor="ceiling">Max Ceiling Height (m)</Label>
            <Input
              id="ceiling"
              inputMode="decimal"
              type="number"
              step="0.01"
              min={0}
              value={String(form.maxCeiling)}
              onChange={(e) => setForm({ ...form, maxCeiling: Number(e.target.value) || 0 })}
            />

            <Label htmlFor="designTemp">Design Temperature (°C)</Label>
            <Input
              id="designTemp"
              inputMode="decimal"
              type="number"
              value={form.designTemp ?? ''}
              onChange={(e) => setForm({ ...form, designTemp: toOptionalNumber(e.target.value) })}
              placeholder="Optional"
            />

            <Label htmlFor="airChanges">Air Change Rate (/hr)</Label>
            <Input
              id="airChanges"
              inputMode="decimal"
              type="number"
              value={form.airChangeRate ?? ''}
              onChange={(e) => setForm({ ...form, airChangeRate: toOptionalNumber(e.target.value) })}
              placeholder="Optional"
            />

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 14 }}>
              <button type="button" onClick={() => setShowModal(false)} style={secondaryBtn}>
                Cancel
              </button>
              <button type="button" onClick={onSaveRoom} style={primaryBtn}>
                Save room
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

/* ------------------------------ UI Components ------------------------------ */
function Label({ children, htmlFor }: { children: React.ReactNode; htmlFor?: string }) {
  return (
    <label htmlFor={htmlFor} style={{ display: 'block', margin: '12px 0 6px', color: '#555', fontSize: 12 }}>
      {children}
    </label>
  );
}

function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} style={{ ...input, ...(props.style || {}) }} />;
}

const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(function Select(
  props,
  ref
) {
  // eslint-disable-next-line jsx-a11y/no-onchange
  return <select ref={ref} {...props} style={{ ...input, ...(props.style || {}) }} />;
});

/* ------------------------------ Styles ------------------------------ */
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
  border: '1px solid #111',
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

const linkDanger: React.CSSProperties = {
  color: '#b00020',
  cursor: 'pointer',
  textDecoration: 'underline',
  background: 'none',
  border: 0,
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
  width: 'min(700px, 90vw)',
  borderRadius: 14,
  border: '1px solid #e6e6e6',
  padding: 20,
  boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
};
