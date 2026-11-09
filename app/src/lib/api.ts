// Acceso a datos: Supabase (Edge Function «motor» + tablas con RLS) o, sin credenciales, un modo demo
// con salidas reales del motor grabadas (app/src/demo/datos.json, generado con `npm run demo`).
import { supabase } from './supabase';
import { zonaNavegador } from './formato';
import { DEFAULTS } from '../../../lib/defaults.mjs';
import { estadoDiario } from '../../../lib/diario.mjs';
import type { Ajustes, Estado, Operacion, Perfil, PosicionGuardada } from './tipos';
import demoDatos from '../demo/datos.json';

export type Accion = 'estado' | 'senal' | 'posicion' | 'btc' | 'ballenas' | 'noticias' | 'escaner';
export interface NuevaOperacion { simbolo: string; lado: 'LONG' | 'SHORT' | null; pnl: number; margen?: number | null; nota?: string | null; fecha?: string; senal_id?: number | null }
export interface NuevaPosicion { base: string; lado: 'LONG' | 'SHORT'; entrada: number; sl: number; tps: number[]; contratos?: number | null; estrategia?: string; senal_id?: number | null }

export interface Backend {
  demo: boolean;
  motor<T>(accion: Accion, params?: Record<string, unknown>): Promise<T>;
  perfil(): Promise<Perfil>;
  guardarPerfil(cambios: Partial<Pick<Perfil, 'nombre' | 'capital_inicial' | 'ajustes' | 'acepto_aviso_en'>>): Promise<void>;
  operaciones(): Promise<Operacion[]>;
  registrar(op: NuevaOperacion): Promise<void>;
  borrar(id: number): Promise<void>;
  abrirPosicion(p: NuevaPosicion): Promise<void>;
  cerrarPosicion(id: number): Promise<void>;
}

export class ErrorApi extends Error {}

// ---------------- Supabase ----------------
function backendSupabase(): Backend {
  const sb = supabase!;
  const falla = (e: { message: string } | null) => { if (e) throw new ErrorApi(e.message); };
  return {
    demo: false,
    async motor<T>(accion: Accion, params: Record<string, unknown> = {}) {
      const { data, error } = await sb.functions.invoke('motor', { body: { accion, params: { ...params, zona: zonaNavegador() } } });
      if (error) {
        let msg = 'No se pudo contactar con el motor. Revisa tu conexión y prueba de nuevo.';
        try { const j = await (error as { context?: Response }).context?.json(); if (j?.error) msg = j.error; } catch { /* sin cuerpo */ }
        throw new ErrorApi(msg);
      }
      return data as T;
    },
    async perfil() {
      const { data, error } = await sb.from('perfiles').select('id, nombre, capital_inicial, ajustes, acepto_aviso_en').single();
      falla(error);
      return { ...data, capital_inicial: data!.capital_inicial == null ? null : Number(data!.capital_inicial) } as Perfil;
    },
    async guardarPerfil(cambios) {
      const { data: u } = await sb.auth.getUser();
      const { error } = await sb.from('perfiles').update(cambios).eq('id', u.user!.id);
      falla(error);
    },
    async operaciones() {
      const { data, error } = await sb.from('operaciones').select('id, fecha, simbolo, lado, pnl, margen, nota').order('fecha', { ascending: false }).limit(2000);
      falla(error);
      return (data ?? []).map((o) => ({ ...o, pnl: Number(o.pnl), margen: o.margen == null ? null : Number(o.margen) })) as Operacion[];
    },
    async registrar(op) { const { error } = await sb.from('operaciones').insert(op); falla(error); },
    async borrar(id) { const { error } = await sb.from('operaciones').delete().eq('id', id); falla(error); },
    async abrirPosicion(p) {
      const { error } = await sb.from('posiciones').insert(p);
      if (error?.code === '23505') throw new ErrorApi('Ya sigues una posición abierta. Ciérrala antes de abrir otra.');
      falla(error);
    },
    async cerrarPosicion(id) { const { error } = await sb.from('posiciones').update({ cerrada: new Date().toISOString() }).eq('id', id); falla(error); },
  };
}

// ---------------- Demo ----------------
type Datos = typeof demoDatos & Record<string, unknown>;
const D = demoDatos as Datos;
const CLAVE = 'cripto-trader-demo-v1';

// Las grabaciones son del 7/11/2026: se desplazan al momento actual para que el reloj tenga sentido.
function mover<T>(x: T, delta: number): T {
  if (typeof x === 'number') return (x > 1.7e12 && x < 1.9e12 ? x + delta : x) as T;
  if (Array.isArray(x)) return x.map((v) => mover(v, delta)) as T;
  if (x && typeof x === 'object') return Object.fromEntries(Object.entries(x).map(([k, v]) => [k, mover(v, delta)])) as T;
  return x;
}
const ahoraDe = (x: unknown) => ((x as { ahora?: number; creada?: number }).creada ?? (x as { ahora?: number }).ahora ?? D.generado);
const espera = (ms = 650) => new Promise((r) => setTimeout(r, ms));

