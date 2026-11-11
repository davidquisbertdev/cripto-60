// SWING TRADING: operaciones de días a semanas en velas DIARIAS. Motor aparte del de 15-60 min.
//
// Medido con 2.5 años de velas diarias de BTC, ETH, SOL, BNB y XRP (comisiones y funding en contra incluidos):
//  - RUPTURA de máximos/mínimos de 20 días a favor de la media de 200 días, con trailing: +0.19 R de media
//    (44 % de aciertos, ~20 días por operación). Es el que gana, sobre todo en ETH y BTC.
//  - RETROCESO a la media de 20 días en tendencia: −0.06/−0.09 R. REVERSIÓN en extremos (RSI): −0.15 R.
// Por eso cada moneda elige el setup que gana en SU historial de 2 años; si ninguno gana: ESPERAR.
//
// Gestión (la misma del historial): SL en la estructura o a 2 ATR diarios; TP1 a 2R o 3R donde se cierra el
// 50 % y el SL pasa a la entrada; el resto sigue con un SL dinámico (trailing) en el mínimo de los últimos
// 10 días (máximo para un SHORT), hasta 30 días como mucho. Módulo puro salvo datosSwing (pide velas).
import { calcularPlan, redondear } from './plan.mjs';

export const SETUPS = {
  ruptura: { nombre: 'Ruptura de 20 días', explica: 'El precio cierra por encima del máximo de los últimos 20 días (por debajo del mínimo para SHORT), a favor de la media de 200 días: empieza un tramo nuevo de la tendencia.' },
  retroceso: { nombre: 'Retroceso en tendencia', explica: 'En tendencia (precio y media de 50 sobre la de 200), el precio corrige hasta la media de 20 días y rebota: se entra en la corrección.' },
  reversion: { nombre: 'Reversión en extremo', explica: 'RSI diario en sobreventa (<30) o sobrecompra (>70) con una vela de giro: se busca la vuelta a la media de 20 días. Va contra la tendencia.' },
};
export const SWING = { dias_max: 30, trailing_dias: 10, costes_pct: 0.1, funding_dia_pct: 0.03, riesgo_pct: 2, min_ops: 8 };

// ---------- Indicadores diarios ----------
const ema = (a, n) => { const k = 2 / (n + 1), o = []; a.forEach((x, i) => o.push(i ? x * k + o[i - 1] * (1 - k) : x)); return o; };
export function indicadoresSwing(v) {
  const c = v.map((x) => x.c);
  const tr = v.map((x, i) => (i ? Math.max(x.h - x.l, Math.abs(x.h - v[i - 1].c), Math.abs(x.l - v[i - 1].c)) : x.h - x.l));
  const rsi = []; let g = 0, p = 0;
  for (let i = 0; i < c.length; i++) { const d = i ? c[i] - c[i - 1] : 0; g = (g * 13 + Math.max(d, 0)) / 14; p = (p * 13 + Math.max(-d, 0)) / 14; rsi.push(p ? 100 - 100 / (1 + g / p) : 50); }
  return { e20: ema(c, 20), e50: ema(c, 50), e200: ema(c, 200), atr: ema(tr, 14), rsi };
}
const maxH = (v, a, b) => Math.max(...v.slice(a, b).map((x) => x.h));
const minL = (v, a, b) => Math.min(...v.slice(a, b).map((x) => x.l));

