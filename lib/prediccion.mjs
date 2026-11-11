// Predicción de MEXC (Up/Down de 5 y 15 min en BTC y ETH): cajas, modelo de probabilidad y veredicto.
//
// Cómo liquida MEXC (medido el 11/11/2026 contra su propia API pública y 24 h de cajas reales):
//  · Las cajas van con el reloj (5 min: :00, :05…; 15 min: :00, :15…). El precio base («To Beat») de una
//    caja es el precio de cierre de la anterior: el índice en el instante de apertura.
//  · El índice NO es el precio en vivo: es la media de los últimos 60 s del spot (TWAP de Chainlink, par
//    contra USD), publicada unos 5 s tarde. Encaja con la media de 60 s de Binance spot con ~0,2 pb de error
//    (más una diferencia fija USD/USDT, que se mide en cada análisis).
//  · Por eso el spot en vivo «adelanta» al gráfico de MEXC ~35 s: lo que el spot ya hizo, el índice lo va a
//    hacer. El modelo proyecta el índice del cierre con el spot ya conocido y la volatilidad reciente.
//  · Up gana si el cierre queda por encima de la base; el empate es Down.
// Módulo sin node:fs (lo usan la web y la Edge Function). La red va por la fuente (`f.json`).

export const API_PRED = 'https://prediction.mexc.com/api/platform/predict/market/web';
export const MONEDAS_PRED = ['BTC', 'ETH'];
export const PLAZOS_PRED = [5, 15];
export const VENTANA_S = 60;   // el índice promedia 60 s de spot
export const RETRASO_S = 5;    // y se publica ~5 s tarde
export const COMISION_PRED = 0.025; // comisión taker que publica MEXC en cada caja (se asume sobre lo apostado)
// Calibración medida en scripts/prediccion-estudio.mjs (24 h de cajas reales de BTC y ETH)
// (6.236 lecturas: cuando el modelo dijo 66 % acertó 67 %; 78 % → 79 %; 90 % → 90 %; 99 % → 99 %)
export const AJUSTE_SD = 1.1;    // la desviación teórica se queda algo corta (colas gordas): se ensancha
export const VENTAJA_MIN = 0.05; // valor esperado mínimo por USDT apostado, ya con comisión
export const NIVELES_PRED = { ALTA: 0.85, MEDIA: 0.72, BAJA: 0.6 };
export const CORTE_S = 8;        // con menos de esto no da tiempo a entrar (MEXC puede suspender órdenes)

// ---------------- matemáticas ----------------
// Distribución normal acumulada (Abramowitz-Stegun 7.1.26, error < 1.5e-7)
export function normalAcum(z) {
  if (!Number.isFinite(z)) return z > 0 ? 1 : 0;
  const x = Math.abs(z) / Math.SQRT2, t = 1 / (1 + 0.3275911 * x);
  const erf = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  return z >= 0 ? 0.5 * (1 + erf) : 0.5 * (1 - erf);
}
const r = (x, n = 2) => (Number.isFinite(x) ? +x.toFixed(n) : null);
const sumaCuadrados = (m) => (m * (m + 1) * (2 * m + 1)) / 6;

// ---------------- cajas ----------------
// Cajas alineadas al reloj: `antes` cerradas, la actual y `despues` próximas.
export function cajasReloj(ahora, plazoMin, antes = 5, despues = 5) {
  const ms = plazoMin * 60e3, actual = Math.floor(ahora / ms) * ms, out = [];
  for (let k = -antes; k <= despues; k++) {
    const inicio = actual + k * ms;
    out.push({ inicio, fin: inicio + ms, plazo_min: plazoMin, estado: k < 0 ? 'cerrada' : k === 0 ? 'actual' : 'proxima' });
  }
  return out;
}

// ---------------- series por segundo ----------------
// Velas de 1 s de Binance spot → serie continua (un valor por segundo; los segundos sin operaciones repiten el último).
// Devuelve { t0, c[], v[], compra[] } con v = volumen y compra = volumen comprador agresivo.
export function seriePorSegundo(klines, hasta = null) {
  const k = [...klines].sort((a, b) => a[0] - b[0]);
  if (!k.length) return null;
  const t0 = +k[0][0], fin = Math.floor((hasta ?? +k.at(-1)[0]) / 1000) * 1000;
  const n = Math.max(1, Math.round((fin - t0) / 1000) + 1), c = new Array(n), v = new Array(n).fill(0), compra = new Array(n).fill(0);
  let i = 0, ult = +k[0][4];
  for (let s = 0; s < n; s++) {
    const t = t0 + s * 1000;
    while (i < k.length && +k[i][0] < t) i++;
    if (i < k.length && +k[i][0] === t) { ult = +k[i][4]; v[s] = +k[i][5]; compra[s] = +k[i][9]; }
    c[s] = ult;
  }
  return { t0, c, v, compra };
}
const pos = (S, t) => Math.round((t - S.t0) / 1000);
export const spotEn = (S, t) => { const i = pos(S, t); return i >= 0 && i < S.c.length ? S.c[i] : null; };
// media del spot en los segundos [a, b] (ms, incluidos); null si no está completa
function mediaSpot(S, a, b) {
  const i = pos(S, a), j = pos(S, b);
  if (i < 0 || j >= S.c.length || j < i) return null;
  let s = 0; for (let x = i; x <= j; x++) s += S.c[x];
  return s / (j - i + 1);
}
// Lo que valdría el índice en t según el spot (sin la diferencia USD/USDT)
export const indiceTeorico = (S, t) => mediaSpot(S, t - (RETRASO_S + VENTANA_S - 1) * 1000, t - RETRASO_S * 1000);