interface EstadoDemo { perfil: Perfil; operaciones: Operacion[]; posicion: PosicionGuardada | null; sig: number }
function cargarDemo(): EstadoDemo {
  try { const s = localStorage.getItem(CLAVE); if (s) return JSON.parse(s); } catch { /* sin almacenamiento */ }
  const delta = Date.now() - D.generado;
  const ops = (D.operaciones as Operacion[]).map((o) => ({ ...o, fecha: new Date(Date.parse(o.fecha) + delta).toISOString() })).reverse();
  const p = D.posicion as { base: string; posicion: { lado: 'LONG' | 'SHORT'; entrada: number; sl: number; tps: number[]; contratos: number; estrategia: 'tendencia' }; ahora: number };
  return {
    perfil: { id: 'demo', nombre: 'Demo', capital_inicial: D.capital_inicial, ajustes: { zona_horaria: null }, acepto_aviso_en: new Date().toISOString() },
    operaciones: ops,
    posicion: { id: 1, base: p.base, lado: p.posicion.lado, entrada: p.posicion.entrada, sl: p.posicion.sl, tps: p.posicion.tps, contratos: p.posicion.contratos, estrategia: 'tendencia', abierta: new Date(Date.now() - 6 * 60e3).toISOString(), senal_id: null },
    sig: ops.length + 1,
  };
}

function backendDemo(): Backend {
  const st = cargarDemo();
  const guardar = () => { try { localStorage.setItem(CLAVE, JSON.stringify(st)); } catch { /* sin almacenamiento */ } };
  const cfg = () => ({ ...DEFAULTS, ...st.perfil.ajustes, riesgo_por_confianza: { ...DEFAULTS.riesgo_por_confianza, ...(st.perfil.ajustes.riesgo_por_confianza ?? {}) } });
  const diario = () => (st.perfil.capital_inicial ? estadoDiario({ capital_inicial: st.perfil.capital_inicial, operaciones: [...st.operaciones].reverse() }, cfg(), Date.now()) : null);
  const ahora = <T,>(x: T): T => mover(x, Date.now() - ahoraDe(x));

  return {
    demo: true,
    async motor<T>(accion: Accion, params: Record<string, unknown> = {}) {
      await espera(accion === 'estado' ? 150 : 700);
      if (accion === 'estado') return { ahora: Date.now(), cfg: cfg(), diario: diario(), posicion_abierta: st.posicion } as unknown as T;
      if (accion === 'senal') {
        const d = diario();
        if (d?.bloqueo) return { bloqueado: true, motivo: d.bloqueo, pausa_hasta: d.pausa_hasta } as T;
        const s = ahora(D.senal) as Record<string, unknown>;
        const pedida = String(params.moneda ?? '').toUpperCase();
        return { ...s, diario: d, id: 'demo', demo_nota: pedida && pedida !== D.senal.base ? `En modo demo solo hay datos grabados de ${D.senal.base}: esta es su señal, no la de ${pedida}.` : null } as T;
      }
      const tabla: Record<string, unknown> = { posicion: D.posicion, btc: D.btc, ballenas: D.ballenas, noticias: D.noticias, escaner: D.escaner };
      return ahora(tabla[accion]) as T;
    },
    async perfil() { return st.perfil; },
    async guardarPerfil(c) { st.perfil = { ...st.perfil, ...c }; guardar(); },
    async operaciones() { await espera(200); return st.operaciones; },
    async registrar(op) {
      st.operaciones = [{ id: st.sig++, fecha: op.fecha ?? new Date().toISOString(), simbolo: op.simbolo, lado: op.lado, pnl: op.pnl, margen: op.margen ?? null, nota: op.nota ?? null }, ...st.operaciones];
      guardar();
    },
    async borrar(id) { st.operaciones = st.operaciones.filter((o) => o.id !== id); guardar(); },
    async abrirPosicion(p) {
      if (st.posicion) throw new ErrorApi('Ya sigues una posición abierta. Ciérrala antes de abrir otra.');
      st.posicion = { id: st.sig++, base: p.base, lado: p.lado, entrada: p.entrada, sl: p.sl, tps: p.tps, contratos: p.contratos ?? null, estrategia: (p.estrategia as 'tendencia') ?? 'tendencia', abierta: new Date().toISOString(), senal_id: null };
      guardar();
    },
    async cerrarPosicion() { st.posicion = null; guardar(); },
  };
}

export const reiniciarDemo = () => { try { localStorage.removeItem(CLAVE); } catch { /* nada */ } };
export const backend: Backend = supabase ? backendSupabase() : backendDemo();
export type { Ajustes, Estado };
