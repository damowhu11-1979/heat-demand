'use client';

import React from 'react';

interface ClearDataButtonProps {
  onClearState: () => void;
  style?: React.CSSProperties;
}

export default function ClearDataButton({ onClearState, style }: ClearDataButtonProps) {
  const handleClick = () => {
    const ok = confirm('Are you sure you want to clear all data?');
    if (!ok) return;

    // Clear localStorage
    if (typeof window !== 'undefined') {
      localStorage.removeItem('mcs.property');
    }

    // Clear React state via callback
    onClearState();
  };

  return (
    <button onClick={handleClick} style={{
      background: '#fff',
      color: '#111',
      border: '1px solid #ddd',
      padding: '10px 16px',
      borderRadius: 10,
      cursor: 'pointer',
      ...style
    }}>
      Clear Data
    </button>
  );
}