// Diferencia fija entre el índice real y el teórico (USD frente a USDT): mediana de los últimos minutos
export function diferenciaIndice(S, indice, hasta, seg = 300) {
  const d = [];
  for (const [t, p] of indice) {
    if (t > hasta || t < hasta - seg * 1000) continue;
    const m = indiceTeorico(S, t);
    if (m != null) d.push(p - m);
  }
  if (d.length < 20) return null;
  d.sort((a, b) => a - b);
  return d[Math.floor(d.length / 2)];
}

// Volatilidad por segundo (en precio) con retornos de `paso` s de los últimos `seg` s: los retornos de 1 s
// llevan el rebote entre compra y venta y exageran.
export function volatilidadSeg(S, hasta, seg = 600, paso = 5) {
  const j = Math.min(pos(S, hasta), S.c.length - 1), i = Math.max(0, j - seg);
  let s2 = 0, n = 0;
  for (let x = i + paso; x <= j; x += paso) { const d = S.c[x] - S.c[x - paso]; s2 += d * d; n++; }
  return n >= 12 ? Math.sqrt(s2 / n / paso) : null;
}

// ---------------- modelo ----------------
/**
 * Proyecta el índice en el instante `objetivo` con el spot conocido hasta `ahora`.
 * El índice en T es la media del spot en [T−64 s, T−5 s]: la parte ya ocurrida se conoce, la que falta se
 * supone paseo aleatorio desde el último precio (más `deriva` por segundo si se indica).
 * @returns {{ esperado: number, sd: number, conocido_pct: number, faltan_s: number } | null}
 */
export function proyectarIndice(S, ahora, objetivo, sigma, { dif = 0, deriva = 0 } = {}) {
  const n = Math.min(pos(S, ahora), S.c.length - 1);
  if (n < 0 || !(sigma >= 0)) return null;
  const a = pos(S, objetivo - (RETRASO_S + VENTANA_S - 1) * 1000), b = pos(S, objetivo - RETRASO_S * 1000);
  const ultimo = S.c[n];
  if (n >= b) { // ventana completa: el cierre ya está decidido
    const m = mediaSpot(S, S.t0 + a * 1000, S.t0 + b * 1000);
    return m == null ? null : { esperado: m + dif, sd: 0, conocido_pct: 100, faltan_s: 0 };
  }
  const W = VENTANA_S;
  if (n < a) { // toda la ventana es futura: media de un paseo en los pasos g+1 … g+W
    const g = a - n - 1;
    return { esperado: ultimo + dif + deriva * (g + (W + 1) / 2), sd: sigma * Math.sqrt(g + sumaCuadrados(W) / (W * W)), conocido_pct: 0, faltan_s: b - n };
  }
  if (a < 0) return null;
  let suma = 0; for (let x = a; x <= n; x++) suma += S.c[x];
  const k = n - a + 1, m = W - k;
  return {
    esperado: (suma + m * ultimo + deriva * (m * (m + 1)) / 2) / W + dif,
    sd: (sigma * Math.sqrt(sumaCuadrados(m))) / W, conocido_pct: r((100 * k) / W, 0), faltan_s: m,
  };
}

/**
 * Probabilidad de Up de una caja. Con la caja abierta, la base es fija; en una caja que aún no abre la base
 * también es una proyección (y casi todo es moneda al aire salvo en el último minuto antes de abrir).
 */
export function probabilidadCaja(S, ahora, caja, sigma, { dif = 0, base = null, deriva = 0, ajuste = AJUSTE_SD } = {}) {
  const fin = proyectarIndice(S, ahora, caja.fin, sigma, { dif, deriva });
  if (!fin) return null;
  let baseEst = base, sd = fin.sd, baseFija = base != null;
  if (base == null) {
    const ini = proyectarIndice(S, ahora, caja.inicio, sigma, { dif, deriva });
    if (!ini) return null;
    baseEst = ini.esperado;
    baseFija = ini.sd === 0;
    // base y cierre comparten camino: la incertidumbre de la diferencia es la del tramo entre ambas ventanas
    sd = Math.sqrt(Math.max(0, fin.sd * fin.sd - ini.sd * ini.sd));
  }
  sd *= ajuste;
  const dist = fin.esperado - baseEst;
  const z = sd > 0 ? dist / sd : dist > 0 ? Infinity : -Infinity;
  const p = sd > 0 ? normalAcum(z) : dist > 0 ? 1 : 0;
  return { p_up: p, p_down: 1 - p, z: Number.isFinite(z) ? z : null, esperado: fin.esperado, sd, base: baseEst, base_fija: baseFija, distancia: dist, conocido_pct: fin.conocido_pct, decidido: fin.sd === 0 && baseFija };
}

