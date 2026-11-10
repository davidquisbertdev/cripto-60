#!/usr/bin/env node
// cripto-escaner: recorre los futuros USDT más líquidos (Binance o MEXC) y ordena las monedas con el setup
// más claro (LONG o SHORT) según el mismo análisis multi-temporalidad de cripto-senal.
import { pathToFileURL } from 'node:url';
import { Fuente, cerradas, esCripto, cambio24h } from '../lib/mexc.mjs';
import { crearFuente, nombreExchange } from '../lib/fuentes.mjs';
import { analizarMarco, combinar, puntuacionBTC } from '../lib/analisis.mjs';
import { puntuarReversion, decidirReversion } from '../lib/reversion.mjs';
import path from 'node:path';
import { leerConfig, carpeta } from '../lib/config.mjs';
import { analizarSimbolo } from '../lib/motor.mjs';
import { generarSenal } from '../cripto-senal/senal.mjs';
import { args, signo, salir } from '../lib/formato.mjs';

export const ESTABLES = /^(USDC|USDE|FDUSD|TUSD|DAI|USD1|PYUSD|BUSD|EUR|XAUT|PAXG)_USDT$/;

// Apto para scalping: el ATR de 5m tiene que cubrir varias veces la comisión de ida y vuelta, y el
// spread tiene que ser pequeño.
export function aptoScalping({ atr5Pct, comisionPct, spreadPct, ratioMin = 3 }) {
  const cubre = comisionPct > 0 ? atr5Pct / comisionPct : Infinity;
  if (cubre < ratioMin * 1.5) return { apto: false, motivo: 'se mueve poco para sus comisiones', cubre };
  if (spreadPct != null && spreadPct > 0.05) return { apto: false, motivo: 'spread ancho', cubre };
  return { apto: true, motivo: null, cubre };
}

// confirmar(simbolo): opcional, corre la SEÑAL COMPLETA (la misma de /cripto-senal y de la web) en las
// mejores monedas del filtro rápido, para que el escáner no recomiende algo que la señal rechaza
// (historial real negativo, BTC en contra, ballenas, simulación...). confirmarN: cuántas.
export async function escanear(fuente, { top = 30, minVolumen = 5e6, ratioMin = 3, confirmar = null, confirmarN = 3 } = {}) {
  const detalles = new Map((await fuente.detalles()).filter((d) => d.state === 0 && esCripto(d)).map((d) => [d.symbol, d]));
  const todos = (await fuente.tickers()).filter((t) => detalles.has(t.symbol) && t.symbol.endsWith('_USDT') && !ESTABLES.test(t.symbol) && +t.amount24 >= minVolumen);
  todos.sort((a, b) => +b.amount24 - +a.amount24);
  const lista = todos.slice(0, top);
  const [b5, b15] = await Promise.all([fuente.velas('BTC_USDT', '5m', 300), fuente.velas('BTC_USDT', '15m', 300)]);
  const btc = puntuacionBTC(analizarMarco(cerradas(b5)), analizarMarco(cerradas(b15)));
  const filas = [];
  for (const t of lista) {
    try {
      const sym = t.symbol, precio = +t.lastPrice, det = detalles.get(sym);
      const v1 = await fuente.velas(sym, '1m', 300), v5 = await fuente.velas(sym, '5m', 300), v15 = await fuente.velas(sym, '15m', 300);
      const marcos = { '1m': analizarMarco(cerradas(v1), precio), '5m': analizarMarco(cerradas(v5), precio), '15m': analizarMarco(cerradas(v15), precio) };
      if (!marcos['5m'] || !marcos['15m']) continue;
      const d = combinar({ marcos, btc, funding: +t.fundingRate, esBTC: sym === 'BTC_USDT' });
      const atr5Pct = (100 * marcos['5m'].atr) / precio;
      const comisionPct = 100 * ((+det.takerFeeRate || 0) + (+det.makerFeeRate || 0));
      const spreadPct = t.ask1 && t.bid1 ? (100 * (+t.ask1 - +t.bid1)) / precio : null;
      const ap = aptoScalping({ atr5Pct, comisionPct, spreadPct, ratioMin });
      const c5 = cerradas(v5);
      const rv = decidirReversion(puntuarReversion(c5, precio, cerradas(v1), marcos['15m'].score), { lateral: d.lateral, adx15: marcos['15m'].adx });
      filas.push({
        simbolo: sym, precio, sesgo: d.sesgo, nivel: d.nivel, confianza: d.confianza, puntuacion: d.puntuacion,
        cambio_15m: c5.length > 3 ? +((100 * (precio - c5.at(-4).c)) / c5.at(-4).c).toFixed(2) : null, volumen_24h_musdt: +(+t.amount24 / 1e6).toFixed(1),
        funding_pct: +(100 * +t.fundingRate).toFixed(4), atr5_pct: +atr5Pct.toFixed(3), comision_pct: +comisionPct.toFixed(3), spread_pct: spreadPct == null ? null : +spreadPct.toFixed(4),
        reversion: rv.nivel === 'NO OPERAR' ? null : { lado: rv.sesgo, nivel: rv.nivel, confianza: rv.confianza },
        cero_promo: !!det.isZeroFeeSymbol, apto: ap.apto, motivo_no_apto: ap.motivo, lateral: d.lateral, sobreextendido: d.sobreextendido,
      });
    } catch { /* moneda sin datos suficientes: se salta */ }
  }
  // primero las aptas para scalping, luego por confianza
  filas.sort((a, b) => (b.apto - a.apto) || b.confianza - a.confianza || Math.abs(b.puntuacion) - Math.abs(a.puntuacion));
  let confirmadas = 0;
  if (confirmar && confirmarN > 0) {
    const elegidas = filas.filter((x) => x.apto).slice(0, confirmarN);
    await Promise.all(elegidas.map(async (x) => {
      try { x.senal = resumenSenal(await confirmar(x.simbolo)); confirmadas++; } catch (e) { x.senal = { error: e.message }; }
    }));
    // las confirmadas por la señal suben arriba: recomendadas por confianza, luego con mejor entrada posible
    const peso = (x) => (!x.senal || x.senal.error ? 0 : x.senal.recomendacion !== 'NO OPERAR' ? 3 : x.senal.mejor ? 1 : 0.5);
    filas.sort((a, b) => (b.apto - a.apto) || peso(b) - peso(a) || (b.senal?.confianza ?? b.confianza) - (a.senal?.confianza ?? a.confianza));
  }
  return { btc, analizadas: filas.length, aptas: filas.filter((f) => f.apto).length, confirmadas, filas };
}

