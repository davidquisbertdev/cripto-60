// Acciones del motor para la app web. No depende del entorno: recibe una base de datos abstracta (db)
// y una fuente de datos, así corre igual en Node (tests, modo demo) y en Supabase Edge Functions (Deno).
// Usa exactamente las mismas funciones que las skills de Claude: un solo motor.
import { DEFAULTS, aplicarRiesgo } from '../lib/defaults.mjs';
import { estadoDiario } from '../lib/diario.mjs';
import { crearFuente } from '../lib/fuentes.mjs';
import { simbolo as simboloDe, base as baseDe, cerradas, esCripto } from '../lib/mexc.mjs';
import { analizarSimbolo } from '../lib/motor.mjs';
import { leerCalendario } from '../lib/calendario.mjs';
import { analizarBallenas, compararInstantanea, billeteraHL, DIR_HL } from '../lib/ballenas.mjs';
import { leerNoticias, miedoCodicia } from '../lib/noticias.mjs';
import { decimales } from '../lib/plan.mjs';
import { generarSenal } from '../cripto-senal/senal.mjs';
import { cargarPosicion, evaluar } from '../cripto-posicion/posicion.mjs';
import { informeBTC, lecturaMoneda } from '../cripto-btc/btc.mjs';
import { dominancia } from '../lib/dominancia.mjs';
import { analizarSwing, datosSwing, evaluarSwing, indicadoresSwing, SETUPS } from '../lib/swing.mjs';
import { escanear, ESTABLES, resumenSenal } from '../cripto-escaner/escaner.mjs';
import { listaPrediccion, analizarPrediccion, MONEDAS_PRED, PLAZOS_PRED } from '../lib/prediccion.mjs';

// Lado elegido por el usuario y la señal previa que vio (solo los campos que usa la advertencia)
const LADOS = ['LONG', 'SHORT'];
function ladoValido(x) {
  const l = String(x).toUpperCase();
  if (!LADOS.includes(l)) throw new ErrorUsuario('El lado debe ser LONG o SHORT.');
  return l;
}
function previaValida(p) {
  if (!p || typeof p !== 'object' || !LADOS.includes(p.lado)) return undefined;
  const texto = (x, n) => String(x ?? '').slice(0, n);
  return {
    recomendacion: [...LADOS, 'NO OPERAR'].includes(p.recomendacion) ? p.recomendacion : null, lado: p.lado,
    estrategia: ['tendencia', 'reversion'].includes(p.estrategia) ? p.estrategia : null, nivel: texto(p.nivel, 12),
    razones: Array.isArray(p.razones) ? p.razones.slice(0, 5).map((r) => texto(r, 300)) : [],
  };
}

// Operaciones swing que manda la web para evaluarlas (solo los campos que usa el seguimiento)
function opsSwing(lista) {
  if (!Array.isArray(lista)) return [];
  return lista.slice(0, 20).map((o) => ({
    id: String(o?.id ?? ''), base: baseDe(simboloDe(String(o?.base ?? 'BTC'))), lado: o?.lado === 'SHORT' ? 'SHORT' : 'LONG',
    entrada: +o?.entrada, sl: +o?.sl, tp1: o?.tp1 == null ? null : +o.tp1, trailing: o?.trailing !== false,
    abierta_en: typeof o?.abierta_en === 'number' ? o.abierta_en : Date.parse(o?.abierta_en),
    eventos: Array.isArray(o?.eventos) ? o.eventos.slice(0, 50).map((x) => ({ tipo: x?.tipo === 'salida' ? 'salida' : 'entrada', precio: +x?.precio, porcentaje: Math.min(100, Math.max(0, +x?.porcentaje || 0)) })) : [],
  })).filter((o) => o.id && o.entrada > 0 && o.sl > 0 && Number.isFinite(o.abierta_en));
}

// Caché del calendario económico en la base de datos (la tabla de instantáneas, clave '_calendario')
const cacheCal = (db) => (db?.leerInstantanea ? { leer: () => db.leerInstantanea('_calendario'), guardar: (doc) => db.guardarInstantanea('_calendario', doc) } : null);

