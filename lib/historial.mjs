// Historial real de la señal (backtest corto): en las últimas ~28 h de velas de 1 minuto, cada vez que
// el análisis técnico rápido (5m + 1m) daba la misma dirección con fuerza, se aplica el MISMO plan
// (SL en ATR de 5m, TPs en R, breakeven tras TP1, cierre si no hay TP1 en espera_max_min, cierre total
// en duracion_max_min) sobre lo que pasó de verdad después. Mide si la señal tiene ventaja AHORA en esa
// moneda, con comisiones.
import { analizarMarco } from './analisis.mjs';
import { puntuarReversion } from './reversion.mjs';
import { lecturaBTCEn, filtroBTC } from './btc.mjs';

// Agrupa velas de 1 minuto en velas de n minutos (alineadas al reloj).
export function agrupar(velas1m, n = 5) {
  const out = [];
  let act = null;
  for (const b of velas1m) {
    const t0 = Math.floor(b.t / (n * 60e3)) * n * 60e3;
    if (!act || act.t !== t0) {
      if (act) out.push(act);
      act = { t: t0, o: b.o, h: b.h, l: b.l, c: b.c, v: b.v, cerrada: true, ultimo: b.t };
    } else {
      act.h = Math.max(act.h, b.h); act.l = Math.min(act.l, b.l); act.c = b.c; act.v += b.v; act.ultimo = b.t;
    }
  }
  if (act) out.push(act);
  return out;
}

// Gestiona una operación sobre velas reales (de 1 min) como el plan. Devuelve r (en R), fin y minutos.
export function gestionar(velas, { lado, entrada, sl, tps, reparto = [50, 30, 20], limiteTP1 = 15, duracion = 25 }) {
  const L = lado === 'LONG' ? 1 : -1, R = Math.abs(entrada - sl), w = reparto.map((x) => x / 100);
  let stop = sl, hit = 0, abierto = 1, r = 0;
  for (let i = 0; i < velas.length && i < duracion; i++) {
    const b = velas[i];
    if (L > 0 ? b.l <= stop : b.h >= stop) { r += abierto * (L * (stop - entrada)) / R; return { r, fin: hit ? 'stop movido' : 'SL', minutos: i + 1, hit }; }
    while (hit < tps.length && (L > 0 ? b.h >= tps[hit] : b.l <= tps[hit])) {
      r += w[hit] * (L * (tps[hit] - entrada)) / R; abierto -= w[hit];
      stop = hit === 0 ? entrada : tps[hit - 1]; hit++;
    }
    if (hit === tps.length || abierto <= 1e-9) return { r, fin: 'TP3', minutos: i + 1, hit };
    if (hit === 0 && i + 1 >= limiteTP1) { r += abierto * (L * (b.c - entrada)) / R; return { r, fin: 'tiempo', minutos: i + 1, hit }; }
  }
  const ult = velas[Math.min(velas.length, duracion) - 1];
  if (!ult) return null;
  r += abierto * (L * (ult.c - entrada)) / R;
  return { r, fin: hit ? 'tiempo tras TP' : 'tiempo', minutos: Math.min(velas.length, duracion), hit };
}

