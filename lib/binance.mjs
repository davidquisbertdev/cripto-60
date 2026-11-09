// Fuente de datos de Binance USDⓈ-M Futures (API pública, sin key). Devuelve los mismos campos que la
// fuente de MEXC (contrato, ticker, funding, libro, operaciones y velas) para que el motor no cambie.
// Tamaño: 1 "contrato" = 1 paso de cantidad (stepSize) de Binance, así el plan redondea a lo que se
// puede operar; el informe lo muestra en monedas.
import { Fuente, ErrorDatos, simbolo, INTERVALOS } from './mexc.mjs';

export const BASE_BINANCE = 'https://fapi.binance.com';
// Comisiones estándar VIP 0 de futuros USDⓈ-M (sin descuento BNB). Se cambian con --comision.
export const COMISIONES_BINANCE = { maker: 0.0002, taker: 0.0005 };

const aBinance = (sym) => simbolo(sym).replace('_USDT', 'USDT');
const deBinance = (s) => s.replace(/USDT$/, '_USDT');

export class FuenteBinance extends Fuente {
  constructor(op = {}) {
    super(op);
    this.exchange = 'BINANCE';
    this._info = null;
  }

  async bn(ruta, clave) {
    const j = await this.json(BASE_BINANCE + ruta, `binance-${clave}`);
    if (j && j.code != null && j.code < 0) {
      if (j.code === -1121) throw new ErrorDatos(`El contrato no existe en Binance futuros (${ruta.match(/symbol=([A-Z0-9]+)/)?.[1] ?? ruta}).`);
      throw new ErrorDatos(`Binance: ${j.msg || j.code}`);
    }
    return j;
  }

  async info() {
    this._info ??= this.bn('/fapi/v1/exchangeInfo', 'exchangeInfo.json');
    return this._info;
  }

  static contrato(s) {
    const f = Object.fromEntries((s.filters || []).map((x) => [x.filterType, x]));
    const paso = +(f.LOT_SIZE?.stepSize ?? 1), minQty = +(f.LOT_SIZE?.minQty ?? paso);
    const mayor = /^(BTC|ETH)$/.test(s.baseAsset);
    return {
      symbol: deBinance(s.symbol), exchange: 'BINANCE', baseCoin: s.baseAsset,
      state: s.status === 'TRADING' ? 0 : 1,
      // solo perpetuos de cripto: acciones, materias primas, índices y pre-market se rechazan
      conceptPlate: s.contractType === 'PERPETUAL' && s.underlyingType === 'COIN' ? [] : ['mc-trade-zone-tradfi'],
      contractSize: paso, minVol: Math.max(1, Math.ceil(minQty / paso - 1e-9)),
      priceUnit: +(f.PRICE_FILTER?.tickSize ?? 0.0001), min_nocional: +(f.MIN_NOTIONAL?.notional ?? 5),
      takerFeeRate: COMISIONES_BINANCE.taker, makerFeeRate: COMISIONES_BINANCE.maker,
      // la API pública no da los tramos de apalancamiento: valores prudentes (el plan topa en 30x)
      maxLeverage: mayor ? 125 : 50, maintenanceMarginRate: mayor ? 0.004 : 0.01,
      isZeroFeeSymbol: false,
    };
  }

  async detalle(sym) {
    const b = aBinance(sym);
    const s = (await this.info()).symbols.find((x) => x.symbol === b && x.quoteAsset === 'USDT');
    if (!s) throw new ErrorDatos(`El contrato no existe en Binance futuros (${b}).`);
    return FuenteBinance.contrato(s);
  }

  async detalles() {
    return (await this.info()).symbols.filter((s) => s.quoteAsset === 'USDT' && /PERPETUAL/.test(s.contractType)).map(FuenteBinance.contrato);
  }