// ¿Dispara el setup en la vela i (cerrada)? Devuelve { L, sl, tp, trailing, maxDias } con la entrada en la
// apertura de la vela siguiente (e). null si no dispara.
export function disparo(setup, v, I, i, e = v[i + 1]?.o ?? v[i].c) {
  const x = v[i], A = I.atr[i];
  if (i < 210 || !A) return null;
  const alza = x.c > I.e200[i] && I.e50[i] > I.e200[i] && I.e50[i] > I.e50[i - 10];
  const baja = x.c < I.e200[i] && I.e50[i] < I.e200[i] && I.e50[i] < I.e50[i - 10];
  if (setup === 'ruptura') {
    const hi = maxH(v, i - 20, i), lo = minL(v, i - 20, i);
    const L = x.c > hi && x.c > I.e200[i] ? 1 : x.c < lo && x.c < I.e200[i] ? -1 : 0;
    if (!L) return null;
    const d = 2 * A;
    return { L, sl: e - L * d, tp: e + L * 3 * d, rTp: 3, trailing: true, maxDias: SWING.dias_max, nivelRoto: L > 0 ? hi : lo };
  }
  if (setup === 'retroceso') {
    const L = alza && x.l <= I.e20[i] + 0.2 * A && x.c > I.e20[i] && x.c > x.o ? 1 : baja && x.h >= I.e20[i] - 0.2 * A && x.c < I.e20[i] && x.c < x.o ? -1 : 0;
    if (!L) return null;
    const ext = L > 0 ? minL(v, i - 2, i + 1) - 0.5 * A : maxH(v, i - 2, i + 1) + 0.5 * A;
    const d = Math.min(Math.max(Math.abs(e - ext), A), 3 * A);
    return { L, sl: e - L * d, tp: e + L * 2 * d, rTp: 2, trailing: true, maxDias: SWING.dias_max };
  }
  const L = I.rsi[i] < 30 && x.c > x.o ? 1 : I.rsi[i] > 70 && x.c < x.o ? -1 : 0;
  if (!L || L * (I.e20[i] - e) <= 0.3 * A) return null;
  return { L, sl: e - L * 1.5 * A, tp: I.e20[i], rTp: +((L * (I.e20[i] - e)) / (1.5 * A)).toFixed(2), trailing: false, maxDias: 10 };
}

// Recorre la operación desde la vela de entrada: TP1 (50 %) → SL a la entrada → trailing del resto.
export function seguirOperacion(v, desde, { L, e, sl, tp, trailing, maxDias }) {
  const R = Math.abs(e - sl);
  let s = sl, tp1 = false, parcial = 0, salida = null, como = 'tiempo', j = desde, tTp1 = null;
  for (; j < Math.min(v.length, desde + maxDias); j++) {
    const y = v[j];
    if (L > 0 ? y.l <= s : y.h >= s) { salida = s; como = tp1 ? (s === e ? 'entrada' : 'trailing') : 'sl'; break; }
    if (!tp1 && (L > 0 ? y.h >= tp : y.l <= tp)) {
      if (!trailing) { salida = tp; como = 'tp'; break; }
      tp1 = true; tTp1 = j; parcial = (L * (tp - e)) / R; s = e;
    }
    if (trailing && tp1 && j >= SWING.trailing_dias) {
      const ext = L > 0 ? minL(v, j - SWING.trailing_dias + 1, j + 1) : maxH(v, j - SWING.trailing_dias + 1, j + 1);
      s = L > 0 ? Math.max(s, ext) : Math.min(s, ext);
    }
  }
  const fin = Math.min(j, v.length - 1);
  if (salida == null) salida = v[fin].c;
  const resto = (L * (salida - e)) / R;
  return { r: tp1 ? 0.5 * parcial + 0.5 * resto : resto, dias: fin - desde + 1, como, tp1, dias_tp1: tTp1 == null ? null : tTp1 - desde + 1, abierta: salida === v[fin].c && j >= v.length };
}

