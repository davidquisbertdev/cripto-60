// Pruebas de las skills con datos reales grabados de MEXC (tests/fixtures), sin red.
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
import { escanear } from '../cripto-escaner/escaner.mjs';
import { parsearRSS, filtrar } from '../lib/noticias.mjs';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FX = (n) => path.join(RAIZ, 'tests', 'fixtures', n);
const cfg = { ...DEFAULTS, carpeta: path.join('tests', '.tmp-no-existe'), zona_horaria: 'UTC' };

test('señal SOL con datos reales: SHORT con plan completo', async () => {
  const a = await analizarSimbolo(new Fuente({ offline: FX('sol') }), 'sol');
  const s = await generarSenal(a, { capital: 10, objetivo: 3 }, cfg);
  assert.equal(s.simbolo, 'SOL_USDT');
  assert.equal(s.recomendacion, 'SHORT');
  assert.equal(s.nivel, 'MEDIA'); // ADX 1h lateral: no puede ser ALTA
  const p = s.plan;
  assert.ok(p.viable);
  assert.ok(p.sl > s.precio && p.tps.every((t) => t.precio < s.precio));
  assert.ok(p.riesgo_pct_real <= 5.01);
  assert.ok(p.liquidacion > p.sl);
  assert.ok(s.simulacion.prob.tp1 > 0 && s.simulacion.prob.tp1 < 100);
  assert.ok(s.espera_max_min >= 15 && s.espera_max_min <= 12 * 60);
  assert.equal(s.cerrar_si_no_tp1_a_las, s.creada + s.espera_max_min * 60e3);
  assert.equal(p.objetivo.alcanzable, false);
  assert.ok(s.alertas.some((x) => /lateral/.test(x)));
  const txt = informe(s, cfg);
  for (const k of ['SEÑAL: SHORT', 'Stop loss', 'TP1', 'TP2', 'TP3', 'Apalancamiento', 'Espera máxima', 'PROBABILIDADES']) assert.ok(txt.includes(k), k);
});

test('señal MNT con 100 USDT: marcos en conflicto = NO OPERAR', async () => {
  const a = await analizarSimbolo(new Fuente({ offline: FX('mnt') }), 'MNT');
  const s = await generarSenal(a, { capital: 100, objetivo: 5 }, cfg);
  assert.equal(s.recomendacion, 'NO OPERAR');
  assert.ok(s.reentrada.long_si_rompe > s.precio);
  assert.ok(s.reentrada.short_si_pierde < s.precio);
  assert.ok(s.plan.margen <= 50 + 1e-9, 'con incertidumbre se usa como mucho la mitad del capital');
  assert.match(informe(s, cfg), /QUÉ ESPERAR/);
});

test('forzar el lado contrario baja la confianza', async () => {
  const a = await analizarSimbolo(new Fuente({ offline: FX('sol') }), 'SOL');
  const s = await generarSenal(a, { capital: 10, lado: 'long' }, cfg);
  assert.equal(s.lado, 'LONG');
  assert.notEqual(s.nivel, 'ALTA');
  assert.ok(s.alertas.some((x) => /Pediste LONG/.test(x)));
});

test('recorrido de una posición: TP1 y luego vuelve a la entrada', () => {
  const t0 = Date.parse('2026-11-07T10:00:00Z');
  const pos = { lado: 'LONG', entrada: 100, sl: 99, tps: [101, 102, 103], abierta: t0, reparto: [50, 30, 20] };
  const v = [[100.5, 99.5], [101.2, 100.2], [100.6, 99.9]].map(([h, l], i) => ({ t: t0 + i * 60e3, h, l, o: 100, c: 100 }));
  const r = recorrido(v, pos);
  assert.equal(r.hit, 1);
  assert.equal(r.cierre.tipo, 'ENTRADA');
  const r2 = recorrido([{ t: t0, h: 100.2, l: 98.9 }], pos);
  assert.equal(r2.cierre.tipo, 'SL');
});

