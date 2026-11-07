// Configuración (trader/config.json) y diario de operaciones (trader/diario.json).
import fs from 'node:fs';
import path from 'node:path';

export const DEFAULTS = {
  exchange: 'MEXC',
  carpeta: 'trader',
  zona_horaria: null, // null = la del sistema. Ej: "America/La_Paz"
  apalancamiento_max: 20, // tope propio, aunque MEXC permita más
  riesgo_max_pct: 10, // nunca arriesgar más de este % del capital en una operación
  // % del capital que se pierde si salta el SL, según la confianza del análisis
  riesgo_por_confianza: { ALTA: 8, MEDIA: 5, BAJA: 2.5 },
  // % del capital que se usa como margen, según la confianza
  margen_por_confianza: { ALTA: 100, MEDIA: 70, BAJA: 50 },
  tps_r: [1, 2, 3], // TP1, TP2, TP3 en múltiplos del riesgo (R)
  reparto_tps: [50, 30, 20], // % de la posición que se cierra en cada TP
  liquidacion_vs_sl: 2, // la liquidación debe quedar al menos 2x más lejos que el SL
  validez_entrada_min: 30, // si no entraste en este tiempo, la señal caduca
  espera_max_horas: 12, // tope del tiempo máximo para esperar el TP1
  simulaciones: 5000,
  semilla: 7,
  // Diario / gestión de capital
  max_operaciones_dia: 4,
  max_perdida_dia_pct: 15, // si hoy pierdes este % del capital, se para hasta mañana
  perdidas_seguidas_mitad: 2, // tras N pérdidas seguidas, riesgo a la mitad
  perdidas_seguidas_parar: 3, // tras N pérdidas seguidas, parar por hoy
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
  let seguidas = 0;
  for (let i = ops.length - 1; i >= 0 && ops[i].pnl < 0; i--) seguidas++;
  const capitalInicioDia = capital - pnlHoy;
  const avisos = [];
  let bloqueo = null;
  let factor = 1;
  if (seguidas >= cfg.perdidas_seguidas_parar) bloqueo = `${seguidas} pérdidas seguidas: para por hoy, el mercado no está a tu favor.`;
  else if (seguidas >= cfg.perdidas_seguidas_mitad) { factor = 0.5; avisos.push(`${seguidas} pérdidas seguidas: riesgo reducido a la mitad.`); }
  if (capitalInicioDia > 0 && -pnlHoy >= (capitalInicioDia * cfg.max_perdida_dia_pct) / 100)
    bloqueo = `Hoy ya perdiste ${(-pnlHoy).toFixed(2)} USDT (límite ${cfg.max_perdida_dia_pct} % del capital): no operes más hoy.`;
  if (deHoy.length >= cfg.max_operaciones_dia) bloqueo = bloqueo || `Ya hiciste ${deHoy.length} operaciones hoy (máximo ${cfg.max_operaciones_dia}).`;
  const ganadas = ops.filter((o) => o.pnl > 0).length;
  return {
    capital, capital_inicial: diario.capital_inicial, operaciones: ops.length, ganadas,
    perdidas: ops.filter((o) => o.pnl < 0).length,
    tasa_acierto: ops.length ? +((100 * ganadas) / ops.length).toFixed(1) : null,
    hoy: { fecha: hoy, operaciones: deHoy.length, pnl: +pnlHoy.toFixed(4) },
    perdidas_seguidas: seguidas, factor_riesgo: factor, bloqueo, avisos,
  };
}
