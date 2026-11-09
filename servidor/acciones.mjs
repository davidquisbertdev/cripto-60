// Acciones del motor para la app web. No depende del entorno: recibe una base de datos abstracta (db)
// y una fuente de datos, así corre igual en Node (tests, modo demo) y en Supabase Edge Functions (Deno).
// Usa exactamente las mismas funciones que las skills de Claude: un solo motor.
import { DEFAULTS } from '../lib/defaults.mjs';
import { estadoDiario } from '../lib/diario.mjs';
import { crearFuente } from '../lib/fuentes.mjs';
import { simbolo as simboloDe, base as baseDe, cerradas, esCripto } from '../lib/mexc.mjs';
import { analizarSimbolo } from '../lib/motor.mjs';
import { analizarBallenas, compararInstantanea } from '../lib/ballenas.mjs';
import { leerNoticias, miedoCodicia } from '../lib/noticias.mjs';
import { decimales } from '../lib/plan.mjs';
import { generarSenal } from '../cripto-senal/senal.mjs';
import { cargarPosicion, evaluar } from '../cripto-posicion/posicion.mjs';
import { informeBTC } from '../cripto-btc/btc.mjs';
import { escanear } from '../cripto-escaner/escaner.mjs';

export const ACCIONES = ['estado', 'senal', 'posicion', 'btc', 'ballenas', 'noticias', 'escaner'];

// Ajustes que el usuario puede cambiar desde la web (el resto queda en los valores del motor).
export const AJUSTES_EDITABLES = [
  'exchange', 'zona_horaria', 'objetivo_usdt', 'margen_base', 'reinversion_pct', 'apalancamiento_max',
  'riesgo_por_confianza', 'max_perdida_dia_pct', 'max_operaciones_dia', 'max_operaciones_hora', 'pausa_min',
];

export class ErrorUsuario extends Error {
  constructor(msg, estado = 400) { super(msg); this.estado = estado; }
}

// Igual que leerConfig, pero con los ajustes guardados en la base de datos.
export function configDe(propio = {}) {
  const limpio = Object.fromEntries(Object.entries(propio || {}).filter(([k]) => AJUSTES_EDITABLES.includes(k)));
  const cfg = { ...DEFAULTS, ...limpio };
  cfg.riesgo_por_confianza = { ...DEFAULTS.riesgo_por_confianza, ...(limpio.riesgo_por_confianza || {}) };
  cfg.margen_por_confianza = { ...DEFAULTS.margen_por_confianza };
  // los frenos nunca pueden pasar los topes del motor
  cfg.apalancamiento_max = Math.min(+cfg.apalancamiento_max || DEFAULTS.apalancamiento_max, DEFAULTS.apalancamiento_max);
  for (const k of ['ALTA', 'MEDIA', 'BAJA']) cfg.riesgo_por_confianza[k] = Math.min(+cfg.riesgo_por_confianza[k] || DEFAULTS.riesgo_por_confianza[k], DEFAULTS.riesgo_max_pct);
  cfg.max_perdida_dia_pct = Math.min(+cfg.max_perdida_dia_pct || DEFAULTS.max_perdida_dia_pct, DEFAULTS.max_perdida_dia_pct);
  return cfg;
}

const num = (v, que, { min = -Infinity, max = Infinity, opcional = true } = {}) => {
  if (v == null || v === '') { if (opcional) return undefined; throw new ErrorUsuario(`Falta ${que}.`); }
  const n = Number(String(v).replace(',', '.'));
  if (!Number.isFinite(n) || n < min || n > max) throw new ErrorUsuario(`${que} no es válido (${v}).`);
  return n;
};

const moneda = (v) => {
  const m = String(v ?? '').trim().toUpperCase().replace(/[^A-Z0-9_]/g, '');
  if (!m) throw new ErrorUsuario('Indica una moneda, por ejemplo SOL.');
  return m;
};

async function contexto(db) {
  const [ajustes, diarioDoc] = await Promise.all([db.leerAjustes(), db.leerDiario()]);
  return { cfg: configDe(ajustes), diarioDoc };
}

/**
 * @param {string} accion una de ACCIONES
 * @param {Record<string, any>} [params]
 * @param {{ db: any, fuente?: any }} [ctx] db: leerAjustes, leerDiario, guardarSenal, ultimaSenal, leerInstantanea, guardarInstantanea, posicionAbierta
 */
