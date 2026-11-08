// Elige la fuente de datos según el exchange: --exchange, trader/config.json o, en modo offline, el
// exchange con el que se grabaron los datos (meta.json). Por defecto, Binance.
import fs from 'node:fs';
import path from 'node:path';
import { Fuente } from './mexc.mjs';
import { FuenteBinance } from './binance.mjs';

export const EXCHANGES = { BINANCE: 'Binance', MEXC: 'MEXC' };
export const nombreExchange = (x) => EXCHANGES[String(x || 'MEXC').toUpperCase()] ?? x;

export function crearFuente({ exchange = null, cfg = null, offline = null, grabar = null, ahora = null, pausa = 0 } = {}) {
  let ex = exchange ?? null;
  if (!ex && offline) {
    const meta = path.join(offline, 'meta.json');
    ex = (fs.existsSync(meta) && JSON.parse(fs.readFileSync(meta, 'utf8')).exchange) || 'MEXC'; // grabaciones antiguas: MEXC
  }
  ex = String(ex ?? cfg?.exchange ?? 'BINANCE').toUpperCase();
  if (!EXCHANGES[ex]) throw new Error(`Exchange no soportado: ${ex}. Usa binance o mexc.`);
  const f = ex === 'BINANCE' ? new FuenteBinance({ offline, grabar, ahora, pausa }) : new Fuente({ offline, grabar, ahora, pausa });
  if (grabar) {
    const meta = path.join(grabar, 'meta.json');
    fs.writeFileSync(meta, JSON.stringify({ ...JSON.parse(fs.readFileSync(meta, 'utf8')), exchange: ex }, null, 1));
  }
  return f;
}
