import test from 'node:test';
import assert from 'node:assert/strict';
import { ema, rsi, atr, swings } from '../lib/indicadores.mjs';
import { simbolo, esCripto, cambio24h } from '../lib/mexc.mjs';
import { calcularPlan, redondear, repartir, decimales, stopLoss } from '../lib/plan.mjs';
import { simular } from '../lib/simulacion.mjs';
import { agrupar, gestionar, historialSenal } from '../lib/historial.mjs';
import { bollinger, puntuarReversion, decidirReversion } from '../lib/reversion.mjs';
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
  assert.equal(repartir(7, [50, 30, 20]).reduce((a, b) => a + b, 0), 7);
});

test('plan LONG: SL con espacio detrás del swing de 5m, riesgo, apalancamiento y liquidación', () => {
  const p = calcularPlan({ lado: 'LONG', entrada: 100, atr: 0.5, soporte: 99.6, resistencia: 101, contrato: SOL, capital: 20, nivel: 'MEDIA', cfg });
  assert.ok(p.viable);
  assert.equal(p.sl, 99.47); // soporte 99.6 - 0.25 ATR
  assert.ok(p.tps[0].precio > 100 && p.tps[1].precio > p.tps[0].precio && p.tps[2].precio > p.tps[1].precio);
  assert.deepEqual(p.tps.map((t) => t.r), cfg.tps_r);
  assert.deepEqual(p.tps.map((t) => t.cerrar_pct), [50, 25, 25]);
  assert.ok(p.riesgo_usdt <= (20 * cfg.riesgo_por_confianza.MEDIA) / 100 + 0.01, `riesgo ${p.riesgo_usdt}`);
  assert.ok(p.apalancamiento <= cfg.apalancamiento_max);
  assert.ok(p.margen <= (20 * cfg.margen_por_confianza.MEDIA) / 100 + 1e-9);
  assert.ok(100 - p.liquidacion >= 2 * (100 - p.sl) - 0.02, `liq ${p.liquidacion}`);
  assert.equal(p.tps.reduce((x, t) => x + t.contratos, 0), p.contratos);
  assert.ok(p.escenarios.sl_directo < 0 && p.escenarios.todos_los_tps > p.escenarios.tp1_y_luego_be);
  assert.ok(p.comisiones.tp1_cubre_x >= 3);
  assert.match(p.apalancamiento_razon, /SL a .* %/);
});

test('plan SHORT es el espejo', () => {
  const p = calcularPlan({ lado: 'SHORT', entrada: 100, atr: 0.5, soporte: 99, resistencia: 100.4, contrato: SOL, capital: 20, nivel: 'ALTA', cfg });
  assert.equal(p.sl, 100.53);
  assert.ok(p.tps[0].precio < 100 && p.tps[2].precio < p.tps[1].precio);
  assert.ok(p.liquidacion > p.sl);
});

test('SL: estructura lejana se limita y nunca baja del mínimo (con espacio)', () => {
  assert.equal(stopLoss({ lado: 'LONG', entrada: 100, atr: 0.5, soporte: 98, cfg }).dist, 1.1); // 2.2 ATR
  assert.equal(stopLoss({ lado: 'LONG', entrada: 100, atr: 0.5, soporte: 99.95, cfg }).dist, 0.45); // 0.9 ATR
  assert.equal(stopLoss({ lado: 'LONG', entrada: 100, atr: 0.01, soporte: null, cfg }).dist, 0.3); // 0.3 % mínimo
});

test('override de la distancia del SL (calibración)', () => {
  const p = calcularPlan({ lado: 'LONG', entrada: 100, atr: 0.5, soporte: null, resistencia: null, contrato: SOL, capital: 20, nivel: 'MEDIA', cfg, slDist: 0.45, slRegla: 'x' });
  assert.equal(p.sl, 99.55);
  assert.equal(p.sl_regla, 'x');
});

test('sin movimiento suficiente para cubrir comisiones = no viable', () => {
  const caro = { ...SOL, takerFeeRate: 0.001, makerFeeRate: 0.0005 };
  const p = calcularPlan({ lado: 'LONG', entrada: 100, atr: 0.05, soporte: null, resistencia: null, contrato: caro, capital: 20, nivel: 'ALTA', cfg });
  assert.equal(p.viable, false);
  assert.match(p.motivo, /comisión/);
});

