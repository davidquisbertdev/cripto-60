#!/usr/bin/env node
// cripto-senal: analiza una moneda de futuros MEXC y da LONG / SHORT / NO OPERAR con entrada, SL,
// TP1-TP3, % a cerrar en cada TP, apalancamiento, margen, probabilidades y tiempo máximo de espera.
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { Fuente } from '../lib/mexc.mjs';
import { analizarSimbolo } from '../lib/motor.mjs';
import { calcularPlan, redondear } from '../lib/plan.mjs';
import { simular } from '../lib/simulacion.mjs';
import { leerConfig, leerJSON, escribirJSON, rutaDiario, rutaSenal, estadoDiario } from '../lib/config.mjs';
import { args, precio as fp, usdt, pct, signo, hora, duracion, salir } from '../lib/formato.mjs';

const BAJAR = { ALTA: 'MEDIA', MEDIA: 'BAJA', BAJA: 'NO OPERAR', 'NO OPERAR': 'NO OPERAR' };

export async function generarSenal(a, op, cfg) {
  const ahora = a.ahora;
  const diario = estadoDiario(leerJSON(rutaDiario(cfg)), cfg, ahora);
  const capital = op.capital ?? diario?.capital ?? cfg.capital;
  if (!(capital > 0)) throw new Error('Indica el capital disponible, por ejemplo --capital 10');

  const d = a.decision;
  const lado = op.lado ? op.lado.toUpperCase() : d.sesgo;
  if (!['LONG', 'SHORT'].includes(lado)) throw new Error('--lado debe ser long o short');
  let nivel = d.nivel;
  const motivos = [...d.alertas];
  if (op.lado && lado !== d.sesgo) { nivel = BAJAR[BAJAR[nivel]]; motivos.push(`Pediste ${lado} pero el análisis se inclina a ${d.sesgo}.`); }

  const atr15 = a.marcos['15m'].atr;
  const n15 = a.niveles15;
  const base = {
    lado, entrada: a.precio, atr15, soporte: n15.soporte, resistencia: n15.resistencia, contrato: a.contrato, capital, cfg,
    factorRiesgo: diario?.factor_riesgo ?? 1, objetivo: op.objetivo ?? null,
  };
  let plan = calcularPlan({ ...base, nivel });
  let sim = null;
  if (plan.viable || plan.sl) {
    sim = simular({
      velas: a.velas5m.slice(-1000), lado, entrada: a.precio, sl: plan.sl, tps: plan.tps.map((t) => (typeof t === 'number' ? t : t.precio)),
      reparto: cfg.reparto_tps, horizonte: Math.round(cfg.espera_max_horas * 12), n: op.simulaciones ?? cfg.simulaciones, semilla: op.semilla ?? cfg.semilla,
    });
    if (sim.r_esperado <= -0.1 && nivel !== 'NO OPERAR') { nivel = 'NO OPERAR'; motivos.push(`La simulación da un resultado esperado negativo (${signo(sim.r_esperado)} R).`); }
    else if (sim.r_esperado < 0 && nivel !== 'NO OPERAR') { nivel = BAJAR[nivel]; motivos.push(`La simulación da un resultado esperado ligeramente negativo (${signo(sim.r_esperado)} R): se baja la confianza.`); }
    if (nivel !== d.nivel || op.lado) plan = calcularPlan({ ...base, nivel });
  }
  if (diario?.bloqueo) { nivel = 'NO OPERAR'; motivos.unshift(diario.bloqueo); }
  if (!plan.viable) motivos.unshift(plan.motivo);

  const L = lado === 'LONG' ? 1 : -1;
  const unidad = a.contrato.priceUnit;
  const atr5 = a.marcos['5m']?.atr ?? atr15 / 2;
  const entrada = {
    mercado: a.precio,
    limit: redondear(a.precio - L * 0.25 * atr5, unidad),
    no_perseguir: redondear(a.precio + L * 0.3 * atr15, unidad),
    valida_hasta: ahora + cfg.validez_entrada_min * 60e3,
  };
  const esperaMin = sim ? Math.min(Math.max(sim.espera_max_min ?? sim.horizonte_min, 15), cfg.espera_max_horas * 60) : null;
  const n1h = a.niveles1h;
  const reentrada = {
    long_si_rompe: n15.resistencia ?? n1h.resistencia, short_si_pierde: n15.soporte ?? n1h.soporte,
  };

  const recomendado = nivel !== 'NO OPERAR' && plan.viable;
  return {
    tipo: 'senal', version: 1, simbolo: a.simbolo, base: a.base, exchange: 'MEXC', creada: ahora,
    recomendacion: recomendado ? lado : 'NO OPERAR', lado, nivel, confianza: d.confianza, puntuacion: d.puntuacion,
    sesgo_analisis: d.sesgo, razones: d.razones, alertas: motivos, capital,
    precio: a.precio, decimales: a.decimales, entrada, plan, simulacion: sim,
    espera_max_min: esperaMin, cerrar_si_no_tp1_a_las: esperaMin ? ahora + esperaMin * 60e3 : null, reentrada,
    contexto: {
      funding: a.funding, proximo_funding: a.proximo_funding, libro: a.libro, btc: a.btc, fng: a.fng,
      cambio_24h_pct: a.cambio_24h,
      rsi: Object.fromEntries(Object.entries(a.marcos).map(([k, m]) => [k, m?.rsi ?? null])),
      atr15: atr15, adx1h: a.marcos['1h']?.adx, niveles15: { soporte: n15.soporte, resistencia: n15.resistencia }, niveles1h: { soporte: n1h.soporte, resistencia: n1h.resistencia },
    },
    noticias: a.noticias ? {
      sentimiento: a.noticias.sentimiento, evento_riesgo: a.noticias.evento_riesgo,
      propias: a.noticias.propias.slice(0, 6).map(({ titulo, fecha, fuente, sentimiento, enlace }) => ({ titulo, fecha, fuente, sentimiento, enlace })),
      macro: a.noticias.macro.slice(0, 4).map(({ titulo, fecha, fuente, sentimiento }) => ({ titulo, fecha, fuente, sentimiento })),
    } : null,
    diario,
  };
}

