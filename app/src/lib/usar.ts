import { useCallback, useEffect, useRef, useState } from 'react';

// Petición asíncrona con estados de carga y error. `run` vuelve a lanzarla.
export function usePeticion<T>(fn: () => Promise<T>, deps: unknown[] = [], { auto = true } = {}) {
  const [datos, setDatos] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(auto);
  const vivo = useRef(0);
  const run = useCallback(async () => {
    const id = ++vivo.current;
    setCargando(true); setError(null);
    try { const r = await fn(); if (id === vivo.current) setDatos(r); return r; }
    catch (e) { if (id === vivo.current) setError((e as Error).message || 'Algo falló.'); return null; }
    finally { if (id === vivo.current) setCargando(false); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  useEffect(() => { if (auto) run(); }, [run, auto]);
  return { datos, error, cargando, run, setDatos };
}

// Hora actual que avanza cada segundo (para los relojes).
export function useAhora(cada = 1000) {
  const [t, setT] = useState(Date.now());
  useEffect(() => { const i = setInterval(() => setT(Date.now()), cada); return () => clearInterval(i); }, [cada]);
  return t;
}

export function useLocal<T>(clave: string, inicial: T) {
  const [v, setV] = useState<T>(() => { try { const s = localStorage.getItem(clave); return s ? (JSON.parse(s) as T) : inicial; } catch { return inicial; } });
  const set = (x: T) => { setV(x); try { localStorage.setItem(clave, JSON.stringify(x)); } catch { /* sin almacenamiento */ } };
  return [v, set] as const;
}