// ---------------- veredicto ----------------
// Valor esperado por USDT apostado al comprar a `precio` (0–1) un lado con probabilidad p: cobra 1 por acción si gana.
export const valorEsperado = (p, precio, comision = COMISION_PRED) => (precio > 0 ? p / precio - 1 - comision : null);
// Precio máximo por acción que deja la ventaja mínima
export const precioMaximo = (p, comision = COMISION_PRED, ventaja = VENTAJA_MIN) => Math.min(0.99, p / (1 + comision + ventaja));

export function nivelPred(p) {
  return p >= NIVELES_PRED.ALTA ? 'ALTA' : p >= NIVELES_PRED.MEDIA ? 'MEDIA' : p >= NIVELES_PRED.BAJA ? 'BAJA' : 'NO OPERAR';
}

/**
 * Veredicto final: UP, DOWN o NO OPERAR. Acertar el lado no basta: hay que pagar menos de lo que vale.
 * @param {{ p_up: number, decidido?: boolean }} prob
 * @param {{ up?: { compra: number|null, venta: number|null }, down?: { compra: number|null, venta: number|null } } | null} mercado precios por acción (0–1); venta = lo que pagas al entrar
 */
export function veredictoPred(prob, mercado, { faltan_s = null, comision = COMISION_PRED, estado = 'actual' } = {}) {
  const lado = prob.p_up >= 0.5 ? 'UP' : 'DOWN', p = Math.max(prob.p_up, prob.p_down);
  const nivel = nivelPred(p), razones = [], avisos = [];
  const pago = mercado?.[lado.toLowerCase()]?.venta ?? null;
  const ve = pago ? valorEsperado(p, pago, comision) : null, maximo = precioMaximo(p, comision);
  const fuera = (motivo) => ({ veredicto: 'NO OPERAR', lado_probable: lado, probabilidad: r(100 * p, 1), nivel: 'NO OPERAR', precio_mercado: pago, precio_maximo: r(maximo, 3), valor_esperado_pct: ve == null ? null : r(100 * ve, 1), razones: [motivo, ...razones], avisos });
  if (estado === 'proxima' && !prob.base_fija && nivel === 'NO OPERAR') return fuera('La caja aún no abre y su precio base no está fijado: hoy es casi una moneda al aire. Vuelve a analizarla en su primer minuto.');
  if (faltan_s != null && faltan_s < CORTE_S && estado === 'actual') return fuera(`Quedan ${Math.max(0, Math.round(faltan_s))} s: ya no da tiempo a entrar con calma (MEXC puede suspender las órdenes cerca del cierre).`);
  if (nivel === 'NO OPERAR') return fuera(`El modelo da ${r(100 * p, 0)} % a ${lado}: por debajo del ${100 * NIVELES_PRED.BAJA} % no hay ventaja que cubra la comisión.`);
  razones.push(`El modelo da ${r(100 * p, 0)} % a ${lado}.`);
  if (pago == null) {
    avisos.push(`Sin precio de mercado de MEXC: entra solo si ${lado} cuesta ${r(maximo, 2)} o menos por acción.`);
    return { veredicto: lado, lado_probable: lado, probabilidad: r(100 * p, 1), nivel, precio_mercado: null, precio_maximo: r(maximo, 3), valor_esperado_pct: null, razones, avisos };
  }
  if (ve < VENTAJA_MIN) {
    return fuera(`${lado} es lo más probable (${r(100 * p, 0)} %), pero MEXC lo cobra a ${r(pago, 2)} por acción y solo vale la pena hasta ${r(maximo, 2)}: el mercado ya lo descuenta.`);
  }
  razones.push(`MEXC vende ${lado} a ${r(pago, 2)} por acción; vale la pena hasta ${r(maximo, 2)}. Valor esperado +${r(100 * ve, 0)} % por USDT apostado, con la comisión del ${r(100 * comision, 1)} %.`);
  if (prob.conocido_pct > 0) razones.push(`El ${prob.conocido_pct} % del minuto que promedia el cierre ya ocurrió.`);
  return { veredicto: lado, lado_probable: lado, probabilidad: r(100 * p, 1), nivel, precio_mercado: pago, precio_maximo: r(maximo, 3), valor_esperado_pct: r(100 * ve, 1), razones, avisos };
}

