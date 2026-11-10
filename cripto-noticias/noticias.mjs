#!/usr/bin/env node
// cripto-noticias: titulares recientes de una moneda y del mercado, sentimiento y Fear & Greed.
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { Fuente, base } from '../lib/mexc.mjs';
import { crearFuente, nombreExchange } from '../lib/fuentes.mjs';
import { leerNoticias, miedoCodicia } from '../lib/noticias.mjs';
import { leerCalendario, cacheArchivo } from '../lib/calendario.mjs';
import { leerConfig, carpeta } from '../lib/config.mjs';
import { args, hora, signo, salir } from '../lib/formato.mjs';

async function main() {
  const { pos, op } = args(process.argv.slice(2), { flags: ['json'], numeros: ['horas'] });
  const cfg = leerConfig(op.config);
  const fuente = crearFuente({ exchange: op.exchange, cfg, offline: op.offline, grabar: op.grabar });
  const monedas = pos.length ? pos.map(base) : ['BTC'];
  const fng = await miedoCodicia(fuente);
  const res = [];
  for (const m of monedas) res.push(await leerNoticias(fuente, m, { horas: op.horas ?? 24 }));
  // calendario económico (IPC, empleo, Fed...): lo que mueve a todo el mercado, con la reacción de BTC
  const btc5 = await fuente.velas('BTC_USDT', '5m', 300).catch(() => null);
  const cal = await leerCalendario(fuente, { velasBTC5m: btc5, cache: cacheArchivo(path.join(carpeta(cfg), 'cache')) }).catch(() => null);
  if (op.json) return console.log(JSON.stringify({ fng, calendario: cal, monedas: res }, null, 2));
  const tz = cfg.zona_horaria;
  if (fng) console.log(`Fear & Greed: ${fng.valor} (${fng.clase})${fng.ayer != null ? `, ayer ${fng.ayer}` : ''}`);
  if (cal) {
    console.log(`\nCALENDARIO ECONÓMICO (${cal.fuente}): datos que mueven a todas las cripto a la vez`);
    for (const e of cal.eventos) {
      const r = e.reaccion_btc;
      const reac = e.publicado ? (r ? ` · ya salió → BTC ${signo(r.cambio_15m_pct)} % en 15 min, ${signo(r.cambio_60m_pct)} % en 1 h (mín. ${signo(r.min_pct)} %)` : ' · ya salió') : '';
      console.log(`  ${hora(e.fecha, tz)} ${e.importancia.padEnd(7)} ${e.pais} ${e.que_es}${e.prevision ? ` · previsión ${e.prevision}` : ''}${e.anterior ? ` · anterior ${e.anterior}` : ''}${reac}`);
      if (!e.publicado && e.importancia === 'CRÍTICA') console.log(`      ${e.efecto}`);
    }
    if (!cal.eventos.length) console.log('  Sin datos importantes en las últimas 24 h ni en los próximos 3 días.');
  }
  for (const r of res) {
    if (r.alerta_macro) console.log(`\n! ${r.alerta_macro}`);
    console.log(`\n${r.moneda}: ${r.propias.length} noticias en ${op.horas ?? 24} h · sentimiento ${signo(r.sentimiento)}${r.evento_riesgo ? ` · ⚠ RIESGO: ${r.evento_riesgo}` : ''}`);
    for (const n of r.propias.slice(0, 10)) console.log(`  ${hora(n.fecha, tz)} ${signo(n.sentimiento)} ${n.titulo} [${n.fuente}]\n      ${n.enlace}`);
    if (r.errores.length) console.log(`  (fuentes con error: ${r.errores.join('; ')})`);
  }
  const macro = res[0]?.macro || [];
  if (macro.length) {
    console.log('\nMercado general / macro:');
    for (const n of macro.slice(0, 8)) console.log(`  ${hora(n.fecha, tz)} ${signo(n.sentimiento)} ${n.titulo} [${n.fuente}]`);
  }
  console.log('\nEl sentimiento es un conteo de palabras clave en inglés, orientativo. Lee el titular antes de decidir.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch(salir);
