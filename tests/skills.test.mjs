// Pruebas de las skills con datos reales grabados (tests/fixtures), sin red. Modo scalping.
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { Fuente } from '../lib/mexc.mjs';
import { analizarSimbolo } from '../lib/motor.mjs';
import { DEFAULTS } from '../lib/config.mjs';
import { generarSenal, informe } from '../cripto-senal/senal.mjs';
import { recorrido, evaluar, cargarPosicion } from '../cripto-posicion/posicion.mjs';
import { escanear, aptoScalping } from '../cripto-escaner/escaner.mjs';
import { parsearRSS, filtrar } from '../lib/noticias.mjs';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FX = (n) => path.join(RAIZ, 'tests', 'fixtures', n);
const cfg = { ...DEFAULTS, carpeta: path.join('tests', '.tmp-no-existe'), zona_horaria: 'UTC' };
const senalDe = async (fx, sym, op) => generarSenal(await analizarSimbolo(new Fuente({ offline: FX(fx) }), sym), op, cfg);

test('señal NEAR (datos reales): plan intradía completo y coherente', async () => {
  const s = await senalDe('near', 'NEAR', { capital: 20 });
  assert.equal(s.modo, 'intradia-corto');
  const p = s.plan;
  assert.ok(p.viable);
  const L = s.lado === 'LONG' ? 1 : -1;
  assert.ok(L * (s.precio - p.sl) > 0 && p.tps.every((t) => L * (t.precio - s.precio) > 0));
  assert.ok(p.sl_pct >= cfg.sl_pct_min);
  assert.ok(p.riesgo_pct_real <= cfg.riesgo_max_pct + 0.01);
  assert.ok(L * (p.sl - p.liquidacion) > 0, "la liquidación queda más allá del SL");
  assert.match(p.sl_regla, /calibrado por tiempo|detrás/);
  // el SL elegido es el más amplio que se resuelve en la espera en >= 65 % de los casos
  const ok = s.sl_probados.filter((x) => x.viable && x.tiempo <= cfg.cierre_tiempo_max_pct);
  if (ok.length) assert.equal(p.sl_regla, ok.at(-1).regla);
  // tiempos de scalping
  assert.ok(s.espera_max_min >= cfg.espera_min_min && s.espera_max_min <= cfg.espera_max_min);
  assert.equal(s.cierre_total_a_las, s.creada + cfg.duracion_max_min * 60e3);
  assert.equal(s.simulacion.horizonte_min, cfg.duracion_max_min);
  assert.ok(s.entrada.valida_hasta - s.creada === cfg.validez_entrada_min * 60e3);
  // historial real con comisiones
  assert.ok(s.historial.n >= cfg.historial_min_ops);
  assert.ok(s.historial.minutos_medio <= cfg.duracion_max_min);
  const txt = informe(s, cfg);
  for (const k of ['INTRADÍA 15-60 min', 'Stop loss', 'TP1', 'TP2', 'TP3', 'APALANCAMIENTO', 'Espera máxima del TP1', 'HISTORIAL REAL', 'PROBABILIDADES en 1 h']) assert.ok(txt.includes(k), k);
});

test('señal SOL (mercado quieto, historial negativo) = NO OPERAR', async () => {
  const s = await senalDe('sol', 'SOL', { capital: 10, objetivo: 3 });
  assert.equal(s.recomendacion, 'NO OPERAR');
  assert.ok(s.alertas.some((x) => /Historial|tiempo/.test(x)));
  assert.ok(s.alertas.some((x) => /lateral|Volumen/.test(x)));
  assert.equal(s.plan.objetivo.alcanzable, false);
  assert.match(informe(s, cfg), /QUÉ ESPERAR/);
});

test('MNT: con más margen hace falta menos apalancamiento para el mismo objetivo', async () => {
  const a = await analizarSimbolo(new Fuente({ offline: FX('mnt') }), 'MNT');
  const grande = await generarSenal(a, { capital: 100 }, cfg);
  const chico = await generarSenal(a, { capital: 20 }, cfg);
  assert.equal(grande.lado, chico.lado);
  assert.ok(grande.plan.apalancamiento < chico.plan.apalancamiento, `${grande.plan.apalancamiento} vs ${chico.plan.apalancamiento}`);
  assert.ok(grande.plan.margen <= (100 * cfg.margen_por_confianza[grande.nivel === 'NO OPERAR' ? 'BAJA' : grande.nivel]) / 100 + 1e-9);
  // --margen menor que el capital
  const m = await generarSenal(a, { capital: 100, margen: 15 }, cfg);
  assert.ok(m.plan.margen <= 15 + 1e-9);
  await assert.rejects(generarSenal(a, { capital: 10, margen: 15 }, cfg), /no puede ser mayor/);
});