test('apalancamiento por objetivo: menos margen = más apalancamiento, mismo objetivo', () => {
  const base = { lado: 'LONG', entrada: 100, atr: 0.4, soporte: null, resistencia: null, contrato: SOL, nivel: 'ALTA', cfg, objetivo: 3, slDist: 0.5 };
  const chico = calcularPlan({ ...base, capital: 30, margen: 20 });
  const grande = calcularPlan({ ...base, capital: 200, margen: 100 });
  assert.ok(chico.apalancamiento > grande.apalancamiento, `${chico.apalancamiento} vs ${grande.apalancamiento}`);
  for (const p of [chico, grande]) {
    assert.equal(p.limitante, 'objetivo');
    assert.ok(p.objetivo.alcanzable);
    assert.ok(Math.abs(p.escenarios.todos_los_tps - 3) < 0.3, `gana ${p.escenarios.todos_los_tps}`);
  }
  // SL más cerca = más apalancamiento para el mismo objetivo y la misma pérdida máxima
  const cerca = calcularPlan({ ...base, capital: 30, margen: 20, slDist: 0.35 });
  assert.ok(cerca.apalancamiento >= chico.apalancamiento);
});

test('el objetivo nunca rompe los frenos: pérdida máxima y apalancamiento seguro', () => {
  const base = { lado: 'LONG', entrada: 100, atr: 0.4, soporte: null, resistencia: null, contrato: SOL, cfg, objetivo: 10, slDist: 0.5 };
  const r = calcularPlan({ ...base, capital: 20, margen: 20, nivel: 'MEDIA' });
  assert.equal(r.limitante, 'riesgo');
  assert.equal(r.objetivo.alcanzable, false);
  assert.ok(r.riesgo_usdt <= 20 * 0.07 + 0.02);
  assert.match(r.objetivo.mensaje, /tope de pérdida/);
  const l = calcularPlan({ ...base, capital: 1000, margen: 5, nivel: 'ALTA', objetivo: 3 });
  assert.equal(l.limitante, 'apalancamiento');
  assert.ok(l.apalancamiento <= cfg.apalancamiento_max);
  assert.match(l.objetivo.mensaje, /necesitarías unos/);
});

test('más confianza = más riesgo; el tope del riesgo se respeta', () => {
  const base = { lado: 'LONG', entrada: 100, atr: 0.5, soporte: null, resistencia: null, contrato: SOL, capital: 100, cfg, objetivo: 0 };
  const alta = calcularPlan({ ...base, nivel: 'ALTA' }), baja = calcularPlan({ ...base, nivel: 'BAJA' });
  assert.ok(alta.riesgo_usdt > baja.riesgo_usdt);
  assert.ok(baja.margen <= 50 + 1e-9);
  const loca = calcularPlan({ ...base, nivel: 'ALTA', cfg: { ...cfg, riesgo_por_confianza: { ALTA: 50, MEDIA: 5, BAJA: 2 } } });
  assert.ok(loca.riesgo_pct_real <= cfg.riesgo_max_pct + 0.01);
});

test('capital insuficiente para el contrato mínimo', () => {
  const BTC = { contractSize: 1, minVol: 1, maxLeverage: 500, priceUnit: 0.1, takerFeeRate: 0.0002, makerFeeRate: 0, maintenanceMarginRate: 0.001 };
  const p = calcularPlan({ lado: 'LONG', entrada: 75000, atr: 70, soporte: null, resistencia: null, contrato: BTC, capital: 10, nivel: 'ALTA', cfg });
  assert.equal(p.viable, false);
  assert.match(p.motivo, /Capital insuficiente/);
});

const serie = (n = 600) => {
  let pr = 100;
  return Array.from({ length: n }, (_, i) => {
    const o = pr, c = pr * (1 + Math.sin(i * 1.7) * 0.002);
    pr = c;
    return { t: Date.parse('2026-11-06T00:00:00Z') + i * 60e3, o, h: Math.max(o, c) * 1.0008, l: Math.min(o, c) * 0.9992, c, v: 10 };
  });
};

