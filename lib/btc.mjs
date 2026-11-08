// Bitcoin como contexto obligatorio: las altcoins siguen a BTC en el corto plazo. Este módulo lee BTC en
// 1m, 5m, 15m y 1h, mide cuánto se parece la moneda a BTC (correlación y beta de los retornos de 5m) y
// dice si BTC acompaña o va en contra de una operación.
import { cerradas } from './mexc.mjs';
import { analizarMarco, niveles } from './analisis.mjs';

const lim = (x, a = -1, b = 1) => Math.max(a, Math.min(b, x));
export const PESOS_BTC = { '1m': 0.15, '5m': 0.35, '15m': 0.3, '1h': 0.2 };

const cambio = (velas, n, precio) => (velas && velas.length > n ? +((100 * (precio - velas.at(-n - 1).c)) / velas.at(-n - 1).c).toFixed(3) : null);
const dirTxt = (s) => (s >= 0.25 ? 'alcista' : s <= -0.25 ? 'bajista' : 'neutral');

// Lectura de BTC. Las velas de 1m y 1h son opcionales (si fallan, se usan 5m y 15m).
// Se piden 500 velas de 5m para poder leer BTC en cualquier momento del historial de ~28 h.
export async function analizarBTC(fuente) {
  const pedir = (i, n) => fuente.velas('BTC_USDT', i, n).catch(() => null);
  const [v1, v5, v15, v1h] = await Promise.all([pedir('1m', 300), pedir('5m', 500), pedir('15m', 300), pedir('1h', 300)]);
  if (!v5 || !v15) return null;
  const series = { c1: v1 ? cerradas(v1) : null, c5: cerradas(v5), c15: cerradas(v15), c1h: v1h ? cerradas(v1h) : null };
  const r = leerBTC({ ...series, c5: series.c5.slice(-300) }, (v1 ?? v5).at(-1).c);
  return r && { ...r, velas5m: series.c5, series };
}

const SEG = { c1: 60, c5: 300, c15: 900, c1h: 3600 };
// BTC tal como se veía en el instante t (solo velas ya cerradas entonces): para el historial.
export function lecturaBTCEn(series, t) {
  if (!series) return null;
  const corte = {};
  for (const [k, v] of Object.entries(series)) {
    if (!v) { corte[k] = null; continue; }
    const hasta = v.filter((b) => b.t + SEG[k] * 1000 <= t);
    corte[k] = hasta.length ? hasta.slice(-300) : null;
  }
  if (!corte.c5 || !corte.c15) return null;
  return leerBTC(corte, corte.c5.at(-1).c, { breve: true });
}

// Lectura pura a partir de velas cerradas. breve: sin frases ni niveles (para el historial).
export function leerBTC({ c1, c5, c15, c1h }, precio, { breve = false } = {}) {
  if (!c5 || !c15) return null;
  const marcos = {
    '1m': c1 ? analizarMarco(c1, precio) : null,
    '5m': analizarMarco(c5, precio),
    '15m': analizarMarco(c15, precio),
    '1h': c1h ? analizarMarco(c1h, precio) : null,
  };
  let s = 0, w = 0;
  for (const [k, p] of Object.entries(PESOS_BTC)) if (marcos[k]) { s += p * marcos[k].score; w += p; }
  let puntuacion = w ? s / w : 0;
  const cambio15 = cambio(c5, 3, precio), cambio1h = cambio(c5, 12, precio);
  // Presión ahora: las 3 últimas velas de 5m en la misma dirección y movimiento de 15 min apreciable
  const ult = c5.slice(-3);
  const atrPct = marcos['5m']?.atr ? (100 * marcos['5m'].atr) / precio : 0.1;
  let presion = 0;
  if (cambio15 != null && Math.abs(cambio15) >= Math.max(0.12, atrPct)) {
    const d = Math.sign(cambio15);
    if (ult.every((b) => Math.sign(b.c - b.o) === d || b.c === b.o)) presion = d;
  }
  if (presion) puntuacion = lim(puntuacion + 0.1 * presion);
  // Tendencia mayor (15m + 1h): un rebote de 1m no cambia el rumbo de BTC
  const mayores = ['15m', '1h'].filter((k) => marcos[k]).map((k) => marcos[k].score);
  const tendenciaMayor = mayores.length ? +(mayores.reduce((x, y) => x + y, 0) / mayores.length).toFixed(3) : 0;
  const adx15 = marcos['15m']?.adx ?? null;
  const lateral = adx15 != null && adx15 < 18;
  const lectura = puntuacion >= 0.25 ? 'ALCISTA' : puntuacion <= -0.25 ? 'BAJISTA' : 'NEUTRAL';
  const fuerza = Math.abs(puntuacion) >= 0.5 ? 'fuerte' : Math.abs(puntuacion) >= 0.25 ? 'moderada' : '';
  if (breve) return { precio, puntuacion: +puntuacion.toFixed(3), tendencia_mayor: tendenciaMayor, lectura, presion };
  const porMarco = Object.fromEntries(Object.entries(marcos).filter(([, m]) => m).map(([k, m]) => [k, { score: m.score, dir: dirTxt(m.score), rsi: m.rsi, adx: m.adx }]));
  const n5 = niveles(marcos['5m'], precio);
  const frases = [];
  frases.push(`Marcos: ${Object.entries(porMarco).map(([k, m]) => `${k} ${m.dir} (${m.score.toFixed(2)})`).join(' · ')}`);
  frases.push(`Cambio 15 min ${cambio15 == null ? '—' : `${cambio15 >= 0 ? '+' : ''}${cambio15} %`} · 1 h ${cambio1h == null ? '—' : `${cambio1h >= 0 ? '+' : ''}${cambio1h} %`}${lateral ? ` · ADX 15m ${adx15}: lateral` : ''}`);
  if (Math.abs(tendenciaMayor) >= 0.35) frases.push(`Tendencia mayor (15m + 1h) ${tendenciaMayor > 0 ? 'alcista' : 'bajista'} (${tendenciaMayor.toFixed(2)})${Math.sign(tendenciaMayor) !== Math.sign(puntuacion) && Math.abs(puntuacion) >= 0.1 ? ': el movimiento corto va contra ella, puede ser solo un rebote' : ''}.`);
  if (presion) frases.push(`BTC se está moviendo AHORA ${presion > 0 ? 'hacia arriba' : 'hacia abajo'} (3 velas de 5m seguidas): arrastra a las altcoins.`);
  return {
    precio, puntuacion: +puntuacion.toFixed(3), tendencia_mayor: tendenciaMayor, lectura, fuerza, presion, lateral, adx15m: adx15,
    cambio_15m_pct: cambio15, cambio_1h_pct: cambio1h, rsi_5m: marcos['5m']?.rsi ?? null, marcos: porMarco,
    soporte_5m: n5.soporte, resistencia_5m: n5.resistencia, frases,
  };
}

