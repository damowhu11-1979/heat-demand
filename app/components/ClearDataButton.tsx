"use client";
export default function ClearDataButton({ onClearState }: { onClearState: () => void }) {
  return (
    <button
      onClick={onClearState}
      style={{
        background: '#fff',
        color: '#111',
        border: '1px solid #ddd',
        padding: '10px 16px',
        borderRadius: 10,
        cursor: 'pointer'
      }}
    >
      Clear Data
    </button>
  );
}
