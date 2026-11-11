// Predicción de MEXC (Up/Down de 5 y 15 min): cajas, modelo y veredicto, con datos reales grabados (sin red).
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Fuente } from '../lib/mexc.mjs';
import {
  cajasReloj, normalAcum, seriePorSegundo, proyectarIndice, probabilidadCaja, veredictoPred, valorEsperado, precioMaximo,
  indiceTeorico, resumenCerradas, cajaDeEvento, VENTANA_S, RETRASO_S, NIVELES_PRED,
} from '../lib/prediccion.mjs';
import { ejecutar, ErrorUsuario } from '../servidor/acciones.mjs';
import { dbMemoria } from '../servidor/db-memoria.mjs';

const FX = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'prediccion');
const fx = () => new Fuente({ offline: FX });
// spot plano en `precio` durante n segundos desde t0, con un salto a `luego` en el segundo `en`
const plano = (t0, n, precio, en = Infinity, luego = precio) => seriePorSegundo(Array.from({ length: n }, (_, i) => [t0 + i * 1000, 0, 0, 0, i >= en ? luego : precio, 1, 0, 0, 0, 0.5]));

test('cajasReloj: alineadas al reloj, 5 antes, la actual y 5 después', () => {
  const ahora = Date.UTC(2026, 10, 11, 18, 42, 30);
  const c5 = cajasReloj(ahora, 5), c15 = cajasReloj(ahora, 15);
  assert.equal(c5.length, 11);
  assert.deepEqual(c5.map((c) => c.estado), [...Array(5).fill('cerrada'), 'actual', ...Array(5).fill('proxima')]);
  assert.equal(new Date(c5[5].inicio).toISOString(), '2026-11-11T18:40:00.000Z');
  assert.equal(new Date(c5[6].inicio).toISOString(), '2026-11-11T18:45:00.000Z');
  assert.equal(new Date(c15[5].inicio).toISOString(), '2026-11-11T18:30:00.000Z');
  assert.equal(new Date(c15[6].inicio).toISOString(), '2026-11-11T18:45:00.000Z');
  assert.equal(c15[5].fin - c15[5].inicio, 900e3);
});

test('normalAcum', () => {
  assert.ok(Math.abs(normalAcum(0) - 0.5) < 1e-6);
  assert.ok(Math.abs(normalAcum(1.96) - 0.975) < 1e-3);
  assert.ok(Math.abs(normalAcum(-1) - 0.1587) < 1e-3);
});

test('el índice es la media de 60 s del spot con 5 s de retraso', () => {
  const t0 = 1.79e12, S = plano(t0, 400, 100, 200, 110); // salta de 100 a 110 en el segundo 200
  assert.equal(indiceTeorico(S, t0 + 190e3), 100);
  // 30 s después del salto + el retraso, el índice va por la mitad del camino
  assert.ok(Math.abs(indiceTeorico(S, t0 + (200 + RETRASO_S + VENTANA_S / 2 - 1) * 1000) - 105) < 0.2);
  assert.equal(indiceTeorico(S, t0 + 300e3), 110);
});

test('proyectarIndice: lo ya ocurrido cuenta y la incertidumbre se cierra al final', () => {
  const t0 = 1.79e12, S = plano(t0, 400, 100, 200, 110), fin = t0 + 300e3;
  const lejos = proyectarIndice(S, t0 + 210e3, fin, 0.1);   // faltan 90 s: toda la ventana es futura
  const dentro = proyectarIndice(S, t0 + 270e3, fin, 0.1);  // faltan 30 s: más de la mitad ya ocurrió
  const hecho = proyectarIndice(S, t0 + 296e3, fin, 0.1);   // la ventana [fin−64, fin−5] ya pasó
  assert.equal(lejos.esperado, 110);
  assert.equal(lejos.conocido_pct, 0);
  assert.ok(dentro.sd < lejos.sd && dentro.conocido_pct > 50);
  assert.equal(hecho.sd, 0);
  assert.equal(hecho.esperado, 110);
});

test('probabilidadCaja: el spot ya por encima de la base da ventaja a Up antes de que el índice lo muestre', () => {
  const t0 = 1.79e12, S = plano(t0, 400, 100, 200, 100.5), caja = { inicio: t0 + 120e3, fin: t0 + 420e3 };
  // justo tras el salto el índice aún marca 100 (la base), pero el spot ya está en 100.5
  const p = probabilidadCaja(S, t0 + 205e3, caja, 0.02, { base: 100 });
  assert.ok(p.p_up > 0.7, `Up ${p.p_up}`);
  assert.ok(Math.abs(p.p_up + p.p_down - 1) < 1e-9);
  // una caja lejana sin base: moneda al aire
  const lejos = probabilidadCaja(S, t0 + 205e3, { inicio: t0 + 900e3, fin: t0 + 1200e3 }, 0.02);
  assert.ok(Math.abs(lejos.p_up - 0.5) < 0.01 && !lejos.base_fija);
});

