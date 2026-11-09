// Fuente de datos de Bybit (futuros lineales USDT, API pública v5, sin key). Devuelve los mismos campos que
// las fuentes de MEXC y Binance (contrato, ticker, funding, libro, operaciones y velas): el motor no cambia.
// Tamaño: 1 "contrato" = 1 paso de cantidad (qtyStep) de Bybit, como en Binance; el informe lo muestra en monedas.
import { Fuente, ErrorDatos, simbolo, INTERVALOS } from './mexc.mjs';

export const BASE_BYBIT = 'https://api.bybit.com';
// Comisiones estándar VIP 0 de derivados de Bybit. Se cambian con --comision.
export const COMISIONES_BYBIT = { maker: 0.0002, taker: 0.00055 };
const INTERVALO_BYBIT = { '1m': '1', '5m': '5', '15m': '15', '30m': '30', '1h': '60', '4h': '240', '1d': 'D' };

const CRIPTO_NO = new Set(['stock', 'etf', 'commodity', 'forex', 'index']);
const aBybit = (sym) => simbolo(sym).replace('_USDT', 'USDT');
const deBybit = (s) => s.replace(/USDT$/, '_USDT');

export class FuenteBybit extends Fuente {
  constructor(op = {}) {
    super(op);
    this.exchange = 'BYBIT';
    this._info = null;
  }

  async by(ruta, clave) {
    let j;
    try { j = await this.json(BASE_BYBIT + ruta, `bybit-${clave}`); }
    catch (e) {
      // Bybit bloquea algunas regiones (p. ej. EE. UU.) con HTTP 403
      if (/HTTP 403/.test(e.message)) throw new ErrorDatos('Bybit rechazó la conexión (HTTP 403): bloquea algunas regiones. Usa Binance o MEXC.');
      throw e;
    }
    if (j?.retCode !== 0) {
      if (j?.retCode === 10001 || /symbol/i.test(j?.retMsg ?? '')) throw new ErrorDatos(`El contrato no existe en Bybit futuros (${ruta.match(/symbol=([A-Z0-9]+)/)?.[1] ?? ruta}).`);
      throw new ErrorDatos(`Bybit: ${j?.retMsg || j?.retCode}`);
    }
    return j.result;
  }

  // Todos los perpetuos lineales en USDT (la API pagina con cursor)
  async info() {
    this._info ??= (async () => {
      const todos = [];
      let cursor = '', pagina = 0;
      do {
        const r = await this.by(`/v5/market/instruments-info?category=linear&limit=1000${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`, `instruments${pagina ? `-p${pagina + 1}` : ''}.json`);
        todos.push(...(r.list || []));
        cursor = r.nextPageCursor || '';
        pagina++;
      } while (cursor && pagina < 5);
      return todos;
    })();
    return this._info;
  }

  static contrato(s) {
    const paso = +(s.lotSizeFilter?.qtyStep ?? 1), minQty = +(s.lotSizeFilter?.minOrderQty ?? paso);
    const mayor = /^(BTC|ETH)$/.test(s.baseCoin);
    return {
      symbol: deBybit(s.symbol), exchange: 'BYBIT', baseCoin: s.baseCoin,
      state: s.status === 'Trading' ? 0 : 1,
      // solo perpetuos lineales de cripto en USDT: Bybit marca acciones, ETFs, materias primas y forex en symbolType
      conceptPlate: s.contractType === 'LinearPerpetual' && s.settleCoin === 'USDT' && !CRIPTO_NO.has(String(s.symbolType || '').toLowerCase()) ? [] : ['mc-trade-zone-tradfi'],
      contractSize: paso, minVol: Math.max(1, Math.ceil(minQty / paso - 1e-9)),
      priceUnit: +(s.priceFilter?.tickSize ?? 0.0001), min_nocional: +(s.lotSizeFilter?.minNotionalValue ?? 5),
      takerFeeRate: COMISIONES_BYBIT.taker, makerFeeRate: COMISIONES_BYBIT.maker,
      maxLeverage: +(s.leverageFilter?.maxLeverage ?? 50), maintenanceMarginRate: mayor ? 0.005 : 0.01,
      isZeroFeeSymbol: false,
    };
  }

