import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Fuente } from '../lib/mexc.mjs';
import { DEFAULTS } from '../lib/config.mjs';
import { combinar } from '../lib/analisis.mjs';
import { seleccionarBallenas, resumirPosiciones, resumirFills, lecturaOI, compararInstantanea, puntuarBallenas, operacionesGrandes, muros } from '../lib/ballenas.mjs';
import { informeBallenas, texto } from '../cripto-ballenas/ballenas.mjs';
import { analizarSimbolo } from '../lib/motor.mjs';
import { generarSenal, informe } from '../cripto-senal/senal.mjs';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FX = (n) => path.join(RAIZ, 'tests', 'fixtures', n);
const tmp = () => fs.mkdtempSync(path.join(RAIZ, 'tests', '.tmp-'));

const fila = (dir, valor, pnl, vol) => ({ ethAddress: dir, accountValue: String(valor), windowPerformances: [['month', { pnl: '0', vlm: String(vol) }], ['allTime', { pnl: String(pnl), vlm: '0' }]] });

test('selección de ballenas: grandes, rentables y sin market makers', () => {
  const w = seleccionarBallenas([
    fila('0xgrande', 5e7, 1e6, 1e8), // rotación 2x: ballena
    fila('0xmm', 5e7, 1e6, 5e10), // rotación 1000x: market maker
    fila('0xperdedora', 5e7, -1e6, 1e8),
    fila('0xchica', 5e5, 1e5, 1e6),
    fila('0xmediana', 2e6, 1e5, 1e6),
  ]);
  assert.deepEqual(w.map((x) => x.dir), ['0xgrande', '0xmediana']);
});

test('posiciones: se ignoran restos pequeños', () => {
  const est = (szi, val) => ({ ballena: { dir: `0x${szi}`, valor: 1e7 }, estado: { marginSummary: { accountValue: '1e7' }, assetPositions: [{ position: { coin: 'SOL', szi: String(szi), positionValue: String(val), entryPx: '90', unrealizedPnl: '0', leverage: { value: 5 } } }] } });
  const r = resumirPosiciones([est(-1000, 9e4), est(500, 4.5e4), est(10, 900)], 'SOL');
  assert.equal(r.con_posicion, 2);
  assert.equal(r.shorts, 1);
  assert.ok(r.neto < 0);
});

test('fills: un giro Long > Short cierra el long y abre el short', () => {
  const f = resumirFills([
    { coin: 'SOL', px: '100', sz: '15', side: 'A', time: 10, startPosition: '10' }, // vende 15 con 10 long: cierra 10, abre 5 short
    { coin: 'SOL', px: '100', sz: '2', side: 'B', time: 11, startPosition: '-5' }, // cierra 2 del short
    { coin: 'ETH', px: '1', sz: '1', side: 'B', time: 11, startPosition: '0' },
  ], 'SOL', 0);
  assert.equal(f.cerraron_long, 1000);
  assert.equal(f.abrieron_short, 500);
  assert.equal(f.cerraron_short, 200);
  assert.equal(f.operaciones, 2);
  assert.ok(f.neto < 0);
});

test('open interest + precio', () => {
  const oi = (a, b) => [a, a, a, a, a, a, b].map((c, i) => ({ t: i, contratos: c, valor: c }));
  assert.match(lecturaOI(oi(100, 104), 1.2).tipo, /LONGS nuevos/);
  assert.match(lecturaOI(oi(100, 104), -1.2).tipo, /SHORTS nuevos/);
  assert.match(lecturaOI(oi(100, 96), 1).tipo, /cierre de shorts/);
  assert.match(lecturaOI(oi(100, 96), -1).tipo, /cierre de longs/);
  assert.equal(lecturaOI(oi(100, 100.2), 1).puntuacion, 0);
});

test('instantáneas: detecta quién abrió, cerró o aumentó', () => {
  const prev = { t: 1, posiciones: { a: -100, b: 50 } };
  const r = compararInstantanea(prev, { disponible: true, instantanea: { a: -150, c: 20 }, precio_hl: 100 });
  assert.equal(r.delta_neto_usd, (-50 - 50 + 20) * 100);
  const que = Object.fromEntries(r.cambios.map((c) => [c.dir, c.que]));
  assert.equal(que.a, 'aumentó su SHORT');
  assert.equal(que.b, 'cerró su LONG');
  assert.equal(que.c, 'abrió LONG');
});

