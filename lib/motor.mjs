// Descarga y analiza todo lo que hace falta para una moneda: contrato, precio, funding, libro,
// velas 5m/15m/1h/4h, contexto de BTC, noticias y Fear & Greed.
import { simbolo, base, cerradas, esCripto, cambio24h } from './mexc.mjs';
import { analizarMarco, combinar, puntuacionBTC, niveles, desequilibrioLibro } from './analisis.mjs';
import { leerNoticias, miedoCodicia } from './noticias.mjs';
import { decimales } from './plan.mjs';

export async function analizarSimbolo(fuente, entrada, { conNoticias = true, noticiasDesde = null } = {}) {
  const sym = simbolo(entrada);
  const b = base(sym);
  const contrato = await fuente.detalle(sym);
  if (contrato.state != null && contrato.state !== 0) throw new Error(`${sym} no está activo en MEXC (estado ${contrato.state}).`);
  if (!esCripto(contrato)) throw new Error(`${sym} no es una criptomoneda (es un contrato de acciones/materias primas). Este pack solo analiza cripto.`);
  const [ticker, funding, depth] = await Promise.all([fuente.ticker(sym), fuente.funding(sym).catch(() => null), fuente.profundidad(sym).catch(() => null)]);
  const v5 = await fuente.velas(sym, '5m', 2000);
  const v15 = await fuente.velas(sym, '15m', 500);
  const v1h = await fuente.velas(sym, '1h', 500);
  const v4h = await fuente.velas(sym, '4h', 300);
  const precio = +ticker.lastPrice;
  const marcos = {
    '5m': analizarMarco(cerradas(v5).slice(-300), precio),
    '15m': analizarMarco(cerradas(v15), precio),
    '1h': analizarMarco(cerradas(v1h), precio),
    '4h': analizarMarco(cerradas(v4h), precio),
  };
  if (!marcos['15m'] || !marcos['1h']) throw new Error(`${sym} tiene muy poco historial para analizar (contrato nuevo).`);

  let btc = null, btcInfo = null;
  if (b !== 'BTC') {
    const [b1, b4] = await Promise.all([fuente.velas('BTC_USDT', '1h', 300), fuente.velas('BTC_USDT', '4h', 300)]);
    const m1 = analizarMarco(cerradas(b1)), m4 = analizarMarco(cerradas(b4));
    btc = puntuacionBTC(m1, m4);
    btcInfo = { puntuacion: btc, precio: b1.at(-1)?.c, rsi_1h: m1?.rsi };
  }
  let noticias = null, fng = null;
  if (conNoticias) {
    noticias = await leerNoticias(fuente, b, { horas: 48, desde: noticiasDesde });
    fng = await miedoCodicia(fuente);
  }
  const libro = desequilibrioLibro(depth);
  const fr = funding ? +funding.fundingRate : ticker.fundingRate != null ? +ticker.fundingRate : null;
  const decision = combinar({ marcos, btc, funding: fr, libro, noticias, esBTC: b === 'BTC' });
  return {
    simbolo: sym, base: b, ahora: fuente.ahora(), precio, contrato, ticker, decimales: decimales(contrato.priceUnit), cambio_24h: cambio24h(v1h, precio),
    funding: fr, proximo_funding: funding?.nextSettleTime ?? null, libro: +libro.toFixed(3),
    marcos, velas5m: cerradas(v5), niveles15: niveles(marcos['15m'], precio), niveles1h: niveles(marcos['1h'], precio),
    btc: btcInfo, noticias, fng, decision,
  };
}
