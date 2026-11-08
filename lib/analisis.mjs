// Análisis multi-temporalidad para operaciones INTRADÍA CORTAS (15 a 60 minutos): tendencia + momentum
// en 5m y 15m, 1m para el momento de entrada y 1h de contexto; más BTC, funding, libro, noticias y ballenas.
// Puntuación final en [-1, 1]: positiva = LONG, negativa = SHORT.
import { ema, rsi, atr, macd, adx, swings, ultimo } from './indicadores.mjs';

// 5m manda (es el marco de la operación), 15m da la dirección, 1h el contexto y 1m el momento exacto.
export const PESOS = { '1h': 0.2, '15m': 0.3, '5m': 0.35, '1m': 0.15 };
const lim = (x, a = -1, b = 1) => Math.max(a, Math.min(b, x));

export function analizarMarco(velas, precio = null) {
  if (velas.length < 60) return null;
  const c = velas.map((b) => b.c);
  const p = precio ?? c.at(-1);
  const e20 = ema(c, 20), e50 = ema(c, 50), e200 = ema(c, 200);
  const r = rsi(c, 14), a = atr(velas, 14), m = macd(c), x = adx(velas, 14);
  const E20 = ultimo(e20), E50 = ultimo(e50), E200 = ultimo(e200);
  const R = ultimo(r), A = ultimo(a), ADX = ultimo(x);
  const H = m.hist.filter((v) => v != null);
  const h0 = H.at(-1) ?? 0, h1 = H.at(-2) ?? 0;
  const pend = e50.length > 6 && e50.at(-6) != null ? (E50 - e50.at(-6)) / (A || 1) : 0;

  const t1 = p > E50 ? 1 : -1;
  const t2 = E20 > E50 ? 1 : -1;
  const t3 = E200 == null ? 0 : E50 > E200 ? 1 : -1;
  const t4 = lim(pend);
  const tendencia = E200 == null ? 0.35 * t1 + 0.35 * t2 + 0.3 * t4 : 0.3 * t1 + 0.25 * t2 + 0.25 * t3 + 0.2 * t4;

  const m1 = Math.sign(h0) * (Math.sign(h0 - h1) === Math.sign(h0) ? 1 : 0.4);
  const m2 = lim((R - 50) / 20);
  const momentum = 0.5 * m1 + 0.5 * m2;

  let score = 0.6 * tendencia + 0.4 * momentum;
  const distE20 = A ? (p - E20) / A : 0;
  let extendido = null;
  if (R >= 75 || distE20 >= 2.5) extendido = 'arriba';
  if (R <= 25 || distE20 <= -2.5) extendido = 'abajo';
  if ((extendido === 'arriba' && score > 0) || (extendido === 'abajo' && score < 0)) score *= 0.7;

  const vol = velas.slice(-21, -1).reduce((s, b) => s + b.v, 0) / 20;
  return {
    precio: p, score: +score.toFixed(3), tendencia: +tendencia.toFixed(3), momentum: +momentum.toFixed(3),
    ema20: E20, ema50: E50, ema200: E200, rsi: R == null ? null : +R.toFixed(1), atr: A, adx: ADX == null ? null : +ADX.toFixed(1),
    macd_hist: h0, extendido, vol_rel: vol ? +(velas.at(-1).v / vol).toFixed(2) : null,
    swings: swings(velas.slice(-120), 3),
  };
}

// Niveles de soporte/resistencia cercanos a partir de los swings de un marco.
export function niveles(marco, precio) {
  if (!marco) return { soporte: null, resistencia: null };
  const sop = marco.swings.bajos.map((s) => s.p).filter((x) => x < precio).sort((a, b) => b - a);
  const res = marco.swings.altos.map((s) => s.p).filter((x) => x > precio).sort((a, b) => a - b);
  return { soporte: sop[0] ?? null, resistencia: res[0] ?? null, soportes: sop.slice(0, 3), resistencias: res.slice(0, 3) };
}

export function desequilibrioLibro(depth) {
  if (!depth || !depth.bids || !depth.asks) return 0;
  const b = depth.bids.reduce((s, x) => s + +x[1], 0), a = depth.asks.reduce((s, x) => s + +x[1], 0);
  return a + b ? (b - a) / (a + b) : 0;
}

