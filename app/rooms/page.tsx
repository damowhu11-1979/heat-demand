'use client';

import React, { useEffect, useState } from 'react';
// import Link from 'next/link'; // Removed to fix the compilation error

// --- Replicating shared constants and styles from the previous page for consistency ---

const FONT_STACK = 'system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif';
const STORAGE_KEY = 'mcs.heated_rooms';

const HEATABLE_ROOMS = {
  kitchen: 'Kitchen',
  living: 'Living Room',
  bedroom: 'Bedroom 1',
  'bedroom-2': 'Bedroom 2',
  study: 'Study/Office',
  hall: 'Hallway',
};

const DEFAULT_ROOM_SETTINGS = Object.keys(HEATABLE_ROOMS).reduce((acc, key) => {
  acc[key] = { heated: true, setpoint: 20 }; // Default to heated at 20°C
  return acc;
}, {} as Record<string, { heated: boolean; setpoint: number }>);


/* ───────── storage helpers ───────── */
const readRooms = () => {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};
const writeRooms = (obj: any) => {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(obj));
  } catch {}
};

/* ───────── UI atoms/styles ───────── */
const Label = ({ children, style }: { children: React.ReactNode, style?: React.CSSProperties }) => (
  <label style={{ display: 'block', fontWeight: 600, marginBottom: 4, ...style }}>{children}</label>
);

const primaryBtn: React.CSSProperties = {
  background: '#111',
  color: '#fff',
  padding: '10px 14px',
  borderRadius: 10,
  textDecoration: 'none',
  border: 0,
  cursor: 'pointer',
};

const secondaryBtn: React.CSSProperties = {
  background: '#fff',
  color: '#111',
  padding: '10px 14px',
  borderRadius: 10,
  textDecoration: 'none',
  border: '1px solid #ccc',
  cursor: 'pointer',
};

const inputStyle: React.CSSProperties = {
  fontFamily: 'inherit',
  padding: '8px 10px',
  border: '1px solid #ddd',
  borderRadius: 8,
  width: '100%',
  boxSizing: 'border-box',
};

// ───────── component ─────────
export default function HeatedRoomsPage() {
  const [roomSettings, setRoomSettings] = useState(DEFAULT_ROOM_SETTINGS);

  const numHeatedRooms = Object.values(roomSettings).filter(r => r.heated).length;
  
  const updateRoom = (key: string, field: 'heated' | 'setpoint', value: boolean | number) => {
    setRoomSettings(prev => ({
      ...prev,
      [key]: { ...prev[key], [field]: value },
    }));
  };

  // Load state from localStorage on mount
  useEffect(() => {
    const saved = readRooms();
    if (saved) {
      setRoomSettings((prev) => ({ ...prev, ...saved }));
    }
  }, []);

  // Save state to localStorage whenever it changes
  useEffect(() => {
    writeRooms(roomSettings);
  }, [roomSettings]);


  const roomGrid: React.CSSProperties = {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
    gap: 20,
    marginBottom: 20,
  };

  const roomCard: React.CSSProperties = {
    border: '1px solid #eee',
    borderRadius: 10,
    padding: 16,
    boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  };

  const statusChip: React.CSSProperties = {
    padding: '4px 8px',
    borderRadius: 999,
    fontSize: 12,
    fontWeight: 600,
    textAlign: 'center' as const,
  };


  return (
    <main style={{ maxWidth: 900, margin: '0 auto', padding: 20, fontFamily: FONT_STACK }}>
      
      {/* Sticky summary */}
      <div
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 10,
          background: '#fff',
          padding: '10px 12px',
          margin: '-8px 0 12px',
          border: '1px solid #eee',
          borderRadius: 10,
          boxShadow: '0 2px 6px rgba(0,0,0,0.04)',
          display: 'flex',
          gap: 12,
          flexWrap: 'wrap',
          alignItems: 'center',
        }}
      >
        <strong style={{ marginRight: 8 }}>Heated Rooms</strong>
        <span
          style={{
            ...statusChip,
            background: numHeatedRooms > 0 ? '#e5ffe5' : '#fffae5',
            color: numHeatedRooms > 0 ? '#111' : '#a07d00',
          }}
        >
          {numHeatedRooms} Heated {numHeatedRooms === 1 ? 'Zone' : 'Zones'}
        </span>
      </div>

      <h1 style={{ fontSize: 28, marginBottom: 6 }}>Heated Rooms Configuration</h1>
      <p style={{ color: '#666', fontSize: 13, marginBottom: 20 }}>
        Step 3 of 6 — Define which rooms are heated and their temperature setpoints for heat loss calculations.
      </p>

      <section>
        <h3 style={{ fontSize: 18, marginBottom: 12 }}>Room Setpoints</h3>
        <div style={roomGrid}>
          {Object.entries(HEATABLE_ROOMS).map(([key, label]) => {
            const settings = roomSettings[key];
            const isHeated = settings ? settings.heated : false;
            const setpoint = settings ? settings.setpoint : 0;

            return (
              <div 
                key={key} 
                style={{
                  ...roomCard,
                  borderColor: isHeated ? '#a0e8a0' : '#ddd',
                  opacity: isHeated ? 1 : 0.6,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                  <h4 style={{ fontSize: 16, margin: 0 }}>{label}</h4>
                  <span style={{ ...statusChip, background: isHeated ? '#22c55e' : '#fef2f2', color: isHeated ? '#fff' : '#ef4444' }}>
                    {isHeated ? 'Heated' : 'Unheated'}
                  </span>
                </div>
                
                <Label>
                  <input
                    type="checkbox"
                    checked={isHeated}
                    onChange={(e) => updateRoom(key, 'heated', e.target.checked)}
                    style={{ marginRight: 8, transform: 'scale(1.2)' }}
                  />
                  Include in heated space
                </Label>

                <div style={{ pointerEvents: isHeated ? 'auto' : 'none', opacity: isHeated ? 1 : 0.4 }}>
                  <Label style={{ fontWeight: 500 }}>
                    Target Temperature Setpoint (°C)
                  </Label>
                  <input
                    type="number"
                    min={10}
                    max={30}
                    step={1}
                    value={setpoint}
                    onChange={(e) => updateRoom(key, 'setpoint', parseInt(e.target.value || '0'))}
                    style={inputStyle}
                  />
                  <p style={{ fontSize: 12, color: '#666', marginTop: 4 }}>
                    Standard living areas are typically 20°C.
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Navigation Footer */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          position: 'sticky',
          bottom: 0,
          background: '#fff',
          paddingTop: 8,
        }}
      >
        {/* Replaced Link with standard <a> tag */}
        <a href="/ventilation" style={secondaryBtn}>
          ← Back: Ventilation
        </a>
        {/* Updated 'Next' link to Building Elements */}
        <a href="/building-elements" style={primaryBtn}>
          Next: Building Elements →
        </a>
      </div>
    </main>
  );
}
