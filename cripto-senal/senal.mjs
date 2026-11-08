#!/usr/bin/env node
// cripto-senal: analiza una moneda de futuros (Binance o MEXC) y da LONG / SHORT / NO OPERAR con entrada, SL,
// TP1-TP3, % a cerrar en cada TP, apalancamiento, margen, probabilidades y tiempo máximo de espera.
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { Fuente } from '../lib/mexc.mjs';
import { crearFuente, nombreExchange } from '../lib/fuentes.mjs';
import { analizarSimbolo } from '../lib/motor.mjs';
import { calcularPlan, redondear, stopLoss } from '../lib/plan.mjs';
import { simular } from '../lib/simulacion.mjs';
import { historialSenal } from '../lib/historial.mjs';
import { filtroBTC } from '../lib/btc.mjs';
import { leerConfig, leerJSON, escribirJSON, rutaDiario, rutaSenal, estadoDiario, carpeta } from '../lib/config.mjs';
import { args, precio as fp, usdt, pct, signo, hora, duracion, salir } from '../lib/formato.mjs';

const BAJAR = { ALTA: 'MEDIA', MEDIA: 'BAJA', BAJA: 'NO OPERAR', 'NO OPERAR': 'NO OPERAR' };

// Evalúa UNA estrategia (tendencia o reversión) para un lado: calibra el SL por tiempo, simula y mide
// el historial real de esa misma estrategia en la moneda. Devuelve el plan y el nivel final.
function evaluarEstrategia(a, cfg, op, { estrategia, lado, nivel, motivos, capital, diario, fb = null, nivelSinBTC = null }) {
  motivos = [...motivos];
  const atr = a.marcos['5m'].atr;
  const n5 = a.niveles5;
  const base = {
    lado, entrada: a.precio, atr, soporte: n5.soporte, resistencia: n5.resistencia, contrato: a.contrato, capital, cfg,
    factorRiesgo: diario?.factor_riesgo ?? 1, objetivo: op.objetivo ?? cfg.objetivo_usdt, margen: op.margen ?? diario?.margen_sugerido ?? null,
  };
  // La simulación sortea velas reales de 1 min: no tiene ventaja direccional, sirve para medir TIEMPOS.
  // Se elige el SL más amplio con el que la mayoría de operaciones se resuelve (TP1 o SL) en la espera.
  // Si la estrategia tiene ventaja lo dice el historial real, no la simulación.
  const comisionRT = (+a.contrato.takerFeeRate || 0) + (+a.contrato.makerFeeRate || 0);
  const semilla = op.semilla ?? cfg.semilla;
  const simDe = (pl, n) => simular({
    velas: a.velas1m.slice(-1000), lado, entrada: a.precio, sl: pl.sl, tps: pl.tps.map((t) => (typeof t === 'number' ? t : t.precio)),
    reparto: cfg.reparto_tps, horizonte: cfg.duracion_max_min, minBarra: 1, limiteTP1: cfg.espera_max_min, n, semilla,
  });
  const pMin = (cfg.sl_pct_min / 100) * a.precio;
  const candidatos = cfg.sl_candidatos_atr.map((m) => ({ dist: Math.max(m * atr, pMin), regla: `${m} ATR(5m), calibrado por tiempo` }));
  const est = stopLoss({ lado, entrada: a.precio, atr, soporte: n5.soporte, resistencia: n5.resistencia, cfg });
  if (/detrás/.test(est.regla)) candidatos.push(est);
  candidatos.sort((x, y) => x.dist - y.dist);
  const probados = [];
  for (const c of candidatos) {
    const pl = calcularPlan({ ...base, nivel, slDist: c.dist, slRegla: c.regla });
    probados.push({ c, plan: pl, sim: pl.viable ? simDe(pl, 2000) : null });
  }
  const viables = probados.filter((x) => x.sim);
  const resuelven = viables.filter((x) => x.sim.prob.cierre_por_tiempo <= cfg.cierre_tiempo_max_pct);
  const elegido = resuelven.at(-1) ?? [...viables].sort((x, y) => x.sim.prob.cierre_por_tiempo - y.sim.prob.cierre_por_tiempo)[0] ?? probados.at(-1);
  let plan = elegido.plan, sim = null, historial = null;
  const nivel0 = nivel;
  if (elegido.sim) {
    sim = simDe(plan, op.simulaciones ?? cfg.simulaciones);
    historial = historialSenal(a.velas1m, {
      lado, estrategia, slATR: elegido.c.dist / atr, slPctMin: cfg.sl_pct_min, tpsR: cfg.tps_r, reparto: cfg.reparto_tps,
      limiteTP1: cfg.espera_max_min, duracion: cfg.duracion_max_min, comisionRT,
      btc: a.btcSeries ? { series: a.btcSeries, rel: a.btc?.relacion } : null,
    });
    const nombre = estrategia === 'reversion' ? 'la reversión' : 'esta señal';
    // Bloqueo de BTC adaptativo: si en esta moneda las operaciones que el filtro evita vienen ganando,
    // el bloqueo no se sostiene con datos: se levanta y solo se baja un nivel.
    const fh = historial.filtro_btc;
    let levantado = false;
    if (fb?.bloquea && fh?.evitadas >= cfg.historial_min_ops && fh.r_medio_evitadas >= cfg.historial_r_bueno && nivelSinBTC && nivelSinBTC !== 'NO OPERAR') {
      levantado = true;
      nivel = BAJAR[nivelSinBTC];
      motivos.push(`El filtro de BTC no está funcionando ahora en ${a.base}: las ${fh.evitadas} operaciones que habría evitado ganaron ${signo(fh.r_medio_evitadas)} R. Se levanta el bloqueo y se baja un nivel.`);
    }
    if (sim.prob.cierre_por_tiempo >= cfg.cierre_tiempo_no_operar_pct && nivel !== 'NO OPERAR') { nivel = 'NO OPERAR'; motivos.push(`El ${sim.prob.cierre_por_tiempo} % de las simulaciones se cierra por tiempo sin TP1 (TP1 solo ${sim.prob.tp1} %): el precio no se mueve lo suficiente ahora.`); }
    else if (sim.prob.cierre_por_tiempo > cfg.cierre_tiempo_max_pct && nivel !== 'NO OPERAR') { nivel = BAJAR[nivel]; motivos.push(`El ${sim.prob.cierre_por_tiempo} % de las simulaciones se cierra por tiempo sin TP1: el precio se mueve poco ahora.`); }
    // Qué historial juzga: el filtrado por BTC si tiene operaciones suficientes; si no, el completo
    // (con las que el filtro evitó), para que el filtro nunca esconda un historial que pierde.
    const nTotal = historial.n + (fh?.evitadas ?? 0);
    const juez = historial.n >= cfg.historial_min_ops ? { n: historial.n, r: historial.r_medio_neto, que: '' }
      : fh && nTotal >= cfg.historial_min_ops ? { n: nTotal, r: fh.r_medio_sin_filtro, que: ' (historial completo, sin filtro de BTC: el filtrado tiene pocas operaciones)' } : null;
    if (levantado) { /* el historial que cuenta es el de las operaciones contra BTC (ya revisado) */ }
    else if (juez) {
      // nunca se recomienda una jugada que en el historial reciente pierde en promedio
      if (juez.r < cfg.historial_r_min && nivel !== 'NO OPERAR') { nivel = 'NO OPERAR'; motivos.push(`Historial: en las últimas ${historial.horas} h ${nombre} perdió en promedio (${signo(juez.r)} R tras comisiones en ${juez.n} operaciones)${juez.que}.`); }
      else if (juez.r < cfg.historial_r_bueno && nivel !== 'NO OPERAR') { nivel = BAJAR[nivel]; motivos.push(`Historial casi plano (${signo(juez.r)} R en ${juez.n} operaciones)${juez.que}: ventaja mínima, se baja la confianza.`); }
    } else if (nivel !== 'NO OPERAR') { nivel = BAJAR[nivel]; motivos.push(`Historial con solo ${nTotal} operaciones comparables: poco fiable, se baja la confianza y ve con tamaño pequeño.`); }
    else motivos.push(`Historial con solo ${nTotal} operaciones comparables: poco fiable.`);
    if (nivel !== nivel0) plan = calcularPlan({ ...base, nivel, slDist: elegido.c.dist, slRegla: elegido.c.regla });
  }
  const slProbados = probados.map((x) => ({ regla: x.c.regla, viable: !!x.sim, sl_pct: x.plan.sl_pct ?? null, tp1: x.sim?.prob.tp1 ?? null, sl: x.sim?.prob.sl_antes_tp1 ?? null, tiempo: x.sim?.prob.cierre_por_tiempo ?? null }));
  return { estrategia, lado, nivel, motivos, plan, sim, historial, slProbados };
}