test('veredicto: acertar el lado no basta, hay que pagar menos de lo que vale', () => {
  const prob = { p_up: 0.9, p_down: 0.1, conocido_pct: 0, base_fija: true };
  const barato = veredictoPred(prob, { up: { compra: 0.7, venta: 0.72 }, down: { compra: 0.27, venta: 0.29 } }, { faltan_s: 120 });
  assert.equal(barato.veredicto, 'UP');
  assert.equal(barato.nivel, 'ALTA');
  assert.ok(barato.valor_esperado_pct > 5);
  const caro = veredictoPred(prob, { up: { compra: 0.9, venta: 0.92 }, down: { compra: 0.07, venta: 0.09 } }, { faltan_s: 120 });
  assert.equal(caro.veredicto, 'NO OPERAR');
  assert.equal(caro.lado_probable, 'UP');
  assert.match(caro.razones[0], /ya lo descuenta/);
  assert.equal(veredictoPred({ ...prob, p_up: 0.55, p_down: 0.45 }, null, { faltan_s: 120 }).veredicto, 'NO OPERAR');
  assert.equal(veredictoPred(prob, null, { faltan_s: 3 }).veredicto, 'NO OPERAR'); // sin tiempo para entrar
  const sinPrecio = veredictoPred({ ...prob, p_up: 0.2, p_down: 0.8 }, null, { faltan_s: 120 });
  assert.equal(sinPrecio.veredicto, 'DOWN');
  assert.ok(sinPrecio.precio_maximo < 0.8);
  assert.ok(Math.abs(valorEsperado(0.9, 0.72) - (0.9 / 0.72 - 1.025)) < 1e-9);
  assert.ok(precioMaximo(0.9) < 0.9 && precioMaximo(0.9) > 0.8);
  assert.ok(NIVELES_PRED.ALTA > NIVELES_PRED.MEDIA && NIVELES_PRED.MEDIA > NIVELES_PRED.BAJA);
});

test('cajaDeEvento y resumenCerradas', () => {
  const c = cajaDeEvento({ id: 1, as: 'ETH', sp: 900, st: 1000, et: 901000, bsp: '2000.5', skp: '2000.5', v: '10', tfr: '0.025', ers: [{ rn: 'Up', bp: '0.4', ap: '0.42' }, { rn: 'Down', bp: '0.58', ap: '0.6' }] });
  assert.equal(c.plazo_min, 15);
  assert.equal(c.resultado, 'DOWN'); // el empate es Down
  assert.deepEqual(c.up, { compra: 0.4, venta: 0.42 });
  const r = resumenCerradas([{ resultado: 'UP' }, { resultado: 'UP' }, { resultado: 'DOWN' }, { resultado: 'UP' }]);
  assert.deepEqual(r.racha, { lado: 'UP', n: 2 });
  assert.equal(r.up, 3);
});

test('acción prediccion: 5 cerradas con resultado, la actual con base y precios, y las próximas', async () => {
  const l = await ejecutar('prediccion', { moneda: 'btc', plazo: 5 }, { db: dbMemoria(), fuente: fx() });
  assert.equal(l.moneda, 'BTC');
  assert.equal(l.cajas.length, 11);
  const cerradas = l.cajas.filter((c) => c.estado === 'cerrada'), actual = l.cajas.find((c) => c.estado === 'actual'), prox = l.cajas.filter((c) => c.estado === 'proxima');
  assert.equal(cerradas.length, 5);
  for (const c of cerradas) { assert.ok(c.base > 0 && c.cierre > 0); assert.equal(c.resultado, c.cierre > c.base ? 'UP' : 'DOWN'); }
  // la base de cada caja es el cierre de la anterior
  for (let i = 1; i < cerradas.length; i++) assert.equal(cerradas[i].base, cerradas[i - 1].cierre);
  assert.equal(actual.base, cerradas.at(-1).cierre);
  assert.ok(actual.mercado.up.venta > 0 && actual.mercado.down.venta > 0);
  assert.ok(actual.p_up >= 0 && actual.p_up <= 100);
  assert.equal(prox.length, 5);
  for (const c of prox) { assert.equal(c.base, null); assert.equal(c.resultado, null); }
  assert.ok(l.resumen.n > 100 && l.indice.precio > 0);
});

test('acción prediccion_analisis: veredicto de la caja actual, detalle de una cerrada y una próxima', async () => {
  const db = dbMemoria(), ahora = fx().ahora(), inicio = Math.floor(ahora / 300e3) * 300e3;
  const a = await ejecutar('prediccion_analisis', { moneda: 'BTC', plazo: 5, inicio }, { db, fuente: fx() });
  assert.ok(['UP', 'DOWN', 'NO OPERAR'].includes(a.veredicto));
  assert.ok(Math.abs(a.proyeccion.p_up + a.proyeccion.p_down - 100) < 0.2);
  assert.equal(a.faltan_s, Math.round((inicio + 300e3 - ahora) / 1000));
  assert.ok(a.factores.filter((x) => x.cuenta).length >= 3);
  assert.ok(a.exchanges.length >= 4, 'precios de varios exchanges');
  assert.ok(a.repaso.muestras > 50 && a.serie.length > 20);
  // el veredicto respeta el precio de MEXC: solo entra con ventaja
  if (a.veredicto !== 'NO OPERAR') assert.ok(a.valor_esperado_pct >= 5);
  // diferencia USD/USDT medida: el índice y el spot ajustado quedan a pocos pb
  assert.ok(Math.abs(a.indice - a.spot) / a.indice < 0.002);

  const c = await ejecutar('prediccion_analisis', { moneda: 'BTC', plazo: 5, inicio: inicio - 300e3 }, { db, fuente: fx() });
  assert.equal(c.caja.estado, 'cerrada');
  assert.equal(c.caja.resultado, c.caja.cierre > c.caja.base ? 'UP' : 'DOWN');
  assert.ok(c.recorrido.max >= c.recorrido.min && c.serie.length > 50);

  const p = await ejecutar('prediccion_analisis', { moneda: 'BTC', plazo: 5, inicio: inicio + 600e3 }, { db, fuente: fx() });
  assert.equal(p.caja.estado, 'proxima');
  assert.equal(p.veredicto, 'NO OPERAR'); // sin base fijada, una caja lejana es moneda al aire

  await assert.rejects(ejecutar('prediccion', { moneda: 'SOL' }, { db, fuente: fx() }), ErrorUsuario);
  await assert.rejects(ejecutar('prediccion', { moneda: 'BTC', plazo: 10 }, { db, fuente: fx() }), ErrorUsuario);
});
