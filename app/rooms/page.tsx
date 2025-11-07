import Link from 'next/link';

// ... inside your Rooms component render:
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
