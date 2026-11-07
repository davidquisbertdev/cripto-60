// Configuración (trader/config.json) y diario de operaciones (trader/diario.json).
import fs from 'node:fs';
import path from 'node:path';

export const DEFAULTS = {
  exchange: 'MEXC',
  carpeta: 'trader',
  zona_horaria: null, // null = la del sistema. Ej: "America/La_Paz"
  // INTRADÍA CORTO: operaciones de 15 a 60 minutos, con un SL con espacio para respirar y un
  // objetivo de ganancia en USDT por operación (p. ej. 3 USDT). El apalancamiento sale del objetivo:
  // posición necesaria = objetivo / (movimiento medio de los TP); apalancamiento = posición / margen.
  // Lo frenan la pérdida máxima por confianza, la distancia a la liquidación y el tope de apalancamiento.
  objetivo_usdt: 3, // ganancia buscada si llegan los 3 TP (0 = sin objetivo, solo riesgo)
  margen_base: 20, // USDT que pones por operación si no dices otro
  reinversion_pct: 50, // % de la ganancia acumulada que se suma al margen sugerido (interés compuesto)
  apalancamiento_max: 30, // tope propio, aunque MEXC permita más
  riesgo_max_pct: 10, // nunca perder más de este % del capital si salta el SL
  // pérdida máxima si salta el SL (% del capital), según la confianza del análisis
  riesgo_por_confianza: { ALTA: 10, MEDIA: 7, BAJA: 4 },
  // % de tu margen que se usa, según la confianza (incertidumbre = menos dinero en juego)
  margen_por_confianza: { ALTA: 100, MEDIA: 75, BAJA: 50 },
  tps_r: [1, 1.8, 2.6], // TP1, TP2, TP3 en múltiplos del riesgo (R)
  reparto_tps: [50, 25, 25], // TP1 cierra 50 %, TP2 otro 25 % (75 %), TP3 el resto (100 %)
  // Stop loss en ATR de 5 minutos, con espacio: un pequeño retroceso no te saca
  sl_atr_min: 0.9, sl_atr_max: 2.2, sl_colchon_atr: 0.25, sl_pct_min: 0.3,
  sl_candidatos_atr: [0.9, 1.2, 1.6, 2.0], // distancias de SL que se prueban con la simulación
  cierre_tiempo_max_pct: 35, // el SL elegido debe resolverse (TP1 o SL) en la espera en al menos el 65 % de los casos
  historial_min_ops: 12, // mínimo de operaciones comparables para que el historial cuente
  historial_r_min: -0.03, // por debajo (pierde en promedio tras comisiones): NO OPERAR
  historial_r_bueno: 0.03, // por debajo de esto la ventaja es mínima: se baja la confianza
  cierre_tiempo_no_operar_pct: 60, // si el 60 % se cierra por tiempo sin TP1, el precio no se mueve: NO OPERAR
  comision_ratio_min: 3, // el TP1 tiene que cubrir al menos 3x la comisión de ida y vuelta
  liquidacion_vs_sl: 2, // la liquidación debe quedar al menos 2x más lejos que el SL
  validez_entrada_min: 5, // si no entraste en 5 min, la señal caduca (el precio ya se movió)
  espera_min_min: 10, // espera mínima para el TP1
  espera_max_min: 30, // si el TP1 no llega en este tiempo como mucho, se cierra
  duracion_max_min: 60, // cierre total de lo que quede (tras TP1 el resto corre con SL en entrada)
  simulaciones: 5000,
  semilla: 7,
  // Diario / gestión de capital
  max_operaciones_dia: 20,
  max_operaciones_hora: 4,
  max_perdida_dia_pct: 20, // si hoy pierdes este % del capital, se para hasta mañana
  perdidas_seguidas_mitad: 2, // tras N pérdidas seguidas (hoy), riesgo a la mitad
  perdidas_seguidas_pausa: 2, // tras N pérdidas seguidas, pausa
  pausa_min: 30, // duración de la pausa
  perdidas_seguidas_parar: 4, // tras N pérdidas seguidas, parar por hoy
};

export function carpeta(cfg) {
  return path.resolve(process.cwd(), cfg.carpeta || 'trader');
}

export function leerConfig(ruta) {
  const f = ruta || path.resolve(process.cwd(), 'trader', 'config.json');
  let propio = {};
  if (fs.existsSync(f)) {
    try { propio = JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) {
      throw new Error(`trader/config.json no es JSON válido: ${e.message}`);
    }
  }
  const cfg = { ...DEFAULTS, ...propio };
  cfg.riesgo_por_confianza = { ...DEFAULTS.riesgo_por_confianza, ...(propio.riesgo_por_confianza || {}) };
  cfg.margen_por_confianza = { ...DEFAULTS.margen_por_confianza, ...(propio.margen_por_confianza || {}) };
  return cfg;
}

