import test from 'node:test';
import assert from 'node:assert/strict';
import { ema, rsi, atr, swings } from '../lib/indicadores.mjs';
import { simbolo, esCripto, cambio24h } from '../lib/mexc.mjs';
import { calcularPlan, redondear, repartir, decimales } from '../lib/plan.mjs';
import { simular } from '../lib/simulacion.mjs';
import { DEFAULTS, estadoDiario } from '../lib/config.mjs';
import { parseDuracion, numero } from '../lib/formato.mjs';
import { sentimientoTexto, filtrar } from '../lib/noticias.mjs';

const cfg = { ...DEFAULTS };
const SOL = { contractSize: 0.1, minVol: 1, maxLeverage: 300, priceUnit: 0.01, takerFeeRate: 0.0002, makerFeeRate: 0, maintenanceMarginRate: 0.0023 };

test('símbolos', () => {
  assert.equal(simbolo('sol'), 'SOL_USDT');
  assert.equal(simbolo('SOLUSDT'), 'SOL_USDT');
  assert.equal(simbolo('sol/usdt'), 'SOL_USDT');
  assert.equal(simbolo('MNT_USDT'), 'MNT_USDT');
  assert.equal(simbolo('btc-usdt-perp'), 'BTC_USDT');
});

test('solo cripto', () => {
  assert.equal(esCripto({ symbol: 'SOL_USDT', conceptPlate: ['mc-trade-zone-mainly'] }), true);
  assert.equal(esCripto({ symbol: 'SOXL_USDT', conceptPlate: ['mc-trade-zone-Stock', 'mc-trade-zone-tradfi'] }), false);
  assert.equal(esCripto({ symbol: 'XAU_USDT', conceptPlate: ['mc-trade-zone-metals'] }), false);
  assert.equal(esCripto({ symbol: 'NVDASTOCK_USDT', conceptPlate: [] }), false);
});

test('indicadores básicos', () => {
  const c = Array.from({ length: 50 }, () => 10);
  assert.equal(ema(c, 20).at(-1), 10);
  const sube = Array.from({ length: 30 }, (_, i) => i + 1);
  assert.equal(rsi(sube, 14).at(-1), 100);
  const velas = Array.from({ length: 30 }, (_, i) => ({ o: 10, h: 11, l: 9, c: 10, t: i }));
  assert.ok(Math.abs(atr(velas, 14).at(-1) - 2) < 1e-9);
  const zig = [1, 2, 3, 9, 3, 2, 1, 2, 3, 2, 1].map((x, i) => ({ h: x, l: x, t: i }));
  assert.deepEqual(swings(zig, 3).altos.map((s) => s.p), [9]);
});

test('cambio 24h con velas de 1h', () => {
  const v = Array.from({ length: 30 }, (_, i) => ({ c: 100 + i }));
  assert.equal(cambio24h(v, 130), +((100 * (130 - 105)) / 105).toFixed(2));
  assert.equal(cambio24h(v.slice(0, 10), 1), null);
});

test('redondeo de precios', () => {
  assert.equal(decimales(0.01), 2);
  assert.equal(decimales(1e-10), 10);
  assert.equal(redondear(89.476, 0.01, 'abajo'), 89.47);
  assert.equal(redondear(89.471, 0.01, 'arriba'), 89.48);
  assert.equal(redondear(0.45449, 0.0001), 0.4545);
});

test('reparto de contratos entre TPs', () => {
  assert.deepEqual(repartir(1, [50, 30, 20]), [1, 0, 0]);
  assert.deepEqual(repartir(2, [50, 30, 20]), [1, 1, 0]);
  assert.deepEqual(repartir(10, [50, 30, 20]), [5, 3, 2]);
  const r = repartir(7, [50, 30, 20]);
  assert.equal(r.reduce((a, b) => a + b, 0), 7);
});

test('plan LONG: niveles, riesgo, apalancamiento y liquidación', () => {
  const p = calcularPlan({ lado: 'LONG', entrada: 100, atr15: 0.5, soporte: 99.4, resistencia: 101, contrato: SOL, capital: 10, nivel: 'MEDIA', cfg });
  assert.ok(p.viable);
  assert.ok(p.sl < 100 && p.tps[0].precio > 100 && p.tps[1].precio > p.tps[0].precio && p.tps[2].precio > p.tps[1].precio);
  assert.equal(p.sl, 99.27); // soporte 99.4 - 0.25 ATR
  assert.ok(p.riesgo_usdt <= 10 * cfg.riesgo_por_confianza.MEDIA / 100 + 1e-9, `riesgo ${p.riesgo_usdt}`);
  assert.ok(p.apalancamiento <= cfg.apalancamiento_max);
  assert.ok(p.margen <= 10 * cfg.margen_por_confianza.MEDIA / 100 + 1e-9);
  // la liquidación queda al menos 2x más lejos que el SL
  assert.ok(100 - p.liquidacion >= 2 * (100 - p.sl) - 0.02, `liq ${p.liquidacion}`);
  assert.deepEqual(p.tps.map((t) => t.cerrar_pct), [50, 30, 20]);
  assert.equal(p.tps.reduce((s, t) => s + t.contratos, 0), p.contratos);
  assert.ok(p.escenarios.sl_directo < 0 && p.escenarios.todos_los_tps > p.escenarios.tp1_y_luego_be);
});

test('plan SHORT es el espejo', () => {
  const p = calcularPlan({ lado: 'SHORT', entrada: 100, atr15: 0.5, soporte: 99, resistencia: 100.6, contrato: SOL, capital: 10, nivel: 'ALTA', cfg });
  assert.equal(p.sl, 100.73);
  assert.ok(p.tps[0].precio < 100 && p.tps[2].precio < p.tps[1].precio);
  assert.ok(p.liquidacion > p.sl);
});

