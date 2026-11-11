// Acceso a datos: Supabase (Edge Function «motor» + tablas con RLS) o, sin credenciales, un modo demo
// con salidas reales del motor grabadas (app/src/demo/datos.json, generado con `npm run demo`).
import { supabase } from './supabase';
import { zonaNavegador } from './formato';
import { DEFAULTS } from '../../../lib/defaults.mjs';
import { estadoDiario } from '../../../lib/diario.mjs';
import type { Ajustes, Estado, Operacion, Perfil, PosicionGuardada, SwingOperacion, NuevaSwing, InformeSwing } from './tipos';
import demoDatos from '../demo/datos.json';
import { evaluarSwing } from '../../../lib/swing.mjs';

export type Accion = 'estado' | 'senal' | 'posicion' | 'btc' | 'ballenas' | 'billetera' | 'noticias' | 'escaner' | 'mercado' | 'panorama' | 'swing' | 'swing_revisar' | 'prediccion' | 'prediccion_analisis';
export interface NuevaOperacion { simbolo: string; lado: 'LONG' | 'SHORT' | null; pnl: number; margen?: number | null; nota?: string | null; fecha?: string; senal_id?: number | null }
export interface NuevaPosicion { base: string; lado: 'LONG' | 'SHORT'; entrada: number; sl: number; tps: number[]; contratos?: number | null; estrategia?: string; senal_id?: number | null; duracion_max_min?: number | null }

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
  duracionPosicion(id: number, minutos: number | null): Promise<void>;
  // operaciones de swing guardadas en la cuenta
  swingListar(): Promise<SwingOperacion[]>;
  swingCrear(op: NuevaSwing): Promise<SwingOperacion>;
  swingActualizar(id: number, cambios: Partial<Pick<SwingOperacion, 'sl' | 'tp1' | 'eventos' | 'cerrada_en' | 'nota'>>): Promise<void>;
  swingBorrar(id: number): Promise<void>;
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
      const { data, error } = await sb.from('perfiles').select('id, nombre, capital_inicial, ajustes, acepto_aviso_en, activo, suscripcion_hasta').single();
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
    async duracionPosicion(id, minutos) { const { error } = await sb.from('posiciones').update({ duracion_max_min: minutos }).eq('id', id); falla(error); },
    async swingListar() {
      const { data, error } = await sb.from('swing_operaciones').select('*').order('abierta_en', { ascending: false }).limit(200);
      falla(error);
      return (data ?? []).map(numSwing);
    },
    async swingCrear(op) {
      const { data, error } = await sb.from('swing_operaciones').insert(op).select('*').single();
      falla(error);
      return numSwing(data);
    },
    async swingActualizar(id, cambios) { const { error } = await sb.from('swing_operaciones').update(cambios).eq('id', id); falla(error); },
    async swingBorrar(id) { const { error } = await sb.from('swing_operaciones').delete().eq('id', id); falla(error); },
  };
}
// numeric de Postgres llega como texto
const numSwing = (o: Record<string, unknown>): SwingOperacion => ({ ...(o as unknown as SwingOperacion), entrada: Number(o.entrada), sl: Number(o.sl), tp1: o.tp1 == null ? null : Number(o.tp1), eventos: (o.eventos as SwingOperacion['eventos']) ?? [] });

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