  async ticker(sym) {
    const b = aBinance(sym);
    const [t, bt, pi] = await Promise.all([
      this.bn(`/fapi/v1/ticker/24hr?symbol=${b}`, `ticker-${b}.json`),
      this.bn(`/fapi/v1/ticker/bookTicker?symbol=${b}`, `book-${b}.json`),
      this.bn(`/fapi/v1/premiumIndex?symbol=${b}`, `premium-${b}.json`).catch(() => null),
    ]);
    return { symbol: deBinance(b), lastPrice: +t.lastPrice, bid1: +bt.bidPrice, ask1: +bt.askPrice, amount24: +t.quoteVolume, fundingRate: pi ? +pi.lastFundingRate : null };
  }

  async tickers() {
    const [ts, bts, pis] = await Promise.all([
      this.bn('/fapi/v1/ticker/24hr', 'tickers.json'), this.bn('/fapi/v1/ticker/bookTicker', 'books.json'), this.bn('/fapi/v1/premiumIndex', 'premiums.json'),
    ]);
    const book = new Map(bts.map((x) => [x.symbol, x])), prem = new Map(pis.map((x) => [x.symbol, x]));
    return ts.filter((t) => t.symbol.endsWith('USDT')).map((t) => ({
      symbol: deBinance(t.symbol), lastPrice: +t.lastPrice, amount24: +t.quoteVolume, cambio24: +t.priceChangePercent,
      bid1: book.has(t.symbol) ? +book.get(t.symbol).bidPrice : null, ask1: book.has(t.symbol) ? +book.get(t.symbol).askPrice : null,
      fundingRate: prem.has(t.symbol) ? +prem.get(t.symbol).lastFundingRate : 0,
    }));
  }

  async funding(sym) {
    const b = aBinance(sym);
    const p = await this.bn(`/fapi/v1/premiumIndex?symbol=${b}`, `premium-${b}.json`);
    return { fundingRate: +p.lastFundingRate, nextSettleTime: +p.nextFundingTime };
  }

  // Libro en "contratos" (pasos de cantidad), como MEXC: [[precio, contratos]]
  async profundidad(sym, n = 20) {
    const b = aBinance(sym), paso = (await this.detalle(sym)).contractSize;
    const lim = [5, 10, 20, 50, 100, 500, 1000].find((x) => x >= n) ?? 1000;
    const d = await this.bn(`/fapi/v1/depth?symbol=${b}&limit=${lim}`, `depth${lim}-${b}.json`);
    const conv = (lado) => lado.map(([p, q]) => [+p, +q / paso]);
    return { bids: conv(d.bids), asks: conv(d.asks) };
  }

  // Operaciones recientes, como MEXC: {p, v (contratos), T (1 compra agresiva, 2 venta), t}
  async operaciones(sym) {
    const b = aBinance(sym), paso = (await this.detalle(sym)).contractSize;
    const d = await this.bn(`/fapi/v1/aggTrades?symbol=${b}&limit=200`, `aggTrades-${b}.json`);
    return d.map((x) => ({ p: +x.p, v: +x.q / paso, T: x.m ? 2 : 1, t: +x.T }));
  }

  async velas(sym, intervalo, n = 500) {
    const b = aBinance(sym);
    const seg = INTERVALOS[intervalo]?.[1];
    if (!seg) throw new ErrorDatos(`Intervalo no soportado: ${intervalo}`);
    n = Math.min(n, 3000);
    let fin = this._ahora, filas = [], pagina = 0;
    while (filas.length < n) {
      const lim = Math.min(1500, n - filas.length);
      const d = await this.bn(`/fapi/v1/klines?symbol=${b}&interval=${intervalo}&limit=${lim}&endTime=${fin}`, `kline-${b}-${intervalo}${pagina ? `-p${pagina + 1}` : ''}.json`);
      if (!d.length) break;
      filas = [...d, ...filas];
      fin = d[0][0] - 1;
      pagina++;
      if (d.length < lim) break;
    }
    const out = [];
    for (const k of filas) {
      const t = +k[0];
      if (t > this._ahora) continue;
      out.push({ t, o: +k[1], h: +k[2], l: +k[3], c: +k[4], v: +k[5], cerrada: t + seg * 1000 <= this._ahora });
    }
    return out.slice(-n);
  }
}
