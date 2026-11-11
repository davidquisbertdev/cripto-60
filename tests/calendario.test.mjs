// Calendario económico (ForexFactory): clasificación, efecto en la señal, reacción de BTC y caché.
import test from 'node:test';
import assert from 'node:assert/strict';
import { clasificar, resumirCalendario, efectoCalendario, reaccion, leerCalendario } from '../lib/calendario.mjs';
import { calcularPlan } from '../lib/plan.mjs';
import { DEFAULTS } from '../lib/defaults.mjs';

const T0 = Date.parse('2026-11-10T13:30:00Z'); // IPC de EE. UU. (08:30 Nueva York)
const iso = (t) => new Date(t).toISOString();
const CRUDO = [
  { title: 'CPI m/m', country: 'USD', date: iso(T0), impact: 'High', forecast: '0.3%', previous: '0.6%' },
  { title: 'Core CPI m/m', country: 'USD', date: iso(T0), impact: 'High', forecast: '0.2%', previous: '0.3%' },
  { title: 'Unemployment Claims', country: 'USD', date: iso(T0 + 2 * 86400e3), impact: 'Medium', forecast: '194K', previous: '189K' },
  { title: 'ECB President Lagarde Speaks', country: 'EUR', date: iso(T0 + 86400e3), impact: 'Medium' },
  { title: 'German Trade Balance', country: 'EUR', date: iso(T0 - 3600e3), impact: 'Low' },
];

test('calendario: el IPC de EE. UU. es CRÍTICO, lo de impacto bajo se ignora', () => {
  const c = clasificar(CRUDO[0]);
  assert.equal(c.importancia, 'CRÍTICA');
  assert.equal(c.clase, 'inflacion');
  assert.equal(clasificar(CRUDO[2]).importancia, 'MEDIA');
  assert.equal(clasificar(CRUDO[3]), null); // Europa con impacto medio: no
  assert.equal(clasificar(CRUDO[4]), null);
});

test('calendario: un dato CRÍTICO dentro de la operación baja un nivel y −10', () => {
  const cal = resumirCalendario(CRUDO, T0 - 40 * 60e3);
  assert.equal(cal.proximo_importante.titulo, 'CPI m/m');
  const e = efectoCalendario(cal, T0 - 40 * 60e3, 60);
  assert.equal(e.bajar, 1);
  assert.equal(e.ajuste_conf, -10);
  assert.match(e.textos[0], /En 40 min sale Inflación de EE\. UU\./);
  // operación de 15 min que termina antes del dato (con 15 min de margen): no le afecta
  assert.equal(efectoCalendario(cal, T0 - 40 * 60e3, 15).bajar, 0);
  // recién salido: −5 y sigue bajando un nivel
  const tras = efectoCalendario(resumirCalendario(CRUDO, T0 + 10 * 60e3), T0 + 10 * 60e3, 60);
  assert.equal(tras.ajuste_conf, -5);
  assert.equal(tras.bajar, 1);
  // una hora después ya no cuenta
  assert.equal(efectoCalendario(resumirCalendario(CRUDO, T0 + 60 * 60e3), T0 + 60 * 60e3, 60).bajar, 0);
});

test('calendario: mide la reacción real de BTC tras el dato', () => {
  const velas = Array.from({ length: 30 }, (_, i) => {
    const t = T0 - 30 * 60e3 + i * 5 * 60e3, o = 75000 - Math.max(0, i - 6) * 150;
    return { t, o, h: o + 50, l: o - 200, c: o - 150 };
  });
  const r = reaccion(clasificar(CRUDO[0]), velas);
  assert.ok(r.cambio_15m_pct < 0 && r.cambio_60m_pct < r.cambio_15m_pct);
  assert.ok(r.min_pct < r.cambio_60m_pct);
});

test('calendario: con HTTP 429 usa la copia guardada de la semana', async () => {
  const guardada = { t: T0 - 3 * 3600e3, datos: CRUDO };
  const fuente = { offline: null, ahora: () => T0 - 30 * 60e3, json: async () => { throw new Error('HTTP 429'); } };
  const c = await leerCalendario(fuente, { cache: { leer: async () => guardada, guardar: async () => {} } });
  assert.equal(c.leido, guardada.t);
  assert.equal(c.eventos[0].importancia, 'CRÍTICA');
  // copia fresca: no se pide nada
  let pedidas = 0;
  const f2 = { ...fuente, json: async () => { pedidas++; return CRUDO; } };
  await leerCalendario(f2, { cache: { leer: async () => ({ t: T0 - 40 * 60e3, datos: CRUDO }), guardar: async () => {} } });
  assert.equal(pedidas, 0);
});

test('objetivo: explica qué lo frena y cuánto capital haría falta', () => {
  const contrato = { priceUnit: 0.01, contractSize: 0.001, takerFeeRate: 0.0005, makerFeeRate: 0.0002, maxLeverage: 125, volUnit: 1, minVol: 1 };
  const p = calcularPlan({ lado: 'LONG', entrada: 100, atr: 0.3, soporte: 99, resistencia: 101, contrato, capital: 20, nivel: 'BAJA', cfg: { ...DEFAULTS }, objetivo: 30, slDist: 0.4 });
  assert.equal(p.objetivo.alcanzable, false);
  assert.ok(p.objetivo.alcanza < 30);
  assert.ok(p.objetivo.capital_necesario > 20);
  assert.match(p.objetivo.ayuda, /no la sube solo|margen/);
});