test('simulación: reproducible, coherente y con cierre por tiempo', () => {
  const velas = serie();
  const args = { velas, lado: 'LONG', entrada: 100, sl: 99.8, tps: [100.2, 100.32, 100.44], horizonte: 25, minBarra: 1, limiteTP1: 15, n: 2000, semilla: 3 };
  const a = simular(args), b = simular(args);
  assert.deepEqual(a, b);
  const p = a.prob;
  assert.ok(Math.abs(p.tp1 + p.sl_antes_tp1 + p.cierre_por_tiempo + p.nada - 100) < 0.2);
  assert.ok(p.tp1 >= p.tp2 && p.tp2 >= p.tp3);
  assert.equal(a.horizonte_min, 25);
  assert.throws(() => simular({ ...args, velas: velas.slice(0, 50) }), /Pocas velas/);
});

test('historial: agrupar velas y gestionar una operación con velas reales', () => {
  const v1 = Array.from({ length: 12 }, (_, i) => ({ t: Date.parse('2026-11-07T10:00:00Z') + i * 60e3, o: 1, h: 1 + i, l: 0.5, c: 1, v: 1 }));
  const v5 = agrupar(v1, 5);
  assert.equal(v5.length, 3);
  assert.equal(v5[0].h, 5);
  assert.equal(v5[1].v, 5);
  const t = (h, l, c = 100) => ({ h, l, c });
  // TP1 en el minuto 2 (cierra 50 % a +1R), luego vuelve a la entrada: +0.5 R
  let g = gestionar([t(100.5, 99.8), t(101.1, 100.2), t(100.4, 99.9)], { lado: 'LONG', entrada: 100, sl: 99, tps: [101, 101.6, 102.2] });
  assert.equal(g.fin, 'stop movido');
  assert.equal(g.r, 0.5);
  // sin TP1 en 3 minutos -> cierre por tiempo al precio de cierre
  g = gestionar([t(100.3, 99.9, 100.2), t(100.3, 99.9, 100.1), t(100.3, 99.9, 100.3)], { lado: 'LONG', entrada: 100, sl: 99, tps: [101, 102, 103], limiteTP1: 3 });
  assert.equal(g.fin, 'tiempo');
  assert.ok(Math.abs(g.r - 0.3) < 1e-9);
  // SHORT que toca el SL
  g = gestionar([t(101.2, 99.9)], { lado: 'SHORT', entrada: 100, sl: 101, tps: [99, 98.4, 97.8] });
  assert.equal(g.fin, 'SL');
  assert.equal(g.r, -1);
});

test('historial de la señal sobre una serie', () => {
  const h = historialSenal(serie(2000), { lado: 'LONG', slATR: 0.7, umbral: 0 });
  assert.ok(h.n > 0);
  assert.ok(h.acierto_pct >= 0 && h.acierto_pct <= 100);
  assert.ok(h.minutos_medio <= 25);
});

test('reversión: precio estirado bajo la media = LONG, sobre la media = SHORT', () => {
  const base = Array.from({ length: 40 }, (_, i) => ({ t: i, o: 100, h: 100.3, l: 99.7, c: 100 + (i % 2 ? 0.2 : -0.2), v: 1 }));
  const giroUp = [{ o: 97, c: 97.2 }];
  const abajo = puntuarReversion(base, 97, giroUp);
  assert.equal(abajo.sesgo, 'LONG');
  assert.ok(abajo.z < -2 && abajo.score >= 0.35);
  assert.ok(abajo.razones.some((r) => /giro alcista/.test(r)));
  const arriba = puntuarReversion(base, 103, [{ o: 103.2, c: 103 }]);
  assert.equal(arriba.sesgo, 'SHORT');
  const cerca = puntuarReversion(base, 100.05, null);
  assert.ok(Math.abs(cerca.score) < 0.35, 'cerca de la media no hay setup');
  // contra una tendencia fuerte de 15m pierde fuerza
  const contra = puntuarReversion(base, 97, giroUp, -0.8);
  assert.ok(contra.score < abajo.score && contra.contra_tendencia);
  // nivel: lateral suma, sin setup = NO OPERAR
  assert.ok(decidirReversion(abajo, { lateral: true }).confianza > decidirReversion(abajo, { adx15: 30 }).confianza);
  assert.equal(decidirReversion(cerca).nivel, 'NO OPERAR');
  assert.ok(Math.abs(bollinger([1, 2, 3, 4, 5], 5).medio - 3) < 1e-9);
});