// Historial real del setup en la moneda: una operación a la vez, con comisiones y funding (en contra).
export function historialSwing(v, I, setup) {
  const ops = [];
  for (let i = 210; i < v.length - 2; i++) {
    const d = disparo(setup, v, I, i);
    if (!d) continue;
    const e = v[i + 1].o;
    const o = seguirOperacion(v, i + 1, { ...d, e });
    const coste = ((SWING.costes_pct + SWING.funding_dia_pct * o.dias) / 100) * e / Math.abs(e - d.sl);
    ops.push({ t: v[i + 1].t, lado: d.L > 0 ? 'LONG' : 'SHORT', r: o.r - coste, dias: o.dias, dias_tp1: o.dias_tp1, como: o.como });
    i += o.dias; // no se solapan
  }
  const m = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : null);
  const mitad = v[Math.floor((210 + v.length) / 2)]?.t ?? 0;
  const med = (a) => { const s = a.filter((x) => x != null).sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : null; };
  const r = ops.map((x) => x.r);
  return {
    setup, n: ops.length, r_medio: r.length ? +m(r).toFixed(2) : null, acierto_pct: ops.length ? Math.round((100 * ops.filter((x) => x.r > 0).length) / ops.length) : null,
    r_total: +r.reduce((s, x) => s + x, 0).toFixed(1), dias_medio: ops.length ? Math.round(m(ops.map((x) => x.dias))) : null, dias_tp1_mediana: med(ops.map((x) => x.dias_tp1)),
    r_mitad1: ops.some((x) => x.t < mitad) ? +m(ops.filter((x) => x.t < mitad).map((x) => x.r)).toFixed(2) : null,
    r_mitad2: ops.some((x) => x.t >= mitad) ? +m(ops.filter((x) => x.t >= mitad).map((x) => x.r)).toFixed(2) : null,
    ultimas: ops.slice(-6),
  };
}
// gana: suficientes operaciones, positivo y sin una mitad del periodo claramente perdedora
const gana = (h) => h.n >= SWING.min_ops && h.r_medio > 0.05 && (h.r_mitad1 ?? 0) > -0.2 && (h.r_mitad2 ?? 0) > -0.2;