// Combina los marcos y el contexto. Devuelve sesgo, puntuación, confianza (0-100) y las razones.
export function combinar({ marcos, btc = null, btcPeso = 0.15, funding = null, libro = 0, noticias = null, ballenas = null, esBTC = false }) {
  let s = 0, w = 0;
  for (const [k, peso] of Object.entries(PESOS)) {
    if (!marcos[k]) continue;
    s += peso * marcos[k].score;
    w += peso;
  }
  const tecnico = w ? s / w : 0;
  const razones = [], alertas = [];
  let total = tecnico;

  if (btc != null && !esBTC) {
    total = (1 - (btcPeso ?? 0.15)) * total + (btcPeso ?? 0.15) * btc;
    if (Math.abs(btc) >= 0.3) razones.push(`BTC ${btc > 0 ? 'alcista' : 'bajista'} (${btc.toFixed(2)}) ${Math.sign(btc) === Math.sign(tecnico) ? 'acompaña' : 'va en contra'}`);
  }
  if (funding != null) {
    const f = funding;
    let aj = 0;
    if (f >= 0.001) aj = -0.1; else if (f >= 0.0005) aj = -0.05;
    else if (f <= -0.001) aj = 0.1; else if (f <= -0.0005) aj = 0.05;
    if (aj) {
      total += aj;
      razones.push(`funding ${(f * 100).toFixed(3)} %: ${f > 0 ? 'muchos longs apalancados (riesgo de barrida hacia abajo)' : 'muchos shorts apalancados (riesgo de squeeze hacia arriba)'}`);
    }
  }
  if (libro) total += 0.05 * lim(libro);
  if (noticias) {
    total += 0.1 * lim(noticias.sentimiento || 0);
    if (noticias.evento_riesgo) alertas.push(`Noticia de riesgo reciente: "${noticias.evento_riesgo}"`);
  }
  // Ballenas: pesan más cuanto más fuentes hay (cobertura) y nunca deciden solas.
  const bw = ballenas && ballenas.cobertura ? ballenas.puntuacion * Math.min(1, ballenas.cobertura) : null;
  if (bw != null) {
    total += 0.15 * bw;
    if (Math.abs(bw) >= 0.15) razones.push(`Ballenas ${ballenas.lectura} (${bw >= 0 ? '+' : ''}${bw.toFixed(2)})`);
  }
  total = lim(total);

  const signo = Math.sign(total) || 1;
  let acuerdo = 0, wa = 0;
  for (const [k, peso] of Object.entries(PESOS)) {
    if (!marcos[k]) continue;
    wa += peso;
    if (Math.sign(marcos[k].score) === signo) acuerdo += peso;
  }
  acuerdo = wa ? acuerdo / wa : 0;
  const adxRef = marcos['15m']?.adx ?? marcos['5m']?.adx;
  const rango = adxRef != null && adxRef < 18;
  const ext = ['5m', '15m'].some((k) => marcos[k]?.extendido === (signo > 0 ? 'arriba' : 'abajo'));

  let conf = 30 + 60 * Math.abs(total) + 30 * (acuerdo - 0.5);
  if (rango) { conf -= 10; alertas.push(`ADX 15m ${adxRef}: mercado lateral, sin tendencia clara (en scalping el precio rebota entre niveles)`); }
  if (ext) { conf -= 10; alertas.push(`Precio sobreextendido ${signo > 0 ? 'arriba' : 'abajo'} (RSI extremo o lejos de la EMA20): riesgo de retroceso`); }
  if (noticias?.evento_riesgo) conf -= 10;
  const rsi1 = marcos['1m']?.rsi;
  const tardia = rsi1 != null && (signo > 0 ? rsi1 >= 75 : rsi1 <= 25);
  if (tardia) { conf -= 5; alertas.push(`RSI 1m ${rsi1}: el impulso ya corrió, entra con limit en el retroceso, no a mercado`); }
  const ballenasEnContra = bw != null && Math.abs(bw) >= 0.3 && Math.sign(bw) !== signo;
  if (ballenasEnContra) { conf -= 10; alertas.push(`Las ballenas van en contra (${ballenas.lectura}): el dinero grande se posiciona ${bw > 0 ? 'al alza' : 'a la baja'}`); }
  else if (bw != null && Math.abs(bw) >= 0.3) conf += 5;
  conf = Math.round(lim(conf, 5, 90));
  if (rango) conf = Math.min(conf, 64); // lateral: como mucho MEDIA, y el número lo refleja

  const porMarco = [];
  for (const k of Object.keys(PESOS)) {
    const m = marcos[k];
    if (!m) continue;
    const dir = m.score >= 0.25 ? 'alcista' : m.score <= -0.25 ? 'bajista' : 'neutral';
    porMarco.push(`${k}: ${dir} (${m.score.toFixed(2)}), RSI ${m.rsi}, ${m.precio > m.ema50 ? 'sobre' : 'bajo'} EMA50`);
  }
  razones.unshift(...porMarco);

  let nivel;
  if (Math.abs(total) < 0.15 || conf < 40) nivel = 'NO OPERAR';
  else if (conf >= 65 && !rango) nivel = 'ALTA';
  else if (conf >= 50) nivel = 'MEDIA';
  else nivel = 'BAJA';

  return {
    sesgo: total >= 0 ? 'LONG' : 'SHORT', puntuacion: +total.toFixed(3), tecnico: +tecnico.toFixed(3),
    confianza: conf, nivel, acuerdo: +acuerdo.toFixed(2), lateral: rango, sobreextendido: ext, entrada_tardia: tardia,
    ballenas: bw == null ? null : +bw.toFixed(3), ballenas_en_contra: ballenasEnContra, razones, alertas,
  };
}

// Puntuación rápida de BTC (contexto) con 5m y 15m: para scalping importa lo que hace BTC ahora.
export function puntuacionBTC(m5, m15) {
  const a = m5?.score ?? 0, b = m15?.score ?? 0;
  return +(0.5 * a + 0.5 * b).toFixed(3);
}
