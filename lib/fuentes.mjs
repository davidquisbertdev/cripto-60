// Elige la fuente de datos según el exchange (Binance, Bybit o MEXC): --exchange, trader/config.json o, en
// modo offline, el exchange con el que se grabaron los datos (meta.json). Por defecto, Binance.
import fs from 'node:fs';
import path from 'node:path';
import { Fuente } from './mexc.mjs';
import { FuenteBinance } from './binance.mjs';
import { FuenteBybit } from './bybit.mjs';

export const EXCHANGES = { BINANCE: 'Binance', BYBIT: 'Bybit', MEXC: 'MEXC' };
export const nombreExchange = (x) => EXCHANGES[String(x || 'MEXC').toUpperCase()] ?? x;

export function crearFuente({ exchange = null, cfg = null, offline = null, grabar = null, ahora = null, pausa = 0 } = {}) {
  let ex = exchange ?? null;
  if (!ex && offline) {
    const meta = path.join(offline, 'meta.json');
    ex = (fs.existsSync(meta) && JSON.parse(fs.readFileSync(meta, 'utf8')).exchange) || 'MEXC'; // grabaciones antiguas: MEXC
  }
  ex = String(ex ?? cfg?.exchange ?? 'BINANCE').toUpperCase();
  if (!EXCHANGES[ex]) throw new Error(`Exchange no soportado: ${ex}. Usa binance, bybit o mexc.`);
  const Clase = { BINANCE: FuenteBinance, BYBIT: FuenteBybit, MEXC: Fuente }[ex];
  const f = new Clase({ offline, grabar, ahora, pausa });
  if (grabar) {
    const meta = path.join(grabar, 'meta.json');
    fs.writeFileSync(meta, JSON.stringify({ ...JSON.parse(fs.readFileSync(meta, 'utf8')), exchange: ex }, null, 1));
  }
  return f;
}
