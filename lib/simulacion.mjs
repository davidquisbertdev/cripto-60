// Monte Carlo: rehace las próximas horas miles de veces sorteando velas de 5 minutos reales recientes
// de la misma moneda (con su volatilidad y su deriva), y gestiona la operación como en el plan:
// TP1 -> SL a la entrada (breakeven), TP2 -> SL al TP1, TP3 -> cierre total.

export function prng(semilla) {
  let a = semilla >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function pool(velas) {
  const out = [];
  for (let i = 1; i < velas.length; i++) {
    const pc = velas[i - 1].c;
    if (!(pc > 0)) continue;
    out.push([velas[i].o / pc, velas[i].h / pc, velas[i].l / pc, velas[i].c / pc]);
  }
  return out;
}

const pctl = (a, q) => (a.length ? a[Math.min(a.length - 1, Math.floor(q * a.length))] : null);

// tps: [p1, p2, p3]; reparto: [50,30,20]; minBarra: minutos por vela (5)
// Para una posición ya abierta: inicio = precio actual, hechos = TPs ya alcanzados, sl = stop actual.
// limiteTP1 (en velas): regla de scalping, si a esa altura no tocó el TP1 se cierra a mercado.
export function simular({ velas, lado, entrada, sl, tps, reparto = [50, 30, 20], horizonte = 96, n = 5000, semilla = 7, minBarra = 5, inicio = null, hechos = 0, riesgoR = null, limiteTP1 = null }) {
  const P = pool(velas);
  if (P.length < 100) throw new Error(`Pocas velas para simular (${P.length}); hacen falta al menos 100.`);
  const rnd = prng(semilla);
  const L = lado === 'LONG' ? 1 : -1;
  const R = riesgoR ?? Math.abs(entrada - sl);
  const w = reparto.map((x) => x / 100);
  const abierto0 = 1 - w.slice(0, hechos).reduce((a, b) => a + b, 0);
  const cuenta = { tp1: 0, tp2: 0, tp3: 0, sl: 0, nada: 0, be: 0, tiempo: 0 };
  const tTP1 = [], rs = [], finales = [];
  for (let k = 0; k < n; k++) {
    // r: resultado en R (medido desde la entrada) de la parte que sigue abierta
    let p = inicio ?? entrada, stop = sl, hit = hechos, abierto = abierto0, r = 0, fin = null;
    for (let b = 0; b < horizonte; b++) {
      const v = P[Math.floor(rnd() * P.length)];
      // el precio de apertura de la vela continúa desde el cierre anterior
      const hi = p * v[1], lo = p * v[2], cl = p * v[3];
      const tocaStop = L > 0 ? lo <= stop : hi >= stop;
      if (tocaStop) { // conservador: si la vela toca el stop y un TP, cuenta el stop
        r += abierto * (L * (stop - entrada)) / R;
        abierto = 0;
        fin = hit === 0 ? 'sl' : 'be';
        break;
      }
      while (hit < 3 && (L > 0 ? hi >= tps[hit] : lo <= tps[hit])) {
        r += w[hit] * (L * (tps[hit] - entrada)) / R;
        abierto -= w[hit];
        if (hit === 0) tTP1.push((b + 1) * minBarra);
        stop = hit === 0 ? entrada : tps[hit - 1];
        hit++;
      }
      p = cl;
      if (hit === 3 || abierto <= 1e-9) { fin = 'tp3'; break; }
      if (limiteTP1 && hit === 0 && b + 1 >= limiteTP1) { r += abierto * (L * (p - entrada)) / R; abierto = 0; fin = 'tiempo'; break; }
    }
    if (fin == null) { r += abierto * (L * (p - entrada)) / R; fin = hit === 0 ? 'nada' : 'abierto'; }
    if (hit >= 1) cuenta.tp1++;
    if (hit >= 2) cuenta.tp2++;
    if (hit >= 3) cuenta.tp3++;
    if (fin === 'sl') cuenta.sl++;
    if (fin === 'nada') cuenta.nada++;
    if (fin === 'be') cuenta.be++;
    if (fin === 'tiempo') cuenta.tiempo++;
    rs.push(r);
    finales.push(p);
  }
  tTP1.sort((a, b) => a - b);
  rs.sort((a, b) => a - b);
  finales.sort((a, b) => a - b);
  const pc = (x) => +((100 * x) / n).toFixed(1);
  const redondeo5 = (m) => (m == null ? null : minBarra === 1 ? Math.ceil(m) : Math.ceil(m / 5) * 5);
  return {
    simulaciones: n, semilla, horizonte_min: horizonte * minBarra, velas_pool: P.length,
    prob: { tp1: pc(cuenta.tp1), tp2: pc(cuenta.tp2), tp3: pc(cuenta.tp3), sl_antes_tp1: pc(cuenta.sl), nada: pc(cuenta.nada), be_tras_tp1: pc(cuenta.be), cierre_por_tiempo: pc(cuenta.tiempo) },
    minutos_tp1: { p25: pctl(tTP1, 0.25), mediana: pctl(tTP1, 0.5), p75: pctl(tTP1, 0.75), p90: pctl(tTP1, 0.9) },
    espera_max_min: redondeo5(pctl(tTP1, 0.75)),
    r_esperado: +(rs.reduce((a, b) => a + b, 0) / n).toFixed(3),
    r_mediana: +pctl(rs, 0.5).toFixed(3),
    precio_final: { p5: pctl(finales, 0.05), mediana: pctl(finales, 0.5), p95: pctl(finales, 0.95) },
  };
}
