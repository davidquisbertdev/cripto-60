#!/usr/bin/env node
// cripto-diario: registra cada operación cerrada, lleva el capital y aplica las reglas de protección
// (pérdida máxima diaria, pérdidas seguidas, operaciones por día) que cripto-senal respeta.
import { pathToFileURL } from 'node:url';
import { leerConfig, leerJSON, escribirJSON, rutaDiario, estadoDiario } from '../lib/config.mjs';
import { args, usdt, signo, hora, salir } from '../lib/formato.mjs';

export function registrar(diario, { simbolo, lado, pnl, margen = null, nota = null, fecha }) {
  if (!diario) throw new Error('Primero inicia el diario: diario.mjs iniciar --capital 10');
  if (!Number.isFinite(pnl)) throw new Error('Falta --pnl (ganancia o pérdida en USDT, negativa si perdiste)');
  const op = { id: (diario.operaciones.at(-1)?.id ?? 0) + 1, fecha: new Date(fecha).toISOString(), simbolo: simbolo.toUpperCase(), lado: lado ? lado.toUpperCase() : null, pnl, margen, nota };
  diario.operaciones.push(op);
  return op;
}

async function main() {
  const { pos, op } = args(process.argv.slice(2), { flags: ['json', 'forzar'], numeros: ['capital', 'pnl', 'margen'] });
  const cfg = leerConfig(op.config);
  const ruta = rutaDiario(cfg);
  const ahora = op.ahora ? Date.parse(op.ahora) : Date.now();
  let diario = leerJSON(ruta);
  const cmd = pos[0] || 'ver';
  if (cmd === 'iniciar') {
    if (!(op.capital > 0)) throw new Error('Uso: diario.mjs iniciar --capital 10');
    if (diario && diario.operaciones.length && !op.forzar)
      throw new Error(`Ya hay un diario con ${diario.operaciones.length} operaciones. Añade --forzar para empezar de cero.`);
    diario = { capital_inicial: op.capital, creado: new Date(ahora).toISOString(), operaciones: [] };
    escribirJSON(ruta, diario);
    console.log(`Diario iniciado con ${usdt(op.capital)}.`);
    return;
  }
  if (cmd === 'deposito' || cmd === 'retiro') {
    if (!diario) throw new Error('Primero inicia el diario.');
    const m = op.capital ?? +pos[1];
    if (!(m > 0)) throw new Error(`Uso: diario.mjs ${cmd} --capital 50`);
    diario.capital_inicial += cmd === 'deposito' ? m : -m;
    escribirJSON(ruta, diario);
    console.log(`${cmd === 'deposito' ? 'Depósito' : 'Retiro'} de ${usdt(m)} registrado.`);
  } else if (cmd === 'registrar') {
    if (!pos[1]) throw new Error('Uso: diario.mjs registrar SOL --pnl 0.8 [--lado long] [--nota "TP2"]');
    const o = registrar(diario, { simbolo: pos[1], lado: op.lado, pnl: op.pnl, margen: op.margen, nota: op.nota, fecha: ahora });
    escribirJSON(ruta, diario);
    console.log(`#${o.id} ${o.simbolo} ${o.lado || ''} ${signo(o.pnl, 3)} USDT registrado.`);
  } else if (cmd === 'borrar') {
    if (!diario?.operaciones.length) throw new Error('No hay operaciones.');
    const o = diario.operaciones.pop();
    escribirJSON(ruta, diario);
    console.log(`Borrada la operación #${o.id} (${o.simbolo} ${signo(o.pnl, 3)}).`);
  } else if (cmd !== 'ver') throw new Error(`Comando desconocido: ${cmd} (iniciar, registrar, deposito, retiro, borrar, ver)`);

  const e = estadoDiario(diario, cfg, ahora);
  if (!e) { console.log('No hay diario. Empieza con: diario.mjs iniciar --capital 10'); return; }
  if (op.json) return console.log(JSON.stringify({ ...e, ultimas: diario.operaciones.slice(-10) }, null, 2));
  const crec = e.capital_inicial ? (100 * (e.capital - e.capital_inicial)) / e.capital_inicial : 0;
  console.log(`Capital: ${usdt(e.capital)} (inicio ${usdt(e.capital_inicial)}, ${signo(crec, 1)} %)`);
  console.log(`Operaciones: ${e.operaciones} · ganadas ${e.ganadas} · perdidas ${e.perdidas}${e.tasa_acierto != null ? ` · acierto ${e.tasa_acierto} %` : ''}`);
  console.log(`Hoy (${e.hoy.fecha}): ${e.hoy.operaciones} operaciones (${e.hoy.ultima_hora} en la última hora, máx. ${cfg.max_operaciones_hora}), ${signo(e.hoy.pnl, 3)} USDT · pérdidas seguidas: ${e.perdidas_seguidas}`);
  for (const a of e.avisos) console.log(`! ${a}`);
  console.log(`Margen sugerido por operación: ${usdt(e.margen_sugerido)} (base ${cfg.margen_base} + ${cfg.reinversion_pct} % de lo ganado)`);
  console.log(e.bloqueo ? `⛔ ${e.bloqueo}` : '✓ Puedes operar hoy según tus reglas.');
  const ult = diario.operaciones.slice(-5);
  if (ult.length) {
    console.log('Últimas:');
    for (const o of ult) console.log(`  #${o.id} ${hora(Date.parse(o.fecha), cfg.zona_horaria)} ${o.simbolo.padEnd(6)} ${(o.lado || '').padEnd(5)} ${signo(o.pnl, 3).padStart(8)} USDT${o.nota ? '  ' + o.nota : ''}`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch(salir);
