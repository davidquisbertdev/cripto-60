// Estrategia de REVERSIÓN A LA MEDIA para scalping: cuando el precio se estira lejos de su media de 5m
// (fuera de las bandas de Bollinger, RSI extremo) y aparece una vela de giro en 1m, se apuesta a que
// vuelva hacia la media. Funciona mejor en mercado lateral; contra una tendencia fuerte, peor.
import { rsi } from './indicadores.mjs';

const lim = (x, a = -1, b = 1) => Math.max(a, Math.min(b, x));

export function bollinger(cierres, n = 20, k = 2) {
  if (cierres.length < n) return null;
  const v = cierres.slice(-n);
  const medio = v.reduce((a, b) => a + b, 0) / n;
  const sd = Math.sqrt(v.reduce((a, b) => a + (b - medio) ** 2, 0) / n);
  return { medio, sd, sup: medio + k * sd, inf: medio - k * sd };
}

// velas5: velas de 5m cerradas; velas1: de 1m cerradas; precio: el actual; tendencia15: puntuación del
// marco de 15m (opcional). Puntuación en [-1, 1]: positiva = LONG (rebote), negativa = SHORT.
export function puntuarReversion(velas5, precio, velas1 = null, tendencia15 = null) {
  if (!velas5 || velas5.length < 30) return null;
  const c5 = velas5.map((b) => b.c);
  const bb = bollinger(c5, 20, 2);
  if (!bb || !bb.sd) return null;
  const z = (precio - bb.medio) / bb.sd;
  const r5 = rsi([...c5, precio], 14).at(-1);
  let score = 0.55 * lim(-z / 2) + 0.45 * lim((50 - r5) / 20);
  const razones = [];
  // Vela de giro en 1m: la última vela cerrada va ya en la dirección del rebote
  let giro = 0;
  const u = velas1?.at(-1);
  if (u) giro = Math.sign(u.c - u.o);
  const dir = Math.sign(score) || 1;
  if (giro === dir) { score += 0.15 * dir; razones.push(`vela de 1m de giro ${dir > 0 ? 'alcista' : 'bajista'}`); }
  else if (giro === -dir) { score -= 0.1 * dir; razones.push('la vela de 1m todavía va en contra (sin giro)'); }
  let contraTendencia = false;
  if (tendencia15 != null && Math.abs(tendencia15) >= 0.6 && Math.sign(tendencia15) !== dir) {
    score *= 0.6;
    contraTendencia = true;
    razones.push(`contra una tendencia fuerte de 15m (${tendencia15.toFixed(2)})`);
  }
  score = lim(score);
  razones.unshift(`precio a ${z >= 0 ? '+' : ''}${z.toFixed(2)} desviaciones de la media de 5m (${bb.medio.toPrecision(6)}), RSI 5m ${r5.toFixed(1)}`);
  return {
    score: +score.toFixed(3), sesgo: score >= 0 ? 'LONG' : 'SHORT', z: +z.toFixed(2), rsi5: +r5.toFixed(1),
    medio: bb.medio, sup: bb.sup, inf: bb.inf, giro, contra_tendencia: contraTendencia, violento: Math.abs(z) >= 3.2, razones,
  };
}

// Nivel de confianza de la reversión, con el mismo formato que combinar() en analisis.mjs.
export function decidirReversion(rv, { lateral = false, adx15 = null, ballenas = null, umbral = 0.35 } = {}) {
  if (!rv) return { estrategia: 'reversion', sesgo: 'LONG', puntuacion: 0, confianza: 5, nivel: 'NO OPERAR', razones: ['sin datos para reversión'], alertas: [] };
  const signo = Math.sign(rv.score) || 1;
  const razones = [...rv.razones], alertas = [];
  let conf = 30 + 70 * Math.abs(rv.score);
  if (lateral) { conf += 10; razones.push('mercado lateral: terreno de la reversión'); }
  else if (adx15 != null && adx15 >= 25) { conf -= 10; alertas.push(`ADX 15m ${adx15}: hay tendencia, la reversión es más arriesgada`); }
  if (rv.violento) { conf -= 10; alertas.push(`Movimiento violento (${rv.z} desviaciones): puede seguir antes de girar`); }
  const bw = ballenas && ballenas.cobertura ? ballenas.puntuacion * Math.min(1, ballenas.cobertura) : null;
  if (bw != null && Math.abs(bw) >= 0.3 && Math.sign(bw) !== signo) { conf -= 10; alertas.push(`Las ballenas empujan en contra del rebote (${ballenas.lectura})`); }
  conf = Math.round(lim(conf, 5, 90));
  let nivel;
  if (Math.abs(rv.score) < umbral || conf < 40) nivel = 'NO OPERAR';
  else if (conf >= 65) nivel = 'ALTA';
  else if (conf >= 50) nivel = 'MEDIA';
  else nivel = 'BAJA';
  return { estrategia: 'reversion', sesgo: rv.sesgo, puntuacion: rv.score, confianza: conf, nivel, razones, alertas, objetivo_media: rv.medio };
}
