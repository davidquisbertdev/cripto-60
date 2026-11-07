#!/usr/bin/env node
// cripto-escaner: recorre los futuros USDT más líquidos de MEXC y ordena las monedas con el setup
// más claro (LONG o SHORT) según el mismo análisis multi-temporalidad de cripto-senal.
import { pathToFileURL } from 'node:url';
import { Fuente, cerradas, esCripto, cambio24h } from '../lib/mexc.mjs';
import { analizarMarco, combinar, puntuacionBTC } from '../lib/analisis.mjs';
import { leerConfig } from '../lib/config.mjs';
import { args, signo, salir } from '../lib/formato.mjs';

const ESTABLES = /^(USDC|USDE|FDUSD|TUSD|DAI|USD1|PYUSD|BUSD|EUR|XAUT|PAXG)_USDT$/;

export async function escanear(fuente, { top = 30, minVolumen = 5e6 } = {}) {
  const cripto = new Set((await fuente.detalles()).filter((d) => d.state === 0 && esCripto(d)).map((d) => d.symbol));
  const todos = (await fuente.tickers()).filter((t) => cripto.has(t.symbol) && t.symbol.endsWith('_USDT') && !ESTABLES.test(t.symbol) && +t.amount24 >= minVolumen);
  todos.sort((a, b) => +b.amount24 - +a.amount24);
  const lista = todos.slice(0, top);
  const [b1, b4] = await Promise.all([fuente.velas('BTC_USDT', '1h', 300), fuente.velas('BTC_USDT', '4h', 300)]);
  const btc = puntuacionBTC(analizarMarco(cerradas(b1)), analizarMarco(cerradas(b4)));
  const filas = [];
  for (const t of lista) {
    try {
      const sym = t.symbol, precio = +t.lastPrice;
      const v15 = await fuente.velas(sym, '15m', 300), v1h = await fuente.velas(sym, '1h', 300), v4h = await fuente.velas(sym, '4h', 300);
      const marcos = { '15m': analizarMarco(cerradas(v15), precio), '1h': analizarMarco(cerradas(v1h), precio), '4h': analizarMarco(cerradas(v4h), precio) };
      if (!marcos['15m'] || !marcos['1h']) continue;
      const d = combinar({ marcos, btc, funding: +t.fundingRate, esBTC: sym === 'BTC_USDT' });
      filas.push({
        simbolo: sym, precio, sesgo: d.sesgo, nivel: d.nivel, confianza: d.confianza, puntuacion: d.puntuacion,
        cambio_24h: cambio24h(v1h, precio), volumen_24h_musdt: +(+t.amount24 / 1e6).toFixed(1),
        funding_pct: +(100 * +t.fundingRate).toFixed(4), atr15_pct: +((100 * marcos['15m'].atr) / precio).toFixed(2),
        lateral: d.lateral, sobreextendido: d.sobreextendido,
      });
    } catch { /* moneda sin datos suficientes: se salta */ }
  }
  filas.sort((a, b) => b.confianza - a.confianza || Math.abs(b.puntuacion) - Math.abs(a.puntuacion));
  return { btc, analizadas: filas.length, filas };
}

async function main() {
  const { op } = args(process.argv.slice(2), { flags: ['json'], numeros: ['top', 'min_volumen', 'mostrar'] });
  leerConfig(op.config);
  const fuente = new Fuente({ offline: op.offline, grabar: op.grabar, pausa: op.offline ? 0 : 60 });
  const r = await escanear(fuente, { top: op.top ?? 30, minVolumen: op.min_volumen ?? 5e6 });
  if (op.json) return console.log(JSON.stringify(r, null, 2));
  console.log(`BTC: ${signo(r.btc)} (${r.btc >= 0.25 ? 'alcista' : r.btc <= -0.25 ? 'bajista' : 'neutral'}) · ${r.analizadas} futuros analizados (por volumen 24 h)`);
  console.log('');
  console.log('  #  moneda      sesgo  nivel      conf  24h %    vol M   ATR15 %  funding %');
  r.filas.slice(0, op.mostrar ?? 15).forEach((f, i) => {
    const flag = f.lateral ? ' lateral' : f.sobreextendido ? ' extendido' : '';
    console.log(`${String(i + 1).padStart(3)}  ${f.simbolo.replace('_USDT', '').padEnd(10)}${f.sesgo.padEnd(5)}  ${f.nivel.padEnd(9)}  ${String(f.confianza).padStart(4)}  ${signo(f.cambio_24h).padStart(6)}  ${String(f.volumen_24h_musdt).padStart(6)}  ${f.atr15_pct.toFixed(2).padStart(7)}  ${f.funding_pct.toFixed(4).padStart(9)}${flag}`);
  });
  console.log('\nEs un primer filtro. Antes de operar, pide la señal completa: /cripto-senal MONEDA.');
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) main().catch(salir);
