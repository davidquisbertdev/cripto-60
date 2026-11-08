// Acceso a datos públicos: futuros perpetuos de MEXC (sin API key) y otras fuentes.
// Modo offline (--offline DIR) lee respuestas guardadas; modo grabar (--grabar DIR) las guarda.
import fs from 'node:fs';
import path from 'node:path';

export const BASE = 'https://contract.mexc.com/api/v1/contract';

export const INTERVALOS = {
  '1m': ['Min1', 60], '5m': ['Min5', 300], '15m': ['Min15', 900], '30m': ['Min30', 1800],
  '1h': ['Min60', 3600], '4h': ['Hour4', 14400], '8h': ['Hour8', 28800], '1d': ['Day1', 86400],
};

export class ErrorDatos extends Error {}

// "sol", "SOLUSDT", "SOL/USDT", "sol-usdt", "SOL_USDT" -> "SOL_USDT"
export function simbolo(x) {
  let s = String(x || '').trim().toUpperCase().replace(/[-/ .:]/g, '_').replace(/_+/g, '_');
  if (!s) throw new ErrorDatos('Falta el símbolo (por ejemplo SOL).');
  s = s.replace(/_PERP$/, '');
  if (s.endsWith('_USDT')) return s;
  if (s.endsWith('USDT') && s.length > 4) return s.slice(0, -4) + '_USDT';
  return s + '_USDT';
}

export const base = (sym) => simbolo(sym).replace(/_USDT$/, '');

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

export class Fuente {
  constructor({ offline = null, grabar = null, ahora = null, pausa = 0 } = {}) {
    this.offline = offline;
    this.grabar = grabar;
    this.exchange = 'MEXC';
    this.pausa = pausa;
    if (offline) {
      const meta = path.join(offline, 'meta.json');
      this._ahora = ahora ?? (fs.existsSync(meta) ? JSON.parse(fs.readFileSync(meta, 'utf8')).ahora : Date.now());
    } else {
      this._ahora = ahora ?? Date.now();
    }
    if (grabar) {
      fs.mkdirSync(grabar, { recursive: true });
      fs.writeFileSync(path.join(grabar, 'meta.json'), JSON.stringify({ ahora: this._ahora }, null, 1));
    }
  }

  ahora() { return this._ahora; }

  async post(url, body, clave) {
    return JSON.parse(await this.texto(url, clave, { method: 'POST', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } }));
  }

  async json(url, clave) {
    const t = await this.texto(url, clave);
    try { return JSON.parse(t); } catch { throw new ErrorDatos(`Respuesta no válida de ${url}`); }
  }

  async texto(url, clave, opciones = {}) {
    if (this.offline) {
      const f = path.join(this.offline, clave);
      if (!fs.existsSync(f)) throw new ErrorDatos(`Sin datos offline: ${clave}`);
      return fs.readFileSync(f, 'utf8');
    }
    let ultimo;
    for (let intento = 0; intento < 3; intento++) {
      try {
        if (this.pausa) await dormir(this.pausa);
        const r = await fetch(url, {
          method: opciones.method || 'GET', body: opciones.body,
          headers: { 'User-Agent': 'Mozilla/5.0 (cripto-trader-skill)', Accept: '*/*', ...(opciones.headers || {}) },
          signal: AbortSignal.timeout(opciones.timeout || 15000),
        });
        if (r.status === 429 || r.status >= 500) throw new ErrorDatos(`HTTP ${r.status}`);
        if (!r.ok) { const e = new ErrorDatos(`HTTP ${r.status} en ${url}`); e.definitivo = true; e.cuerpo = await r.text().catch(() => ''); throw e; }
        const t = await r.text();
        if (this.grabar) fs.writeFileSync(path.join(this.grabar, clave), t);
        return t;
      } catch (e) {
        ultimo = e;
        if (e.definitivo) break; // 4xx: reintentar no sirve (p. ej. símbolo inexistente)
        await dormir(600 * (intento + 1));
      }
    }
    throw new ErrorDatos(`No se pudo leer ${url}: ${ultimo && ultimo.message}`);
  }

  async mexc(ruta, clave) {
    const t = await this.texto(BASE + ruta, clave);
    let j;
    try { j = JSON.parse(t); } catch { throw new ErrorDatos(`Respuesta no válida de MEXC (${ruta})`); }
    if (!j.success) {
      if (j.code === 1001) throw new ErrorDatos(`El contrato no existe en MEXC futuros (${ruta.split(/[/?=]/).find((x) => x.includes('_USDT')) || ruta}).`);
      throw new ErrorDatos(`MEXC: ${j.message || j.code}`);
    }
    return j.data;
  }

  detalle(sym) { sym = simbolo(sym); return this.mexc(`/detail?symbol=${sym}`, `detail-${sym}.json`); }
  detalles() { return this.mexc('/detail', 'detail-all.json'); }
  ticker(sym) { sym = simbolo(sym); return this.mexc(`/ticker?symbol=${sym}`, `ticker-${sym}.json`); }
  tickers() { return this.mexc('/ticker', 'tickers.json'); }
  funding(sym) { sym = simbolo(sym); return this.mexc(`/funding_rate/${sym}`, `funding-${sym}.json`); }
  profundidad(sym, n = 20) { sym = simbolo(sym); return this.mexc(`/depth/${sym}?limit=${n}`, n === 20 ? `depth-${sym}.json` : `depth${n}-${sym}.json`); }
  operaciones(sym) { sym = simbolo(sym); return this.mexc(`/deals/${sym}?limit=100`, `deals-${sym}.json`); }

  // Velas OHLCV. Devuelve [{t (ms apertura), o, h, l, c, v, cerrada}] en orden cronológico.
  async velas(sym, intervalo, n = 500) {
    sym = simbolo(sym);
    const [nombre, seg] = INTERVALOS[intervalo] || [];
    if (!nombre) throw new ErrorDatos(`Intervalo no soportado: ${intervalo}`);
    const fin = Math.floor(this._ahora / 1000);
    const ini = fin - Math.min(n, 2000) * seg;
    const d = await this.mexc(`/kline/${sym}?interval=${nombre}&start=${ini}&end=${fin}`, `kline-${sym}-${intervalo}.json`);
    const out = [];
    for (let i = 0; i < (d.time || []).length; i++) {
      const t = d.time[i] * 1000;
      if (t > this._ahora) continue;
      out.push({ t, o: +d.open[i], h: +d.high[i], l: +d.low[i], c: +d.close[i], v: +d.vol[i], cerrada: t + seg * 1000 <= this._ahora });
    }
    return out.slice(-n);
  }
}

// MEXC lista también acciones, ETFs, metales, forex y petróleo como perpetuos: aquí solo cripto.
const TRADFI = ['tradfi', 'stock', 'usstocks', 'forex', 'oil', 'commodities', 'metals', 'preipo', 'etf', 'stockindex'];
export function esCripto(det) {
  const tags = (det.conceptPlate || []).map((t) => t.replace('mc-trade-zone-', '').toLowerCase());
  return !tags.some((t) => TRADFI.includes(t)) && !/STOCK_USDT$/.test(det.symbol);
}

// Variación real de las últimas 24 h con velas de 1 h (el riseFallRate de MEXC se reinicia a las 00:00 UTC+8).
export function cambio24h(velas1h, precio) {
  if (!velas1h || velas1h.length < 25) return null;
  const ref = velas1h.at(-25).c;
  return ref ? +((100 * (precio - ref)) / ref).toFixed(2) : null;
}

// Solo velas ya cerradas (la última en curso se descarta para indicadores).
export const cerradas = (v) => v.filter((b) => b.cerrada);