test('historial de la reversión sobre una serie', () => {
  const h = historialSenal(serie(2000), { lado: 'LONG', estrategia: 'reversion', slATR: 0.9, umbral: 0.2 });
  assert.ok(h.n >= 0);
  if (h.n) assert.ok(h.minutos_medio <= 25);
});

test('diario: reglas de protección y margen sugerido', () => {
  const ahora = Date.parse('2026-11-07T15:00:00Z');
  const op = (pnl, min) => ({ fecha: new Date(ahora - min * 60e3).toISOString(), pnl, simbolo: 'SOL' });
  const c = { ...cfg, zona_horaria: 'UTC' };
  let e = estadoDiario({ capital_inicial: 20, operaciones: [op(1, 90), op(-0.5, 20), op(-0.5, 10)] }, c, ahora);
  assert.equal(e.perdidas_seguidas, 2);
  assert.match(e.bloqueo, /pausa/, '2 pérdidas seguidas recientes: pausa');
  assert.equal(e.pausa_hasta, ahora - 10 * 60e3 + 30 * 60e3);
  e = estadoDiario({ capital_inicial: 20, operaciones: [op(-0.5, 90), op(-0.5, 60)] }, c, ahora);
  assert.equal(e.bloqueo, null, 'la pausa ya pasó');
  assert.equal(e.factor_riesgo, 0.5);
  e = estadoDiario({ capital_inicial: 100, operaciones: [1, 2, 3, 4].map((k) => op(-0.5, 300 - k * 60)) }, c, ahora);
  assert.match(e.bloqueo, /para por hoy/);
  e = estadoDiario({ capital_inicial: 20, operaciones: [op(-4, 120)] }, c, ahora);
  assert.match(e.bloqueo, /límite/);
  e = estadoDiario({ capital_inicial: 20, operaciones: [1500, 1490, 1480, 1470].map((m) => op(-0.1, m)) }, c, ahora);
  assert.equal(e.bloqueo, null, 'las pérdidas de ayer no cuentan en la racha de hoy');
  e = estadoDiario({ capital_inicial: 20, operaciones: [50, 40, 30, 20].map((m) => op(0.5, m)) }, c, ahora);
  assert.match(e.bloqueo, /última hora/);
  // margen sugerido: base + 50 % de lo ganado, nunca más que el capital
  e = estadoDiario({ capital_inicial: 20, operaciones: [op(10, 600)] }, c, ahora);
  assert.equal(e.margen_sugerido, 25);
  e = estadoDiario({ capital_inicial: 10, operaciones: [] }, c, ahora);
  assert.equal(e.margen_sugerido, 10);
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

test('BTC: correlación y beta de 5m frente a BTC', async () => {
  const { relacionConBTC } = await import('../lib/btc.mjs');
  const btc = [], alt = [];
  let pb = 75000, pa = 90;
  for (let i = 0; i < 120; i++) {
    const r = Math.sin(i * 1.7) * 0.002;
    pb *= 1 + r; pa *= 1 + 2 * r;
    btc.push({ t: i * 300e3, c: pb }); alt.push({ t: i * 300e3, c: pa });
  }
  const rel = relacionConBTC(alt, btc);
  assert.ok(rel.correlacion > 0.99);
  assert.ok(Math.abs(rel.beta - 2) < 0.05);
  assert.equal(relacionConBTC(alt.slice(0, 10), btc), null);
});

test('BTC: bloquea una reversión contra la tendencia mayor de BTC y avisa en tendencia', async () => {
  const { filtroBTC } = await import('../lib/btc.mjs');
  const rel = { correlacion: 0.72, beta: 1.7 };
  const bajista = { puntuacion: -0.16, tendencia_mayor: -0.41, lectura: 'NEUTRAL', presion: 0 };
  const rev = filtroBTC(bajista, rel, 1, 'reversion');
  assert.equal(rev.bloquea, true);
  assert.equal(rev.estado, 'en contra');
  const tend = filtroBTC(bajista, rel, 1, 'tendencia');
  assert.equal(tend.bloquea, false);
  assert.equal(tend.bajar, 1);
  assert.ok(tend.ajuste_conf < 0);
  assert.equal(filtroBTC(bajista, rel, -1, 'tendencia').estado, 'neutral');
  const alcista = { puntuacion: 0.45, tendencia_mayor: 0.3, lectura: 'ALCISTA', presion: 1 };
  assert.equal(filtroBTC(alcista, rel, 1).estado, 'a favor');
  assert.equal(filtroBTC(alcista, { correlacion: 0.2 }, -1).ajuste_conf, -5); // poco ligada: solo aviso
  assert.equal(filtroBTC(null, rel, 1).estado, 'sin datos');
});

test('Binance: ficha del contrato con el formato de MEXC y solo cripto', async () => {
  const { FuenteBinance } = await import('../lib/binance.mjs');
  const filtros = [{ filterType: 'PRICE_FILTER', tickSize: '0.0010' }, { filterType: 'LOT_SIZE', stepSize: '0.01', minQty: '0.01' }, { filterType: 'MIN_NOTIONAL', notional: '5' }];
  const c = FuenteBinance.contrato({ symbol: 'SOLUSDT', baseAsset: 'SOL', status: 'TRADING', contractType: 'PERPETUAL', underlyingType: 'COIN', filters: filtros });
  assert.equal(c.symbol, 'SOL_USDT');
  assert.equal(c.contractSize, 0.01);
  assert.equal(c.minVol, 1);
  assert.equal(c.priceUnit, 0.001);
  assert.equal(c.state, 0);
  assert.ok(esCripto(c));
  const accion = FuenteBinance.contrato({ symbol: 'TSLAUSDT', baseAsset: 'TSLA', status: 'TRADING', contractType: 'TRADIFI_PERPETUAL', underlyingType: 'EQUITY', filters: filtros });
  assert.equal(esCripto(accion), false);
});

test('fuentes: offline sin exchange grabado usa MEXC; por defecto Binance', async () => {
  const { crearFuente } = await import('../lib/fuentes.mjs');
  const path = await import('node:path');
  const { fileURLToPath } = await import('node:url');
  const fx = path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'sol');
  assert.equal(crearFuente({ offline: fx }).exchange, 'MEXC');
  assert.equal(crearFuente({}).exchange, 'BINANCE');
  assert.equal(crearFuente({ exchange: 'mexc' }).exchange, 'MEXC');
  assert.throws(() => crearFuente({ exchange: 'kraken' }), /no soportado/);
});

test('historial con filtro de BTC: separa las operaciones bloqueadas y las mide aparte', async () => {
  const velas = [];
  let p = 100;
  for (let i = 0; i < 1700; i++) { // caídas y rebotes: hay estiramientos para la reversión LONG
    const o = p; p = 100 + 3 * Math.sin(i / 40) + 0.4 * Math.sin(i / 3);
    velas.push({ t: i * 60e3, o, h: Math.max(o, p) + 0.05, l: Math.min(o, p) - 0.05, c: p, v: 10, cerrada: true });
  }
  const base = { lado: 'LONG', estrategia: 'reversion', slATR: 1.2, tpsR: [1, 1.8, 2.6], reparto: [50, 25, 25], limiteTP1: 30, duracion: 60 };
  const sin = historialSenal(velas, base);
  assert.ok(sin.n > 0);
  assert.equal(sin.filtro_btc, null);
  // BTC siempre bajista fuerte en 15m y 1h: bloquea todas las reversiones LONG
  const serie = (seg, n) => Array.from({ length: n }, (_, i) => { const c = 80000 - i * 40; return { t: i * seg * 1000, o: c + 40, h: c + 60, l: c - 20, c, v: 1, cerrada: true }; });
  const series = { c1: null, c5: serie(300, 400), c15: serie(900, 300), c1h: serie(3600, 300) };
  const con = historialSenal(velas, { ...base, btc: { series, rel: { correlacion: 0.8 } } });
  assert.ok(con.filtro_btc.evitadas > 0);
  assert.ok(con.n < sin.n);
  assert.ok(con.filtro_btc.r_medio_sin_filtro != null);
});

test('repartir: 1, 2 o 3 TPs y TPs con 0 %', () => {
  assert.deepEqual(repartir(10, [100]), [10]);
  assert.deepEqual(repartir(10, [70, 30]), [7, 3]);
  assert.deepEqual(repartir(3, [100, 0, 0]), [3, 0, 0]);
  assert.deepEqual(repartir(1, [50, 50]), [1, 0]);
});