// ---------------- datos de MEXC ----------------
const numero = (x) => (x == null || x === '' || !(+x > 0) ? null : +x);
// Evento de la API → caja con nombres propios
export function cajaDeEvento(e) {
  const lado = (n) => { const x = (e.ers || []).find((y) => y.rn === n); return x ? { compra: numero(x.bp), venta: numero(x.ap) } : null; };
  const base = numero(e.bsp), cierre = numero(e.skp);
  return {
    id: e.id, moneda: e.as, plazo_min: Math.round(e.sp / 60), inicio: +e.st, fin: +e.et, base, cierre,
    resultado: base != null && cierre != null ? (cierre > base ? 'UP' : 'DOWN') : null,
    volumen: numero(e.v), comision: numero(e.tfr) ?? COMISION_PRED, up: lado('Up'), down: lado('Down'),
  };
}
// estado 1 = abiertas, 2 = liquidadas (MEXC devuelve las últimas ~12 h)
export async function eventosPred(f, estado = 1) {
  const j = await f.json(`${API_PRED}/event/v2/events?level1TypeId=702&status=${estado}`, `pred-eventos-${estado}.json`, { intentos: 2 });
  if (!Array.isArray(j?.data)) throw new Error('MEXC Predicción no respondió con la lista de cajas.');
  return j.data.filter((e) => MONEDAS_PRED.includes(e.as) && e.sp).map(cajaDeEvento);
}
// Índice por segundo [[t, precio]] en orden cronológico (MEXC da como mucho 1 h por llamada y 24 h hacia atrás)
export async function indicePred(f, moneda, desde, hasta, clave = null) {
  const j = await f.json(`${API_PRED}/event/index/price/range?indexName=${moneda}&start=${desde}&end=${hasta}&indexPeriod=300`, clave ?? `pred-indice-${moneda}.json`, { intentos: 2 });
  return (Array.isArray(j?.data) ? j.data : []).map((x) => [+x.ts, +x.p]).filter((x) => x[1] > 0).sort((a, b) => a[0] - b[0]);
}
// Velas de 1 s de Binance spot (hasta 1000 por llamada). El espejo data-api sirve donde api.binance.com está vetado.
const SPOT = ['https://api.binance.com', 'https://data-api.binance.vision'];
export async function spot1s(f, moneda, seg = 1000) {
  let fin = f.ahora(), filas = [], pagina = 0;
  while (filas.length < seg && pagina < 6) {
    const lim = Math.min(1000, seg - filas.length), ruta = `/api/v3/klines?symbol=${moneda}USDT&interval=1s&limit=${lim}&endTime=${fin}`, clave = `pred-spot-${moneda}${pagina ? `-p${pagina + 1}` : ''}.json`;
    let d = null;
    for (const h of SPOT) { try { d = await f.json(h + ruta, clave, { intentos: 1, timeout: 8000 }); if (Array.isArray(d)) break; d = null; } catch { d = null; } }
    if (!d?.length) break;
    filas = [...d, ...filas];
    fin = +d[0][0] - 1;
    pagina++;
    if (d.length < lim) break;
  }
  return filas;
}

// Precio ahora en varios exchanges (cada uno puede fallar sin romper nada)
const EXCHANGES_PRED = [
  ['Binance spot', (m) => `https://data-api.binance.vision/api/v3/ticker/bookTicker?symbol=${m}USDT`, (x) => [x?.bidPrice, x?.askPrice], 'USDT'],
  ['Binance futuros', (m) => `https://fapi.binance.com/fapi/v1/ticker/bookTicker?symbol=${m}USDT`, (x) => [x?.bidPrice, x?.askPrice], 'USDT'],
  ['Bybit spot', (m) => `https://api.bybit.com/v5/market/tickers?category=spot&symbol=${m}USDT`, (x) => [x?.result?.list?.[0]?.bid1Price, x?.result?.list?.[0]?.ask1Price], 'USDT'],
  ['Bybit futuros', (m) => `https://api.bybit.com/v5/market/tickers?category=linear&symbol=${m}USDT`, (x) => [x?.result?.list?.[0]?.bid1Price, x?.result?.list?.[0]?.ask1Price], 'USDT'],
  ['OKX spot', (m) => `https://www.okx.com/api/v5/market/ticker?instId=${m}-USDT`, (x) => [x?.data?.[0]?.bidPx, x?.data?.[0]?.askPx], 'USDT'],
  ['Coinbase', (m) => `https://api.exchange.coinbase.com/products/${m}-USD/ticker`, (x) => [x?.bid, x?.ask], 'USD'],
  ['MEXC spot', (m) => `https://api.mexc.com/api/v3/ticker/bookTicker?symbol=${m}USDT`, (x) => [x?.bidPrice, x?.askPrice], 'USDT'],
  ['MEXC futuros', (m) => `https://contract.mexc.com/api/v1/contract/ticker?symbol=${m}_USDT`, (x) => [x?.data?.bid1, x?.data?.ask1], 'USDT'],
];
export async function preciosExchanges(f, moneda) {
  const filas = await Promise.all(EXCHANGES_PRED.map(async ([nombre, url, leer, contra], i) => {
    try {
      const [b, a] = leer(await f.json(url(moneda), `pred-ex-${i}-${moneda}.json`, { intentos: 1, timeout: 4000 }));
      return +b > 0 && +a > 0 ? { nombre, contra, precio: (+b + +a) / 2 } : null;
    } catch { return null; }
  }));
  return filas.filter(Boolean);
}