export const ACCIONES = ['estado', 'senal', 'posicion', 'btc', 'ballenas', 'billetera', 'noticias', 'escaner', 'mercado', 'panorama', 'swing', 'swing_revisar', 'prediccion', 'prediccion_analisis'];

// Ajustes que el usuario puede cambiar desde la web (el resto queda en los valores del motor).
export const AJUSTES_EDITABLES = [
  'exchange', 'zona_horaria', 'objetivo_usdt', 'margen_base', 'reinversion_pct', 'apalancamiento_max',
  'riesgo_por_confianza', 'max_perdida_dia_pct', 'max_operaciones_dia', 'max_operaciones_hora', 'pausa_min',
  'duracion_max_min', 'espera_max_min', 'reparto_tps',
];

export const DURACION_MIN = 15, DURACION_MAX = 1440;

// Duración de una operación (min): cierre total a los `d` minutos. Si no se indica la espera del TP1,
// se escala en la misma proporción (30 de 60 → 60 de 120).
export function conDuracion(cfg, d, espera = null) {
  const dur = Math.round(Math.min(Math.max(+d || cfg.duracion_max_min, DURACION_MIN), DURACION_MAX));
  const esp = espera ?? (cfg.espera_max_min * dur) / cfg.duracion_max_min;
  const espMax = Math.round(Math.min(Math.max(+esp || cfg.espera_max_min, 5), dur));
  return { ...cfg, duracion_max_min: dur, espera_max_min: espMax, espera_min_min: Math.min(cfg.espera_min_min, espMax) };
}

// Cuántos TP y qué % cierra cada uno (1 a 3, cada uno > 0, suman 100). Los TP quedan a los primeros
// múltiplos de R del motor (1R, 1.8R, 2.6R). Devuelve null si el reparto no es válido.
export function repartoValido(r) {
  const v = (Array.isArray(r) ? r : String(r ?? '').split(/[,s/]+/).filter(Boolean)).map(Number);
  if (v.length < 1 || v.length > DEFAULTS.tps_r.length || v.some((x) => !(x > 0)) || Math.abs(v.reduce((a, b) => a + b, 0) - 100) > 0.01) return null;
  return v.map((x) => +x.toFixed(2));
}
export function conReparto(cfg, r) {
  const v = repartoValido(r);
  return v ? { ...cfg, reparto_tps: v, tps_r: DEFAULTS.tps_r.slice(0, v.length) } : cfg;
}

export class ErrorUsuario extends Error {
  constructor(msg, estado = 400) { super(msg); this.estado = estado; }
}