// Correlación y beta de la moneda frente a BTC con retornos de 5m alineados por hora (últimas ~8 h).
export function relacionConBTC(velasAlt, velasBTC, n = 96) {
  if (!velasAlt?.length || !velasBTC?.length) return null;
  const mapa = new Map(velasBTC.map((b) => [b.t, b.c]));
  const pares = [];
  for (let i = 1; i < velasAlt.length; i++) {
    const a0 = velasAlt[i - 1], a1 = velasAlt[i];
    const b0 = mapa.get(a0.t), b1 = mapa.get(a1.t);
    if (b0 == null || b1 == null) continue;
    pares.push([(a1.c - a0.c) / a0.c, (b1 - b0) / b0]);
  }
  const p = pares.slice(-n);
  if (p.length < 30) return null;
  const ma = p.reduce((s, x) => s + x[0], 0) / p.length, mb = p.reduce((s, x) => s + x[1], 0) / p.length;
  let cov = 0, va = 0, vb = 0;
  for (const [x, y] of p) { cov += (x - ma) * (y - mb); va += (x - ma) ** 2; vb += (y - mb) ** 2; }
  if (!va || !vb) return null;
  const corr = cov / Math.sqrt(va * vb);
  return { correlacion: +corr.toFixed(2), beta: +(cov / vb).toFixed(2), velas: p.length };
}

// Cuánto pesa BTC en la decisión de una altcoin: más cuanto más se le parece.
export const pesoBTC = (rel) => 0.1 + 0.2 * Math.max(0, rel?.correlacion ?? 0.6);

// ¿BTC acompaña o va en contra de un lado (signo +1 LONG / -1 SHORT)? Devuelve el ajuste para la decisión.
// estrategia 'reversion' es más sensible: una reversión contra un BTC con dirección es atrapar un cuchillo.
export function filtroBTC(btc, rel, signo, estrategia = 'tendencia') {
  if (!btc) return { estado: 'sin datos', ajuste_conf: 0, bloquea: false, bajar: 0, texto: null };
  const corr = rel?.correlacion ?? 0.6; // sin dato, se asume la correlación típica de una altcoin
  const b = btc.puntuacion, tm = btc.tendencia_mayor ?? 0;
  const mayorContra = Math.sign(tm) !== signo && Math.abs(tm) >= 0.35;
  const contra = (Math.sign(b) !== signo && Math.abs(b) >= 0.25) || mayorContra;
  const favor = !contra && Math.sign(b) === signo && Math.abs(b) >= 0.25;
  const presionContra = btc.presion && btc.presion !== signo;
  const ligada = corr >= 0.5;
  const lado = signo > 0 ? 'LONG' : 'SHORT';
  const que = mayorContra && !(Math.sign(b) !== signo && Math.abs(b) >= 0.25)
    ? `la tendencia mayor de BTC (15m + 1h ${tm.toFixed(2)})` : `BTC ${btc.lectura} (${b.toFixed(2)})`;
  const r = { estado: contra ? 'en contra' : favor ? 'a favor' : 'neutral', ajuste_conf: 0, bloquea: false, bajar: 0, texto: null };
  if (contra && ligada) {
    const fuerte = (Math.sign(b) !== signo && Math.abs(b) >= 0.4) || presionContra || mayorContra;
    if (estrategia === 'reversion' && fuerte) {
      r.bloquea = true;
      r.texto = `${que} va en contra del ${lado} y la moneda lo sigue (correlación ${corr}): una reversión contra BTC suele seguir de largo. Espera a que BTC se frene.`;
    } else {
      r.ajuste_conf = estrategia === 'reversion' ? -15 : -10;
      if (fuerte) r.bajar = 1;
      r.texto = `${que} va en contra del ${lado} (correlación ${corr}${presionContra ? ', y se está moviendo ahora' : ''}).`;
    }
  } else if (contra) {
    r.ajuste_conf = -5;
    r.texto = `BTC ${btc.lectura} va en contra, pero esta moneda se le parece poco ahora (correlación ${corr}).`;
  } else if (favor && ligada) {
    r.ajuste_conf = 5;
    r.texto = `BTC ${btc.lectura} acompaña el ${lado} (correlación ${corr}).`;
  }
  return r;
}