// Libro de Binance spot: desequilibrio entre compras y ventas a ±5 pb del precio (contexto, no puntúa)
export async function libroSpot(f, moneda) {
  try {
    const d = await f.json(`https://data-api.binance.vision/api/v3/depth?symbol=${moneda}USDT&limit=500`, `pred-libro-${moneda}.json`, { intentos: 1, timeout: 5000 });
    const medio = (+d.bids[0][0] + +d.asks[0][0]) / 2, lim = medio * 0.0005;
    const suma = (l, ok) => l.filter(([p]) => ok(+p)).reduce((s, [, q]) => s + +q, 0);
    const c = suma(d.bids, (p) => p >= medio - lim), v = suma(d.asks, (p) => p <= medio + lim);
    return c + v > 0 ? { compras: r(c, 3), ventas: r(v, 3), desequilibrio_pct: r((100 * (c - v)) / (c + v), 0) } : null;
  } catch { return null; }
}

// ---------------- lectura del momento ----------------
// Flujo comprador/vendedor agresivo e impulso del spot en los últimos segundos (Binance spot)
export function flujoSpot(S, ahora, seg) {
  const j = Math.min(pos(S, ahora), S.c.length - 1), i = Math.max(0, j - seg + 1);
  let v = 0, c = 0; for (let x = i; x <= j; x++) { v += S.v[x]; c += S.compra[x]; }
  return { seg, volumen: r(v, 3), compra_pct: v > 0 ? r((100 * c) / v, 0) : null, cambio: S.c[j] - S.c[Math.max(0, i - 1)] };
}

/**
 * Repite el modelo sobre la última hora: cajas del mismo plazo empezando cada 20 s, mirando en el mismo
 * segundo transcurrido que ahora. Dice cuánto acierta el lado favorito y si la probabilidad está bien medida.
 */
export function repasoHora(S, indice, { plazoMin, transcurrido, hasta, dif, paso = 20 }) {
  const I = new Map(indice), ms = plazoMin * 60e3, filas = [];
  if (!indice.length) return null;
  for (let ini = Math.ceil(indice[0][0] / 1000) * 1000 + 120e3; ini + ms <= hasta; ini += paso * 1000) {
    const base = I.get(ini), cierre = I.get(ini + ms), t = ini + transcurrido * 1000;
    if (base == null || cierre == null) continue;
    const sigma = volatilidadSeg(S, t);
    if (sigma == null) continue;
    const p = probabilidadCaja(S, t, { inicio: ini, fin: ini + ms }, sigma, { dif, base });
    if (!p) continue;
    filas.push({ p: p.p_up, up: cierre > base });
  }
  if (filas.length < 10) return null;
  const tramo = (min, max) => {
    const l = filas.filter((x) => { const q = Math.max(x.p, 1 - x.p); return q >= min && q < max; });
    const ok = l.filter((x) => (x.p >= 0.5) === x.up).length;
    return { desde_pct: 100 * min, n: l.length, aciertos: ok, acierto_pct: l.length ? r((100 * ok) / l.length, 0) : null };
  };
  const ok = filas.filter((x) => (x.p >= 0.5) === x.up).length;
  return {
    muestras: filas.length, acierto_pct: r((100 * ok) / filas.length, 0), up_pct: r((100 * filas.filter((x) => x.up).length) / filas.length, 0),
    tramos: [tramo(0.5, NIVELES_PRED.BAJA), tramo(NIVELES_PRED.BAJA, NIVELES_PRED.MEDIA), tramo(NIVELES_PRED.MEDIA, NIVELES_PRED.ALTA), tramo(NIVELES_PRED.ALTA, 1.01)],
  };
}

// Rachas y reparto de las cajas ya liquidadas (más recientes primero)
export function resumenCerradas(cerradas) {
  const l = cerradas.filter((c) => c.resultado);
  if (!l.length) return null;
  let racha = 1; while (racha < l.length && l[racha].resultado === l[0].resultado) racha++;
  // ¿tras un Up viene otro Up? (continuación frente a alternancia)
  let sigue = 0, pares = 0; for (let i = 0; i + 1 < l.length; i++) { pares++; if (l[i].resultado === l[i + 1].resultado) sigue++; }
  return { n: l.length, up: l.filter((c) => c.resultado === 'UP').length, up_pct: r((100 * l.filter((c) => c.resultado === 'UP').length) / l.length, 0), racha: { lado: l[0].resultado, n: racha }, repite_pct: pares ? r((100 * sigue) / pares, 0) : null };
}