export async function ejecutar(accion, params = {}, { db, fuente = null } = /** @type {any} */ ({})) {
  if (!ACCIONES.includes(accion)) throw new ErrorUsuario(`Acción desconocida: ${accion}`);
  const { cfg, diarioDoc } = await contexto(db);
  // Sin zona guardada, la del navegador del usuario (el servidor corre en UTC)
  if (!cfg.zona_horaria && params.zona) {
    try { new Intl.DateTimeFormat('es', { timeZone: params.zona }); cfg.zona_horaria = params.zona; } catch { /* zona inválida: se ignora */ }
  }
  const f = fuente ?? crearFuente({ exchange: params.exchange ?? null, cfg });
  const ahora = f.ahora();
  const diario = estadoDiario(diarioDoc, cfg, ahora);

  switch (accion) {
    case 'estado': {
      const abierta = await db.posicionAbierta();
      return { ahora, cfg, diario, posicion_abierta: abierta };
    }

    case 'senal': {
      const m = moneda(params.moneda);
      if (diario?.bloqueo && !params.forzar) {
        // El diario manda: con un freno activo no se genera la orden.
        return { bloqueado: true, motivo: diario.bloqueo, pausa_hasta: diario.pausa_hasta, diario };
      }
      const op = {
        capital: num(params.capital, 'El capital', { min: 1 }),
        margen: num(params.margen, 'El margen', { min: 0.5 }),
        objetivo: num(params.objetivo, 'El objetivo', { min: 0 }),
        lado: params.lado || undefined,
        estrategia: params.estrategia || undefined,
        diario,
      };
      const a = await analizarSimbolo(f, m, { conNoticias: params.sin_noticias !== true, conBallenas: params.sin_ballenas !== true, carpetaCache: null });
      const s = await generarSenal(a, op, cfg);
      const id = await db.guardarSenal(s);
      return { ...s, id };
    }

    case 'posicion': {
      const m = moneda(params.moneda);
      const sym = simboloDe(m);
      const senal = params.manual ? null : await db.ultimaSenal(baseDe(sym));
      const op = {
        lado: params.lado || undefined,
        entrada: num(params.entrada, 'La entrada', { min: 0 }),
        sl: num(params.sl, 'El stop loss', { min: 0 }),
        tp1: num(params.tp1, 'El TP1', { min: 0 }),
        tp2: num(params.tp2, 'El TP2', { min: 0 }),
        tp3: num(params.tp3, 'El TP3', { min: 0 }),
        contratos: num(params.contratos, 'Los contratos', { min: 0 }),
        hace: params.hace || undefined,
        abierta: params.abierta || undefined,
        estrategia: params.estrategia || undefined,
      };
      let p;
      try { p = cargarPosicion(op, cfg, ahora, m, senal); } catch (e) { throw new ErrorUsuario(e.message); }
      const a = await analizarSimbolo(f, m, { conNoticias: params.sin_noticias !== true, conBallenas: params.sin_ballenas !== true, carpetaCache: null });
      a.velas1m_vivo = await f.velas(a.simbolo, '1m', 2000);
      p.tam = p.tam ?? +a.contrato.contractSize;
      const e = evaluar(a, p, cfg);
      return { ...e, simbolo: a.simbolo, base: a.base, decimales: a.decimales, senal_id: senal?.id ?? null, posicion: {
        lado: p.lado, entrada: p.entrada, sl: p.sl, tps: p.tps.filter(Number.isFinite), abierta: p.abierta,
        espera_max_min: p.espera_max_min, duracion_max_min: p.duracion_max_min, estrategia: p.estrategia, contratos: p.contratos ?? null,
      } };
    }

    case 'btc':
      return informeBTC(f, params.moneda ? moneda(params.moneda) : null);

    case 'ballenas': {
      const sym = simboloDe(moneda(params.moneda)), b = baseDe(sym);
      const contrato = await f.detalle(sym);
      if (!esCripto(contrato)) throw new ErrorUsuario(`${sym} no es una criptomoneda.`);
      const ticker = await f.ticker(sym);
      const precio = +ticker.lastPrice;
      const v5 = cerradas(await f.velas(sym, '5m', 30));
      const precio15m = v5.length > 7 ? (100 * (precio - v5.at(-7).c)) / v5.at(-7).c : null;
      const r = await analizarBallenas(f, { base: b, simbolo: sym, contrato, precio, precio15m, carpetaCache: null, n: 50 });
      const prev = await db.leerInstantanea(b);
      r.desde_anterior = compararInstantanea(prev, r.hl);
      if (r.hl?.disponible) await db.guardarInstantanea(b, { t: ahora, precio_hl: r.hl.precio_hl, posiciones: r.hl.instantanea });
      return { simbolo: sym, base: b, ahora, precio, decimales: decimales(contrato.priceUnit), ...r };
    }

    case 'noticias': {
      const lista = (Array.isArray(params.monedas) && params.monedas.length ? params.monedas : ['BTC']).slice(0, 4).map(moneda).map(baseDe);
      const horas = num(params.horas, 'Las horas', { min: 1, max: 168 }) ?? 24;
      const fng = await miedoCodicia(f);
      const monedas = [];
      for (const m of lista) monedas.push(await leerNoticias(f, m, { horas }));
      return { ahora, fng, horas, monedas };
    }

    case 'escaner': {
      const top = num(params.top, 'El número de monedas', { min: 5, max: 60 }) ?? 30;
      return { ahora, exchange: f.exchange ?? 'MEXC', ...(await escanear(f, { top })) };
    }
  }
}