test('posición SOL real: la acción depende del tiempo y del análisis', async () => {
  const fuente = new Fuente({ offline: FX('sol-posicion') });
  const ahora = fuente.ahora();
  const pos = cargarPosicion({ lado: 'short', entrada: 89.49, sl: 90.02, tp1: 88.96, tp2: 88.43, tp3: 87.9, hace: '40m', espera: '70m' }, cfg, ahora, 'SOL');
  const a = await analizarSimbolo(fuente, 'SOL');
  a.velas1m = await fuente.velas('SOL_USDT', '1m', 50);
  const e = evaluar(a, pos, cfg);
  assert.equal(e.accion, 'MANTENER');
  assert.equal(e.recorrido.hit, 0);
  assert.ok(e.simulacion && e.prob_siguiente_tp != null);
  // mismo trade pero ya pasó la espera máxima sin TP1 -> cerrar
  const tarde = cargarPosicion({ lado: 'short', entrada: 89.49, sl: 90.02, tp1: 88.96, hace: '40m', espera: '30m' }, cfg, ahora, 'SOL');
  assert.equal(evaluar(a, tarde, cfg).accion, 'CERRAR');
  // un LONG contra un análisis SHORT -> cerrar
  const contra = cargarPosicion({ lado: 'long', entrada: 89.49, sl: 89.0, tp1: 90, hace: '10m', espera: '60m' }, cfg, ahora, 'SOL');
  assert.match(evaluar(a, contra, cfg).accion, /CERRAR/);
  assert.throws(() => cargarPosicion({ lado: 'long', entrada: 89, sl: 90, tp1: 91 }, cfg, ahora, 'SOL'), /lado equivocado/);
});

test('escáner: solo cripto, ordenado por confianza', async () => {
  const r = await escanear(new Fuente({ offline: FX('escaner') }), { top: 12 });
  assert.ok(r.filas.length >= 10);
  assert.ok(r.filas.every((f) => !/STOCK|SOXL|XAU/.test(f.simbolo)));
  for (let i = 1; i < r.filas.length; i++) assert.ok(r.filas[i - 1].confianza >= r.filas[i].confianza);
  const btc = r.filas.find((f) => f.simbolo === 'BTC_USDT');
  assert.ok(btc && Math.abs(btc.cambio_24h) < 20);
});

test('noticias grabadas: titulares de Solana en 48 h', () => {
  const items = ['cointelegraph', 'decrypt', 'coindesk'].flatMap((n) => parsearRSS(fs.readFileSync(path.join(FX('sol'), `rss-${n}.xml`), 'utf8'), n));
  assert.ok(items.length > 50);
  const ahora = JSON.parse(fs.readFileSync(path.join(FX('sol'), 'meta.json'), 'utf8')).ahora;
  const r = filtrar(items, 'SOL', { desde: ahora - 48 * 3600e3 });
  assert.ok(r.propias.some((n) => /Solana/.test(n.titulo)));
});

test('CLI: senal.mjs --json offline', () => {
  const out = execFileSync(process.execPath, [path.join(RAIZ, 'cripto-senal', 'senal.mjs'), 'SOL', '--capital', '10', '--offline', FX('sol'), '--json', '--no-guardar'], { encoding: 'utf8' });
  const j = JSON.parse(out);
  assert.equal(j.recomendacion, 'SHORT');
  assert.equal(j.plan.tps.length, 3);
});

test('CLI: contrato que no es cripto da error claro', () => {
  const dir = fs.mkdtempSync(path.join(RAIZ, 'tests', '.tmp-'));
  try {
    fs.writeFileSync(path.join(dir, 'meta.json'), JSON.stringify({ ahora: Date.now() }));
    fs.writeFileSync(path.join(dir, 'detail-SOXL_USDT.json'), JSON.stringify({ success: true, code: 0, data: { symbol: 'SOXL_USDT', state: 0, conceptPlate: ['mc-trade-zone-Stock'] } }));
    assert.throws(() => execFileSync(process.execPath, [path.join(RAIZ, 'cripto-senal', 'senal.mjs'), 'SOXL', '--capital', '10', '--offline', dir, '--no-guardar'], { encoding: 'utf8', stdio: 'pipe' }), /no es una criptomoneda/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
