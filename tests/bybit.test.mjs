// Fuente de Bybit: mismos campos que MEXC y Binance, con datos reales grabados (sin red).
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FuenteBybit } from '../lib/bybit.mjs';
import { crearFuente } from '../lib/fuentes.mjs';
import { esCripto, cerradas } from '../lib/mexc.mjs';
import { analizarSimbolo } from '../lib/motor.mjs';
import { generarSenal } from '../cripto-senal/senal.mjs';
import { DEFAULTS } from '../lib/defaults.mjs';

const FX = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'bybit-sol');
const fuente = () => new FuenteBybit({ offline: FX });

test('crearFuente elige Bybit con --exchange bybit', () => {
  assert.equal(crearFuente({ exchange: 'bybit', offline: FX }).exchange, 'BYBIT');
  assert.throws(() => crearFuente({ exchange: 'kraken' }), /binance, bybit o mexc/);
});

test('contrato de SOL: pasos de cantidad, tick y comisiones de Bybit', async () => {
  const c = await fuente().detalle('sol');
  assert.equal(c.symbol, 'SOL_USDT');
  assert.equal(c.exchange, 'BYBIT');
  assert.ok(c.contractSize > 0 && c.priceUnit > 0);
  assert.equal(c.takerFeeRate, 0.00055);
  assert.ok(esCripto(c));
});

test('acciones y ETFs de Bybit no cuentan como cripto', async () => {
  const todos = await fuente().detalles();
  const soxl = todos.find((c) => c.symbol === 'SOXL_USDT');
  assert.ok(soxl, 'SOXL está en la lista de Bybit');
  assert.equal(esCripto(soxl), false);
  assert.ok(todos.filter(esCripto).length > 300);
});

test('velas en orden cronológico y paginadas hasta 2000 de 1 min', async () => {
  const v = await fuente().velas('SOL_USDT', '1m', 2000);
  assert.ok(v.length > 1500, `${v.length}`);
  for (let i = 1; i < v.length; i++) assert.ok(v[i].t > v[i - 1].t);
  assert.ok(cerradas(v).length >= v.length - 1);
});

test('señal completa con Bybit (sin noticias ni ballenas)', async () => {
  const f = fuente();
  const a = await analizarSimbolo(f, 'SOL', { conNoticias: false, conBallenas: false });
  assert.equal(a.exchange, 'BYBIT');
  assert.ok(a.btc, 'BTC de guía');
  const s = await generarSenal(a, { capital: 10, diario: null }, { ...DEFAULTS });
  assert.ok(['LONG', 'SHORT', 'NO OPERAR'].includes(s.recomendacion));
  assert.ok(s.plan.apalancamiento <= 30);
});
