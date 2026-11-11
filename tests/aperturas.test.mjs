// Agenda de aperturas de mercado (con horario de verano) y su efecto en la señal.
import test from 'node:test';
import assert from 'node:assert/strict';
import { APERTURAS, ocurrencias, agenda, efectoAperturas, instanteLocal } from '../lib/aperturas.mjs';

const ap = (c) => APERTURAS.find((x) => x.clave === c);
const iso = (t) => new Date(t).toISOString();

test('aperturas: la bolsa de Nueva York sigue el horario de verano de EE. UU.', () => {
  // octubre (EDT, UTC-4): 09:30 NY = 13:30 UTC · noviembre tras el cambio (EST, UTC-5): 14:30 UTC
  assert.equal(iso(instanteLocal(2026, 9, 14, 9, 30, 'America/New_York')), '2026-10-14T13:30:00.000Z');
  assert.equal(iso(instanteLocal(2026, 10, 12, 9, 30, 'America/New_York')), '2026-11-12T14:30:00.000Z');
  // Hong Kong no cambia: 09:30 HKT = 01:30 UTC
  assert.equal(iso(instanteLocal(2026, 10, 12, 9, 30, 'Asia/Hong_Kong')), '2026-11-12T01:30:00.000Z');
});

test('aperturas: sin fines de semana (salvo la reapertura del CME el domingo)', () => {
  const desde = Date.parse('2026-11-13T00:00:00Z'), hasta = Date.parse('2026-11-17T00:00:00Z'); // vie a lun
  const nyse = ocurrencias(ap('nyse'), desde, hasta).map(iso);
  assert.deepEqual(nyse, ['2026-11-13T14:30:00.000Z', '2026-11-16T14:30:00.000Z']);
  const cme = ocurrencias(ap('cme'), desde, hasta).map(iso);
  assert.ok(cme.includes('2026-11-15T23:00:00.000Z')); // domingo 18:00 NY
  assert.ok(!cme.includes('2026-11-13T23:00:00.000Z')); // viernes: no reabre
});

test('aperturas: agenda ordenada, con la que está dando su golpe', () => {
  const t = Date.parse('2026-11-12T14:32:00Z'); // 2 min después de abrir Nueva York
  const a = agenda(t, { horas: 2 });
  assert.equal(a[0].clave, 'nyse');
  assert.equal(a[0].estado, 'golpe');
  assert.equal(a[1].clave, 'datos_1000');
  assert.ok(agenda(t, { horas: 2, importancia: ['MEDIA'] }).every((x) => x.importancia === 'MEDIA'));
});

test('aperturas: en la señal avisan y restan 5 si una fuerte cae dentro de la operación', () => {
  const t = Date.parse('2026-11-12T14:10:00Z'); // 20 min antes de abrir Nueva York
  const e = efectoAperturas(t, 60);
  assert.equal(e.ajuste_conf, -5);
  assert.ok(e.en_ventana.includes('nyse'));
  assert.match(e.textos.find((x) => x.includes('bolsa de Nueva York')), /En 20 min/);
  // operación de 15 min: termina antes de la apertura
  assert.equal(efectoAperturas(t, 15).ajuste_conf, 0);
  // si el calendario ya avisa de un dato a esa hora, no se repite
  const cal = { eventos: [{ fecha: Date.parse('2026-11-12T13:30:00Z'), importancia: 'CRÍTICA' }] };
  const antesDato = Date.parse('2026-11-12T13:20:00Z');
  assert.ok(!efectoAperturas(antesDato, 30, { calendario: cal }).textos.some((x) => x.includes('08:30')));
  assert.ok(efectoAperturas(antesDato, 30).textos.some((x) => x.includes('08:30')));
});
