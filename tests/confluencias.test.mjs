// Fibonacci, CVD + open interest y mapa de liquidaciones: datos sintéticos y los grabados de NEAR.
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fibDe, efectoFib, entradaFib } from '../lib/fibonacci.mjs';
import { leerFlujo, efectoFlujo, analizarFlujo } from '../lib/flujo.mjs';
import { mapaLiquidaciones, efectoLiquidaciones, liqPrecio } from '../lib/liquidaciones.mjs';
import { Fuente } from '../lib/mexc.mjs';
import { analizarSimbolo } from '../lib/motor.mjs';
import { generarSenal, confluencias, CONFLUENCIA_MAX } from '../cripto-senal/senal.mjs';
import { DEFAULTS } from '../lib/defaults.mjs';

const FX = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures');
const vela = (t, o, h, l, c, v = 100, tb = 50, oi = null) => ({ t, o, h, l, c, v, tb, oi });

// impulso alcista de 100 a 110 en 40 velas, luego retroceso hasta `hasta`
function impulso(hasta) {
  const v = [];
  for (let i = 0; i < 6; i++) { const c = 102 - (2 * (i + 1)) / 7; v.push(vela(i - 6, c + 0.1, c + 0.15, c - 0.15, c)); } // bajada previa: el mínimo es un giro
  for (let i = 0; i < 40; i++) { const c = 100 + (10 * i) / 39; v.push(vela(i, c - 0.1, c + 0.15, c - 0.15, c)); }
  for (let i = 0; i < 15; i++) { const c = 110 - ((110 - hasta) * (i + 1)) / 15; v.push(vela(40 + i, c + 0.1, c + 0.15, c - 0.15, c)); }
  return v;
}

test('Fibonacci: mide el retroceso del último impulso y marca la zona dorada', () => {
  const v = impulso(104.5); // retrocede ~55 %
  const f = fibDe(v, 104.5, 0.5, { marco: '5m' });
  assert.equal(f.direccion, 'alcista');
  assert.equal(f.estado, 'zona dorada');
  assert.ok(f.zona_dorada.desde > f.zona_dorada.hasta); // 50 % por encima del 61.8 % en un impulso alcista
  const e = efectoFib({ '5m': f }, 'LONG');
  assert.equal(e.ajuste_conf, 5);
  assert.equal(efectoFib({ '5m': f }, 'SHORT').ajuste_conf, -5);
  // impulso roto: retroceso de más del 78.6 %
  const roto = fibDe(impulso(101), 101, 0.5);
  assert.equal(roto.estado, 'invalidado');
  assert.equal(efectoFib({ '15m': roto }, 'LONG').ajuste_conf, -5);
});

test('Fibonacci: entrada limit paciente entre el precio y el SL', () => {
  const f = fibDe(impulso(107), 107, 0.5); // retroceso leve: el 50 % (≈105) queda por debajo
  const e = entradaFib({ '5m': f }, 'LONG', 107, 103, 0.5);
  assert.ok(e && e.precio < 107 && e.precio > 103);
  assert.equal(entradaFib({ '5m': f }, 'LONG', 107, 106, 0.5), null); // el nivel cae detrás del SL
});

// 60 velas de 5 min; las 12 últimas con la subida/bajada y el OI/CVD indicados
function serieFlujo({ dPrecio, dOI, comprado }) {
  const v = [];
  for (let i = 0; i < 60; i++) {
    const k = Math.max(0, i - 47) / 12;
    const c = 100 * (1 + (dPrecio / 100) * k);
    v.push(vela(i * 300e3, c, c * 1.001, c * 0.999, c, 1000, i >= 48 ? 1000 * comprado : 500, 1e6 * (1 + (dOI / 100) * k)));
  }
  return v;
}

test('CVD + OI: subida sana, squeeze de shorts y efecto en la señal', () => {
  const sana = leerFlujo(serieFlujo({ dPrecio: 1, dOI: 2, comprado: 0.7 }));
  assert.equal(sana.regimen, 'subida sana');
  assert.equal(efectoFlujo(sana, 'LONG').ajuste_conf, 5);
  assert.equal(efectoFlujo(sana, 'SHORT').ajuste_conf, -5);
  const squeeze = leerFlujo(serieFlujo({ dPrecio: 1, dOI: -2, comprado: 0.55 }));
  assert.equal(squeeze.regimen, 'cierre de shorts');
  assert.equal(efectoFlujo(squeeze, 'LONG').ajuste_conf, 0); // subida débil: no suma
});

test('Liquidaciones: precio de liquidación y mapa por tramos', () => {
  assert.ok(Math.abs(liqPrecio(100, 10, 1) - 90.5) < 1e-9);
  assert.ok(Math.abs(liqPrecio(100, 10, -1) - 109.5) < 1e-9);
  // OI que sube en cada vela a 100: longs (casi todo comprado) que se liquidan por debajo
  const v = Array.from({ length: 40 }, (_, i) => vela(i * 300e3, 100, 100.1, 99.9, 100, 1000, 800, 1e6 + i * 1e4));
  const m = mapaLiquidaciones(v, 100, { rango: 12, paso: 0.5 });
  assert.ok(m.abajo_3pct_usd > m.arriba_3pct_usd); // a 100x los longs se liquidan a ~1.5 % abajo
  assert.ok(m.asimetria < 0);
  assert.ok(m.zona_abajo.precio < 100);
  const e = efectoLiquidaciones(m, 'LONG');
  assert.ok(e.ajuste_conf <= 0);
  for (const t of m.tramos) { if (t.precio > 100) assert.equal(t.longs_usd, 0); if (t.precio < 100) assert.equal(t.shorts_usd, 0); }
});

test('NEAR grabado: la señal trae Fibonacci, CVD/OI, liquidaciones y confluencias acotadas', async () => {
  const fuente = new Fuente({ offline: path.join(FX, 'near') });
  const f = await analizarFlujo(fuente, 'NEAR');
  assert.equal(f.simbolo, 'NEARUSDT');
  assert.ok(f.serie.length > 50 && f.oi_pct != null);
  const a = await analizarSimbolo(fuente, 'NEAR');
  assert.ok(a.fib && a.flujo && a.liquidaciones);
  for (const lado of ['LONG', 'SHORT']) {
    const c = confluencias(a, lado, 'tendencia');
    assert.ok(Math.abs(c.ajuste_conf) <= CONFLUENCIA_MAX);
  }
  const s = await generarSenal(a, { capital: 10, diario: null }, { ...DEFAULTS });
  assert.ok(s.flujo && !('velas' in s.flujo));
  assert.ok(s.liquidaciones.tramos.length > 0);
  assert.ok(s.confluencias && Math.abs(s.confluencias.ajuste) <= CONFLUENCIA_MAX);
});
