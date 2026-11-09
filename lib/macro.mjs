// Oro y petróleo como contexto macro de BTC: precio, cambios de 1 h / 4 h / 24 h / 7 días, la curva de
// 24 h y cuánto se parecen a BTC (correlación de los retornos de 1 h en 7 días). Datos de los perpetuos
// TradFi de Binance (XAUUSDT y CLUSDT, API pública, sin key), que cotizan las 24 h.
//
// En operaciones de 15-60 min el oro y el petróleo casi nunca marcan la dirección de BTC (la correlación
// de 1 h suele ser baja), así que NO entran en la puntuación. Lo que sí importa es un movimiento brusco:
// suele venir de una noticia macro (guerra, OPEP, Fed, inflación) que también sacude a las cripto. Por eso
// solo avisan y bajan un poco la confianza cuando uno de los dos se mueve fuerte en la última hora.

const BN = 'https://fapi.binance.com';
export const ACTIVOS_MACRO = [
  // choque: movimiento en 1 h que se considera brusco; dia: movimiento en 24 h que hace del día uno volátil
  { clave: 'oro', nombre: 'Oro', simbolo: 'XAUUSDT', choque: 1.2, dia: 3 },
  { clave: 'petroleo', nombre: 'Petróleo WTI', simbolo: 'CLUSDT', choque: 2, dia: 5 },
];

const velasDe = (k) => (Array.isArray(k) ? k.map((x) => ({ t: +x[0], o: +x[1], h: +x[2], l: +x[3], c: +x[4] })) : []);
const cambio = (velas, horas, precio, minVela) => {
  const n = Math.round((horas * 60) / minVela);
  return velas.length > n ? +((100 * (precio - velas.at(-n - 1).c)) / velas.at(-n - 1).c).toFixed(2) : null;
};

// Correlación de Pearson de los retornos de 1 h, emparejados por hora (mínimo 48 horas en común).
export function correlacion1h(a, b) {
  if (!a?.length || !b?.length) return null;
  const mapa = new Map(b.map((x) => [x.t, x.c]));
  const pares = [];
  for (let i = 1; i < a.length; i++) {
    const b0 = mapa.get(a[i - 1].t), b1 = mapa.get(a[i].t);
    if (b0 && b1) pares.push([a[i].c / a[i - 1].c - 1, b1 / b0 - 1]);
  }
  if (pares.length < 48) return null;
  const n = pares.length, mx = pares.reduce((s, p) => s + p[0], 0) / n, my = pares.reduce((s, p) => s + p[1], 0) / n;
  let sxy = 0, sxx = 0, syy = 0;
  for (const [x, y] of pares) { sxy += (x - mx) * (y - my); sxx += (x - mx) ** 2; syy += (y - my) ** 2; }
  return sxx && syy ? +(sxy / Math.sqrt(sxx * syy)).toFixed(2) : null;
}

// c1hBTC: velas de 1 h de BTC (cerradas) para la correlación; opcional.
export async function analizarMacro(fuente, c1hBTC = null) {
  const ahora = fuente.ahora();
  const uno = async (a) => {
    try {
      const [k15, k1h] = await Promise.all([
        fuente.json(`${BN}/fapi/v1/klines?symbol=${a.simbolo}&interval=15m&limit=97&endTime=${ahora}`, `macro-${a.simbolo}-15m.json`),
        fuente.json(`${BN}/fapi/v1/klines?symbol=${a.simbolo}&interval=1h&limit=169&endTime=${ahora}`, `macro-${a.simbolo}-1h.json`),
      ]);
      const v15 = velasDe(k15).filter((v) => v.t <= ahora), v1h = velasDe(k1h).filter((v) => v.t <= ahora);
      if (v15.length < 10) return null;
      const precio = v15.at(-1).c;
      const r = {
        clave: a.clave, nombre: a.nombre, simbolo: a.simbolo, precio,
        cambio_1h: cambio(v15, 1, precio, 15), cambio_4h: cambio(v15, 4, precio, 15), cambio_24h: cambio(v15, 24, precio, 15),
        cambio_7d: v1h.length > 1 ? +((100 * (precio - v1h[0].c)) / v1h[0].c).toFixed(2) : null,
        // solo velas cerradas de 1 h para la correlación
        correlacion_btc: correlacion1h(v1h.filter((v) => v.t + 3600e3 <= ahora), c1hBTC),
        serie: v15.map((v) => ({ t: v.t, c: v.c })),
      };
      r.choque = r.cambio_1h != null && Math.abs(r.cambio_1h) >= a.choque;
      r.dia_volatil = r.cambio_24h != null && Math.abs(r.cambio_24h) >= a.dia;
      r.frase = fraseMacro(r);
      return r;
    } catch { return null; }
  };
  const activos = (await Promise.all(ACTIVOS_MACRO.map(uno))).filter(Boolean);
  return activos.length ? { ahora, activos } : null;
}

const sg = (x) => (x == null ? '—' : `${x >= 0 ? '+' : ''}${x} %`);
export function fraseMacro(r) {
  const rel = r.correlacion_btc == null ? 'sin datos para medir cuánto se parece a BTC'
    : Math.abs(r.correlacion_btc) < 0.3 ? `casi no se mueve con BTC (correlación 1 h ${r.correlacion_btc})`
      : `se mueve ${r.correlacion_btc > 0 ? 'con' : 'al revés que'} BTC (correlación 1 h ${r.correlacion_btc})`;
  const estado = r.choque ? `MOVIMIENTO BRUSCO: ${sg(r.cambio_1h)} en 1 h` : r.dia_volatil ? `día volátil: ${sg(r.cambio_24h)} en 24 h` : `${sg(r.cambio_1h)} en 1 h, ${sg(r.cambio_24h)} en 24 h`;
  return `${r.nombre}: ${estado}; ${rel}.`;
}

// Efecto en una señal: un choque en oro o petróleo (noticia macro) baja la confianza 5 puntos y avisa.
// Si además el activo se mueve con BTC (|correlación| ≥ 0.5) y va en contra del lado, se dice.
export function efectoMacro(macro, lado) {
  if (!macro?.activos?.length) return { ajuste_conf: 0, textos: [] };
  const L = lado === 'LONG' ? 1 : -1, textos = [];
  let ajuste = 0;
  for (const r of macro.activos) {
    if (r.choque) {
      ajuste = -5;
      textos.push(`${r.nombre} se movió ${sg(r.cambio_1h)} en la última hora: suele ser una noticia macro que también mueve a las cripto. Ve con tamaño menor y SL firme.`);
    }
    if (r.correlacion_btc != null && Math.abs(r.correlacion_btc) >= 0.5 && r.cambio_4h != null && Math.abs(r.cambio_4h) >= r.choque / 2) {
      const empuja = Math.sign(r.cambio_4h) * Math.sign(r.correlacion_btc);
      if (empuja === -L) textos.push(`${r.nombre} (${sg(r.cambio_4h)} en 4 h) se está moviendo con BTC y empuja en contra del ${lado}.`);
    }
  }
  return { ajuste_conf: ajuste, textos };
}

// Lo justo para guardar en la señal (sin la curva).
export const macroResumen = (m) => (m ? m.activos.map(({ serie, ...r }) => r) : null);
