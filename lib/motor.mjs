// Descarga y analiza todo lo que hace falta para operar en 15-60 min una moneda: contrato, precio,
// funding, libro, velas 1m/5m/15m/1h, contexto de BTC (1m/5m/15m/1h y correlación), noticias, Fear & Greed y ballenas.
import { simbolo, base, cerradas, esCripto, cambio24h } from './mexc.mjs';
import { analizarMarco, combinar, puntuacionBTC, niveles, desequilibrioLibro } from './analisis.mjs';
import { leerNoticias, miedoCodicia } from './noticias.mjs';
import { decimales } from './plan.mjs';
import { analizarBallenas } from './ballenas.mjs';
import { puntuarReversion, decidirReversion } from './reversion.mjs';
import { analizarBTC, relacionConBTC, pesoBTC } from './btc.mjs';
import { analizarMacro } from './macro.mjs';
import { analizarFib } from './fibonacci.mjs';
import { analizarFlujo } from './flujo.mjs';
import { mapaLiquidaciones } from './liquidaciones.mjs';
import { leerCalendario, cacheArchivo } from './calendario.mjs';

const cambioPct = (velas, n, precio) => (velas.length > n ? (100 * (precio - velas.at(-n - 1).c)) / velas.at(-n - 1).c : null);

export async function analizarSimbolo(fuente, entrada, { conNoticias = true, noticiasDesde = null, conBallenas = true, carpetaCache = null, cacheCalendario = null } = {}) {
  const sym = simbolo(entrada);
  const b = base(sym);
  const contrato = await fuente.detalle(sym);
  if (contrato.state != null && contrato.state !== 0) throw new Error(`${sym} no está activo en ${fuente.exchange ?? 'MEXC'} (estado ${contrato.state}).`);
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

  // BTC siempre: las altcoins lo siguen en el corto plazo (lectura 1m/5m/15m/1h y cuánto se le parece)
  let btc = null, btcInfo = null, btcSeries = null;
  const lb = b !== 'BTC' ? await analizarBTC(fuente).catch(() => null) : null;
  if (lb) {
    const relacion = relacionConBTC(c5, lb.velas5m);
    btc = lb.puntuacion;
    const { velas5m, series, ...resto } = lb;
    btcSeries = series;
    btcInfo = { ...resto, relacion, peso: +pesoBTC(relacion).toFixed(2) };
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
  // oro y petróleo: contexto macro (avisan si hay un movimiento brusco), con la correlación frente a BTC
  const macro = await analizarMacro(fuente, b === 'BTC' ? cerradas(v1h) : btcSeries?.c1h ?? null).catch(() => null);
  // Fibonacci del último impulso (5m y 15m), CVD + open interest de Binance (24 h en 5m) y el mapa de
  // liquidaciones (estimado con ese OI + el real de las ballenas de Hyperliquid): confluencias de la entrada
  const c15 = cerradas(v15);
  const fib = analizarFib(marcos, c5, c15, precio);
  const flujo = await analizarFlujo(fuente, b).catch(() => null);
  const hlPos = ballenas?.hl?.disponible ? ballenas.hl.posiciones ?? [] : [];
  const liquidaciones = mapaLiquidaciones(flujo?.velas, precio, { hl: hlPos, ahora: fuente.ahora() });
  // calendario económico (IPC, empleo, Fed...): los datos macro que pueden barrer la operación, con la
  // reacción real de BTC a los ya publicados
  const calendario = conNoticias ? await leerCalendario(fuente, { velasBTC5m: b === 'BTC' ? c5 : lb?.velas5m ?? null, cache: cacheCalendario ?? (carpetaCache ? cacheArchivo(carpetaCache) : null) }).catch(() => null) : null;
  const libro = desequilibrioLibro(depth);
  const fr = funding ? +funding.fundingRate : ticker.fundingRate != null ? +ticker.fundingRate : null;
  const decision = combinar({ marcos, btc, btcPeso: btcInfo?.peso, funding: fr, libro, noticias, ballenas, esBTC: b === 'BTC' });
  const reversion = puntuarReversion(c5, precio, c1, marcos['15m']?.score ?? null);
  const decisionReversion = decidirReversion(reversion, { lateral: decision.lateral, adx15: marcos['15m']?.adx, ballenas });
  const spread = ticker.ask1 && ticker.bid1 ? (100 * (+ticker.ask1 - +ticker.bid1)) / precio : null;
  return {
    simbolo: sym, base: b, ahora: fuente.ahora(), precio, contrato, ticker, decimales: decimales(contrato.priceUnit), cambio_24h: cambio24h(v1h, precio),
    cambio_15m: cambioPct(c5, 3, precio), spread_pct: spread == null ? null : +spread.toFixed(4),
    funding: fr, proximo_funding: funding?.nextSettleTime ?? null, libro: +libro.toFixed(3),
    marcos, velas1m: c1, velas5m: c5, niveles5: niveles(marcos['5m'], precio), niveles15: niveles(marcos['15m'], precio),
    btc: btcInfo, btcSeries, exchange: fuente.exchange ?? 'MEXC', noticias, fng, macro, ballenas, fib, flujo, liquidaciones, calendario, decision: { ...decision, estrategia: 'tendencia' }, reversion, decisionReversion,
  };
}
