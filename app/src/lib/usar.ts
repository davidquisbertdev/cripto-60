import { useCallback, useEffect, useRef, useState } from 'react';

// Caché en memoria de las peticiones: al volver a una pantalla (BTC, Ballenas, Noticias, Escáner…)
// se muestra al instante lo ya cargado sin volver a pedirlo; solo el botón Actualizar (`run`)
// vuelve a pedir datos frescos. Vive mientras dure la sesión en la app.
const CACHE = new Map<string, unknown>();

// Petición asíncrona con estados de carga y error. `run` vuelve a lanzarla. Con `clave`, la respuesta
// queda cacheada: entrar de nuevo con la misma clave muestra la cacheada y no pide nada.
export function usePeticion<T>(fn: () => Promise<T>, deps: unknown[] = [], { auto = true, clave = null }: { auto?: boolean; clave?: string | null } = {}) {
  const [datos, setDatos] = useState<T | null>(() => (clave ? (CACHE.get(clave) as T) ?? null : null));
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(auto && !(clave && CACHE.has(clave)));
  const vivo = useRef(0);
  const run = useCallback(async () => {
    const id = ++vivo.current;
    setCargando(true); setError(null);
    try { const r = await fn(); if (id === vivo.current) { if (clave) CACHE.set(clave, r); setDatos(r); } return r; }
    catch (e) { if (id === vivo.current) setError((e as Error).message || 'Algo falló.'); return null; }
    finally { if (id === vivo.current) setCargando(false); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clave, ...deps]);
  useEffect(() => {
    if (!auto) return;
    if (clave && CACHE.has(clave)) { vivo.current++; setDatos(CACHE.get(clave) as T); setCargando(false); setError(null); return; }
    run();
  }, [run, auto, clave]);
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