// ---------- Análisis actual ----------
// v: velas diarias (la última puede estar en curso: se usa la última CERRADA). contrato/cfg: para el tamaño.
export function analizarSwing({ v, ahora, contrato, capital, margen = null, apalancamiento = null, cfg, funding = null, base }) {
  const cerradas = v.filter((x) => x.t + 864e5 <= ahora);
  const I = indicadoresSwing(cerradas);
  const i = cerradas.length - 1, x = cerradas[i], A = I.atr[i];
  const precio = v.at(-1).c;
  const historiales = Object.fromEntries(Object.keys(SETUPS).map((k) => [k, historialSwing(cerradas, I, k)]));
  const validos = Object.values(historiales).filter(gana).sort((a, b) => b.r_medio - a.r_medio);
  const tendencia = x.c > I.e200[i] && I.e50[i] > I.e200[i] ? 'ALCISTA' : x.c < I.e200[i] && I.e50[i] < I.e200[i] ? 'BAJISTA' : 'LATERAL';
  const u = +contrato.priceUnit;
  const f = (p) => redondear(p, u);
  // ¿Dispara hoy alguno de los setups que ganan? (señal en la última vela cerrada; entrada ahora)
  let senal = null;
  for (const h of validos) {
    const d = disparo(h.setup, cerradas, I, i, precio);
    if (d) { senal = { ...d, setup: h.setup, hist: h }; break; }
  }
  // Si no, los niveles que lo activarían (para dejarlo vigilado)
  const hi20 = maxH(cerradas, i - 19, i + 1), lo20 = minL(cerradas, i - 19, i + 1);
  const vigilar = [];
  if (historiales.ruptura && gana(historiales.ruptura)) {
    if (x.c > I.e200[i]) vigilar.push({ setup: 'ruptura', lado: 'LONG', precio: f(hi20), texto: `LONG si un día CIERRA por encima de ${f(hi20)} (máximo de 20 días)`, dist_pct: +((100 * (hi20 - precio)) / precio).toFixed(2) });
    if (x.c < I.e200[i]) vigilar.push({ setup: 'ruptura', lado: 'SHORT', precio: f(lo20), texto: `SHORT si un día CIERRA por debajo de ${f(lo20)} (mínimo de 20 días)`, dist_pct: +((100 * (lo20 - precio)) / precio).toFixed(2) });
  }
  if (historiales.retroceso && gana(historiales.retroceso) && tendencia !== 'LATERAL')
    vigilar.push({ setup: 'retroceso', lado: tendencia === 'ALCISTA' ? 'LONG' : 'SHORT', precio: f(I.e20[i]), texto: `${tendencia === 'ALCISTA' ? 'LONG' : 'SHORT'} si el precio vuelve a la media de 20 días (${f(I.e20[i])}) y rebota`, dist_pct: +((100 * (I.e20[i] - precio)) / precio).toFixed(2) });

  // plan condicional de cada nivel vigilado: dónde entrar, SL, TP1 y cuántos días suele tardar si se activa
  for (const w of vigilar) {
    const L = w.lado === 'LONG' ? 1 : -1, h = historiales[w.setup];
    const d = w.setup === 'ruptura' ? 2 * A : Math.max(A, 1.5 * A);
    const rTp = w.setup === 'ruptura' ? 3 : 2;
    w.plan = { entrada: w.precio, sl: f(w.precio - L * d), tp1: f(w.precio + L * rTp * d), r_tp1: rTp, sl_pct: +((100 * d) / w.precio).toFixed(2), tp1_pct: +((100 * rTp * d) / w.precio).toFixed(2), dias_tp1: h?.dias_tp1_mediana ?? null, dias_medio: h?.dias_medio ?? null };
  }
  let plan = null, recomendacion = 'ESPERAR', nivel = 'NO OPERAR', texto;
  if (senal) {
    const h = senal.hist, L = senal.L, lado = L > 0 ? 'LONG' : 'SHORT';
    nivel = h.r_medio >= 0.4 && h.n >= 12 ? 'ALTA' : h.r_medio >= 0.15 ? 'MEDIA' : 'BAJA';
    recomendacion = lado;
    const slDist = Math.abs(precio - senal.sl);
    const cfgS = { ...cfg, tps_r: [senal.rTp], reparto_tps: [100], comision_ratio_min: 1, riesgo_por_confianza: { ALTA: SWING.riesgo_pct, MEDIA: SWING.riesgo_pct * 0.75, BAJA: SWING.riesgo_pct * 0.5 }, riesgo_max_pct: SWING.riesgo_pct, apalancamiento_max: Math.min(cfg.apalancamiento_max ?? 30, 10) };
    const pl = calcularPlan({ lado, entrada: precio, atr: A, soporte: null, resistencia: null, contrato, capital, margen, nivel, cfg: cfgS, objetivo: null, slDist, slRegla: senal.setup === 'ruptura' ? '2 ATR diarios bajo la entrada' : 'estructura del swing', apalancamiento });
    // zona de entrada escalonada: hoy a mercado o con limits algo mejores, sin acercarse al SL
    const zona = [0, 0.25, 0.5].map((k, j) => ({ precio: f(precio - L * k * A), reparto: [40, 30, 30][j] })).filter((z) => L * (z.precio - senal.sl) > 0.5 * slDist);
    const tp1 = pl.tps?.[0]?.precio ?? f(senal.tp);
    const fundingDia = funding != null ? Math.abs(funding) * 3 : null;
    plan = {
      ...pl, setup: senal.setup, zona_entrada: zona, sl: f(senal.sl), tp1, tp1_cierra_pct: senal.trailing ? 50 : 100,
      trailing: senal.trailing ? { dias: SWING.trailing_dias, texto: `Tras el TP1 el SL pasa a la entrada y luego al ${L > 0 ? 'mínimo' : 'máximo'} de los últimos ${SWING.trailing_dias} días.`, nivel_hoy: f(L > 0 ? minL(cerradas, i - SWING.trailing_dias + 1, i + 1) : maxH(cerradas, i - SWING.trailing_dias + 1, i + 1)) } : null,
      dias_tp1: h.dias_tp1_mediana, dias_max: senal.maxDias,
      funding_estimado_usdt: fundingDia != null && pl.nocional ? +((pl.nocional * fundingDia * (h.dias_medio ?? 15))).toFixed(2) : null,
      funding_paga: funding == null ? null : (L > 0 ? funding > 0 : funding < 0),
    };
    texto = `${lado} por ${SETUPS[senal.setup].nombre.toLowerCase()}: ${SETUPS[senal.setup].explica} En ${base} este setup ganó ${h.r_medio >= 0 ? '+' : ''}${h.r_medio} R de media en ${h.n} operaciones (${h.acierto_pct} % de aciertos, ~${h.dias_medio} días cada una).`;
  } else if (!validos.length) {
    texto = `En ${base} ningún setup de swing ganó en los últimos 2 años con comisiones y funding (ruptura ${historiales.ruptura.r_medio ?? '—'} R, retroceso ${historiales.retroceso.r_medio ?? '—'} R, reversión ${historiales.reversion.r_medio ?? '—'} R): ESPERAR.`;
  } else {
    texto = `Hoy no hay entrada. Setup que funciona en ${base}: ${SETUPS[validos[0].setup].nombre.toLowerCase()} (${validos[0].r_medio >= 0 ? '+' : ''}${validos[0].r_medio} R de media en ${validos[0].n} operaciones). Vigila los niveles de abajo.`;
  }
  return {
    base, ahora, precio, tendencia, recomendacion, nivel, texto, setup: senal?.setup ?? validos[0]?.setup ?? null, plan, vigilar, historiales,
    indicadores: { ema20: f(I.e20[i]), ema50: f(I.e50[i]), ema200: f(I.e200[i]), atr: f(A), atr_pct: +((100 * A) / precio).toFixed(2), rsi: +I.rsi[i].toFixed(1), max20: f(hi20), min20: f(lo20) },
    funding,
  };
}

