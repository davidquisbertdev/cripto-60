#!/usr/bin/env node
// cripto-btc: qué hace Bitcoin ahora (1m, 5m, 15m, 1h) y, si se indica una altcoin, cuánto la arrastra
// (correlación y beta de 5m) y si BTC acompaña un LONG o un SHORT en ella.
import { pathToFileURL } from 'node:url';
import { Fuente, simbolo, base as baseDe, cerradas } from '../lib/mexc.mjs';
import { analizarBTC, relacionConBTC, filtroBTC, pesoBTC } from '../lib/btc.mjs';
import { leerConfig } from '../lib/config.mjs';
import { args, signo, hora, salir } from '../lib/formato.mjs';

export async function informeBTC(fuente, moneda = null) {
  const btc = await analizarBTC(fuente);
  if (!btc) throw new Error('No se pudieron leer las velas de BTC en MEXC.');
  let alt = null;
  if (moneda && baseDe(moneda) !== 'BTC') {
    const sym = simbolo(moneda);
    const v5 = cerradas(await fuente.velas(sym, '5m', 300));
    const rel = relacionConBTC(v5, btc.velas5m);
    alt = { simbolo: sym, base: baseDe(sym), relacion: rel, peso: +pesoBTC(rel).toFixed(2), long: filtroBTC(btc, rel, 1), short: filtroBTC(btc, rel, -1), long_rev: filtroBTC(btc, rel, 1, 'reversion'), short_rev: filtroBTC(btc, rel, -1, 'reversion') };
  }
  const { velas5m, ...resto } = btc;
  return { ahora: fuente.ahora(), btc: resto, alt };
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
    out.push(rel ? `  Correlación ${rel.correlacion} · beta ${rel.beta} (${rel.velas} velas de 5m): si BTC se mueve 1 %, ${a.base} suele moverse ~${rel.beta} %` : '  Sin datos suficientes para medir la correlación.');
    out.push(`  Peso de BTC en la señal de ${a.base}: ${Math.round(100 * a.peso)} %`);
    out.push(`  Para un LONG:  tendencia ${VEREDICTO(a.long)} · reversión ${VEREDICTO(a.long_rev)}`);
    out.push(`  Para un SHORT: tendencia ${VEREDICTO(a.short)} · reversión ${VEREDICTO(a.short_rev)}`);
    for (const f of [a.long_rev, a.short_rev, a.long, a.short]) if (f.texto) { out.push(`  · ${f.texto}`); break; }
  }
  out.push(linea);
  out.push('BTC marca el rumbo de casi todo el mercado en minutos: no operes una altcoin contra un BTC que se mueve con fuerza.');
  return out.join('\n');
}

async function main() {
  const { pos, op } = args(process.argv.slice(2), { flags: ['json'] });
  const cfg = leerConfig(op.config);
  const fuente = new Fuente({ offline: op.offline, grabar: op.grabar });
  const r = await informeBTC(fuente, pos[0] ?? null);
  console.log(op.json ? JSON.stringify(r, null, 2) : texto(r, cfg));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch(salir);