// slATR: SL en múltiplos de ATR(5m) (el mismo que eligió la señal). umbral: fuerza mínima de la puntuación.
// estrategia: 'tendencia' (análisis 5m + 1m a favor del movimiento) o 'reversion' (vuelta a la media).
// btc: { series, rel } opcional. Si se da, en cada operación se lee BTC tal como estaba en ese momento y
// se descartan las que el filtro de BTC habría bloqueado (igual que la señal en vivo). Las descartadas
// se miden aparte, para saber si el filtro ayuda o quita operaciones buenas.
export function historialSenal(velas1m, { lado, slATR, slPctMin = 0.12, tpsR = [1, 1.6, 2.2], reparto = [50, 30, 20], limiteTP1 = 15, duracion = 25, comisionRT = 0, umbral = null, estrategia = 'tendencia', btc = null }) {
  umbral = umbral ?? (estrategia === 'reversion' ? 0.35 : 0.25);
  const L = lado === 'LONG' ? 1 : -1;
  const v5 = agrupar(velas1m, 5).filter((b) => b.ultimo - b.t >= 4 * 60e3); // solo velas de 5m completas
  const idx1 = new Map(velas1m.map((b, i) => [b.t, i]));
  const ops = [], evitadas = [];
  let ocupadoHasta = 0, ocupadoEv = 0;
  for (let k = 80; k < v5.length; k++) {
    const b5 = v5[k];
    const i1 = idx1.get(b5.ultimo);
    if (i1 == null || i1 + 1 >= velas1m.length || b5.t < ocupadoHasta) continue;
    const p = b5.c;
    const v5h = v5.slice(Math.max(0, k - 200), k + 1);
    const m5 = analizarMarco(v5h, p);
    if (!m5) continue;
    let s;
    if (estrategia === 'reversion') {
      const rv = puntuarReversion(v5h.slice(0, -1), p, velas1m.slice(Math.max(0, i1 - 5), i1 + 1));
      if (!rv) continue;
      s = rv.score;
    } else {
      const m1 = analizarMarco(velas1m.slice(Math.max(0, i1 - 150), i1 + 1), p);
      if (!m1) continue;
      s = 0.6 * m5.score + 0.4 * m1.score;
    }
    if (Math.sign(s) !== L || Math.abs(s) < umbral) continue;
    let bloqueada = false;
    if (btc?.series) {
      const lb = lecturaBTCEn(btc.series, b5.ultimo + 60e3);
      bloqueada = !!(lb && filtroBTC(lb, btc.rel, L, estrategia).bloquea);
      if (bloqueada && b5.t < ocupadoEv) continue;
    }
    const a5 = m5.atr;
    const dist = Math.max(slATR * a5, (slPctMin / 100) * p);
    const sl = p - L * dist;
    const tps = tpsR.map((r) => p + L * r * dist);
    const g = gestionar(velas1m.slice(i1 + 1), { lado, entrada: p, sl, tps, reparto, limiteTP1, duracion });
    if (!g) continue;
    // al final de los datos: una operación que no tuvo tiempo de resolverse no cuenta
    if (velas1m.length - (i1 + 1) < duracion && g.fin.startsWith('tiempo') && g.minutos < limiteTP1) continue;
    const neto = g.r - (comisionRT * p) / dist;
    const op = { t: b5.ultimo, r: +g.r.toFixed(3), neto: +neto.toFixed(3), fin: g.fin, minutos: g.minutos, hit: g.hit };
    if (bloqueada) { evitadas.push(op); ocupadoEv = b5.ultimo + g.minutos * 60e3; continue; }
    ops.push(op);
    ocupadoHasta = b5.ultimo + g.minutos * 60e3; // no se solapan operaciones
  }
  const horas = v5[80] ? +((velas1m.at(-1).t - v5[80].t) / 3600e3).toFixed(1) : null;
  const filtro = btc?.series ? {
    evitadas: evitadas.length,
    r_medio_evitadas: evitadas.length ? +(evitadas.reduce((x, o) => x + o.neto, 0) / evitadas.length).toFixed(3) : null,
    acierto_evitadas_pct: evitadas.length ? +((100 * evitadas.filter((o) => o.neto > 0).length) / evitadas.length).toFixed(1) : null,
    // aproximado: sin el filtro se habrían hecho también las evitadas
    r_medio_sin_filtro: ops.length + evitadas.length ? +([...ops, ...evitadas].reduce((x, o) => x + o.neto, 0) / (ops.length + evitadas.length)).toFixed(3) : null,
  } : null;
  const n = ops.length;
  if (!n) return { n: 0, horas, filtro_btc: filtro };
  const ganadas = ops.filter((o) => o.neto > 0).length;
  const media = ops.reduce((x, o) => x + o.neto, 0) / n;
  const cuenta = (f) => +((100 * ops.filter(f).length) / n).toFixed(1);
  return {
    n, horas, acierto_pct: +((100 * ganadas) / n).toFixed(1),
    r_medio_neto: +media.toFixed(3), tp1_pct: cuenta((o) => o.hit >= 1), sl_pct: cuenta((o) => o.fin === 'SL'), tiempo_pct: cuenta((o) => o.fin === 'tiempo'),
    minutos_medio: +(ops.reduce((x, o) => x + o.minutos, 0) / n).toFixed(1), ultimas: ops.slice(-5), filtro_btc: filtro,
  };
}
