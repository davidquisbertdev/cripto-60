// Mejor entrada en los próximos minutos, apalancamiento elegido por el usuario y huella de los bots.
import test from 'node:test';
import assert from 'node:assert/strict';
import { retrocesos, mejorEntrada } from '../lib/entrada.mjs';
import { flujoAlgoritmico, gridsLibro, analizarBots, efectoBots, seleccionarBots } from '../lib/bots.mjs';
import { calcularPlan } from '../lib/plan.mjs';
import { DEFAULTS } from '../lib/defaults.mjs';

// velas de 1 min que oscilan ±0.2 % alrededor de 100
const velas = Array.from({ length: 600 }, (_, i) => { const c = 100 + 0.2 * Math.sin(i / 3); return { t: i * 60e3, o: c, h: c + 0.05, l: c - 0.05, c }; });

test('mejor entrada: con el impulso de 1 min en contra conviene un limit; a favor, mercado', () => {
  const r = retrocesos(velas, 'LONG', 5);
  assert.ok(r.length > 100 && r[r.length - 1] > 0);
  const contra = mejorEntrada({ lado: 'LONG', precio: 100, sl: 99.4, velas1m: velas, momento1m: -0.5, ev: 0.1 });
  assert.equal(contra.recomendada, 'limit');
  assert.ok(contra.precio < 100 && contra.precio > 99.7); // nunca más allá de la mitad del camino al SL
  assert.ok(contra.prob_llenado >= 50);
  const favor = mejorEntrada({ lado: 'LONG', precio: 100, sl: 99.4, velas1m: velas, momento1m: 0.6, ev: 0.1 });
  assert.equal(favor.recomendada, 'mercado');
  // un SHORT busca el limit por encima
  const s = mejorEntrada({ lado: 'SHORT', precio: 100, sl: 100.6, velas1m: velas, momento1m: 0.5, ev: 0.1 });
  assert.ok(s.precio > 100);
});

test('apalancamiento elegido: se respeta y avisa del recomendado y de la liquidación', () => {
  const contrato = { priceUnit: 0.01, contractSize: 0.01, takerFeeRate: 0.0004, makerFeeRate: 0.0002, maxLeverage: 125, minVol: 1 };
  const base = { lado: 'LONG', entrada: 100, atr: 0.3, soporte: 99, resistencia: 101, contrato, capital: 100, nivel: 'MEDIA', cfg: { ...DEFAULTS }, objetivo: 3, slDist: 0.5 };
  const auto = calcularPlan(base);
  const alto = calcularPlan({ ...base, apalancamiento: 150 });
  assert.equal(auto.apalancamiento_usuario, null);
  assert.equal(alto.apalancamiento, 125); // el exchange no deja más
  assert.equal(alto.apalancamiento_recomendado, auto.apalancamiento);
  assert.ok(alto.liquida_antes_sl); // a 125x con el SL a 0.5 % la liquidación llega antes
  assert.match(alto.aviso_apalancamiento, /mi recomendación era/);
  assert.match(alto.aviso_apalancamiento, /ANTES de tocar el SL/);
  const bajo = calcularPlan({ ...base, apalancamiento: 5 });
  assert.equal(bajo.apalancamiento, 5);
  assert.equal(bajo.liquida_antes_sl, false);
});

test('bots: órdenes repetidas del mismo tamaño y escaleras en el libro', () => {
  const deals = [
    ...Array.from({ length: 6 }, (_, i) => ({ p: 100, v: 50, T: 1, t: i * 1000 })), // TWAP de compra: 6 × 5000 USD
    { p: 100, v: 3, T: 2, t: 7000 }, { p: 100, v: 7, T: 2, t: 8000 },
  ];
  const a = flujoAlgoritmico(deals, 1);
  assert.equal(a.patrones, 1);
  assert.equal(a.mayor.lado, 'compra');
  assert.ok(a.neto > 0.9);
  const depth = { bids: Array.from({ length: 6 }, (_, i) => [99.5 - i * 0.2, 300]), asks: [[100.5, 10], [100.7, 33]] };
  const g = gridsLibro(depth, 1, 100);
  assert.equal(g.length, 1);
  assert.equal(g[0].lado, 'compra');
  const b = analizarBots({ deals: Array.from({ length: 40 }, (_, i) => ({ p: 100, v: 600, T: 1, t: i * 1000 })), depth, tamContrato: 1, precio: 100 });
  assert.equal(b.lectura, 'COMPRADORES');
  assert.equal(efectoBots(b, 'LONG').ajuste_conf, 3);
  assert.equal(efectoBots(b, 'SHORT').ajuste_conf, -3);
  // las cuentas de bots son las de rotación de market maker (lo que el filtro de ballenas excluye)
  const filas = [
    { ethAddress: '0xa', accountValue: 5e6, windowPerformances: [['month', { vlm: 2e9 }]] },
    { ethAddress: '0xb', accountValue: 5e6, windowPerformances: [['month', { vlm: 1e7 }]] },
  ];
  assert.deepEqual(seleccionarBots(filas).map((x) => x.dir), ['0xa']);
});
