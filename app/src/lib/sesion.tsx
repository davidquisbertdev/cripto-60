import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabase';
import { backend } from './api';
import { fijarZona } from './formato';
import type { Estado, Perfil } from './tipos';

interface Ctx {
  listo: boolean;
  sesion: Session | null;
  demo: boolean;
  perfil: Perfil | null;
  /** null mientras carga el perfil; en modo demo siempre true */
  suscrita: boolean | null;
  errorPerfil: string | null;
  estado: Estado | null;
  refrescar: () => Promise<void>;
  salir: () => Promise<void>;
  aviso: (msg: string) => void;
  toast: string | null;
}
const C = createContext<Ctx>(null as unknown as Ctx);
export const useSesion = () => useContext(C);

export function ProveedorSesion({ children }: { children: ReactNode }) {
  const [sesion, setSesion] = useState<Session | null>(null);
  const [listo, setListo] = useState(!supabase);
  const [perfil, setPerfil] = useState<Perfil | null>(null);
  const [estado, setEstado] = useState<Estado | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [errorPerfil, setErrorPerfil] = useState<string | null>(null);
  const dentro = !supabase || !!sesion;

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => { setSesion(data.session); setListo(true); });
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSesion(s));
    return () => data.subscription.unsubscribe();
  }, []);

  const refrescar = useCallback(async () => {
    if (!dentro) return;
    let p: Perfil;
    try { p = await backend.perfil(); setErrorPerfil(null); }
    catch (x) { setErrorPerfil((x as Error).message || 'No se pudo leer tu cuenta.'); return; }
    setPerfil(p);
    // sin suscripción el motor responde 402: no se le llama
    const activa = backend.demo || (!!p.activo && (!p.suscripcion_hasta || Date.parse(p.suscripcion_hasta) > Date.now()));
    const e = activa ? await backend.motor<Estado>('estado').catch(() => null) : null;
    if (e) { setEstado(e); fijarZona(p.ajustes?.zona_horaria || null); }
  }, [dentro]);

  useEffect(() => { refrescar(); }, [refrescar]);

  useEffect(() => {
    try {
      const t = localStorage.getItem('cripto-trader-tema');
      if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t;
    } catch { /* sin almacenamiento */ }
  }, []);

  const aviso = useCallback((msg: string) => { setToast(msg); setTimeout(() => setToast(null), 3200); }, []);
  // Cierra solo la sesión de este dispositivo: con scope global el servidor responde 403 si la sesión
  // ya no existe allí (caducada o cerrada en otro lado), aunque igual se borre la local.
  const salir = useCallback(async () => {
    try { await supabase?.auth.signOut({ scope: 'local' }); } catch { /* la sesión local se descarta igual */ }
    setPerfil(null); setEstado(null); setErrorPerfil(null);
  }, []);

  const suscrita = backend.demo ? true : !perfil ? null : !!perfil.activo && (!perfil.suscripcion_hasta || Date.parse(perfil.suscripcion_hasta) > Date.now());

  return <C.Provider value={{ listo, sesion, demo: backend.demo, perfil, suscrita, errorPerfil, estado, refrescar, salir, aviso, toast }}>{children}</C.Provider>;
}
