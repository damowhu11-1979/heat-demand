'use client';
import { useMemo } from 'react';

export function firstPathSegmentFrom(pathname: string): string {
  if (typeof pathname !== 'string' || pathname.length === 0 || pathname === '/') return '';
  const m = /^\/[^/]+/.exec(pathname);
  return m ? m[0] : '';
}

export function computeBasePath(): string {
  try {
    const envBase = (process as any)?.env?.NEXT_PUBLIC_BASE_PATH || '';
    if (typeof envBase === 'string' && envBase) return envBase;
  } catch {}
  if (typeof window !== 'undefined') {
    try {
      const injected = (window as any).__BASE_PATH__;
      if (typeof injected === 'string' && injected) return injected;
      const pathname = window.location?.pathname ?? '';
      return firstPathSegmentFrom(pathname);
    } catch {}
  }
  return '';
}

export function useBasePath() {
  return useMemo(() => computeBasePath(), []);
}

// Idempotent prefix
export function withBase(href: string, base: string) {
  if (!base) return href;
  if (href.startsWith(base + '/')) return href;
  return `${base}${href.startsWith('/') ? '' : '/'}${href}`;
}
