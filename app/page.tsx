// Suggested improvements for the Heat Load Calculator

// 1. Constants instead of magic numbers
const DEFAULTS = {
  HDD_UK_FALLBACK: 2033,
  MEAN_ANNUAL_TEMP: 10.2,
  DESIGN_TEMP_SAFETY_BUFFER: 2,
  LAPSE_RATE: 0.0065, // °C per meter
  BASE_TEMP: 15.5,
} as const;

// 2. Custom hook for number inputs
function useNumberInput(initialValue: number | '') {
  const [value, setValue] = useState<number | ''>(initialValue);
  
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setValue(val === '' ? '' : Number(val));
  };
  
  return [value, handleChange, setValue] as const;
}

// 3. Proper useEffect cleanup
useEffect(() => {
  if (!postcode && !address) return;
  
  const timeoutId = window.setTimeout(async () => {
    try {
      setClimStatus('Auto climate: looking up…');
      const res = await autoClimateCalc(postcode, address, Number(altitude) || 0);
      setHdd(res.hdd);
      setTex(res.designTemp);
      setClimStatus(`Auto climate ✓  HDD ${res.hdd}, DesignT ${res.designTemp}°C`);
    } catch (e: any) {
      setClimStatus(`Auto climate failed: ${e?.message || e}`);
    }
  }, 700);
  
  // Cleanup to prevent memory leaks
  return () => {
    window.clearTimeout(timeoutId);
  };
}, [postcode, address, altitude]);

// 4. Rate limiting helper
class RateLimiter {
  private cache = new Map<string, { data: any; timestamp: number }>();
  private pending = new Map<string, Promise<any>>();
  private readonly cacheDuration = 3600000; // 1 hour
  
  async fetch<T>(key: string, fetcher: () => Promise<T>): Promise<T> {
    // Check cache
    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.timestamp < this.cacheDuration) {
      return cached.data;
    }
    
    // Check if already fetching
    if (this.pending.has(key)) {
      return this.pending.get(key)!;
    }
    
    // Fetch and cache
    const promise = fetcher();
    this.pending.set(key, promise);
    
    try {
      const data = await promise;
      this.cache.set(key, { data, timestamp: Date.now() });
      return data;
    } finally {
      this.pending.delete(key);
    }
  }
}

const rateLimiter = new RateLimiter();

// 5. Input sanitization
function sanitizeInput(input: string): string {
  return input.replace(/[<>'"]/g, '').trim();
}

// 6. Better error handling with specific error types
class GeocodingError extends Error {
  constructor(message: string, public readonly service: string) {
    super(message);
    this.name = 'GeocodingError';
  }
}

class ElevationError extends Error {
  constructor(message: string, public readonly service: string) {
    super(message);
    this.name = 'ElevationError';
  }
}

// 7. Improved geocodeAny with caching
async function geocodeAnyCached(postcode: string, address: string, latlonText?: string): Promise<LatLon> {
  const cacheKey = `geo:${postcode}:${address}:${latlonText}`;
  
  return rateLimiter.fetch(cacheKey, async () => {
    const ll = latlonText ? asLatLon(latlonText) : null;
    if (ll) return { ...ll, src: 'latlon' };
    
    const pc = toPC(sanitizeInput(postcode || ''));
    if (pc) {
      try {
        return await geocodePostcode(pc);
      } catch (err) {
        console.warn('Postcode lookup failed, trying address:', err);
        return await geocodeAddress(pc);
      }
    }
    
    const cleanAddr = sanitizeInput(address);
    if (!cleanAddr || cleanAddr.length < 4) {
      throw new GeocodingError('Enter postcode or address (min 4 chars)', 'none');
    }
    
    return await geocodeAddress(cleanAddr);
  });
}

// 8. Form validation helper
interface ValidationResult {
  isValid: boolean;
  errors: Record<string, string>;
}

function validatePropertyForm(data: {
  reference: string;
  postcode: string;
  epcNo: string;
}): ValidationResult {
  const errors: Record<string, string> = {};
  
  if (!data.reference.trim()) {
    errors.reference = 'Reference is required';
  }
  
  if (!data.postcode.trim() && !data.epcNo.trim()) {
    errors.postcode = 'Postcode or EPC number required';
  }
  
  if (data.postcode && !toPC(data.postcode)) {
    errors.postcode = 'Invalid UK postcode format';
  }
  
  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  };
}

// 9. Accessibility-enhanced Input component
function AccessibleInput({
  label,
  error,
  required,
  ...props
}: {
  label: string;
  error?: string;
  required?: boolean;
} & React.InputHTMLAttributes<HTMLInputElement>) {
  const id = props.id || `input-${label.toLowerCase().replace(/\s+/g, '-')}`;
  const errorId = `${id}-error`;
  
  return (
    <div style={{ marginBottom: 12 }}>
      <label htmlFor={id} style={{ display: 'block', fontSize: 12, color: '#555', marginBottom: 6 }}>
        {label}
        {required && <span style={{ color: '#d33' }}> *</span>}
      </label>
      <input
        {...props}
        id={id}
        aria-required={required}
        aria-invalid={!!error}
        aria-describedby={error ? errorId : undefined}
        style={{
          width: '100%',
          padding: '10px 12px',
          borderRadius: 10,
          border: `1px solid ${error ? '#d33' : '#ddd'}`,
          outline: 'none',
          boxSizing: 'border-box',
        }}
      />
      {error && (
        <div id={errorId} role="alert" style={{ color: '#d33', fontSize: 11, marginTop: 4 }}>
          {error}
        </div>
      )}
    </div>
  );
}

// 10. Loading state management
function useAsyncOperation() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const execute = async <T,>(operation: () => Promise<T>): Promise<T | null> => {
    setLoading(true);
    setError(null);
    try {
      const result = await operation();
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      return null;
    } finally {
      setLoading(false);
    }
  };
  
  return { loading, error, execute };
}
