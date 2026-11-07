#!/usr/bin/env node
// cripto-noticias: titulares recientes de una moneda y del mercado, sentimiento y Fear & Greed.
import { pathToFileURL } from 'node:url';
import { Fuente, base } from '../lib/mexc.mjs';
import { leerNoticias, miedoCodicia } from '../lib/noticias.mjs';
import { leerConfig } from '../lib/config.mjs';
import { args, hora, signo, salir } from '../lib/formato.mjs';

async function main() {
  const { pos, op } = args(process.argv.slice(2), { flags: ['json'], numeros: ['horas'] });
  const cfg = leerConfig(op.config);
  const fuente = new Fuente({ offline: op.offline, grabar: op.grabar });
  const monedas = pos.length ? pos.map(base) : ['BTC'];
  const fng = await miedoCodicia(fuente);
  const res = [];
  for (const m of monedas) res.push(await leerNoticias(fuente, m, { horas: op.horas ?? 24 }));
  if (op.json) return console.log(JSON.stringify({ fng, monedas: res }, null, 2));
  const tz = cfg.zona_horaria;
  if (fng) console.log(`Fear & Greed: ${fng.valor} (${fng.clase})${fng.ayer != null ? `, ayer ${fng.ayer}` : ''}`);
  for (const r of res) {
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
