'use client';

export default function ClearDataButton() {
  const clearAll = () => {
    try {
      localStorage.removeItem('mcs.property');
      localStorage.removeItem('mcs.rooms');
      localStorage.removeItem('mcs.elements.v1');
      alert('All saved data cleared.');
      // optional: hard refresh
      window.location.reload();
    } catch {
      alert('Unable to clear saved data (storage not available).');
    }
  };

  return (
    <button
      type="button"
      onClick={clearAll}
      style={{
        borderRadius: 10,
        padding: '10px 14px',
        border: '1px solid #ddd',
        background: '#fff',
        color: '#111',
        cursor: 'pointer',
      }}
      aria-label="Clear saved data"
      title="Clear saved data"
    >
      Clear data
    </button>
  );
}