export function leerJSON(f, defecto = null) {
  if (!fs.existsSync(f)) return defecto;
  return JSON.parse(fs.readFileSync(f, 'utf8'));
}

export function escribirJSON(f, doc) {
  fs.mkdirSync(path.dirname(f), { recursive: true });
  const tmp = f + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(doc, null, 2) + '\n');
  fs.renameSync(tmp, f);
}

export function rutaDiario(cfg) { return path.join(carpeta(cfg), 'diario.json'); }
export function rutaSenal(cfg, base) { return path.join(carpeta(cfg), `senal-${base}.json`); }

// Día local (YYYY-MM-DD) en la zona configurada
export function diaLocal(ms, tz) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz || undefined, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ms));
}

// Estado del diario para la gestión de riesgo: capital, pérdidas seguidas, resultado de hoy y bloqueos.
export function estadoDiario(diario, cfg, ahora) {
  if (!diario) return null;
  const ops = diario.operaciones || [];
  const capital = +(diario.capital_inicial + ops.reduce((s, o) => s + (+o.pnl || 0), 0)).toFixed(4);
  const hoy = diaLocal(ahora, cfg.zona_horaria);
  const deHoy = ops.filter((o) => diaLocal(Date.parse(o.fecha), cfg.zona_horaria) === hoy);
  const pnlHoy = deHoy.reduce((s, o) => s + (+o.pnl || 0), 0);
  // racha de pérdidas de HOY (una mala racha de ayer no cuenta)
  let seguidas = 0;
  for (let i = deHoy.length - 1; i >= 0 && deHoy[i].pnl < 0; i--) seguidas++;
  const ultima = deHoy.length ? Date.parse(deHoy.at(-1).fecha) : null;
  const ultimaHora = deHoy.filter((o) => ahora - Date.parse(o.fecha) < 3600e3).length;
  const capitalInicioDia = capital - pnlHoy;
  const avisos = [];
  let bloqueo = null, pausa_hasta = null;
  let factor = 1;
  if (seguidas >= cfg.perdidas_seguidas_parar) bloqueo = `${seguidas} pérdidas seguidas hoy: para por hoy, el mercado no está a tu favor.`;
  else if (seguidas >= cfg.perdidas_seguidas_pausa && ultima && ahora - ultima < cfg.pausa_min * 60e3) {
    pausa_hasta = ultima + cfg.pausa_min * 60e3;
    bloqueo = `${seguidas} pérdidas seguidas: pausa de ${cfg.pausa_min} min (hasta ${new Intl.DateTimeFormat('es', { timeZone: cfg.zona_horaria || undefined, hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(pausa_hasta))}). Respira y no persigas la pérdida.`;
  }
  if (!bloqueo && seguidas >= cfg.perdidas_seguidas_mitad) { factor = 0.5; avisos.push(`${seguidas} pérdidas seguidas: riesgo reducido a la mitad.`); }
  if (capitalInicioDia > 0 && -pnlHoy >= (capitalInicioDia * cfg.max_perdida_dia_pct) / 100)
    bloqueo = `Hoy ya perdiste ${(-pnlHoy).toFixed(2)} USDT (límite ${cfg.max_perdida_dia_pct} % del capital): no operes más hoy.`;
  if (deHoy.length >= cfg.max_operaciones_dia) bloqueo = bloqueo || `Ya hiciste ${deHoy.length} operaciones hoy (máximo ${cfg.max_operaciones_dia}).`;
  if (ultimaHora >= cfg.max_operaciones_hora) bloqueo = bloqueo || `${ultimaHora} operaciones en la última hora (máximo ${cfg.max_operaciones_hora}): baja el ritmo, el sobre-trading es la forma más rápida de perder.`;
  const ganadas = ops.filter((o) => o.pnl > 0).length;
  return {
    capital, capital_inicial: diario.capital_inicial, operaciones: ops.length, ganadas,
    perdidas: ops.filter((o) => o.pnl < 0).length,
    tasa_acierto: ops.length ? +((100 * ganadas) / ops.length).toFixed(1) : null,
    hoy: { fecha: hoy, operaciones: deHoy.length, pnl: +pnlHoy.toFixed(4), ultima_hora: ultimaHora },
    margen_sugerido: +Math.min(capital, (cfg.margen_base ?? 20) + ((cfg.reinversion_pct ?? 50) / 100) * Math.max(0, capital - diario.capital_inicial)).toFixed(2),
    perdidas_seguidas: seguidas, factor_riesgo: factor, bloqueo, pausa_hasta, avisos,
  };
}
