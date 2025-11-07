// app/rooms/page.tsx
'use client';

import Link from 'next/link';
import React from 'react';

export default function RoomsPage(): React.JSX.Element {
  return (
    <main
      style={{
        maxWidth: 1040,
        margin: '0 auto',
        padding: 24,
        fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif',
      }}
    >
      <h1 style={{ fontSize: 28, margin: '6px 0 12px' }}>Heated Rooms</h1>
      <p style={{ color: '#666' }}>
        Placeholder rooms step. Add your rooms UI here. When ready, proceed to Ventilation.
      </p>

      <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
        <Link
          href="/"
          style={{
            border: '1px solid #ddd',
            borderRadius: 10,
            padding: '10px 16px',
            textDecoration: 'none',
            color: '#111',
            background: '#fff',
          }}
        >
          ← Back
        </Link>
        <Link
          href="/ventilation"
          style={{
            background: '#111',
            color: '#fff',
            border: '1px solid #111',
            padding: '12px 18px',
            borderRadius: 12,
            textDecoration: 'none',
          }}
        >
          Next: Ventilation →
        </Link>
      </div>
    </main>
  );
}
