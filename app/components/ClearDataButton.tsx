'use client';

import React from 'react';

type Props = {
  /** Optional: run after clearing localStorage to refresh UI/state */
  onCleared?: () => void;
  /** Optional: extra localStorage keys to remove */
  extraKeys?: string[];
};

/**
 * Clears all calculator data from localStorage.
 * Keys used in this project:
 * - mcs.property
 * - mcs.ventilation
 * - mcs.rooms
 * - mcs.elements
 */
export default function ClearDataButton({ onCleared, extraKeys }: Props) {
  const handleClear = () => {
    try {
      const keys = [
        'mcs.property',
        'mcs.ventilation',
        'mcs.rooms',
        'mcs.elements',
        ...(extraKeys || []),
      ];
      keys.forEach((k) => localStorage.removeItem(k));
      // small confirm
      // eslint-disable-next-line no-alert
      alert('All saved calculator data has been cleared.');
      onCleared?.();
    } catch {
      // ignore
    }
  };

  return (
    <button
      type="button"
      onClick={handleClear}
      style={{
        background: '#fff',
        color: '#111',
        border: '1px solid #ddd',
        padding: '8px 12px',
        borderRadius: 10,
        cursor: 'pointer',
      }}
      title="Clear all saved data (localStorage)"
    >
      Clear saved data
    </button>
  );
}
