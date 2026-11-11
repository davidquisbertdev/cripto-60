#!/usr/bin/env node
// cripto-swing: swing trading (días a semanas, velas diarias). Análisis de una moneda con el setup que gana en
// su historial de 2 años, y registro/seguimiento de tus operaciones swing en trader/swing.json.
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { simbolo, base as baseDe } from '../lib/mexc.mjs';
import { crearFuente, nombreExchange } from '../lib/fuentes.mjs';
import { analizarSwing, datosSwing, evaluarSwing, SETUPS } from '../lib/swing.mjs';
import { leerConfig, leerJSON, escribirJSON, carpeta } from '../lib/config.mjs';
import { args, signo, salir } from '../lib/formato.mjs';

const ruta = (cfg) => path.join(carpeta(cfg), 'swing.json');
const fecha = (t, tz) => new Intl.DateTimeFormat('es', { timeZone: tz || undefined, day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(t));
const n = (x) => (x == null ? '—' : +(+x).toPrecision(7));

export function textoAnalisis(a, exchange) {
  const out = [], linea = '─'.repeat(64);
  out.push(`${a.base} · SWING (días a semanas, velas diarias) · ${nombreExchange(exchange)} · precio ${n(a.precio)}`);
  out.push(linea);
  out.push(`SEÑAL SWING: ${a.recomendacion}${a.recomendacion !== 'ESPERAR' ? `   confianza ${a.nivel}` : ''} · tendencia ${a.tendencia.toLowerCase()} · ATR diario ${a.indicadores.atr_pct} %`);
  out.push(`  ${a.texto}`);
  if (a.plan) {
    const p = a.plan;
    out.push(linea);
    out.push(`PLAN ${a.recomendacion} (${SETUPS[p.setup].nombre})`);
    out.push(`  Zona de entrada: ${p.zona_entrada.map((z) => `${n(z.precio)} (${z.reparto} %)`).join(' · ')}`);
    out.push(`  Stop loss:       ${n(p.sl)} (${p.sl_pct} %)`);
    out.push(`  TP1:             ${n(p.tp1)} → cierra el ${p.tp1_cierra_pct} %`);
    if (p.trailing) out.push(`  El resto:        ${p.trailing.texto} (hoy: ${n(p.trailing.nivel_hoy)})`);
    out.push(`  Tiempo:          TP1 en ~${p.dias_tp1 ?? '—'} días · máximo ${p.dias_max} días`);
    out.push(`  Tamaño:          ${p.apalancamiento}x · margen ${p.margen?.toFixed?.(2)} USDT · si salta el SL pierdes ${p.riesgo_usdt?.toFixed?.(2)} USDT`);
    if (p.funding_estimado_usdt != null) out.push(`  Funding:         ${p.funding_paga ? 'pagas' : 'cobras'} ~${p.funding_estimado_usdt} USDT en la operación`);
  }
  if (a.vigilar.length) {
    out.push(linea);
    out.push('NIVELES A VIGILAR (plan si se activan)');
    for (const w of a.vigilar) out.push(`  · ${w.texto} [${signo(w.dist_pct)} %] → entrada ${n(w.plan.entrada)}, SL ${n(w.plan.sl)} (${w.plan.sl_pct} %), TP1 ${n(w.plan.tp1)} (${w.plan.tp1_pct} %), ~${w.plan.dias_tp1 ?? '—'} días`);
  }
  out.push(linea);
  out.push('HISTORIAL REAL (2 años, comisiones y funding en contra)');
  for (const h of Object.values(a.historiales)) out.push(`  ${SETUPS[h.setup].nombre.padEnd(24)} ${h.r_medio == null ? '—' : `${signo(h.r_medio)} R`} · ${h.n} operaciones · ${h.acierto_pct ?? '—'} % aciertos · ${h.dias_medio ?? '—'} días · mitades ${h.r_mitad1 ?? '—'} / ${h.r_mitad2 ?? '—'}`);
  out.push('Registra tu entrada con --entrar PRECIO y revisa tus operaciones con: swing.mjs revisar');
  return out.join('\n');
}

async function main() {
  const { pos, op } = args(process.argv.slice(2), { flags: ['json'], numeros: ['capital', 'entrar', 'salir', 'sl', 'tp1', 'porcentaje'] });
  const cfg = leerConfig(op.config);
  const fuente = crearFuente({ exchange: op.exchange, cfg, offline: op.offline, grabar: op.grabar });
  const doc = leerJSON(ruta(cfg), { operaciones: [] });
  const tz = cfg.zona_horaria;
  if (pos[0] === 'revisar') {
    const abiertas = doc.operaciones.filter((o) => !o.cerrada_en);
    if (!abiertas.length) return console.log('No tienes operaciones swing abiertas. Registra una con: swing.mjs BTC --entrar PRECIO');
    for (const o of abiertas) {
      const v = await fuente.velas(simbolo(o.base), '1d', 120);
      const e = evaluarSwing(o, v, fuente.ahora());
      console.log(`${o.base} ${o.lado} desde ${fecha(o.abierta_en, tz)} · entrada ${n(o.entrada)} · SL ${n(o.sl)} · TP1 ${n(o.tp1)}`);
      console.log(e ? `  ${e.accion}: ${e.motivo}\n  Precio ${n(e.precio)} · ${signo(e.resultado_pct)} % (${signo(e.r_actual)} R) · día ${e.dias} · SL sugerido ${n(e.sl_sugerido)}` : '  Sin datos para revisar.');
    }
    return;
  }
  if (!pos[0]) throw new Error('Uso: swing.mjs BTC [--capital 1000] [--entrar PRECIO --lado long|short --sl X --tp1 Y] [--salir PRECIO --porcentaje 50] · swing.mjs revisar');
  const sym = simbolo(pos[0]), b = baseDe(sym);
  // registrar una salida en la operación abierta de esa moneda
  if (op.salir != null) {
    const o = doc.operaciones.find((x) => x.base === b && !x.cerrada_en);
    if (!o) throw new Error(`No tienes una operación swing abierta en ${b}.`);
    const q = Math.min(100, Math.max(1, op.porcentaje ?? 100));
    o.eventos.push({ tipo: 'salida', precio: op.salir, porcentaje: q, fecha: new Date(fuente.ahora()).toISOString() });
    if (o.eventos.filter((x) => x.tipo === 'salida').reduce((s, x) => s + x.porcentaje, 0) >= 100) o.cerrada_en = fuente.ahora();
    escribirJSON(ruta(cfg), doc);
    return console.log(`Salida del ${q} % a ${n(op.salir)} registrada en ${b}${o.cerrada_en ? ': operación cerrada.' : '.'}`);
  }
  const contrato = await fuente.detalle(sym);
  const { velas, funding } = await datosSwing(fuente, sym);
  const a = analizarSwing({ v: velas, ahora: fuente.ahora(), contrato, capital: op.capital ?? cfg.capital ?? 100, cfg, funding, base: b });
  // registrar una entrada: con el plan de hoy, el del nivel vigilado de ese lado o los valores que indiques
  if (op.entrar != null) {
    const lado = (op.lado ?? (a.recomendacion !== 'ESPERAR' ? a.recomendacion : a.vigilar[0]?.lado ?? 'long')).toUpperCase();
    const w = a.vigilar.find((x) => x.lado === lado);
    const sl = op.sl ?? (a.plan && a.recomendacion === lado ? a.plan.sl : w?.plan.sl);
    const tp1 = op.tp1 ?? (a.plan && a.recomendacion === lado ? a.plan.tp1 : w?.plan.tp1) ?? null;
    if (!sl) throw new Error('Indica el SL con --sl (no hay plan de ese lado hoy).');
    const o = { id: Date.now(), base: b, lado, setup: a.plan?.setup ?? w?.setup ?? null, entrada: op.entrar, sl, tp1, trailing: true, abierta_en: fuente.ahora(), cerrada_en: null, eventos: [{ tipo: 'entrada', precio: op.entrar, porcentaje: 100, fecha: new Date(fuente.ahora()).toISOString() }] };
    doc.operaciones.push(o);
    escribirJSON(ruta(cfg), doc);
    return console.log(`Guardada: ${lado} en ${b} a ${n(op.entrar)} · SL ${n(sl)} · TP1 ${n(tp1)}. Revísala cuando quieras con: swing.mjs revisar`);
  }
  if (op.json) return console.log(JSON.stringify(a, null, 2));
  console.log(textoAnalisis(a, fuente.exchange));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch(salir);
