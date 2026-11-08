#!/usr/bin/env node
// cripto-ballenas: qué hace el dinero grande en una moneda. Posiciones y operaciones de las ballenas
// de Hyperliquid (billeteras públicas), top traders frente a minoristas, open interest, flujo agresivo,
// operaciones grandes y muros del libro del exchange. Compara con la revisión anterior.
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { Fuente, simbolo as simboloDe, base as baseDe, cerradas, esCripto } from '../lib/mexc.mjs';
import { crearFuente, nombreExchange } from '../lib/fuentes.mjs';
import { analizarBallenas, compararInstantanea } from '../lib/ballenas.mjs';
import { leerConfig, leerJSON, escribirJSON, carpeta } from '../lib/config.mjs';
import { args, hora, signo, duracion, precio as fp, salir } from '../lib/formato.mjs';
import { decimales } from '../lib/plan.mjs';

const M = (x) => (x == null ? '—' : Math.abs(x) >= 1e6 ? `${(x / 1e6).toFixed(2)} M` : `${(x / 1e3).toFixed(0)} k`);

export async function informeBallenas(fuente, entrada, cfg, { n = 50, guardar = true } = {}) {
  const sym = simboloDe(entrada), b = baseDe(sym);
  const contrato = await fuente.detalle(sym);
  if (!esCripto(contrato)) throw new Error(`${sym} no es una criptomoneda.`);
  const ticker = await fuente.ticker(sym);
  const precio = +ticker.lastPrice;
  const v5 = cerradas(await fuente.velas(sym, '5m', 30));
  const precio15m = v5.length > 7 ? (100 * (precio - v5.at(-7).c)) / v5.at(-7).c : null;
  const dir = carpeta(cfg);
  const r = await analizarBallenas(fuente, { base: b, simbolo: sym, contrato, precio, precio15m, carpetaCache: path.join(dir, 'cache'), n });
  const ruta = path.join(dir, `ballenas-${b}.json`);
  const prev = leerJSON(ruta);
  r.desde_anterior = compararInstantanea(prev, r.hl);
  if (guardar && r.hl?.disponible) escribirJSON(ruta, { t: fuente.ahora(), precio_hl: r.hl.precio_hl, posiciones: r.hl.instantanea });
  return { simbolo: sym, base: b, ahora: fuente.ahora(), precio, decimales: decimales(contrato.priceUnit), ...r };
}

export function texto(r, cfg) {
  const tz = cfg.zona_horaria, f = (x) => fp(x, r.decimales), out = [], linea = '─'.repeat(64);
  out.push(`${r.simbolo} · ballenas y dinero grande · ${hora(r.ahora, tz)} · precio ${f(r.precio)}`);
  out.push(linea);
  out.push(`LECTURA: ${r.lectura} (${signo(r.puntuacion)}) · cobertura de datos ${Math.round(r.cobertura * 100)} %`);
  for (const x of r.frases) out.push(`  · ${x}`);
  const hl = r.hl;
  if (hl?.disponible && hl.posiciones.length) {
    out.push(linea);
    out.push(`BALLENAS EN ${hl.coin} (Hyperliquid, ${hl.criterio})`);
    for (const p of hl.posiciones.slice(0, 8)) {
      const liq = p.liquidacion ? ` · liq ${p.liquidacion.toPrecision(6)}` : '';
      out.push(`  ${p.dir.slice(0, 6)}…${p.dir.slice(-4)} ${p.lado.padEnd(5)} ${M(p.valor).padStart(9)} USD a ${p.entrada.toPrecision(6)} · ${p.apalancamiento ?? '?'}x · PnL ${signo(p.pnl / 1e3, 1)} k${liq} · ${p.conviccion_pct} % de su cuenta`);
    }
  }
  if (r.desde_anterior) {
    const d = r.desde_anterior;
    out.push(linea);
    out.push(`DESDE TU REVISIÓN ANTERIOR (${hora(d.desde, tz)}, hace ${duracion((r.ahora - d.desde) / 60e3)}): ${d.cambios.length ? `${signo(d.delta_neto_usd / 1e6, 2)} M USD netos ${d.delta_neto_usd >= 0 ? 'hacia LONG' : 'hacia SHORT'}` : 'sin cambios relevantes'}`);
    for (const c of d.cambios.slice(0, 6)) out.push(`  · ${c.dir.slice(0, 6)}…${c.dir.slice(-4)} ${c.que} (${signo(c.delta_usd / 1e3, 0)} k USD)`);
  }
  if (r.muros && (r.muros.compra || r.muros.venta)) {
    out.push(linea);
    out.push(`MUROS EN ${(r.exchange ?? 'MEXC').toUpperCase()} (±3 %): ${r.muros.compra ? `compra ${f(r.muros.compra.precio)} (${M(r.muros.compra.usd)} USD)` : 'sin muro de compra'} · ${r.muros.venta ? `venta ${f(r.muros.venta.precio)} (${M(r.muros.venta.usd)} USD)` : 'sin muro de venta'}`);
  }
  out.push(linea);
  out.push('Las ballenas también se equivocan y pueden estar cubriendo otras posiciones. Úsalo como confirmación, no como señal única.');
  return out.join('\n');
}

async function main() {
  const { pos, op } = args(process.argv.slice(2), { flags: ['json', 'no_guardar'], numeros: ['ballenas'] });
  if (!pos[0]) throw new Error('Uso: ballenas.mjs SOL [--ballenas 50] [--json]');
  const cfg = leerConfig(op.config);
  const fuente = crearFuente({ exchange: op.exchange, cfg, offline: op.offline, grabar: op.grabar });
  const r = await informeBallenas(fuente, pos[0], cfg, { n: op.ballenas ?? 50, guardar: !op.no_guardar });
  if (op.json) { const { frases, ...resto } = r; console.log(JSON.stringify({ ...resto, frases }, null, 2)); }
  else console.log(texto(r, cfg));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch(salir);
