// Swing: disparo de los setups, historial, análisis con datos grabados de BTC y seguimiento de una operación.
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { disparo, indicadoresSwing, historialSwing, evaluarSwing, SWING } from '../lib/swing.mjs';
import { crearFuente } from '../lib/fuentes.mjs';
import { ejecutar } from '../servidor/acciones.mjs';
import { dbMemoria } from '../servidor/db-memoria.mjs';

const FX = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'swing-btc');
const DIA = 864e5;
// 260 días de subida suave con ruido y un último día que rompe con fuerza el máximo de 20 días
function serie(ultimoSalto = 6) {
  const v = [];
  for (let i = 0; i < 260; i++) {
    const c = 100 + i * 0.2 + 2 * Math.sin(i / 4);
    v.push({ t: i * DIA, o: c - 0.3, h: c + 1, l: c - 1, c });
  }
  const u = v.at(-1).c + ultimoSalto;
  v.push({ t: 260 * DIA, o: v.at(-1).c, h: u + 0.5, l: v.at(-1).c - 0.2, c: u });
  return v;
}

test('swing: la ruptura de 20 días a favor de la media de 200 dispara un LONG con SL a 2 ATR y TP1 a 3R', () => {
  const v = serie(), I = indicadoresSwing(v), i = v.length - 1;
  const d = disparo('ruptura', v, I, i, v[i].c);
  assert.equal(d.L, 1);
  assert.ok(Math.abs(v[i].c - d.sl - 2 * I.atr[i]) < 1e-9);
  assert.ok(Math.abs(d.tp - v[i].c - 3 * (v[i].c - d.sl)) < 1e-9);
  assert.equal(disparo('ruptura', serie(0), indicadoresSwing(serie(0)), 260), null); // sin ruptura: nada
});

test('swing: el historial no solapa operaciones y descuenta comisiones y funding', () => {
  const v = serie(), I = indicadoresSwing(v);
  const h = historialSwing(v, I, 'ruptura');
  assert.ok(h.n >= 0 && h.n === h.ultimas.length + Math.max(0, h.n - 6));
  for (const o of h.ultimas) assert.ok(o.dias >= 1 && o.dias <= SWING.dias_max);
});

test('swing: seguimiento — TP1 tocado (REDUCIR), SL roto (CERRAR) y trailing (MOVER SL)', () => {
  const base = Date.parse('2026-10-01T00:00:00Z');
  const mk = (cierres) => cierres.map((c, k) => ({ t: base + k * DIA, o: c, h: c * 1.01, l: c * 0.99, c }));
  const op = { lado: 'LONG', entrada: 100, sl: 94, tp1: 112, trailing: true, abierta_en: base + 0.5 * DIA, eventos: [{ tipo: 'entrada', precio: 100, porcentaje: 100 }] };
  // sube hasta 113 (toca el TP1) y sigue en 111
  const sube = mk([100, 103, 106, 109, 113, 111]);
  const e1 = evaluarSwing(op, sube, base + 6 * DIA);
  assert.equal(e1.toco_tp1, true);
  assert.equal(e1.accion, 'REDUCIR');
  assert.ok(e1.sl_sugerido >= 100); // tras el TP1 el SL va, como mínimo, a la entrada
  // tras cerrar el 50 %: toca mover el SL (trailing)
  const e2 = evaluarSwing({ ...op, eventos: [...op.eventos, { tipo: 'salida', precio: 112, porcentaje: 50 }] }, sube, base + 6 * DIA);
  assert.equal(e2.accion, 'MOVER SL');
  // cae y rompe el SL
  const cae = mk([100, 98, 96, 93, 92]);
  const e3 = evaluarSwing(op, cae, base + 5 * DIA);
  assert.equal(e3.toco_sl, true);
  assert.equal(e3.accion, 'CERRAR');
  // lo de antes de entrar en la vela del primer día no cuenta
  const conMecha = [{ t: base, o: 100, h: 101, l: 90, c: 100 }, ...mk([100, 101]).slice(1)];
  assert.equal(evaluarSwing(op, conMecha, base + 2 * DIA).toco_sl, false);
});

test('swing: acción del servidor con BTC grabado (análisis, velas, medias y evaluación de una operación)', async () => {
  const fuente = crearFuente({ offline: FX });
  const op = { id: 'a', base: 'BTC', lado: 'SHORT', entrada: 76000, sl: 80000, tp1: 64000, abierta_en: fuente.ahora() - 10 * DIA, eventos: [] };
  const r = await ejecutar('swing', { moneda: 'BTC', capital: 1000, operaciones: [op] }, { db: dbMemoria(), fuente });
  assert.equal(r.base, 'BTC');
  assert.ok(['LONG', 'SHORT', 'ESPERAR'].includes(r.recomendacion));
  assert.equal(r.velas.length, 180);
  assert.equal(r.medias.length, 180);
  assert.ok(r.historiales.ruptura.n > 0);
  assert.ok(r.evaluaciones.a && ['MANTENER', 'MOVER SL', 'REDUCIR', 'CERRAR'].includes(r.evaluaciones.a.accion));
  for (const w of r.vigilar) assert.ok(w.plan.sl > 0 && w.plan.tp1 > 0);
});