export function informe(s, cfg) {
  const tz = cfg.zona_horaria, dec = s.decimales, P = s.plan, sim = s.simulacion;
  const f = (x) => fp(x, dec);
  const out = [];
  const linea = '─'.repeat(64);
  out.push(`${s.simbolo} · futuros perpetuos MEXC · ${hora(s.creada, tz)} · precio ${f(s.precio)}`);
  out.push(linea);
  const titulo = s.recomendacion === 'NO OPERAR'
    ? `SEÑAL: NO OPERAR  (el análisis se inclina a ${s.sesgo_analisis}, confianza ${s.confianza}/100)`
    : `SEÑAL: ${s.lado}   confianza ${s.nivel} (${s.confianza}/100)`;
  out.push(titulo);
  out.push('Por qué:');
  for (const r of s.razones) out.push(`  · ${r}`);
  const c = s.contexto;
  const ctx = [`funding ${c.funding == null ? '—' : (c.funding * 100).toFixed(4) + ' %'}`, `24 h ${signo(c.cambio_24h_pct)} %`];
  if (c.btc) ctx.push(`BTC ${signo(c.btc.puntuacion)}`);
  if (c.fng) ctx.push(`Fear & Greed ${c.fng.valor} (${c.fng.clase})`);
  out.push(`Contexto: ${ctx.join(' · ')}`);
  if (s.noticias) {
    out.push(`Noticias 48 h: ${s.noticias.propias.length} de ${s.base}, sentimiento ${signo(s.noticias.sentimiento)}`);
    for (const n of s.noticias.propias.slice(0, 3)) out.push(`  · ${hora(n.fecha, tz)} ${n.titulo} [${n.fuente}]`);
  }
  if (s.alertas.length) {
    out.push('Atención:');
    for (const x of s.alertas) out.push(`  ! ${x}`);
  }
  out.push(linea);

  if (!P.viable) {
    out.push(`No hay plan: ${P.motivo}`);
    return out.join('\n');
  }
  const etiqueta = s.recomendacion === 'NO OPERAR' ? `PLAN DE REFERENCIA ${s.lado} (NO recomendado ahora)` : `PLAN ${s.lado}`;
  out.push(`${etiqueta} · capital ${usdt(s.capital)}`);
  const e = s.entrada;
  out.push(`  Entrada    ${f(e.mercado)} a mercado, o limit ${f(e.limit)} (comisión maker menor)`);
  out.push(`             no persigas: si ya está ${s.lado === 'LONG' ? 'por encima' : 'por debajo'} de ${f(e.no_perseguir)}, no entres · la señal caduca a las ${hora(e.valida_hasta, tz)}`);
  out.push(`  Stop loss  ${f(P.sl)}  (${s.lado === 'LONG' ? '-' : '+'}${P.sl_pct} %)  ${P.sl_regla}`);
  for (const t of P.tps) {
    const cierre = t.contratos ? `cierra ${t.cerrar_pct} % (${t.contratos} contr.)` : 'sin contratos (posición mínima)';
    out.push(`  TP${t.n}        ${f(t.precio)}  (${s.lado === 'LONG' ? '+' : '-'}${t.movimiento_pct} %, ${t.r}R)  ${cierre} → ${signo(t.ganancia_usdt, 3)} USDT (${signo(t.roe_pct, 1)} % del margen)`);
  }
  out.push(`  Al tocar TP1 mueve el SL a la entrada (${f(P.entrada)}); al tocar TP2, el SL al TP1 (${f(P.tps[0].precio)}).`);
  out.push(`  Apalancamiento ${P.apalancamiento}x AISLADO (máx. seguro ${P.apalancamiento_max_seguro}x) · margen ${usdt(P.margen)} (${P.margen_pct_capital} % del capital)`);
  out.push(`  Tamaño ${P.contratos} contratos = ${P.cantidad_moneda} ${s.base} (${usdt(P.nocional)} de posición)`);
  out.push(`  Liquidación aprox. ${f(P.liquidacion)} (más allá del SL)`);
  out.push(`  Si salta el SL pierdes ${usdt(-P.riesgo_usdt)} = ${P.riesgo_pct_real} % del capital (comisiones incluidas)`);
  const es = P.escenarios;
  out.push(`  Escenarios: SL directo ${signo(es.sl_directo, 3)} · TP1 y luego entrada ${signo(es.tp1_y_luego_be, 3)} · TP1+TP2 ${signo(es.tp1_tp2_y_luego_tp1, 3)} · los 3 TP ${signo(es.todos_los_tps, 3)} USDT`);
  for (const x of P.avisos) out.push(`  ! ${x}`);
  if (P.objetivo) out.push(`  Objetivo: ${P.objetivo.mensaje}`);
  out.push(linea);
  if (sim) {
    out.push(`PROBABILIDADES (${sim.simulaciones} simulaciones con ${sim.velas_pool} velas reales de 5 m de ${s.base}, semilla ${sim.semilla})`);
    out.push(`  TP1 ${pct(sim.prob.tp1)} · TP2 ${pct(sim.prob.tp2)} · TP3 ${pct(sim.prob.tp3)} · SL antes del TP1 ${pct(sim.prob.sl_antes_tp1)} · nada en ${duracion(sim.horizonte_min)} ${pct(sim.prob.nada)}`);
    out.push(`  Resultado esperado ${signo(sim.r_esperado)} R (≈ ${signo(sim.r_esperado * P.riesgo_usdt, 3)} USDT por operación de este tipo)`);
    out.push('TIEMPO');
    out.push(`  TP1 suele llegar en ${duracion(sim.minutos_tp1.mediana)} (mediana; 75 % antes de ${duracion(sim.minutos_tp1.p75)}).`);
    if (s.cerrar_si_no_tp1_a_las) out.push(`  Espera máxima: ${duracion(s.espera_max_min)}. Si a las ${hora(s.cerrar_si_no_tp1_a_las, tz)} no tocó TP1, cierra la posición y no esperes más.`);
  }
  if (s.recomendacion === 'NO OPERAR') {
    const r = s.reentrada;
    out.push(linea);
    out.push('QUÉ ESPERAR: vuelve a analizar si...');
    if (r.long_si_rompe) out.push(`  · una vela de 15 m cierra por encima de ${f(r.long_si_rompe)} (posible LONG)`);
    if (r.short_si_pierde) out.push(`  · una vela de 15 m cierra por debajo de ${f(r.short_si_pierde)} (posible SHORT)`);
  }
  out.push(linea);
  out.push('No es asesoría financiera: es un cálculo con datos públicos. Opera solo lo que puedas perder.');
  return out.join('\n');
}

async function main() {
  const { pos, op } = args(process.argv.slice(2), { flags: ['json', 'sin_noticias', 'no_guardar'], numeros: ['capital', 'objetivo', 'semilla', 'simulaciones'] });
  if (!pos[0]) throw new Error('Uso: senal.mjs SOL --capital 10 [--objetivo 3] [--lado long|short] [--json]');
  const cfg = leerConfig(op.config);
  const fuente = new Fuente({ offline: op.offline, grabar: op.grabar });
  const a = await analizarSimbolo(fuente, pos[0], { conNoticias: !op.sin_noticias });
  const s = await generarSenal(a, op, cfg);
  if (!op.no_guardar) escribirJSON(rutaSenal(cfg, s.base), s);
  if (op.json) console.log(JSON.stringify(s, null, 2));
  else {
    console.log(informe(s, cfg));
    if (!op.no_guardar) console.log(`Guardado en ${path.relative(process.cwd(), rutaSenal(cfg, s.base))}`);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) main().catch(salir);
