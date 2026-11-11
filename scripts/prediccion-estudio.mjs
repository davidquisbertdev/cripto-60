#!/usr/bin/env node
// Estudio del modelo de Predicción de MEXC sobre las últimas ~24 h reales (índice de MEXC por segundo +
// Binance spot por segundo). Mide: cuánto acierta el lado favorito según el tiempo transcurrido, si la
// probabilidad está bien calibrada (y el ajuste de la desviación que mejor la deja) y si el flujo agresivo
// o el impulso añaden algo. Uso: node scripts/prediccion-estudio.mjs [horas=24]
import { seriePorSegundo, volatilidadSeg, probabilidadCaja, diferenciaIndice, flujoSpot, API_PRED } from '../lib/prediccion.mjs';

const horas = +process.argv[2] || 24;
const j = async (u) => { for (let i = 0; i < 4; i++) { try { const x = await fetch(u, { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(15000) }); if (x.ok) return await x.json(); } catch { /* reintenta */ } await new Promise((s) => setTimeout(s, 800 * (i + 1))); } return null; };
const ahora = Math.floor(Date.now() / 60e3) * 60e3;

async function datos(moneda) {
  const indice = [];
  for (let h = horas; h > 0; h--) {
    const d = await j(`${API_PRED}/event/index/price/range?indexName=${moneda}&start=${ahora - h * 3600e3}&end=${ahora - (h - 1) * 3600e3}&indexPeriod=300`);
    for (const x of d?.data ?? []) indice.push([+x.ts, +x.p]);
  }
  const I = new Map(indice);
  let k = [];
  for (let fin = ahora; k.length < horas * 3600 + 1200;) {
    const d = await j(`https://api.binance.com/api/v3/klines?symbol=${moneda}USDT&interval=1s&limit=1000&endTime=${fin}`);
    if (!d?.length) break;
    k = [...d, ...k]; fin = d[0][0] - 1;
  }
  return { I, indice: [...I].sort((a, b) => a[0] - b[0]), S: seriePorSegundo(k, ahora) };
}

const filas = [];
for (const moneda of ['BTC', 'ETH']) {
  const { I, indice, S } = await datos(moneda);
  console.log(moneda, 'índice', indice.length, 'pts · spot', S.c.length, 's');
  for (const plazo of [5, 15]) {
    const ms = plazo * 60e3;
    for (let ini = Math.ceil((indice[0][0] + 900e3) / ms) * ms; ini + ms <= ahora; ini += ms) {
      const base = I.get(ini), cierre = I.get(ini + ms);
      if (base == null || cierre == null) continue;
      const marcas = plazo === 5 ? [0, 60, 120, 180, 210, 240, 260, 280] : [0, 180, 420, 600, 720, 810, 840, 870, 880];
      for (const e of marcas) {
        const t = ini + e * 1000, sigma = volatilidadSeg(S, t), ventana = indice.filter(([x]) => x <= t && x >= t - 300e3);
        const dif = diferenciaIndice(S, ventana, t);
        if (sigma == null || dif == null) continue;
        const p = probabilidadCaja(S, t, { inicio: ini, fin: ini + ms }, sigma, { dif, base, ajuste: 1 });
        if (!p) continue;
        const f = flujoSpot(S, t, 60);
        filas.push({ moneda, plazo, e, falta: plazo * 60 - e, z: p.z, up: cierre > base, compra: f.compra_pct, impulso: f.cambio / base, error: (cierre - p.esperado) / base, idx: (I.get(t) ?? base) - base });
      }
    }
  }
}

const N = (z) => { const x = Math.abs(z) / Math.SQRT2, t = 1 / (1 + 0.3275911 * x), y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x); return z >= 0 ? 0.5 * (1 + y) : 0.5 * (1 - y); };
const pDe = (f, k) => (f.z == null ? (f.up ? 1 : 0) : N(f.z / k));
const brier = (l, k) => l.reduce((s, f) => s + (pDe(f, k) - (f.up ? 1 : 0)) ** 2, 0) / l.length;

console.log('\nAjuste de la desviación (menor Brier = mejor calibrado):');
let mejor = [1, Infinity];
for (const k of [0.8, 0.9, 1, 1.1, 1.15, 1.2, 1.3, 1.5, 1.8]) { const b = brier(filas, k); if (b < mejor[1]) mejor = [k, b]; console.log(`  k=${k}  Brier ${b.toFixed(4)}`); }
const K = mejor[0];
console.log(`  → mejor k=${K}`);

console.log('\nAcierto del lado favorito según el tiempo transcurrido:');
for (const plazo of [5, 15]) for (const e of [...new Set(filas.filter((f) => f.plazo === plazo).map((f) => f.e))]) {
  const l = filas.filter((f) => f.plazo === plazo && f.e === e), ok = l.filter((f) => (pDe(f, K) >= 0.5) === f.up).length;
  const soloIdx = l.filter((f) => f.idx !== 0), okIdx = soloIdx.filter((f) => (f.idx > 0) === f.up).length;
  console.log(`  ${plazo} min · a los ${String(e).padStart(3)} s (faltan ${String(plazo * 60 - e).padStart(3)}): modelo ${(100 * ok / l.length).toFixed(0)} % · mirando solo el gráfico de MEXC ${(100 * okIdx / Math.max(1, soloIdx.length)).toFixed(0)} %  (n=${l.length})`);
}

console.log('\nCalibración (probabilidad que da el modelo al favorito → cuánto acertó):');
for (const [a, b] of [[0.5, 0.6], [0.6, 0.72], [0.72, 0.85], [0.85, 0.95], [0.95, 1.01]]) {
  const l = filas.filter((f) => { const q = Math.max(pDe(f, K), 1 - pDe(f, K)); return q >= a && q < b; });
  const ok = l.filter((f) => (pDe(f, K) >= 0.5) === f.up).length, media = l.reduce((s, f) => s + Math.max(pDe(f, K), 1 - pDe(f, K)), 0) / Math.max(1, l.length);
  console.log(`  ${(100 * a).toFixed(0)}–${(100 * Math.min(b, 1)).toFixed(0)} %: dice ${(100 * media).toFixed(0)} % · acertó ${(100 * ok / Math.max(1, l.length)).toFixed(0)} %  (n=${l.length})`);
}

// ¿El flujo o el impulso predicen el error que le queda a la proyección? (correlación con cierre − esperado)
const corr = (l, fx) => { const a = l.map(fx), b = l.map((f) => f.error), ma = a.reduce((s, x) => s + x, 0) / a.length, mb = b.reduce((s, x) => s + x, 0) / b.length; let sab = 0, saa = 0, sbb = 0; for (let i = 0; i < a.length; i++) { sab += (a[i] - ma) * (b[i] - mb); saa += (a[i] - ma) ** 2; sbb += (b[i] - mb) ** 2; } return sab / Math.sqrt(saa * sbb); };
const vivos = filas.filter((f) => f.z != null && f.compra != null && f.falta >= 20);
console.log(`\n¿Añaden algo? Correlación con el error de la proyección (n=${vivos.length}; ±${(2 / Math.sqrt(vivos.length)).toFixed(3)} es ruido):`);
console.log(`  flujo comprador 60 s: ${corr(vivos, (f) => f.compra).toFixed(3)}`);
console.log(`  impulso 60 s:         ${corr(vivos, (f) => f.impulso).toFixed(3)}`);