// Lo justo de la señal para la tabla del escáner.
export function resumenSenal(s) {
  const m = s.mejor_entrada;
  return {
    recomendacion: s.recomendacion, lado: s.lado, nivel: s.nivel, confianza: s.confianza, estrategia: s.estrategia,
    motivo: s.recomendacion === 'NO OPERAR' ? (s.alertas?.find((t) => /Historial|BTC|ballenas|simulaciones|Capital|comisi/i.test(t)) ?? s.alertas?.[0] ?? null) : null,
    ballenas: s.ballenas ? { lectura: s.ballenas.lectura, puntuacion: s.ballenas.puntuacion } : null,
    mejor: m ? { lado: m.lado, estrategia: m.estrategia, prob: m.prob?.pct ?? null, recomendada: m.recomendada, contra_btc: !!m.contra_btc } : null,
  };
}

async function main() {
  const { op } = args(process.argv.slice(2), { flags: ['json'], numeros: ['top', 'min_volumen', 'mostrar', 'confirmar', 'capital'] });
  const cfg = leerConfig(op.config);
  const fuente = crearFuente({ exchange: op.exchange, cfg, offline: op.offline, grabar: op.grabar, pausa: op.offline ? 0 : 60 });
  // las mejores se confirman con la señal completa (misma lógica que /cripto-senal)
  const confirmar = async (sym) => {
    const a = await analizarSimbolo(fuente, sym, { carpetaCache: path.join(carpeta(cfg), 'cache') });
    // capital: el indicado, o el del diario; sin ninguno, el margen base
    return generarSenal(a, op.capital != null ? { capital: op.capital } : {}, cfg).catch(() => generarSenal(a, { capital: cfg.margen_base }, cfg));
  };
  const r = await escanear(fuente, { top: op.top ?? 30, minVolumen: op.min_volumen ?? 5e6, confirmar, confirmarN: op.confirmar ?? 3 });
  if (op.json) return console.log(JSON.stringify(r, null, 2));
  console.log(`BTC ahora (5m/15m): ${signo(r.btc)} (${r.btc >= 0.25 ? 'alcista' : r.btc <= -0.25 ? 'bajista' : 'neutral'}) · ${r.analizadas} futuros analizados · ${r.aptas} aptos para scalping`);
  console.log('');
  console.log('  #  moneda      tendencia             reversión     15m %   vol M   ATR5 %  comis %  scalping');
  r.filas.slice(0, op.mostrar ?? 15).forEach((f, i) => {
    const flag = !f.apto ? `NO (${f.motivo_no_apto})` : f.lateral ? 'sí, lateral' : f.sobreextendido ? 'sí, extendido' : 'sí';
    const sn = f.senal ? (f.senal.error ? '   señal: sin datos' : `   SEÑAL: ${f.senal.recomendacion === 'NO OPERAR' ? `NO OPERAR${f.senal.mejor ? ` (mejor posible ${f.senal.mejor.lado} ${f.senal.mejor.prob ?? '—'} %)` : ''}` : `${f.senal.lado} ${f.senal.nivel}`}`) : '';
    console.log(`${String(i + 1).padStart(3)}  ${f.simbolo.replace('_USDT', '').padEnd(10)}  ${f.sesgo.padEnd(5)} ${f.nivel.padEnd(9)} ${String(f.confianza).padStart(3)}   ${(f.reversion ? `${f.reversion.lado} ${f.reversion.confianza}` : '—').padEnd(12)}  ${signo(f.cambio_15m).padStart(6)}  ${String(f.volumen_24h_musdt).padStart(6)}  ${f.atr5_pct.toFixed(3).padStart(6)}  ${(f.cero_promo ? '0 promo' : f.comision_pct.toFixed(3)).padStart(7)}  ${flag}${sn}`);
  });
  if (r.filas.some((f) => f.cero_promo)) console.log('\n"0 promo": MEXC marca la moneda sin comisión (promoción). Confírmalo en la app; si es así, pide la señal con --comision 0.');
  console.log('\nTendencia: a favor del movimiento. Reversión: precio estirado lejos de su media de 5m, apuesta a la vuelta.');
  console.log(`Las ${r.confirmadas} primeras aptas ya pasaron por la señal completa (historial real, BTC, ballenas): "SEÑAL" es lo que dirá /cripto-senal.`);
  console.log('El resto es un primer filtro. Antes de operar, pide la señal completa: /cripto-senal MONEDA.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch(salir);