interface EstadoDemo { perfil: Perfil; operaciones: Operacion[]; posicion: PosicionGuardada | null; sig: number; swing?: SwingOperacion[] }
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
        // con un lado elegido, la señal grabada de ese lado (con su aviso frente a la recomendación)
        const ladoPedido = String(params.lado ?? '').toUpperCase() as 'LONG' | 'SHORT' | '';
        const s = ahora(ladoPedido && D.senal_lado?.[ladoPedido] ? D.senal_lado[ladoPedido] : D.senal) as Record<string, unknown>;
        const pedida = String(params.moneda ?? '').toUpperCase();
        return { ...s, diario: d, id: 'demo', demo_nota: pedida && pedida !== D.senal.base ? `En modo demo solo hay datos grabados de ${D.senal.base}: esta es su señal, no la de ${pedida}.` : null } as T;
      }
      // Swing: el análisis grabado de BTC; las operaciones guardadas se evalúan aquí con el mismo motor
      if (accion === 'swing' || accion === 'swing_revisar') {
        const s = ahora(D.swing) as unknown as InformeSwing;
        const ops = (Array.isArray(params.operaciones) ? params.operaciones : []) as { id: string; base: string; lado: 'LONG' | 'SHORT'; entrada: number; sl: number; tp1: number | null; trailing: boolean; abierta_en: number; eventos: unknown[] }[];
        const evaluaciones = Object.fromEntries(ops.map((o) => [o.id, o.base === s.base ? { ...evaluarSwing(o, s.velas, Date.now()), base: o.base } : null]));
        if (accion === 'swing_revisar') return { ahora: Date.now(), evaluaciones } as T;
        const pedida = String(params.moneda ?? '').toUpperCase();
        return { ...s, evaluaciones, demo_nota: pedida && pedida !== s.base ? `En modo demo solo hay datos grabados de ${s.base}: este es su análisis, no el de ${pedida}.` : null } as T;
      }
      // Predicción de MEXC: las cajas grabadas de BTC a 5 min; el análisis según la caja pulsada
      if (accion === 'prediccion' || accion === 'prediccion_analisis') {
        const P = D.prediccion, delta = Date.now() - P.lista.ahora;
        const otra = String(params.moneda ?? 'BTC') !== P.lista.moneda || Number(params.plazo ?? 5) !== P.lista.plazo;
        const demo_nota = otra ? `En modo demo solo hay cajas grabadas de ${P.lista.moneda} a ${P.lista.plazo} min: son las que ves.` : null;
        if (accion === 'prediccion') return { ...mover(P.lista, delta), demo_nota } as T;
        const actual = P.lista.cajas.find((c) => c.estado === 'actual')!.inicio + delta, k = Math.round((actual - Number(params.inicio)) / (P.lista.plazo * 60e3));
        const a = k <= 0 ? (k === 0 ? P.actual : P.proxima) : P.cerradas[Math.min(k, P.cerradas.length) - 1];
        return { ...mover(a, delta), demo_nota } as T;
      }
      // BTC sin altcoin elegida: sin comparación (la grabada es de una sola altcoin)
      const btc = params.moneda ? D.btc : { ...D.btc, alt: null };
      const tabla: Record<string, unknown> = { posicion: D.posicion, btc, ballenas: D.ballenas, billetera: D.billetera, noticias: D.noticias, escaner: D.escaner, mercado: D.mercado, panorama: D.panorama };
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
      st.posicion = { id: st.sig++, base: p.base, lado: p.lado, entrada: p.entrada, sl: p.sl, tps: p.tps, contratos: p.contratos ?? null, estrategia: (p.estrategia as 'tendencia') ?? 'tendencia', abierta: new Date().toISOString(), senal_id: null, duracion_max_min: p.duracion_max_min ?? null };
      guardar();
    },
    async cerrarPosicion() { st.posicion = null; guardar(); },
    async duracionPosicion(_id, minutos) { if (st.posicion) { st.posicion = { ...st.posicion, duracion_max_min: minutos }; guardar(); } },
    async swingListar() { await espera(150); return st.swing ?? []; },
    async swingCrear(op) {
      const nueva: SwingOperacion = { id: st.sig++, abierta_en: new Date().toISOString(), cerrada_en: null, eventos: [], nota: null, setup: null, tp1: null, trailing: true, ...op, creada: new Date().toISOString() };
      st.swing = [nueva, ...(st.swing ?? [])];
      guardar();
      return nueva;
    },
    async swingActualizar(id, cambios) { st.swing = (st.swing ?? []).map((o) => (o.id === id ? { ...o, ...cambios } : o)); guardar(); },
    async swingBorrar(id) { st.swing = (st.swing ?? []).filter((o) => o.id !== id); guardar(); },
  };
}

export const reiniciarDemo = () => { try { localStorage.removeItem(CLAVE); } catch { /* nada */ } };
export const backend: Backend = supabase ? backendSupabase() : backendDemo();
export type { Ajustes, Estado };