// ---------------- informes ----------------
const mercadoDe = (c) => (c?.up || c?.down ? { up: c.up, down: c.down } : null);
const SPOT_LISTA = 420; // segundos de spot para la lista (volatilidad + ventana del índice)

/**
 * Lista de cajas de una moneda y un plazo: 5 anteriores con su resultado, la actual con su base, los precios
 * de MEXC y una probabilidad rápida, y las próximas.
 */
export async function listaPrediccion(f, { moneda, plazo, antes = 5, despues = 5 }) {
  const ahora = f.ahora();
  const [abiertas, liquidadas, klines, indice] = await Promise.all([
    eventosPred(f, 1), eventosPred(f, 2).catch(() => []), spot1s(f, moneda, SPOT_LISTA).catch(() => []),
    indicePred(f, moneda, ahora - 420e3, ahora).catch(() => []),
  ]);
  const deSerie = (l) => l.filter((c) => c.moneda === moneda && c.plazo_min === plazo);
  const cerradas = deSerie(liquidadas).sort((a, b) => b.inicio - a.inicio);
  const porInicio = new Map([...cerradas, ...deSerie(abiertas)].map((c) => [c.inicio, c]));
  const S = klines.length > 120 ? seriePorSegundo(klines, ahora) : null;
  const dif = S ? diferenciaIndice(S, indice, ahora) : null, sigma = S ? volatilidadSeg(S, ahora, 300) : null;
  const I = new Map(indice);
  const cajas = cajasReloj(ahora, plazo, antes, despues).map((c) => {
    const e = porInicio.get(c.inicio);
    // la base de la actual sale de MEXC; si su lista va tarde, del propio índice en el instante de apertura
    const base = e?.base ?? (c.estado !== 'proxima' ? I.get(c.inicio) ?? null : null), cierre = e?.cierre ?? (c.estado === 'cerrada' ? I.get(c.fin) ?? null : null);
    const fila = { ...c, id: e?.id ?? null, base, cierre: c.estado === 'cerrada' ? cierre : null, resultado: c.estado === 'cerrada' && base != null && cierre != null ? (cierre > base ? 'UP' : 'DOWN') : null, cambio_pct: c.estado === 'cerrada' && base && cierre ? r((100 * (cierre - base)) / base, 3) : null, volumen: e?.volumen ?? null, mercado: c.estado === 'actual' ? mercadoDe(e) : null, p_up: null };
    if (c.estado !== 'cerrada' && S && sigma != null && dif != null && (c.estado === 'proxima' || base != null)) {
      const p = probabilidadCaja(S, ahora, c, sigma, { dif, base: c.estado === 'actual' ? base : null });
      if (p) { fila.p_up = r(100 * p.p_up, 0); if (c.estado === 'proxima') fila.base_estimada = p.base_fija || c.inicio - ahora < 70e3 ? r(p.base, 2) : null; }
    }
    return fila;
  });
  return {
    ahora, moneda, plazo, cajas, indice: indice.length ? { t: indice.at(-1)[0], precio: indice.at(-1)[1] } : null,
    spot: S ? { precio: S.c.at(-1), dif_indice: dif } : null, resumen: resumenCerradas(cerradas), comision: abiertas[0]?.comision ?? COMISION_PRED,
  };
}