test('operaciones grandes y muros de MEXC', () => {
  const deals = [...Array(40)].map((_, i) => ({ p: 100, v: 1, T: 1, t: i * 1000 })).concat([{ p: 100, v: 5000, T: 2, t: 41000 }]);
  const g = operacionesGrandes(deals, 0.1);
  assert.equal(g.n, 1);
  assert.equal(g.ventas_usd, 50000);
  assert.ok(g.neto < 0);
  const m = muros({ bids: [[99.9, 10], [99.5, 10], [99, 900]], asks: [[100.1, 10], [100.5, 12], [110, 99999]] }, 1, 100);
  assert.equal(m.compra.precio, 99);
  assert.equal(m.venta, null, 'un muro fuera del ±3 % no cuenta');
});

test('las ballenas en contra bajan la confianza de la señal', () => {
  const marco = (s) => ({ score: s, rsi: 45, precio: 1, ema50: 2, adx: 30 });
  const marcos = { '4h': marco(-0.7), '1h': marco(-0.7), '15m': marco(-0.7), '5m': marco(-0.5) };
  const sin = combinar({ marcos });
  const contra = combinar({ marcos, ballenas: { puntuacion: 0.6, cobertura: 1, lectura: 'ALCISTA fuerte' } });
  const favor = combinar({ marcos, ballenas: { puntuacion: -0.6, cobertura: 1, lectura: 'BAJISTA fuerte' } });
  assert.equal(sin.sesgo, 'SHORT');
  assert.ok(contra.confianza < sin.confianza && contra.ballenas_en_contra);
  assert.ok(favor.confianza >= sin.confianza);
  assert.ok(contra.alertas.some((a) => /ballenas van en contra/.test(a)));
});

test('puntuación sin datos = neutral, con cobertura 0', () => {
  const p = puntuarBallenas({});
  assert.equal(p.puntuacion, 0);
  assert.equal(p.cobertura, 0);
  assert.equal(p.lectura, 'NEUTRAL');
});

test('SOL con datos reales: ballenas de Hyperliquid netas SHORT', async () => {
  const d = tmp();
  try {
    const cfg = { ...DEFAULTS, carpeta: d, zona_horaria: 'UTC' };
    const r = await informeBallenas(new Fuente({ offline: FX('ballenas-sol') }), 'SOL', cfg);
    assert.ok(r.hl.disponible);
    assert.ok(r.hl.shorts > r.hl.longs);
    assert.ok(r.hl.neto < -0.5);
    assert.ok(r.puntuacion < 0);
    assert.equal(r.posicionamiento.fuente, 'Binance');
    assert.ok(r.cobertura >= 0.9);
    assert.match(texto(r, cfg), /BALLENAS EN SOL/);
    assert.ok(fs.existsSync(path.join(d, 'ballenas-SOL.json')), 'guarda la instantánea');
    // segunda revisión con los mismos datos: sin cambios
    const r2 = await informeBallenas(new Fuente({ offline: FX('ballenas-sol') }), 'SOL', cfg);
    assert.equal(r2.desde_anterior.cambios.length, 0);
  } finally { fs.rmSync(d, { recursive: true, force: true }); }
});

test('MNT: sin Binance usa Bybit y no cuenta los restos de posiciones', async () => {
  const d = tmp();
  try {
    const r = await informeBallenas(new Fuente({ offline: FX('ballenas-mnt') }), 'MNT', { ...DEFAULTS, carpeta: d });
    assert.equal(r.posicionamiento.fuente, 'Bybit');
    assert.equal(r.hl.con_posicion, 0, 'posiciones de 6 k USD no son ballenas');
    assert.equal(r.componentes.hl_posiciones, undefined);
  } finally { fs.rmSync(d, { recursive: true, force: true }); }
});

test('la señal incluye las ballenas', async () => {
  const a = await analizarSimbolo(new Fuente({ offline: FX('sol') }), 'SOL');
  assert.ok(a.ballenas && a.ballenas.cobertura > 0.5);
  const s = await generarSenal(a, { capital: 10 }, { ...DEFAULTS, carpeta: 'tests/.tmp-no-existe', zona_horaria: 'UTC' });
  assert.equal(s.sesgo_analisis, 'SHORT');
  assert.ok(s.ballenas.cobertura > 0.5);
  assert.ok(s.ballenas.instantanea && Object.keys(s.ballenas.instantanea).length > 0);
  assert.ok(s.confianza <= 64, 'mercado lateral: la confianza no pasa de MEDIA');
  assert.match(informe(s, DEFAULTS), /Ballenas: (ALCISTA|BAJISTA|NEUTRAL)/);
});
