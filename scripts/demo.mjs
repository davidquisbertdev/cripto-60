#!/usr/bin/env node
// Genera los datos del modo demo de la web ejecutando el motor real sobre los datos grabados de tests/fixtures.
// El diario de demo es sintético (operaciones inventadas para mostrar la pantalla) y la web lo marca así.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Fuente } from '../lib/mexc.mjs';
import { ejecutar } from '../servidor/acciones.mjs';
import { dbMemoria } from '../servidor/db-memoria.mjs';
import { resumenSenal } from '../cripto-escaner/escaner.mjs';

const RAIZ = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const fx = (n) => new Fuente({ offline: path.join(RAIZ, 'tests', 'fixtures', n) });
const zona = 'America/La_Paz';

const ahora = fx('near').ahora();
const min = 60e3;
// Diario sintético: capital inicial 20 USDT, una semana de operaciones pequeñas.
const pnl = [0.42, -0.31, 0.65, 0.18, -0.27, 0.51, -0.4, 0.33, 0.6, -0.22, 0.47, 0.12, -0.35, 0.58, 0.29];
const operaciones = pnl.map((p, i) => ({
  id: i + 1, fecha: new Date(ahora - (pnl.length - i) * 9.5 * 60 * min).toISOString(),
  simbolo: ['SOL', 'NEAR', 'ENA', 'MNT', 'XRP'][i % 5], lado: i % 3 ? 'SHORT' : 'LONG', pnl: p, margen: 20, nota: null,
}));
const db = dbMemoria({ diario: { capital_inicial: 20, operaciones } });

const senal = await ejecutar('senal', { moneda: 'NEAR', capital: 10, zona }, { db, fuente: fx('near') });
const posicion = await ejecutar('posicion', { moneda: 'NEAR', manual: true, lado: 'short', entrada: 3.658, sl: 3.677, tp1: 3.639, tp2: 3.628, tp3: 3.617, contratos: 30, hace: '6m', zona }, { db, fuente: fx('near-posicion') });
const btc = await ejecutar('btc', { moneda: 'NEAR', zona }, { db, fuente: fx('near') });
const ballenas = await ejecutar('ballenas', { moneda: 'SOL', zona }, { db, fuente: fx('ballenas-sol') });
const noticias = await ejecutar('noticias', { monedas: ['SOL'], horas: 48, zona }, { db, fuente: fx('sol') });
const escaner = await ejecutar('escaner', { top: 25, confirmar: 0, zona }, { db, fuente: fx('escaner') });
// la grabación del escáner no trae los datos completos de cada moneda: se muestra la confirmación con la
// señal grabada de NEAR (la misma de la pantalla Señal del demo)
const filaNear = escaner.filas.find((x) => x.simbolo === 'NEAR_USDT');
if (filaNear) { filaNear.senal = resumenSenal(senal); escaner.confirmadas = 1; }
// una ballena con posición en SOL (la de más valor), con todas sus posiciones
const dirBallena = ballenas.hl?.posiciones?.[0]?.dir;
const billetera = dirBallena ? await ejecutar('billetera', { dir: dirBallena, zona }, { db, fuente: fx('ballenas-sol') }).catch(() => null) : null;
const mercado = await ejecutar('mercado', { zona }, { db, fuente: fx('escaner') });
mercado.fng ??= noticias.fng; // la grabación del escáner no trae el Fear & Greed
const estado = await ejecutar('estado', { zona }, { db, fuente: fx('near') });

const out = path.join(RAIZ, 'app', 'src', 'demo', 'datos.json');
fs.writeFileSync(out, JSON.stringify({ generado: ahora, zona, senal, posicion, btc, ballenas, billetera, noticias, escaner, mercado, estado, operaciones, capital_inicial: 20 }));
console.log(`${out} (${(fs.statSync(out).size / 1024).toFixed(0)} KB) · señal ${senal.recomendacion} · posición ${posicion.accion}`);
