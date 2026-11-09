// Las acciones de la web dan lo mismo que las skills, con datos grabados y sin red.
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Fuente } from '../lib/mexc.mjs';
import { ejecutar, configDe, ErrorUsuario } from './acciones.mjs';
import { dbMemoria } from './db-memoria.mjs';
import { cargarPosicion } from '../cripto-posicion/posicion.mjs';

const FX = (n) => path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'tests', 'fixtures', n);
const fx = (n) => new Fuente({ offline: FX(n) });

test('configDe: los ajustes del usuario nunca pasan los topes del motor', () => {
  const c = configDe({ apalancamiento_max: 125, riesgo_por_confianza: { ALTA: 50 }, max_perdida_dia_pct: 90, carpeta: '/etc' });
  assert.equal(c.apalancamiento_max, 125); // el apalancamiento lo elige el usuario
  assert.equal(configDe({ apalancamiento_max: 9000 }).apalancamiento_max, 500); // hasta el tope
  assert.equal(configDe({}).apalancamiento_max, 30);
  assert.equal(c.riesgo_por_confianza.ALTA, 10);
  assert.equal(c.max_perdida_dia_pct, 20);
  assert.equal(c.carpeta, 'trader'); // no editable
});

test('senal: genera, guarda y la posición la encuentra', async () => {
  const db = dbMemoria();
  const s = await ejecutar('senal', { moneda: 'near', capital: 10 }, { db, fuente: fx('near') });
  assert.equal(s.tipo, 'senal');
  assert.ok(['LONG', 'SHORT', 'NO OPERAR'].includes(s.recomendacion));
  assert.equal(db.senales.length, 1);
  const p = await ejecutar('posicion', { moneda: 'NEAR', hace: '6m' }, { db, fuente: fx('near-posicion') });
  assert.match(p.accion, /MANTENER|MOVER SL|REDUCIR|CERRAR|CERRADA/);
  assert.equal(p.senal_id, s.id);
});

test('senal: un freno del diario bloquea la orden', async () => {
  const ahora = fx('near').ahora();
  const ops = [1, 2, 3, 4].map((i) => ({ fecha: new Date(ahora - (10 - i) * 60e3).toISOString(), pnl: -0.3 }));
  const db = dbMemoria({ diario: { capital_inicial: 10, operaciones: ops } });
  const r = await ejecutar('senal', { moneda: 'NEAR', capital: 10 }, { db, fuente: fx('near') });
  assert.equal(r.bloqueado, true);
  assert.match(r.motivo, /pérdidas seguidas/);
});

test('errores de usuario: moneda vacía y capital inválido', async () => {
  const db = dbMemoria();
  await assert.rejects(() => ejecutar('senal', { moneda: '' }, { db, fuente: fx('near') }), ErrorUsuario);
  await assert.rejects(() => ejecutar('senal', { moneda: 'NEAR', capital: 'mucho' }, { db, fuente: fx('near') }), /capital/);
  await assert.rejects(() => ejecutar('borrar', {}, { db, fuente: fx('near') }), /desconocida/);
});

test('ballenas, noticias, escaner y estado', async () => {
  const db = dbMemoria();
  const b = await ejecutar('ballenas', { moneda: 'SOL' }, { db, fuente: fx('ballenas-sol') });
  assert.equal(b.base, 'SOL');
  const n = await ejecutar('noticias', { monedas: ['SOL'] }, { db, fuente: fx('sol') });
  assert.equal(n.monedas[0].moneda, 'SOL');
  const e = await ejecutar('escaner', { top: 25 }, { db, fuente: fx('escaner') });
  assert.ok(e.filas.length > 0);
  const st = await ejecutar('estado', {}, { db, fuente: fx('sol') });
  assert.equal(st.cfg.objetivo_usdt, 3);
});

test('posicion a mano: 1, 2 o 3 TPs con su reparto', () => {
  const cfg = configDe({});
  const p2 = cargarPosicion({ lado: 'long', entrada: 100, sl: 99, tp1: 101, tp2: 102, reparto: [70, 30], contratos: 10 }, cfg, 0, 'SOL_USDT', null);
  assert.deepEqual(p2.reparto, [70, 30, 0]);
  assert.deepEqual(p2.partes, [7, 3, 0]);
  const p1 = cargarPosicion({ lado: 'short', entrada: 100, sl: 101, tp1: 99, reparto: '100' }, cfg, 0, 'SOL_USDT', null);
  assert.deepEqual(p1.reparto, [100, 0, 0]);
  assert.throws(() => cargarPosicion({ lado: 'long', entrada: 100, sl: 99, tp1: 101, tp2: 102, tp3: 103, reparto: [50, 20, 20] }, cfg, 0, 'SOL_USDT', null), /sumen 100/);
});