test('más confianza = más riesgo; el tope del 10 % se respeta', () => {
  const base = { lado: 'LONG', entrada: 100, atr15: 0.5, soporte: null, resistencia: null, contrato: SOL, capital: 100, cfg };
  const alta = calcularPlan({ ...base, nivel: 'ALTA' }), baja = calcularPlan({ ...base, nivel: 'BAJA' });
  assert.ok(alta.riesgo_usdt > baja.riesgo_usdt);
  assert.ok(baja.margen <= 50 + 1e-9);
  const loca = calcularPlan({ ...base, nivel: 'ALTA', cfg: { ...cfg, riesgo_por_confianza: { ALTA: 50, MEDIA: 5, BAJA: 2 } } });
  assert.ok(loca.riesgo_pct_real <= cfg.riesgo_max_pct + 0.01);
});

test('objetivo irreal se dice claramente', () => {
  const p = calcularPlan({ lado: 'LONG', entrada: 100, atr15: 0.5, soporte: null, resistencia: null, contrato: SOL, capital: 10, nivel: 'MEDIA', cfg, objetivo: 10 });
  assert.equal(p.objetivo.alcanzable, false);
  assert.match(p.objetivo.mensaje, /tope/);
});

test('capital insuficiente para el contrato mínimo', () => {
  const BTC = { contractSize: 1, minVol: 1, maxLeverage: 500, priceUnit: 0.1, takerFeeRate: 0.0002, makerFeeRate: 0, maintenanceMarginRate: 0.001 };
  const p = calcularPlan({ lado: 'LONG', entrada: 75000, atr15: 70, soporte: null, resistencia: null, contrato: BTC, capital: 10, nivel: 'ALTA', cfg });
  assert.equal(p.viable, false);
  assert.match(p.motivo, /Capital insuficiente/);
});

test('simulación: reproducible y coherente', () => {
  let pr = 100;
  const velas = Array.from({ length: 600 }, (_, i) => {
    const o = pr, c = pr * (1 + Math.sin(i * 1.7) * 0.003);
    pr = c;
    return { o, h: Math.max(o, c) * 1.001, l: Math.min(o, c) * 0.999, c };
  });
  const args = { velas, lado: 'LONG', entrada: 100, sl: 99.5, tps: [100.5, 101, 101.5], horizonte: 96, n: 2000, semilla: 3 };
  const a = simular(args), b = simular(args);
  assert.deepEqual(a, b);
  assert.ok(Math.abs(a.prob.tp1 + a.prob.sl_antes_tp1 + a.prob.nada - 100) < 0.2);
  assert.ok(a.prob.tp1 >= a.prob.tp2 && a.prob.tp2 >= a.prob.tp3);
  assert.ok(a.espera_max_min == null || a.espera_max_min % 5 === 0);
  assert.throws(() => simular({ ...args, velas: velas.slice(0, 50) }), /Pocas velas/);
});

test('diario: reglas de protección', () => {
  const ahora = Date.parse('2026-11-07T15:00:00Z');
  const op = (pnl, h) => ({ fecha: new Date(ahora - h * 3600e3).toISOString(), pnl, simbolo: 'SOL' });
  const c = { ...cfg, zona_horaria: 'UTC' };
  let e = estadoDiario({ capital_inicial: 10, operaciones: [op(1, 3), op(-0.4, 2), op(-0.4, 1)] }, c, ahora);
  assert.equal(e.capital, 10.2);
  assert.equal(e.perdidas_seguidas, 2);
  assert.equal(e.factor_riesgo, 0.5);
  assert.equal(e.bloqueo, null);
  e = estadoDiario({ capital_inicial: 10, operaciones: [op(-0.3, 3), op(-0.3, 2), op(-0.3, 1)] }, c, ahora);
  assert.match(e.bloqueo, /pérdidas seguidas/);
  e = estadoDiario({ capital_inicial: 10, operaciones: [op(-2, 1)] }, c, ahora);
  assert.match(e.bloqueo, /límite/);
  e = estadoDiario({ capital_inicial: 10, operaciones: [op(-2, 30)] }, c, ahora);
  assert.equal(e.bloqueo, null, 'una pérdida de ayer no bloquea hoy');
});

test('formato: duraciones y números', () => {
  assert.equal(parseDuracion('5m'), 5);
  assert.equal(parseDuracion('1h30m'), 90);
  assert.equal(parseDuracion('2h'), 120);
  assert.equal(parseDuracion('45'), 45);
  assert.equal(numero('10usdt', 'x'), 10);
  assert.equal(numero('2,5', 'x'), 2.5);
  assert.throws(() => parseDuracion('mañana'));
});

test('noticias: sentimiento y filtro por moneda', () => {
  assert.ok(sentimientoTexto('Solana price surges to record high') > 0);
  assert.ok(sentimientoTexto('Exchange hacked, funds drained') < 0);
  assert.equal(sentimientoTexto('Gamers again wait for the path'), 0); // "again" no es "gain", "path" no es "ath"
  const t = Date.parse('2026-11-07T12:00:00Z');
  const items = [
    { titulo: 'Solana DEX exploit drains $5M', resumen: '', fecha: t - 3600e3, fuente: 'x' },
    { titulo: 'New solution for payments', resumen: '', fecha: t - 3600e3, fuente: 'x' },
    { titulo: 'Fed holds rates steady', resumen: '', fecha: t - 7200e3, fuente: 'x' },
  ];
  const r = filtrar(items, 'SOL', { desde: t - 86400e3 });
  assert.equal(r.propias.length, 1);
  assert.equal(r.macro.length, 1);
  assert.ok(r.evento_riesgo);
  assert.ok(r.sentimiento < 0);
});
