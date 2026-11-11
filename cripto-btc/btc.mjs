#!/usr/bin/env node
// cripto-btc: qué hace Bitcoin ahora (1m, 5m, 15m, 1h) y, si se indica una altcoin, cuánto la arrastra
// (correlación y beta de 5m) y si BTC acompaña un LONG o un SHORT en ella.
import { pathToFileURL } from 'node:url';
import { Fuente, simbolo, base as baseDe, cerradas } from '../lib/mexc.mjs';
import { crearFuente, nombreExchange } from '../lib/fuentes.mjs';
import { analizarBTC, relacionConBTC, filtroBTC, pesoBTC } from '../lib/btc.mjs';
import { analizarMarco } from '../lib/analisis.mjs';
import { analizarMacro } from '../lib/macro.mjs';
import { leerConfig } from '../lib/config.mjs';
import { args, signo, hora, salir } from '../lib/formato.mjs';

// Lectura rápida de una moneda (5m y 15m): precio, cambios 15 min / 1 h / 24 h, dirección. Para comparar una
// altcoin con BTC y para la vista general del mercado (ETH, SOL...).
export async function lecturaMoneda(fuente, moneda) {
  const sym = simbolo(moneda);
  const [v5, v15] = await Promise.all([fuente.velas(sym, '5m', 300).then(cerradas), fuente.velas(sym, '15m', 200).then(cerradas).catch(() => [])]);
  if (!v5.length) throw new Error(`No hay velas de ${sym} en ${nombreExchange(fuente.exchange)}.`);
  const precio = v5.at(-1).c;
  const marco = (v) => { const x = v.length ? analizarMarco(v, precio) : null; return x ? { score: x.score, dir: x.score >= 0.25 ? 'alcista' : x.score <= -0.25 ? 'bajista' : 'neutral', rsi: x.rsi, adx: x.adx } : null; };
  const marcos = { '5m': marco(v5), '15m': marco(v15) };
  const pts = [[marcos['5m'], 0.55], [marcos['15m'], 0.45]].filter(([x]) => x);
  const punt = pts.length ? +(pts.reduce((s, [x, w]) => s + w * x.score, 0) / pts.reduce((s, [, w]) => s + w, 0)).toFixed(3) : 0;
  const cambio = (v, n) => (v.length > n ? +((100 * (precio - v.at(-n - 1).c)) / v.at(-n - 1).c).toFixed(2) : null);
  return {
    simbolo: sym, base: baseDe(sym), precio, cambio_15m_pct: cambio(v5, 3), cambio_1h_pct: cambio(v5, 12), cambio_24h_pct: cambio(v15, 96),
    puntuacion: punt, lectura: punt >= 0.25 ? 'ALCISTA' : punt <= -0.25 ? 'BAJISTA' : 'NEUTRAL', marcos, v5,
  };
}

export async function informeBTC(fuente, moneda = null) {
  const btc = await analizarBTC(fuente);
  if (!btc) throw new Error(`No se pudieron leer las velas de BTC (${nombreExchange(fuente.exchange)}).`);
  let alt = null;
  if (moneda && baseDe(moneda) !== 'BTC') {
    const { v5, ...l } = await lecturaMoneda(fuente, moneda);
    const rel = relacionConBTC(v5, btc.velas5m);
    alt = { ...l, relacion: rel, peso: +pesoBTC(rel).toFixed(2), long: filtroBTC(btc, rel, 1), short: filtroBTC(btc, rel, -1), long_rev: filtroBTC(btc, rel, 1, 'reversion'), short_rev: filtroBTC(btc, rel, -1, 'reversion') };
  }
  // oro y petróleo frente a BTC (correlación de 1 h en 7 días)
  const macro = await analizarMacro(fuente, btc.series?.c1h ?? null).catch(() => null);
  const { velas5m, series, ...resto } = btc;
  return { ahora: fuente.ahora(), btc: resto, alt, macro };
}

const VEREDICTO = (f) => (f.bloquea ? 'NO (bloqueado por BTC)' : f.estado === 'en contra' ? `en contra${f.bajar ? ' (baja un nivel)' : ''}` : f.estado === 'a favor' ? 'a favor' : 'neutral');

export function texto(r, cfg) {
  const b = r.btc, out = [], linea = '─'.repeat(64);
  out.push(`BTC_USDT · Bitcoin como guía de las altcoins · ${hora(r.ahora, cfg.zona_horaria)} · precio ${b.precio}`);
  out.push(linea);
  out.push(`LECTURA: ${b.lectura}${b.fuerza ? ` ${b.fuerza}` : ''} (${signo(b.puntuacion)})`);
  for (const x of b.frases) out.push(`  · ${x}`);
  out.push(`  · Niveles 5m: soporte ${b.soporte_5m ?? '—'} · resistencia ${b.resistencia_5m ?? '—'} · RSI 5m ${b.rsi_5m ?? '—'}`);
  if (r.alt) {
    const a = r.alt, rel = a.relacion;
    out.push(linea);
    out.push(`${a.base} FRENTE A BTC`);
    out.push(`  ${a.base}: ${a.lectura} (${signo(a.puntuacion)}) · precio ${a.precio} · 15 min ${signo(a.cambio_15m_pct)} % · 1 h ${signo(a.cambio_1h_pct)} %`);
    out.push(rel ? `  Correlación ${rel.correlacion} · beta ${rel.beta} (${rel.velas} velas de 5m): si BTC se mueve 1 %, ${a.base} suele moverse ~${rel.beta} %` : '  Sin datos suficientes para medir la correlación.');
    out.push(`  Peso de BTC en la señal de ${a.base}: ${Math.round(100 * a.peso)} %`);
    out.push(`  Para un LONG:  tendencia ${VEREDICTO(a.long)} · reversión ${VEREDICTO(a.long_rev)}`);
    out.push(`  Para un SHORT: tendencia ${VEREDICTO(a.short)} · reversión ${VEREDICTO(a.short_rev)}`);
    for (const f of [a.long_rev, a.short_rev, a.long, a.short]) if (f.texto) { out.push(`  · ${f.texto}`); break; }
  }
  if (r.macro) {
    out.push(linea);
    out.push('ORO Y PETRÓLEO (contexto macro; Binance TradFi)');
    for (const x of r.macro.activos) out.push(`  ${x.nombre.padEnd(13)} ${String(x.precio).padStart(9)} · 1 h ${signo(x.cambio_1h)} % · 24 h ${signo(x.cambio_24h)} % · 7 d ${signo(x.cambio_7d)} % · correlación 1 h con BTC ${x.correlacion_btc ?? '—'}`);
    for (const x of r.macro.activos) out.push(`  · ${x.frase}`);
  }
  out.push(linea);
  out.push('BTC marca el rumbo de casi todo el mercado en minutos: no operes una altcoin contra un BTC que se mueve con fuerza.');
  return out.join('\n');
}

async function main() {
  const { pos, op } = args(process.argv.slice(2), { flags: ['json'] });
  const cfg = leerConfig(op.config);
  const fuente = crearFuente({ exchange: op.exchange, cfg, offline: op.offline, grabar: op.grabar });
  const r = await informeBTC(fuente, pos[0] ?? null);
  console.log(op.json ? JSON.stringify(r, null, 2) : texto(r, cfg));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch(salir);