const NOMBRE = { tendencia: 'TENDENCIA', reversion: 'REVERSIÓN a la media' };
const ORDEN = { ALTA: 3, MEDIA: 2, BAJA: 1, 'NO OPERAR': 0 };
const nivelPorConfianza = (c) => (c < 40 ? 'NO OPERAR' : c < 50 ? 'BAJA' : c < 65 ? 'MEDIA' : 'ALTA');

export async function generarSenal(a, op, cfg) {
  const ahora = a.ahora;
  const diario = estadoDiario(leerJSON(rutaDiario(cfg)), cfg, ahora);
  const capital = op.capital ?? diario?.capital ?? op.margen ?? cfg.capital;
  if (!(capital > 0)) throw new Error('Indica tu capital, por ejemplo --capital 20 (y si quieres el margen por operación: --margen 15)');
  if (op.margen != null && op.margen > capital) throw new Error(`El margen (${op.margen}) no puede ser mayor que tu capital (${capital}).`);
  if (op.lado && !['LONG', 'SHORT'].includes(op.lado.toUpperCase())) throw new Error('--lado debe ser long o short');
  if (op.estrategia && !['tendencia', 'reversion'].includes(op.estrategia)) throw new Error('--estrategia debe ser tendencia o reversion');

  // Alertas comunes de scalping (afectan a las dos estrategias)
  const comunes = [];
  let bajarComun = 0;
  const minFunding = a.proximo_funding ? (a.proximo_funding - ahora) / 60e3 : null;
  if (minFunding != null && minFunding >= 0 && minFunding <= 10) comunes.push(`El funding se cobra en ${Math.round(minFunding)} min: suele haber latigazos justo antes y después. Mejor espera a que pase.`);
  if (a.spread_pct != null && a.spread_pct > 0.05) comunes.push(`Spread de ${a.spread_pct} %: caro para scalping, usa órdenes limit.`);
  const vol5 = a.marcos['5m']?.vol_rel;
  if (vol5 != null && vol5 < 0.4) { comunes.push(`Volumen de 5m muy bajo (${vol5}x la media): el precio puede no moverse en 15 min.`); bajarComun = 1; }
  const bajar = (n, k) => { for (let i = 0; i < k; i++) n = BAJAR[n]; return n; };

  const decisiones = { tendencia: a.decision, reversion: a.decisionReversion };
  const lista = op.estrategia ? [op.estrategia] : ['tendencia', 'reversion'];
  const evaluadas = [];
  for (const e of lista) {
    const d = decisiones[e];
    if (!d) continue;
    // sin setup de reversión (precio cerca de la media) no se evalúa, salvo que se pida
    if (e === 'reversion' && !op.estrategia && Math.abs(d.puntuacion) < 0.35) continue;
    const lado = op.lado ? op.lado.toUpperCase() : d.sesgo;
    let nivel = bajar(d.nivel, bajarComun);
    const motivos = [...comunes, ...d.alertas];
    if (op.lado && lado !== d.sesgo) { nivel = bajar(nivel, 2); motivos.push(`Pediste ${lado} pero ${e === 'reversion' ? 'la reversión' : 'el análisis'} se inclina a ${d.sesgo}.`); }
    // Filtro de BTC: las altcoins siguen a BTC; contra un BTC con dirección se baja o se bloquea
    const fb = filtroBTC(a.btc, a.btc?.relacion, lado === 'LONG' ? 1 : -1, e);
    const dd = { ...d, confianza: Math.round(Math.max(5, Math.min(e === 'tendencia' && d.lateral ? 64 : 90, d.confianza + fb.ajuste_conf))) };    if (fb.texto) motivos.unshift(`BTC: ${fb.texto}`);
    const nivelSinBTC = nivel;
    if (fb.bloquea) nivel = 'NO OPERAR';
    else {
      nivel = bajar(nivel, fb.bajar);
      if (ORDEN[nivelPorConfianza(dd.confianza)] < ORDEN[nivel]) nivel = nivelPorConfianza(dd.confianza);
    }
    const r = evaluarEstrategia(a, cfg, op, { estrategia: e, lado, nivel, motivos, capital, diario, fb, nivelSinBTC });
    evaluadas.push({ ...r, d: dd, btc: fb });
  }
  // Elección: primero las recomendables, luego la de mejor historial real, luego la de más confianza
  const valorHist = (x) => (x.historial?.n >= cfg.historial_min_ops ? x.historial.r_medio_neto : -0.05);
  evaluadas.sort((x, y) => ((ORDEN[y.nivel] > 0) - (ORDEN[x.nivel] > 0)) || valorHist(y) - valorHist(x) || ORDEN[y.nivel] - ORDEN[x.nivel] || y.d.confianza - x.d.confianza);
  const g = evaluadas[0];
  const alt = evaluadas[1] ?? null;
  let { nivel, plan, sim, historial, lado } = g;
  const motivos = [...g.motivos];
  if (diario?.bloqueo) { nivel = 'NO OPERAR'; motivos.unshift(diario.bloqueo); }
  if (!plan.viable) motivos.unshift(plan.motivo);
  const d = g.d;

  const L = lado === 'LONG' ? 1 : -1;
  const unidad = a.contrato.priceUnit;
  const atr = a.marcos['5m'].atr;
  const atr1 = a.marcos['1m']?.atr ?? atr / 2;
  const entrada = {
    mercado: a.precio,
    limit: redondear(a.precio - L * 0.3 * atr1, unidad),
    no_perseguir: redondear(a.precio + L * 0.3 * atr, unidad),
    valida_hasta: ahora + cfg.validez_entrada_min * 60e3,
  };
  const esperaMin = sim ? Math.min(Math.max(sim.espera_max_min ?? cfg.espera_max_min, cfg.espera_min_min), cfg.espera_max_min) : null;
  const n5 = a.niveles5, n15 = a.niveles15;
  const reentrada = { long_si_rompe: n5.resistencia ?? n15.resistencia, short_si_pierde: n5.soporte ?? n15.soporte };
  if (a.reversion) {
    reentrada.rebote_long_bajo = redondear(a.reversion.inf, unidad);
    reentrada.rebote_short_sobre = redondear(a.reversion.sup, unidad);
  }
  const resumenHist = (h) => (h ? { n: h.n, acierto_pct: h.acierto_pct ?? null, r_medio_neto: h.r_medio_neto ?? null } : null);

  // MEJOR ENTRADA: la jugada con más probabilidad de terminar en ganancia entre las estrategias
  // evaluadas, aunque el veredicto sea NO OPERAR (el usuario la quiere siempre, con su aviso).
  // Probabilidad = % de ganadoras del historial real si hay operaciones suficientes; si no, la
  // probabilidad simulada de tocar el TP1 antes que el SL.
  const probDe = (x) => {
    if (x.historial?.n >= cfg.historial_min_ops) return { pct: x.historial.acierto_pct, fuente: `historial real, ${x.historial.n} operaciones` };
    const p = x.sim?.prob;
    if (p && p.tp1 + p.sl_antes_tp1 > 0) return { pct: +((100 * p.tp1) / (p.tp1 + p.sl_antes_tp1)).toFixed(1), fuente: 'simulación: TP1 antes que el SL' };
    return null;
  };
  let mejor = null;
  if (cfg.mostrar_mejor_entrada !== false) {
    const extras = [];
    // también el lado contrario de la tendencia, para comparar LONG frente a SHORT (salvo si se forzó un lado)
    const t0 = evaluadas.find((x) => x.estrategia === 'tendencia');
    if (!op.lado && t0 && !op.estrategia && !(nivel !== 'NO OPERAR' && plan.viable)) {
      const opuesto = t0.lado === 'LONG' ? 'SHORT' : 'LONG';
      if (!evaluadas.some((x) => x.lado === opuesto && x.estrategia === 'tendencia')) {
        const r = evaluarEstrategia(a, cfg, op, { estrategia: 'tendencia', lado: opuesto, nivel: 'NO OPERAR', motivos: [], capital, diario });
        extras.push({ ...r, d: t0.d });
      }
    }
    // con una señal recomendada, la mejor entrada es esa misma; con NO OPERAR, la de más probabilidad
    const hayRecomendada = nivel !== 'NO OPERAR' && plan.viable;
    const cand = (hayRecomendada ? [g] : [...evaluadas, ...extras]).filter((x) => x.plan?.viable && probDe(x)).sort((x, y) => probDe(y).pct - probDe(x).pct || (y.historial?.r_medio_neto ?? -1) - (x.historial?.r_medio_neto ?? -1));
    const m = cand[0];
    if (m) {
      const Lm = m.lado === 'LONG' ? 1 : -1;
      const esp = m.sim ? Math.min(Math.max(m.sim.espera_max_min ?? cfg.espera_max_min, cfg.espera_min_min), cfg.espera_max_min) : cfg.espera_max_min;
      mejor = {
        lado: m.lado, estrategia: m.estrategia, nivel: m.nivel, recomendada: m.nivel !== 'NO OPERAR' && !diario?.bloqueo,
        prob: probDe(m), historial: resumenHist(m.historial), tp1_sim: m.sim?.prob.tp1 ?? null, sl_sim: m.sim?.prob.sl_antes_tp1 ?? null,
        entrada: { mercado: a.precio, limit: redondear(a.precio - Lm * 0.3 * atr1, unidad), valida_hasta: ahora + cfg.validez_entrada_min * 60e3 },
        sl: m.plan.sl, tps: m.plan.tps.map((t) => ({ n: t.n, precio: t.precio, cerrar_pct: t.cerrar_pct, contratos: t.contratos })),
        apalancamiento: m.plan.apalancamiento, margen: m.plan.margen, contratos: m.plan.contratos, cantidad_moneda: m.plan.cantidad_moneda,
        nocional: m.plan.nocional, riesgo_usdt: m.plan.riesgo_usdt, ganancia_todos: m.plan.escenarios?.todos_los_tps ?? null,
        ganancia_tp1: m.plan.escenarios?.tp1_y_luego_be ?? null, liquidacion: m.plan.liquidacion,
        cerrar_si_no_tp1_a_las: ahora + esp * 60e3, cierre_total_a_las: ahora + cfg.duracion_max_min * 60e3,
      };
    }
  }

  const recomendado = nivel !== 'NO OPERAR' && plan.viable;
  return {
    tipo: 'senal', version: 4, modo: 'intradia-corto', estrategia: g.estrategia, simbolo: a.simbolo, base: a.base, exchange: a.exchange ?? 'MEXC', creada: ahora,
    recomendacion: recomendado ? lado : 'NO OPERAR', lado, nivel, confianza: d.confianza, puntuacion: d.puntuacion,
    sesgo_analisis: d.sesgo, razones: d.razones, alertas: motivos, capital,
    precio: a.precio, decimales: a.decimales, entrada, plan, simulacion: sim, historial, sl_probados: g.slProbados,
    objetivo_media: g.estrategia === 'reversion' ? a.reversion?.medio ?? null : null,
    alternativa: alt ? { estrategia: alt.estrategia, lado: alt.lado, nivel: alt.nivel, confianza: alt.d.confianza, historial: resumenHist(alt.historial) } : null,
    estrategias_evaluadas: evaluadas.map((x) => ({ estrategia: x.estrategia, lado: x.lado, nivel: x.nivel, confianza: x.d.confianza, btc: x.btc?.estado ?? null, historial: resumenHist(x.historial) })),
    btc_filtro: g.btc ? { estado: g.btc.estado, bloquea: g.btc.bloquea, ajuste_confianza: g.btc.ajuste_conf, texto: g.btc.texto } : null,
    espera_max_min: esperaMin, cerrar_si_no_tp1_a_las: esperaMin ? ahora + esperaMin * 60e3 : null,
    duracion_max_min: cfg.duracion_max_min, cierre_total_a_las: ahora + cfg.duracion_max_min * 60e3, reentrada,
    contexto: {
      funding: a.funding, proximo_funding: a.proximo_funding, minutos_a_funding: minFunding == null ? null : Math.round(minFunding),
      libro: a.libro, spread_pct: a.spread_pct, btc: a.btc, fng: a.fng,
      cambio_24h_pct: a.cambio_24h, cambio_15m_pct: a.cambio_15m == null ? null : +a.cambio_15m.toFixed(2),
      rsi: Object.fromEntries(Object.entries(a.marcos).map(([k, m]) => [k, m?.rsi ?? null])),
      atr5: atr, atr5_pct: +((100 * atr) / a.precio).toFixed(3), adx15m: a.marcos['15m']?.adx, vol_rel_5m: vol5, lateral: a.decision.lateral,
      reversion: a.reversion ? { z: a.reversion.z, rsi5: a.reversion.rsi5, media: a.reversion.medio, banda_sup: a.reversion.sup, banda_inf: a.reversion.inf } : null,
      niveles5: { soporte: n5.soporte, resistencia: n5.resistencia }, niveles15: { soporte: n15.soporte, resistencia: n15.resistencia },
    },
    noticias: a.noticias ? {
      sentimiento: a.noticias.sentimiento, evento_riesgo: a.noticias.evento_riesgo,
      propias: a.noticias.propias.slice(0, 6).map(({ titulo, fecha, fuente, sentimiento, enlace }) => ({ titulo, fecha, fuente, sentimiento, enlace })),
      macro: a.noticias.macro.slice(0, 4).map(({ titulo, fecha, fuente, sentimiento }) => ({ titulo, fecha, fuente, sentimiento })),
    } : null,
    ballenas: a.ballenas ? {
      puntuacion: a.ballenas.puntuacion, lectura: a.ballenas.lectura, cobertura: a.ballenas.cobertura, frases: a.ballenas.frases,
      muros: a.ballenas.muros, precio_hl: a.ballenas.hl?.precio_hl ?? null, instantanea: a.ballenas.hl?.instantanea ?? null,
    } : null,
    mejor_entrada: mejor,
    diario,
  };
}