test('forzar el lado contrario baja la confianza', async () => {
  const s = await senalDe('near', 'NEAR', { capital: 10, lado: 'long', estrategia: 'tendencia' });
  assert.equal(s.lado, 'LONG');
  assert.equal(s.estrategia, 'tendencia');
  assert.notEqual(s.nivel, 'ALTA');
  assert.ok(s.alertas.some((x) => /Pediste LONG/.test(x)));
});

test('la señal evalúa tendencia y reversión y elige por nivel e historial', async () => {
  const s = await senalDe('near', 'NEAR', { capital: 10 });
  const ev = s.estrategias_evaluadas;
  assert.deepEqual(ev.map((x) => x.estrategia).sort(), ['reversion', 'tendencia']);
  assert.equal(ev[0].estrategia, s.estrategia, 'la elegida va primero');
  // la recomendable gana a la que es NO OPERAR
  if (ev.some((x) => x.nivel !== 'NO OPERAR')) assert.notEqual(ev[0].nivel, 'NO OPERAR');
  assert.equal(s.alternativa.estrategia, ev[1].estrategia);
  assert.match(informe(s, cfg), /La otra estrategia/);
  // forzar la reversión
  const r = await senalDe('near', 'NEAR', { capital: 10, estrategia: 'reversion' });
  assert.equal(r.estrategia, 'reversion');
  assert.equal(r.lado, 'LONG'); // precio por debajo de su media de 5m
  assert.ok(r.objetivo_media > r.precio);
  assert.equal(r.estrategias_evaluadas.length, 1);
});

test('posición de reversión: se vigila con su propia lectura y se cierra al llegar a la media', async () => {
  const fuente = new Fuente({ offline: FX('near-posicion') });
  const ahora = fuente.ahora();
  const a = await analizarSimbolo(fuente, 'NEAR');
  a.velas1m_vivo = await fuente.velas('NEAR_USDT', '1m', 2000);
  // LONG de reversión: el análisis de tendencia dice SHORT, pero eso no basta para cerrar
  const p = cargarPosicion({ lado: 'long', entrada: 3.65, sl: 3.64, tp1: 3.672, hace: '3m', espera: '15m', estrategia: 'reversión' }, cfg, ahora, 'NEAR');
  assert.equal(p.estrategia, 'reversion');
  const e = evaluar(a, p, cfg);
  assert.equal(e.estrategia, 'reversion');
  assert.doesNotMatch(e.motivo, /El análisis cambió/);
  // si el precio ya está sobre la media de 5m y en ganancia: cerrar asegurando
  const p2 = { ...p, objetivo_media: a.precio - 0.001 };
  assert.equal(evaluar(a, p2, cfg).accion, 'CERRAR (asegura ganancia)');
});

test('recorrido de una posición: TP1 y luego vuelve a la entrada', () => {
  const t0 = Date.parse('2026-11-07T10:00:00Z');
  const pos = { lado: 'LONG', entrada: 100, sl: 99, tps: [101, 102, 103], abierta: t0, reparto: [50, 30, 20] };
  const v = [[100.5, 99.5], [101.2, 100.2], [100.6, 99.9]].map(([h, l], i) => ({ t: t0 + i * 60e3, h, l, o: 100, c: 100 }));
  const r = recorrido(v, pos);
  assert.equal(r.hit, 1);
  assert.equal(r.cierre.tipo, 'ENTRADA');
  assert.equal(recorrido([{ t: t0, h: 100.2, l: 98.9 }], pos).cierre.tipo, 'SL');
});