  async detalle(sym) {
    const b = aBybit(sym);
    const s = (await this.info()).find((x) => x.symbol === b && x.quoteCoin === 'USDT');
    if (!s) throw new ErrorDatos(`El contrato no existe en Bybit futuros (${b}).`);
    return FuenteBybit.contrato(s);
  }

  async detalles() {
    return (await this.info()).filter((s) => s.quoteCoin === 'USDT' && s.contractType === 'LinearPerpetual').map(FuenteBybit.contrato);
  }

  static fila(t) {
    return {
      symbol: deBybit(t.symbol), lastPrice: +t.lastPrice, bid1: t.bid1Price ? +t.bid1Price : null, ask1: t.ask1Price ? +t.ask1Price : null,
      amount24: +t.turnover24h, fundingRate: t.fundingRate !== '' && t.fundingRate != null ? +t.fundingRate : null, nextFundingTime: +t.nextFundingTime || null,
    };
  }

  async ticker(sym) {
    const b = aBybit(sym);
    const r = await this.by(`/v5/market/tickers?category=linear&symbol=${b}`, `ticker-${b}.json`);
    if (!r.list?.length) throw new ErrorDatos(`El contrato no existe en Bybit futuros (${b}).`);
    return FuenteBybit.fila(r.list[0]);
  }

  async tickers() {
    const r = await this.by('/v5/market/tickers?category=linear', 'tickers.json');
    return (r.list || []).filter((t) => t.symbol.endsWith('USDT')).map((t) => ({ ...FuenteBybit.fila(t), fundingRate: t.fundingRate ? +t.fundingRate : 0 }));
  }

  async funding(sym) {
    const t = await this.ticker(sym);
    return { fundingRate: t.fundingRate, nextSettleTime: t.nextFundingTime };
  }

  // Libro en "contratos" (pasos de cantidad), como MEXC: [[precio, contratos]]
  async profundidad(sym, n = 20) {
    const b = aBybit(sym), paso = (await this.detalle(sym)).contractSize;
    const lim = Math.min(Math.max(n, 1), 500);
    const d = await this.by(`/v5/market/orderbook?category=linear&symbol=${b}&limit=${lim}`, `depth${lim}-${b}.json`);
    const conv = (lado) => (lado || []).map(([p, q]) => [+p, +q / paso]);
    return { bids: conv(d.b), asks: conv(d.a) };
  }

  // Operaciones recientes, como MEXC: {p, v (contratos), T (1 compra agresiva, 2 venta), t}
  async operaciones(sym) {
    const b = aBybit(sym), paso = (await this.detalle(sym)).contractSize;
    const d = await this.by(`/v5/market/recent-trade?category=linear&symbol=${b}&limit=200`, `trades-${b}.json`);
    return (d.list || []).map((x) => ({ p: +x.price, v: +x.size / paso, T: x.side === 'Buy' ? 1 : 2, t: +x.time }));
  }

  async velas(sym, intervalo, n = 500) {
    const b = aBybit(sym);
    const seg = INTERVALOS[intervalo]?.[1], iv = INTERVALO_BYBIT[intervalo];
    if (!seg || !iv) throw new ErrorDatos(`Intervalo no soportado: ${intervalo}`);
    n = Math.min(n, 3000);
    let fin = this._ahora, filas = [], pagina = 0;
    while (filas.length < n) {
      const lim = Math.min(1000, n - filas.length);
      const d = await this.by(`/v5/market/kline?category=linear&symbol=${b}&interval=${iv}&limit=${lim}&end=${fin}`, `kline-${b}-${intervalo}${pagina ? `-p${pagina + 1}` : ''}.json`);
      const lista = [...(d.list || [])].reverse(); // Bybit las da de la más nueva a la más vieja
      if (!lista.length) break;
      filas = [...lista, ...filas];
      fin = +lista[0][0] - 1;
      pagina++;
      if (lista.length < lim) break;
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