// Bloque fijo, siempre al final: hora, lado, entrada, SL, TP1-TP3, apalancamiento y probabilidad.
function bloqueMejor(s, cfg, f, linea) {
  const m = s.mejor_entrada;
  if (!m) return [];
  const tz = cfg.zona_horaria, out = [linea];
  const cant = (c) => (s.exchange === 'BINANCE' ? `${+(c * (m.cantidad_moneda / (m.contratos || 1))).toFixed(6)} ${s.base}` : `${c} contr.`);
  out.push(m.recomendada
    ? `MEJOR ENTRADA (recomendada: ${m.nivel})`
    : `MEJOR ENTRADA POSIBLE (el sistema dice NO OPERAR: es la de más probabilidad, entra solo bajo tu riesgo)`);
  out.push(`  Hora:            ${hora(s.creada, tz)} · válida hasta las ${hora(m.entrada.valida_hasta, tz)}`);
  out.push(`  Posición:        ${m.lado} · estrategia ${NOMBRE[m.estrategia]}`);
  out.push(`  Precio entrada:  limit ${f(m.entrada.limit)} (o a mercado ${f(m.entrada.mercado)})`);
  out.push(`  Stop loss:       ${f(m.sl)}`);
  for (const t of m.tps) out.push(`  TP${t.n}:             ${f(t.precio)} → cierra ${t.cerrar_pct} % (${cant(t.contratos)})`);
  out.push(`  Apalancamiento:  ${m.apalancamiento}x AISLADO · margen ${usdt(m.margen)} · ${s.exchange === 'BINANCE' ? `${m.cantidad_moneda} ${s.base}` : `${m.contratos} contratos`} (${usdt(m.nocional)})`);
  out.push(`  Dinero:          SL ${usdt(-m.riesgo_usdt)} · solo TP1 ${signo(m.ganancia_tp1, 3)} · los 3 TP ${signo(m.ganancia_todos, 3)} USDT`);
  out.push(`  Probabilidad:    ${pct(m.prob.pct)} de ganar (${m.prob.fuente})${m.historial?.n ? ` · resultado medio ${signo(m.historial.r_medio_neto)} R` : ''}`);
  out.push(`  Tiempo:          si a las ${hora(m.cerrar_si_no_tp1_a_las, tz)} no tocó TP1, cierra · a las ${hora(m.cierre_total_a_las, tz)} cierra todo`);
  return out;
}