test('posición NEAR real: mantener, cerrar por tiempo o por cambio de análisis', async () => {
  const fuente = new Fuente({ offline: FX('near-posicion') });
  const ahora = fuente.ahora();
  const a = await analizarSimbolo(fuente, 'NEAR');
  a.velas1m_vivo = await fuente.velas('NEAR_USDT', '1m', 2000);
  const base = { lado: 'short', entrada: 3.658, sl: 3.677, tp1: 3.639, tp2: 3.628, tp3: 3.617 };
  const e = evaluar(a, cargarPosicion({ ...base, hace: '6m', espera: '15m' }, cfg, ahora, 'NEAR'), cfg);
  assert.equal(e.accion, 'MANTENER');
  assert.equal(e.recorrido.hit, 0);
  assert.ok(e.simulacion.horizonte_min <= 15, `${e.simulacion.horizonte_min}`);
  // pasó la espera sin TP1 -> cerrar
  assert.equal(evaluar(a, cargarPosicion({ ...base, hace: '6m', espera: '5m' }, cfg, ahora, 'NEAR'), cfg).accion, 'CERRAR');
  // un LONG contra un análisis SHORT -> cerrar
  const contra = cargarPosicion({ lado: 'long', entrada: 3.658, sl: 3.64, tp1: 3.676, hace: '3m' }, cfg, ahora, 'NEAR');
  assert.match(evaluar(a, contra, cfg).accion, /CERRAR/);
  assert.throws(() => cargarPosicion({ lado: 'long', entrada: 3.6, sl: 3.7, tp1: 3.8 }, cfg, ahora, 'NEAR'), /lado equivocado/);
});

test('escáner de scalping: solo cripto, aptas primero, promos de 0 comisión marcadas', async () => {
  const r = await escanear(new Fuente({ offline: FX('escaner') }), { top: 25 });
  assert.ok(r.filas.length >= 20);
  assert.ok(r.filas.every((f) => !/STOCK|SOXL|XAU/.test(f.simbolo)));
  const primeraNoApta = r.filas.findIndex((f) => !f.apto);
  if (primeraNoApta >= 0) assert.ok(r.filas.slice(primeraNoApta).every((f) => !f.apto));
  assert.ok(r.filas.some((f) => f.cero_promo));
  assert.equal(aptoScalping({ atr5Pct: 0.05, comisionPct: 0.04, spreadPct: 0.01 }).apto, false);
  assert.equal(aptoScalping({ atr5Pct: 0.3, comisionPct: 0.02, spreadPct: 0.01 }).apto, true);
  assert.equal(aptoScalping({ atr5Pct: 0.3, comisionPct: 0.02, spreadPct: 0.2 }).apto, false);
});

test('noticias grabadas: titulares de Solana en 48 h', () => {
  const items = ['cointelegraph', 'decrypt', 'coindesk'].flatMap((n) => parsearRSS(fs.readFileSync(path.join(FX('sol'), `rss-${n}.xml`), 'utf8'), n));
  assert.ok(items.length > 50);
  const ahora = JSON.parse(fs.readFileSync(path.join(FX('sol'), 'meta.json'), 'utf8')).ahora;
  assert.ok(filtrar(items, 'SOL', { desde: ahora - 48 * 3600e3 }).propias.some((n) => /Solana/.test(n.titulo)));
});

test('CLI: senal.mjs --json offline y --comision', () => {
  const run = (...extra) => JSON.parse(execFileSync(process.execPath, [path.join(RAIZ, 'cripto-senal', 'senal.mjs'), 'NEAR', '--capital', '10', '--offline', FX('near'), '--json', '--no-guardar', ...extra], { encoding: 'utf8' }));
  const j = run();
  assert.equal(j.plan.tps.length, 3);
  assert.ok(j.plan.comisiones.taker > 0);
  const z = run('--comision', '0');
  assert.equal(z.plan.comisiones.taker, 0);
  assert.ok(z.historial.r_medio_neto >= j.historial.r_medio_neto - 1e-9, 'sin comisión el historial no puede ser peor');
});

test('CLI: contrato que no es cripto da error claro', () => {
  const dir = fs.mkdtempSync(path.join(RAIZ, 'tests', '.tmp-'));
  try {
    fs.writeFileSync(path.join(dir, 'meta.json'), JSON.stringify({ ahora: Date.now() }));
    fs.writeFileSync(path.join(dir, 'detail-SOXL_USDT.json'), JSON.stringify({ success: true, code: 0, data: { symbol: 'SOXL_USDT', state: 0, conceptPlate: ['mc-trade-zone-Stock'] } }));
    assert.throws(() => execFileSync(process.execPath, [path.join(RAIZ, 'cripto-senal', 'senal.mjs'), 'SOXL', '--capital', '10', '--offline', dir, '--no-guardar'], { encoding: 'utf8', stdio: 'pipe' }), /no es una criptomoneda/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
