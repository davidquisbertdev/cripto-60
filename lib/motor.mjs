// Descarga y analiza todo lo que hace falta para operar en 15-60 min una moneda: contrato, precio,
// funding, libro, velas 1m/5m/15m/1h, contexto de BTC (5m/15m), noticias, Fear & Greed y ballenas.
import { simbolo, base, cerradas, esCripto, cambio24h } from './mexc.mjs';
import { analizarMarco, combinar, puntuacionBTC, niveles, desequilibrioLibro } from './analisis.mjs';
import { leerNoticias, miedoCodicia } from './noticias.mjs';
import { decimales } from './plan.mjs';
import { analizarBallenas } from './ballenas.mjs';
import { puntuarReversion, decidirReversion } from './reversion.mjs';

const cambioPct = (velas, n, precio) => (velas.length > n ? (100 * (precio - velas.at(-n - 1).c)) / velas.at(-n - 1).c : null);

export async function analizarSimbolo(fuente, entrada, { conNoticias = true, noticiasDesde = null, conBallenas = true, carpetaCache = null } = {}) {
  const sym = simbolo(entrada);
  const b = base(sym);
  const contrato = await fuente.detalle(sym);
  if (contrato.state != null && contrato.state !== 0) throw new Error(`${sym} no está activo en MEXC (estado ${contrato.state}).`);
  if (!esCripto(contrato)) throw new Error(`${sym} no es una criptomoneda (es un contrato de acciones/materias primas). Este pack solo analiza cripto.`);
  const [ticker, funding, depth] = await Promise.all([fuente.ticker(sym), fuente.funding(sym).catch(() => null), fuente.profundidad(sym).catch(() => null)]);
  const v1 = await fuente.velas(sym, '1m', 2000);
  const v5 = await fuente.velas(sym, '5m', 500);
  const v15 = await fuente.velas(sym, '15m', 300);
  const v1h = await fuente.velas(sym, '1h', 300);
  const precio = +ticker.lastPrice;
  const c1 = cerradas(v1), c5 = cerradas(v5);
  const marcos = {
    '1m': analizarMarco(c1.slice(-300), precio),
    '5m': analizarMarco(c5, precio),
    '15m': analizarMarco(cerradas(v15), precio),
    '1h': analizarMarco(cerradas(v1h), precio),
  };
  if (!marcos['1m'] || !marcos['5m'] || !marcos['15m']) throw new Error(`${sym} tiene muy poco historial para analizar (contrato nuevo).`);

  let btc = null, btcInfo = null;
  if (b !== 'BTC') {
    const [b5, b15] = await Promise.all([fuente.velas('BTC_USDT', '5m', 300), fuente.velas('BTC_USDT', '15m', 300)]);
    const m5 = analizarMarco(cerradas(b5)), m15 = analizarMarco(cerradas(b15));
    btc = puntuacionBTC(m5, m15);
    btcInfo = { puntuacion: btc, precio: b5.at(-1)?.c, rsi_5m: m5?.rsi, cambio_15m_pct: cambioPct(cerradas(b5), 3, b5.at(-1)?.c) };
  }
  let noticias = null, fng = null;
  if (conNoticias) {
    noticias = await leerNoticias(fuente, b, { horas: 48, desde: noticiasDesde });
    fng = await miedoCodicia(fuente);
  }
  let ballenas = null;
  if (conBallenas) {
    ballenas = await analizarBallenas(fuente, { base: b, simbolo: sym, contrato, precio, precio15m: cambioPct(c5, 6, precio), carpetaCache }).catch(() => null);
  }
  const libro = desequilibrioLibro(depth);
  const fr = funding ? +funding.fundingRate : ticker.fundingRate != null ? +ticker.fundingRate : null;
  const decision = combinar({ marcos, btc, funding: fr, libro, noticias, ballenas, esBTC: b === 'BTC' });
  const reversion = puntuarReversion(c5, precio, c1, marcos['15m']?.score ?? null);
  const decisionReversion = decidirReversion(reversion, { lateral: decision.lateral, adx15: marcos['15m']?.adx, ballenas });
  const spread = ticker.ask1 && ticker.bid1 ? (100 * (+ticker.ask1 - +ticker.bid1)) / precio : null;
  return {
    simbolo: sym, base: b, ahora: fuente.ahora(), precio, contrato, ticker, decimales: decimales(contrato.priceUnit), cambio_24h: cambio24h(v1h, precio),
    cambio_15m: cambioPct(c5, 3, precio), spread_pct: spread == null ? null : +spread.toFixed(4),
    funding: fr, proximo_funding: funding?.nextSettleTime ?? null, libro: +libro.toFixed(3),
    marcos, velas1m: c1, velas5m: c5, niveles5: niveles(marcos['5m'], precio), niveles15: niveles(marcos['15m'], precio),
    btc: btcInfo, noticias, fng, ballenas, decision: { ...decision, estrategia: 'tendencia' }, reversion, decisionReversion,
  };
}