// Igual que leerConfig, pero con los ajustes guardados en la base de datos.
export function configDe(propio = {}) {
  const limpio = Object.fromEntries(Object.entries(propio || {}).filter(([k]) => AJUSTES_EDITABLES.includes(k)));
  const cfg = { ...DEFAULTS, ...limpio };
  cfg.riesgo_por_confianza = { ...DEFAULTS.riesgo_por_confianza, ...(limpio.riesgo_por_confianza || {}) };
  cfg.margen_por_confianza = { ...DEFAULTS.margen_por_confianza };
  // los frenos nunca pueden pasar los topes del motor. El apalancamiento lo elige el usuario (hasta
  // apalancamiento_tope); el plan lo sigue frenando con el máximo del exchange y la distancia a la liquidación.
  cfg.apalancamiento_max = Math.min(Math.max(1, Math.round(+cfg.apalancamiento_max || DEFAULTS.apalancamiento_max)), DEFAULTS.apalancamiento_tope);
  // pérdida en el SL y del día: las que ponga el usuario (hasta riesgo_tope_pct)
  aplicarRiesgo(cfg);
  // duración por defecto de las operaciones (Ajustes); la espera del TP1 nunca la pasa
  // (sin espera propia, se escala desde la del motor: 30 de 60 → 60 de 120)
  const base = conReparto({ ...cfg, reparto_tps: DEFAULTS.reparto_tps, tps_r: DEFAULTS.tps_r, duracion_max_min: DEFAULTS.duracion_max_min, espera_max_min: DEFAULTS.espera_max_min }, limpio.reparto_tps);
  return conDuracion(base, limpio.duracion_max_min ?? DEFAULTS.duracion_max_min, +limpio.espera_max_min || null);
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
  const { cfg: cfgUsuario, diarioDoc } = await contexto(db);
  // duración de ESTA operación (min), si se pide otra distinta de la de Ajustes: el análisis entero
  // (simulación, historial real, reloj) se hace con ella
  const duracion = accion === 'senal' ? num(params.duracion, 'La duración', { min: DURACION_MIN, max: DURACION_MAX }) : undefined;
  let cfg = duracion && duracion !== cfgUsuario.duracion_max_min ? conDuracion(cfgUsuario, duracion) : cfgUsuario;
  // TPs de ESTA señal (cuántos y % de cada uno), si se piden distintos de los de Ajustes
  if (accion === 'senal' && params.reparto != null && params.reparto !== '') {
    if (!repartoValido(params.reparto)) throw new ErrorUsuario('El reparto de los TP debe tener de 1 a 3 porcentajes mayores que 0 que sumen 100.');
    cfg = conReparto(cfg, params.reparto);
  }
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
        // apalancamiento elegido para esta operación (sin él, el que calcula el motor)
        apalancamiento: num(params.apalancamiento, 'El apalancamiento', { min: 1, max: DEFAULTS.apalancamiento_tope }),
        lado: params.lado ? ladoValido(params.lado) : undefined,
        estrategia: params.estrategia || undefined,
        // la señal automática que el usuario vio antes de pedir el otro lado (para la advertencia)
        previa: params.lado ? previaValida(params.previa) : undefined,
        diario,
      };
      const a = await analizarSimbolo(f, m, { conNoticias: params.sin_noticias !== true, conBallenas: params.sin_ballenas !== true, carpetaCache: null, cacheCalendario: cacheCal(db) });
      const s = await generarSenal(a, op, cfg);
      // resumen: true = confirmación del escáner. No se guarda (no es una señal pedida por el usuario, y la
      // revisión de posición usa la última señal guardada de cada moneda) y solo vuelve lo justo.
      if (params.resumen === true) return { resumen: resumenSenal(s) };
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
        reparto: Array.isArray(params.reparto) && params.reparto.length ? params.reparto.map((x, i) => num(x, `El % del TP${i + 1}`, { min: 1, max: 100, opcional: false })) : undefined,
        hace: params.hace || undefined,
        duracion: num(params.duracion, 'La duración', { min: 5, max: DURACION_MAX }),
        abierta: params.abierta || undefined,
        estrategia: params.estrategia || undefined,
      };
      let p;
      try { p = cargarPosicion(op, cfg, ahora, m, senal); } catch (e) { throw new ErrorUsuario(e.message); }
      const a = await analizarSimbolo(f, m, { conNoticias: params.sin_noticias !== true, conBallenas: params.sin_ballenas !== true, carpetaCache: null, cacheCalendario: cacheCal(db) });
      a.velas1m_vivo = await f.velas(a.simbolo, '1m', 2000);
      p.tam = p.tam ?? +a.contrato.contractSize;
      const e = evaluar(a, p, cfg);
      return { ...e, simbolo: a.simbolo, base: a.base, decimales: a.decimales, senal_id: senal?.id ?? null, posicion: {
        lado: p.lado, entrada: p.entrada, sl: p.sl, tps: p.tps.filter(Number.isFinite), abierta: p.abierta,
        reparto: p.reparto.slice(0, p.tps.filter(Number.isFinite).length).map((x) => +(+x).toFixed(1)),
        espera_max_min: p.espera_max_min, duracion_max_min: p.duracion_max_min, estrategia: p.estrategia, contratos: p.contratos ?? null,
      } };
    }

    case 'btc':
      return informeBTC(f, params.moneda ? moneda(params.moneda) : null);

    case 'swing': {
      // Swing (días a semanas, velas diarias): análisis de la moneda + evaluación de las operaciones guardadas en ella
      const sym = simboloDe(moneda(params.moneda)), b = baseDe(sym);
      const contrato = await f.detalle(sym);
      if (!esCripto(contrato)) throw new ErrorUsuario(`${sym} no es una criptomoneda.`);
      const { velas, funding } = await datosSwing(f, sym);
      if (velas.length < 260) throw new ErrorUsuario(`${b} tiene menos de un año de velas diarias: el swing necesita historial.`);
      const capital = num(params.capital, 'El capital', { min: 1 }) ?? diario?.capital ?? cfg.capital ?? 100;
      const a = analizarSwing({ v: velas, ahora, contrato, capital, margen: num(params.margen, 'El margen', { min: 0.5 }) ?? null, apalancamiento: num(params.apalancamiento, 'El apalancamiento', { min: 1, max: DEFAULTS.apalancamiento_tope }) ?? null, cfg, funding, base: b });
      const I = indicadoresSwing(velas);
      const n = 180, desde = Math.max(0, velas.length - n);
      const evaluaciones = Object.fromEntries(opsSwing(params.operaciones).map((o) => [o.id, evaluarSwing(o, velas, ahora)]));
      return {
        ...a, decimales: decimales(contrato.priceUnit), setups: SETUPS, evaluaciones,
        velas: velas.slice(desde).map(({ t, o, h, l, c }) => ({ t, o, h, l, c })),
        medias: velas.slice(desde).map((v, k) => ({ t: v.t, e20: +I.e20[desde + k].toPrecision(8), e50: +I.e50[desde + k].toPrecision(8), e200: +I.e200[desde + k].toPrecision(8) })),
      };
    }

    case 'swing_revisar': {
      // Seguimiento de las operaciones swing guardadas (de varias monedas): ¿cerca del TP1, rompió el SL, mover SL?
      const ops = opsSwing(params.operaciones).slice(0, 20);
      const porBase = new Map();
      for (const o of ops) porBase.set(o.base, [...(porBase.get(o.base) ?? []), o]);
      const evaluaciones = {};
      await Promise.all([...porBase].map(async ([b, lista]) => {
        const v = await f.velas(simboloDe(b), '1d', 120).catch(() => null);
        for (const o of lista) { const e = v?.length ? evaluarSwing(o, v, ahora) : null; evaluaciones[o.id] = e ? { ...e, base: b } : null; }
      }));
      return { ahora, evaluaciones };
    }

    case 'panorama': {
      // Vista general: BTC, ETH y SOL (o las que pida, hasta 4) en una lectura rápida + dominancia de BTC y USDT
      const lista = (Array.isArray(params.monedas) && params.monedas.length ? params.monedas : ['BTC', 'ETH', 'SOL']).slice(0, 4).map(moneda);
      const [lecturas, dom] = await Promise.all([
        Promise.all(lista.map((m) => lecturaMoneda(f, m).then(({ v5, ...l }) => l).catch(() => null))),
        dominancia(f).catch(() => null),
      ]);
      return { ahora, monedas: lecturas.filter(Boolean), dominancia: dom };
    }

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
      // confirmar: cuántas de las mejores pasan por la señal completa en ESTA llamada (por defecto 0).
      // En la Edge Function no caben varias señales completas en una llamada (CPU y memoria), así que la
      // web confirma cada moneda con su propia llamada a 'senal' con resumen: true.
      const confirmarN = num(params.confirmar, 'Cuántas confirmar', { min: 0, max: 8 }) ?? 0;
      const capital = num(params.capital, 'El capital', { min: 1 }) ?? diario?.capital ?? cfg.margen_base;
      const confirmar = async (sym) => {
        const a = await analizarSimbolo(f, sym, { carpetaCache: null, cacheCalendario: cacheCal(db) });
        return generarSenal(a, { capital, diario }, cfg);
      };
      return { ahora, exchange: f.exchange ?? 'MEXC', ...(await escanear(f, { top, confirmar, confirmarN })) };
    }

    case 'prediccion':
    case 'prediccion_analisis': {
      // Predicción de MEXC (Up/Down de 5 y 15 min): lista de cajas, o el análisis de una con su veredicto
      const m = String(params.moneda ?? 'BTC').toUpperCase(), plazo = +params.plazo || 5;
      if (!MONEDAS_PRED.includes(m)) throw new ErrorUsuario('La Predicción de MEXC solo tiene BTC y ETH.');
      if (!PLAZOS_PRED.includes(plazo)) throw new ErrorUsuario('El plazo debe ser 5 o 15 minutos.');
      try {
        if (accion === 'prediccion') return await listaPrediccion(f, { moneda: m, plazo });
        const inicio = num(params.inicio, 'La caja', { min: 1.6e12, max: 3e12, opcional: false });
        return await analizarPrediccion(f, { moneda: m, plazo, inicio });
      } catch (e) { if (e instanceof ErrorUsuario) throw e; throw new ErrorUsuario(e.message, 502); }
    }

    case 'billetera': {
      const dir = String(params.dir ?? '').trim();
      if (!DIR_HL.test(dir)) throw new ErrorUsuario('Indica una billetera de Hyperliquid válida (0x… de 42 caracteres).');
      return billeteraHL(f, dir.toLowerCase());
    }

    case 'mercado': {
      // Cómo está el día: Fear & Greed (30 días), BTC 24 h en velas de 15 min y la amplitud del mercado
      // (cuántas monedas suben o bajan, las que más se mueven y el funding medio)
      const [fng, tickers, v15] = await Promise.all([
        miedoCodicia(f), f.tickers().catch(() => []), f.velas('BTC_USDT', '15m', 97).catch(() => []),
      ]);
      // calendario económico de hoy y los próximos días, con la reacción real de BTC a lo ya publicado
      const calendario = await leerCalendario(f, { velasBTC5m: v15, cache: cacheCal(db) }).catch(() => null);
      const cambio = (t) => (Number.isFinite(t.cambio24) ? +t.cambio24 : t.riseFallRate != null ? 100 * +t.riseFallRate : null);
      const liquidas = tickers.filter((t) => t.symbol.endsWith('_USDT') && !ESTABLES.test(t.symbol) && +t.amount24 >= 5e6 && Number.isFinite(cambio(t)))
        .map((t) => ({ moneda: baseDe(t.symbol), cambio: +cambio(t).toFixed(2), precio: +t.lastPrice, volumen_musdt: +(+t.amount24 / 1e6).toFixed(1), funding: Number.isFinite(+t.fundingRate) ? +t.fundingRate : null }));
      const suben = liquidas.filter((x) => x.cambio > 0).length, bajan = liquidas.filter((x) => x.cambio < 0).length;
      const ord = [...liquidas].sort((a, b) => b.cambio - a.cambio);
      const media = (l) => (l.length ? l.reduce((s, x) => s + x, 0) / l.length : null);
      const porVol = [...liquidas].sort((a, b) => b.volumen_musdt - a.volumen_musdt).slice(0, 30).map((x) => x.funding).filter((x) => x != null);
      const tramos = [[-Infinity, -10], [-10, -5], [-5, -2], [-2, 0], [0, 2], [2, 5], [5, 10], [10, Infinity]];
      const etiqueta = ([a, b]) => (a === -Infinity ? `< ${b} %` : b === Infinity ? `> ${a} %` : `${a} a ${b} %`);
      const serie = v15.map((v) => ({ t: v.t, c: v.c }));
      const btcCambio = serie.length > 1 ? +((100 * (serie.at(-1).c - serie[0].c)) / serie[0].c).toFixed(2) : null;
      return {
        ahora, exchange: f.exchange ?? 'MEXC', fng, calendario,
        btc: serie.length ? { precio: serie.at(-1).c, cambio_24h_pct: btcCambio, max: Math.max(...v15.map((v) => v.h)), min: Math.min(...v15.map((v) => v.l)), serie } : null,
        amplitud: { total: liquidas.length, suben, bajan, pct_suben: liquidas.length ? +((100 * suben) / liquidas.length).toFixed(1) : null, cambio_medio: liquidas.length ? +media(liquidas.map((x) => x.cambio)).toFixed(2) : null },
        distribucion: tramos.map((r) => ({ tramo: etiqueta(r), n: liquidas.filter((x) => x.cambio >= r[0] && x.cambio < r[1]).length, positivo: r[0] >= 0 })),
        subidas: ord.slice(0, 6), bajadas: ord.slice(-6).reverse(),
        funding_medio_pct: porVol.length ? +(100 * media(porVol)).toFixed(4) : null,
      };
    }
  }
}