/** Análisis completo de una caja (cerrada, actual o próxima) con veredicto final. */
export async function analizarPrediccion(f, { moneda, plazo, inicio }) {
  const ahora = f.ahora(), ms = plazo * 60e3;
  inicio = Math.floor(inicio / ms) * ms;
  const caja = { inicio, fin: inicio + ms, plazo_min: plazo, estado: ahora >= inicio + ms ? 'cerrada' : ahora >= inicio ? 'actual' : 'proxima' };

  if (caja.estado === 'cerrada') {
    // cómo terminó: recorrido del índice dentro de la caja (MEXC guarda 24 h)
    const [liquidadas, indice] = await Promise.all([eventosPred(f, 2).catch(() => []), indicePred(f, moneda, inicio - 60e3, inicio + ms, `pred-indice-caja-${moneda}-${plazo}-${inicio}.json`).catch(() => [])]);
    const e = liquidadas.find((c) => c.moneda === moneda && c.plazo_min === plazo && c.inicio === inicio), I = new Map(indice);
    const base = e?.base ?? I.get(inicio) ?? null, cierre = e?.cierre ?? I.get(inicio + ms) ?? null;
    if (base == null || cierre == null) throw new Error('MEXC ya no guarda los datos de esa caja (solo las últimas 24 h).');
    const dentro = indice.filter(([t]) => t >= inicio && t <= inicio + ms);
    const max = dentro.length ? Math.max(...dentro.map((x) => x[1])) : null, min = dentro.length ? Math.min(...dentro.map((x) => x[1])) : null;
    let cruces = 0; for (let i = 1; i < dentro.length; i++) if ((dentro[i][1] > base) !== (dentro[i - 1][1] > base)) cruces++;
    // ¿en qué minuto quedó definido el lado ganador? (último cruce de la base)
    let ultimoCruce = null; for (let i = 1; i < dentro.length; i++) if ((dentro[i][1] > base) !== (dentro[i - 1][1] > base)) ultimoCruce = dentro[i][0];
    return {
      ahora, moneda, plazo, caja: { ...caja, id: e?.id ?? null, base, cierre, resultado: cierre > base ? 'UP' : 'DOWN', cambio: cierre - base, cambio_pct: r((100 * (cierre - base)) / base, 3), volumen: e?.volumen ?? null },
      recorrido: dentro.length ? { max, min, sobre_base_pct: r((100 * dentro.filter((x) => x[1] > base).length) / dentro.length, 0), cruces, ultimo_cruce_s: ultimoCruce ? Math.round((ultimoCruce - inicio) / 1000) : 0 } : null,
      serie: dentro.filter((_, i) => i % 2 === 0).map(([t, p]) => ({ t, indice: p })),
    };
  }

  const [abiertas, liquidadas, klines, indice, exchanges, libro] = await Promise.all([
    eventosPred(f, 1).catch(() => []), eventosPred(f, 2).catch(() => []), spot1s(f, moneda, 3700),
    indicePred(f, moneda, ahora - 3600e3, ahora), preciosExchanges(f, moneda).catch(() => []), libroSpot(f, moneda),
  ]);
  if (klines.length < 300) throw new Error('No se pudo leer el spot por segundo de Binance: sin él no hay proyección.');
  if (indice.length < 120) throw new Error('MEXC no devolvió el índice de Predicción. Prueba de nuevo en unos segundos.');
  const S = seriePorSegundo(klines, ahora);
  const e = abiertas.find((c) => c.moneda === moneda && c.plazo_min === plazo && c.inicio === inicio), I = new Map(indice);
  const dif = diferenciaIndice(S, indice, ahora) ?? 0, sigma = volatilidadSeg(S, ahora);
  if (sigma == null) throw new Error('Faltan datos recientes del spot para medir la volatilidad.');
  const base = caja.estado === 'actual' ? e?.base ?? I.get(inicio) ?? null : null;
  if (caja.estado === 'actual' && base == null) throw new Error('MEXC aún no publica el precio base de esta caja. Actualiza en unos segundos.');
  const faltan = (caja.fin - ahora) / 1000, transcurrido = Math.max(0, (ahora - inicio) / 1000);
  const prob = probabilidadCaja(S, ahora, caja, sigma, { dif, base });
  if (!prob) throw new Error('No hay datos suficientes del spot para proyectar esta caja.');
  const mercado = mercadoDe(e), comision = e?.comision ?? COMISION_PRED;
  const v = veredictoPred(prob, mercado, { faltan_s: faltan, comision, estado: caja.estado });

  const spot = S.c.at(-1) + dif, idx = indice.at(-1)[1];
  const f60 = flujoSpot(S, ahora, 60), f300 = flujoSpot(S, ahora, 300);
  const cerradas = liquidadas.filter((c) => c.moneda === moneda && c.plazo_min === plazo).sort((a, b) => b.inicio - a.inicio);
  const ref = exchanges.find((x) => x.nombre === 'Binance spot')?.precio ?? S.c.at(-1);
  const pb = (x) => r((1e4 * x) / prob.base, 1);

  // Factores: qué empuja a cada lado. Solo los tres primeros entran en la probabilidad; el resto es contexto.
  const factores = [];
  const hacia = (x) => (x > 0 ? 'UP' : x < 0 ? 'DOWN' : null);
  if (caja.estado === 'actual') factores.push({ nombre: 'Índice de MEXC frente a la base', valor: `${idx - base >= 0 ? '+' : ''}${r(idx - base, 2)} (${pb(idx - base)} pb)`, hacia: hacia(idx - base), cuenta: true, texto: 'Dónde está ahora mismo el precio que MEXC muestra y liquida.' });
  factores.push({ nombre: 'Spot en vivo frente al índice', valor: `${spot - idx >= 0 ? '+' : ''}${r(spot - idx, 2)} (${pb(spot - idx)} pb)`, hacia: Math.abs(spot - idx) / prob.base > 2e-5 ? hacia(spot - idx) : null, cuenta: true, texto: 'El índice es la media de los últimos 60 s del spot: va hacia donde el spot ya está. Es el adelanto real frente al gráfico de MEXC.' });
  factores.push({ nombre: 'Cierre proyectado frente a la base', valor: `${prob.distancia >= 0 ? '+' : ''}${r(prob.distancia, 2)} · margen típico ±${r(prob.sd, 2)}`, hacia: hacia(prob.distancia), cuenta: true, texto: prob.z == null ? 'El cierre ya está decidido.' : `La distancia equivale a ${r(Math.abs(prob.z), 1)} veces el movimiento típico que queda hasta el cierre.` });
  factores.push({ nombre: 'Flujo agresivo 60 s (Binance spot)', valor: f60.compra_pct == null ? 'sin operaciones' : `${f60.compra_pct} % compras`, hacia: f60.compra_pct == null ? null : f60.compra_pct >= 60 ? 'UP' : f60.compra_pct <= 40 ? 'DOWN' : null, cuenta: false, texto: 'Quién cruza el libro en el último minuto. Contexto: en el estudio de 24 h no mejoró la proyección.' });
  factores.push({ nombre: 'Impulso del spot 60 s', valor: `${f60.cambio >= 0 ? '+' : ''}${r(f60.cambio, 2)}`, hacia: null, cuenta: false, texto: 'Ya está dentro de la proyección (el spot de ahora). A estos plazos el impulso no se prolonga de forma fiable.' });
  if (libro) factores.push({ nombre: 'Libro de Binance spot (±5 pb)', valor: `${libro.desequilibrio_pct >= 0 ? '+' : ''}${libro.desequilibrio_pct} %`, hacia: libro.desequilibrio_pct >= 30 ? 'UP' : libro.desequilibrio_pct <= -30 ? 'DOWN' : null, cuenta: false, texto: 'Más órdenes de compra que de venta cerca del precio (o al revés). Contexto: las órdenes se retiran en segundos.' });
  if (mercado?.up?.venta && mercado?.down?.venta) {
    const impl = mercado.up.venta / (mercado.up.venta + mercado.down.venta);
    factores.push({ nombre: 'Lo que descuenta MEXC', valor: `Up ${r(100 * impl, 0)} % · modelo ${r(100 * prob.p_up, 0)} %`, hacia: null, cuenta: false, texto: 'Probabilidad implícita en los precios de las acciones. La ventaja es la diferencia con el modelo, no acertar el lado.' });
  }

  const avisos = [...v.avisos];
  if (sigma / prob.base > 2.5e-4) avisos.push('Volatilidad muy alta ahora mismo: el margen de error del cierre es mayor de lo normal.');
  if (caja.estado === 'actual' && faltan > 75 && Math.abs(prob.z ?? 9) < 0.5) avisos.push('El precio está pegado a la base y queda tiempo: espera a que se separe o al último minuto y medio, cuando el cierre empieza a fijarse.');
  if (caja.estado === 'actual' && faltan <= 65) avisos.push('Último minuto: el promedio del cierre ya se está formando. Es cuando el modelo acierta más, y también cuando MEXC cobra más caro el lado ganador.');

  // serie para el gráfico: últimos minutos de índice y spot (ajustado a USD), cada 2 s
  const desde = Math.max(caja.estado === 'actual' ? inicio - 90e3 : ahora - 300e3, indice[0][0]);
  const serie = indice.filter(([t], i) => t >= desde && i % 2 === 0).map(([t, p]) => ({ t, indice: p, spot: spotEn(S, t) != null ? r(spotEn(S, t) + dif, 4) : null }));

  return {
    ahora, moneda, plazo, caja: { ...caja, id: e?.id ?? null, base: caja.estado === 'actual' ? base : null, base_estimada: caja.estado === 'proxima' ? r(prob.base, 4) : null, base_fija: prob.base_fija, volumen: e?.volumen ?? null },
    faltan_s: Math.round(faltan), transcurrido_s: Math.round(transcurrido),
    indice: idx, spot: r(spot, 4), dif_usd: r(dif, 4), volatilidad_pb_min: r((1e4 * sigma * Math.sqrt(60)) / prob.base, 2),
    proyeccion: { p_up: r(100 * prob.p_up, 1), p_down: r(100 * prob.p_down, 1), cierre_esperado: r(prob.esperado, 4), margen: r(prob.sd, 4), distancia: r(prob.distancia, 4), distancia_pb: pb(prob.distancia), z: prob.z == null ? null : r(prob.z, 2), conocido_pct: prob.conocido_pct, decidido: prob.decidido },
    ...v, mercado, comision, factores, avisos,
    exchanges: exchanges.map((x) => ({ nombre: x.nombre, contra: x.contra, precio: x.precio, dif_pb: r((1e4 * (x.precio - ref)) / ref, 1) })),
    flujo: { s60: f60, s300: f300 }, libro,
    repaso: repasoHora(S, indice, { plazoMin: plazo, transcurrido: caja.estado === 'actual' ? transcurrido : 0, hasta: ahora, dif }),
    resumen: resumenCerradas(cerradas), serie,
  };
}