export function informe(s, cfg) {
  const tz = cfg.zona_horaria, dec = s.decimales, P = s.plan, sim = s.simulacion;
  const f = (x) => fp(x, dec);
  const out = [];
  const linea = '─'.repeat(64);
  out.push(`${s.simbolo} · INTRADÍA 15-60 min · futuros ${nombreExchange(s.exchange)} · ${hora(s.creada, tz)} · precio ${f(s.precio)}`);
  out.push(linea);
  const titulo = s.recomendacion === 'NO OPERAR'
    ? `SEÑAL: NO OPERAR  (el análisis se inclina a ${s.sesgo_analisis}, confianza ${s.confianza}/100)`
    : `SEÑAL: ${s.lado}   confianza ${s.nivel} (${s.confianza}/100) · estrategia ${NOMBRE[s.estrategia]}`;
  out.push(titulo);
  if (s.recomendacion === 'NO OPERAR') out.push(`  (estrategia evaluada: ${NOMBRE[s.estrategia]})`);
  if (s.objetivo_media) out.push(`  Reversión: se busca la vuelta hacia la media de 5m (${f(s.objetivo_media)}).`);
  out.push('Por qué:');
  for (const r of s.razones) out.push(`  · ${r}`);
  const c = s.contexto;
  const ctx = [`15 min ${signo(c.cambio_15m_pct)} %`, `24 h ${signo(c.cambio_24h_pct)} %`, `ATR 5m ${c.atr5_pct} %`, `funding ${c.funding == null ? '—' : (c.funding * 100).toFixed(4) + ' %'}${c.minutos_a_funding != null && c.minutos_a_funding <= 60 ? ` (cobro en ${c.minutos_a_funding} min)` : ''}`];
  if (c.btc) ctx.push(`BTC ${signo(c.btc.puntuacion)}`);
  if (c.fng) ctx.push(`Fear & Greed ${c.fng.valor} (${c.fng.clase})`);
  out.push(`Contexto: ${ctx.join(' · ')}`);
  if (c.btc) {
    const b = c.btc, rel = b.relacion;
    const efecto = s.btc_filtro ? ` → ${s.btc_filtro.estado.toUpperCase()} del ${s.lado}` : '';
    out.push(`BITCOIN: ${b.lectura}${b.fuerza ? ` ${b.fuerza}` : ''} (${signo(b.puntuacion)}) · precio ${b.precio}${efecto}`);
    for (const x of b.frases ?? []) out.push(`  · ${x}`);
    if (rel) out.push(`  · ${s.base} sigue a BTC: correlación ${rel.correlacion} y beta ${rel.beta} (si BTC se mueve 1 %, ${s.base} suele moverse ~${rel.beta} %) · peso de BTC en la señal ${Math.round(100 * b.peso)} %`);
  }
  if (s.noticias) {
    out.push(`Noticias 48 h: ${s.noticias.propias.length} de ${s.base}, sentimiento ${signo(s.noticias.sentimiento)}`);
    for (const n of s.noticias.propias.slice(0, 3)) out.push(`  · ${hora(n.fecha, tz)} ${n.titulo} [${n.fuente}]`);
  }
  if (s.ballenas?.cobertura) {
    out.push(`Ballenas: ${s.ballenas.lectura} (${signo(s.ballenas.puntuacion)})`);
    for (const x of s.ballenas.frases.slice(0, 3)) out.push(`  · ${x}`);
    const m = s.ballenas.muros;
    if (m?.compra || m?.venta) out.push(`  · Muros ${nombreExchange(s.exchange)}: ${m.compra ? `compra ${f(m.compra.precio)}` : '—'} / ${m.venta ? `venta ${f(m.venta.precio)}` : '—'}`);
  }
  if (s.alertas.length) {
    out.push('Atención:');
    for (const x of s.alertas) out.push(`  ! ${x}`);
  }
  out.push(linea);

  if (!P.viable) {
    out.push(`No hay plan: ${P.motivo}`);
    out.push('Prueba otra moneda con más movimiento (/cripto-escaner) o vuelve en unos minutos.');
    out.push(...bloqueMejor(s, cfg, f, linea));
    return out.join('\n');
  }
  const etiqueta = s.recomendacion === 'NO OPERAR' ? `PLAN DE REFERENCIA ${s.lado} (NO recomendado ahora)` : `PLAN ${s.lado}`;
  out.push(`${etiqueta} · capital ${usdt(s.capital)} · margen elegido ${usdt(P.margen_elegido)}`);
  const e = s.entrada;
  out.push(`  Entrada    limit ${f(e.limit)} (comisión maker menor) o a mercado ${f(e.mercado)}`);
  out.push(`             no persigas: si ya está ${s.lado === 'LONG' ? 'por encima' : 'por debajo'} de ${f(e.no_perseguir)}, no entres · si a las ${hora(e.valida_hasta, tz)} no entraste, descártala`);
  out.push(`  Stop loss  ${f(P.sl)}  (${s.lado === 'LONG' ? '-' : '+'}${P.sl_pct} %)  ${P.sl_regla}`);
  const tamPaso = P.contratos ? P.cantidad_moneda / P.contratos : 1;
  for (const t of P.tps) {
    const acum = P.tps.slice(0, t.n).reduce((x, y) => x + y.cerrar_pct, 0);
    const cant = s.exchange === 'BINANCE' ? `${+(t.contratos * tamPaso).toFixed(6)} ${s.base}` : `${t.contratos} contr.`;
    const cierre = t.contratos ? `cierra ${t.cerrar_pct} % → ${acum} % cerrado (${cant})` : 'sin contratos (posición mínima)';
    out.push(`  TP${t.n}        ${f(t.precio)}  (${s.lado === 'LONG' ? '+' : '-'}${t.movimiento_pct} %, ${t.r}R)  ${cierre} → ${signo(t.ganancia_usdt, 3)} USDT (${signo(t.roe_pct, 1)} % del margen)`);
  }
  out.push(`  Al tocar TP1 mueve el SL a la entrada (${f(P.entrada)}); al tocar TP2, el SL al TP1 (${f(P.tps[0].precio)}).`);
  out.push(`  APALANCAMIENTO ${P.apalancamiento}x AISLADO (máx. seguro ${P.apalancamiento_max_seguro}x) · margen ${usdt(P.margen)}`);
  out.push(`             ${P.apalancamiento_razon}`);
  out.push(s.exchange === 'BINANCE' ? `  Cantidad ${P.cantidad_moneda} ${s.base} (${usdt(P.nocional)} de posición) · ponla en la orden en ${s.base}` : `  Tamaño ${P.contratos} contratos = ${P.cantidad_moneda} ${s.base} (${usdt(P.nocional)} de posición)`);
  out.push(`  Liquidación aprox. ${f(P.liquidacion)} (más allá del SL)`);
  out.push(`  Si salta el SL pierdes ${usdt(-P.riesgo_usdt)} = ${P.riesgo_pct_real} % del capital (comisiones incluidas)`);
  const es = P.escenarios;
  out.push(`  Escenarios: SL directo ${signo(es.sl_directo, 3)} · TP1 y luego entrada ${signo(es.tp1_y_luego_be, 3)} · TP1+TP2 ${signo(es.tp1_tp2_y_luego_tp1, 3)} · los 3 TP ${signo(es.todos_los_tps, 3)} USDT`);
  for (const x of P.avisos) out.push(`  ! ${x}`);
  if (P.objetivo) out.push(`  Objetivo: ${P.objetivo.mensaje}`);
  out.push(linea);
  if (sim) {
    out.push(`PROBABILIDADES en ${duracion(sim.horizonte_min)} (${sim.simulaciones} simulaciones con ${sim.velas_pool} velas reales de 1 min de ${s.base}, semilla ${sim.semilla})`);
    out.push(`  TP1 ${pct(sim.prob.tp1)} · TP2 ${pct(sim.prob.tp2)} · TP3 ${pct(sim.prob.tp3)} · SL antes del TP1 ${pct(sim.prob.sl_antes_tp1)} · cierre por tiempo sin TP1 ${pct(sim.prob.cierre_por_tiempo)}`);
    const h = s.historial;
    if (h?.n) {
      out.push(`HISTORIAL REAL de esta señal en ${s.base} (últimas ${h.horas} h, ${h.n} operaciones con el mismo plan, comisiones incluidas${h.filtro_btc ? ', con el filtro de BTC' : ''})`);
      out.push(`  ganadoras ${pct(h.acierto_pct)} · llegaron a TP1 ${pct(h.tp1_pct)} · SL ${pct(h.sl_pct)} · cerradas por tiempo ${pct(h.tiempo_pct)} · duración media ${h.minutos_medio} min`);
      out.push(`  resultado medio ${signo(h.r_medio_neto)} R ≈ ${signo(h.r_medio_neto * P.riesgo_usdt, 3)} USDT por operación → 10 operaciones ≈ ${signo(10 * h.r_medio_neto * P.riesgo_usdt, 2)} USDT`);
    } else if (h) out.push('HISTORIAL: no hubo señales comparables en las últimas horas.');
    const fh = h?.filtro_btc;
    if (fh) out.push(fh.evitadas
      ? `  Filtro BTC en el historial: evitó ${fh.evitadas} operaciones (ganadoras ${pct(fh.acierto_evitadas_pct)}, ${signo(fh.r_medio_evitadas)} R) · sin filtro el resultado medio sería ${signo(fh.r_medio_sin_filtro)} R → el filtro ${fh.r_medio_evitadas < (h.r_medio_neto ?? 0) ? 'AYUDA' : 'NO ayuda'} ahora en ${s.base}`
      : '  Filtro BTC en el historial: no bloqueó ninguna operación (ya incluido).');
    if (s.estrategias_evaluadas.length === 1 && s.estrategia === 'tendencia' && s.contexto.reversion)
      out.push(`  Reversión: sin setup ahora (precio a ${signo(s.contexto.reversion.z)} desviaciones de su media de 5m; hace falta un estiramiento mayor).`);
    for (const x of s.estrategias_evaluadas.filter((x) => x.estrategia !== s.estrategia)) {
      const hh = x.historial;
      out.push(`  La otra estrategia (${NOMBRE[x.estrategia]}, ${x.lado}): ${x.nivel}${hh?.n ? ` · historial ${hh.n} operaciones, ganadoras ${pct(hh.acierto_pct)}, ${signo(hh.r_medio_neto)} R` : ''}`);
    }
    out.push('TIEMPO (operación de 15 a 60 min)');
    out.push(`  TP1 suele llegar en ${duracion(sim.minutos_tp1.mediana)} (mediana; 75 % antes de ${duracion(sim.minutos_tp1.p75)}).`);
    if (s.cerrar_si_no_tp1_a_las) out.push(`  Espera máxima del TP1: ${duracion(s.espera_max_min)} → si a las ${hora(s.cerrar_si_no_tp1_a_las, tz)} no tocó TP1, CIERRA: el plan no se está cumpliendo.`);
    out.push(`  Si tocó TP1, el resto corre con el SL en la entrada como mucho hasta las ${hora(s.cierre_total_a_las, tz)} (${duracion(s.duracion_max_min)}): ahí cierra todo.`);
  }
  if (s.recomendacion === 'NO OPERAR') {
    const r = s.reentrada;
    out.push(linea);
    out.push('QUÉ ESPERAR: vuelve a analizar en unos minutos, o si...');
    if (r.long_si_rompe) out.push(`  · una vela de 5 m cierra por encima de ${f(r.long_si_rompe)} (posible LONG)`);
    if (r.short_si_pierde) out.push(`  · una vela de 5 m cierra por debajo de ${f(r.short_si_pierde)} (posible SHORT)`);
    if (r.rebote_long_bajo) out.push(`  · el precio baja hasta ${f(r.rebote_long_bajo)} o sube hasta ${f(r.rebote_short_sobre)} (posible REVERSIÓN)`);
  }
  out.push(...bloqueMejor(s, cfg, f, linea));
  out.push(linea);
  out.push('No es asesoría financiera: es un cálculo con datos públicos. Opera solo lo que puedas perder.');
  return out.join('\n');
}

