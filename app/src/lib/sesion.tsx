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
  const dentro = !supabase || !!sesion;

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => { setSesion(data.session); setListo(true); });
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSesion(s));
    return () => data.subscription.unsubscribe();
  }, []);

  const refrescar = useCallback(async () => {
    if (!dentro) return;
    const [p, e] = await Promise.all([backend.perfil(), backend.motor<Estado>('estado').catch(() => null)]);
    setPerfil(p);
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
  const salir = useCallback(async () => { await supabase?.auth.signOut(); setPerfil(null); setEstado(null); }, []);

  return <C.Provider value={{ listo, sesion, demo: backend.demo, perfil, estado, refrescar, salir, aviso, toast }}>{children}</C.Provider>;
}