// ---------- Seguimiento de una operación guardada ----------
// op: { lado, entrada, sl, tp1, trailing (bool), abierta_en (ms), eventos: [{ tipo, precio, porcentaje, fecha }] }
export function evaluarSwing(op, v, ahora) {
  const n = (x) => +(+x).toPrecision(7);
  const L = op.lado === 'LONG' ? 1 : -1;
  const desde = v.findIndex((x) => x.t + 864e5 > op.abierta_en);
  if (desde < 0) return null;
  // la vela del día de entrada: solo cuenta de la entrada al cierre (lo de antes de entrar no te afectó)
  const tramo = v.slice(desde).map((x, k) => (k === 0 && x.t < op.abierta_en ? { ...x, h: Math.max(op.entrada, x.c), l: Math.min(op.entrada, x.c) } : x));
  const precio = v.at(-1).c, e = op.entrada, R = Math.abs(e - op.sl);
  const maxFav = L > 0 ? Math.max(...tramo.map((x) => x.h)) : Math.min(...tramo.map((x) => x.l));
  const maxCon = L > 0 ? Math.min(...tramo.map((x) => x.l)) : Math.max(...tramo.map((x) => x.h));
  const tocoTp1 = op.tp1 != null && (L > 0 ? maxFav >= op.tp1 : maxFav <= op.tp1);
  const tocoSl = L > 0 ? maxCon <= op.sl : maxCon >= op.sl;
  // cuándo tocó cada nivel (para marcarlo en el gráfico)
  const cuando = (nivel, fav) => { const x = tramo.find((y) => (fav ? (L > 0 ? y.h >= nivel : y.l <= nivel) : (L > 0 ? y.l <= nivel : y.h >= nivel))); return x ? x.t : null; };
  const salidas = (op.eventos ?? []).filter((x) => x.tipo === 'salida').reduce((s, x) => s + (x.porcentaje ?? 0), 0);
  const abiertoPct = Math.max(0, 100 - salidas);
  // SL sugerido: tras TP1 la entrada; luego el mínimo/máximo de 10 días si es mejor
  const ult = tramo.slice(-SWING.trailing_dias);
  const ext = tramo.length >= 2 ? (L > 0 ? Math.min(...ult.map((x) => x.l)) : Math.max(...ult.map((x) => x.h))) : null;
  let slSug = op.sl;
  if (tocoTp1 && op.trailing !== false) { slSug = e; if (ext != null && (L > 0 ? ext > slSug : ext < slSug)) slSug = ext; }
  const r = (L * (precio - e)) / R;
  const camino = op.tp1 ? Math.max(-1, Math.min(1.2, (L * (precio - e)) / (L * (op.tp1 - e)))) : null; // 0 = entrada, 1 = TP1
  const dias = Math.floor((ahora - op.abierta_en) / 864e5);
  let accion, motivo;
  if (abiertoPct <= 0) { accion = 'CERRADA'; motivo = 'Registraste la salida de toda la posición.'; }
  else if (tocoSl && !tocoTp1) { accion = 'CERRAR'; motivo = `El precio tocó tu SL (${n(op.sl)}): la estrategia falló. Si sigues dentro, cierra.`; }
  else if (tocoTp1 && (L > 0 ? precio <= slSug : precio >= slSug)) { accion = 'CERRAR'; motivo = `El precio volvió al SL dinámico (${n(slSug)}): cierra el resto y guarda la ganancia del TP1.`; }
  else if (dias >= SWING.dias_max) { accion = 'CERRAR'; motivo = `Ya pasaron ${dias} días (máximo ${SWING.dias_max}): la estrategia da por terminado el swing.`; }
  else if (tocoTp1 && salidas < 50) { accion = 'REDUCIR'; motivo = `Tocó el TP1 (${n(op.tp1)}): cierra el 50 % y sube el SL a ${n(slSug)}.`; }
  else if (slSug !== op.sl) { accion = 'MOVER SL'; motivo = `Sube el SL a ${n(slSug)} (trailing de ${SWING.trailing_dias} días) y deja correr el resto.`; }
  else {
    accion = 'MANTENER';
    motivo = r < 0 ? (-r >= 0.6 ? `Cerca del SL: lleva el ${Math.round(-r * 100)} % del camino hacia el SL (${n(op.sl)}). No lo muevas: si lo toca, cierra.` : `Va en contra: ${Math.round(-r * 100)} % del camino hacia el SL. Es normal en swing; el SL está para esto.`)
      : camino >= 0.75 ? `Cerca del TP1 (${n(op.tp1)}): ${Math.round(camino * 100)} % del camino.` : `En camino: ${Math.round(camino * 100)} % hacia el TP1 (${n(op.tp1)}).`;
  }
  return {
    precio, dias, r_actual: +r.toFixed(2), camino_tp1: camino == null ? null : +camino.toFixed(2), toco_tp1: tocoTp1, toco_sl: tocoSl,
    t_tp1: tocoTp1 ? cuando(op.tp1, true) : null, t_sl: tocoSl ? cuando(op.sl, false) : null,
    max_favorable: maxFav, max_contra: maxCon, sl_sugerido: n(slSug), camino_sl: +Math.max(0, -r).toFixed(2), abierto_pct: abiertoPct, accion, motivo,
    resultado_pct: +((100 * L * (precio - e)) / e).toFixed(2),
  };
}

// ---------- Datos ----------
export async function datosSwing(fuente, sym, n = 900) {
  const [v, fr] = await Promise.all([fuente.velas(sym, '1d', n), fuente.funding(sym).catch(() => null)]);
  return { velas: v, funding: fr ? +fr.fundingRate : null };
}