async function main() {
  const { pos, op } = args(process.argv.slice(2), { flags: ['json', 'sin_noticias', 'sin_ballenas', 'no_guardar'], numeros: ['capital', 'margen', 'objetivo', 'semilla', 'simulaciones', 'comision'] });
  if (op.estrategia) op.estrategia = op.estrategia.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  if (!pos[0]) throw new Error('Uso: senal.mjs SOL --capital 10 [--objetivo 3] [--lado long|short] [--json]');
  const cfg = leerConfig(op.config);
  const fuente = crearFuente({ exchange: op.exchange, cfg, offline: op.offline, grabar: op.grabar });
  const a = await analizarSimbolo(fuente, pos[0], { conNoticias: !op.sin_noticias, conBallenas: !op.sin_ballenas, carpetaCache: path.join(carpeta(cfg), 'cache') });
  if (op.comision != null) { // comisión real confirmada en la app (en %), p. ej. 0 en monedas en promoción
    a.contrato = { ...a.contrato, takerFeeRate: op.comision / 100, makerFeeRate: op.comision / 100 };
  }
  const s = await generarSenal(a, op, cfg);
  if (!op.no_guardar) escribirJSON(rutaSenal(cfg, s.base), s);
  if (op.json) console.log(JSON.stringify(s, null, 2));
  else {
    console.log(informe(s, cfg));
    if (!op.no_guardar) console.log(`Guardado en ${path.relative(process.cwd(), rutaSenal(cfg, s.base))}`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch(salir);
