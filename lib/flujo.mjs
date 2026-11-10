// Flujo de órdenes: CVD (Cumulative Volume Delta) y Open Interest de las últimas 24 h, en velas de 5 min.
// Datos públicos de Binance Futures (las velas traen el volumen comprado a mercado y openInterestHist el OI),
// así que funciona aunque la señal use Bybit o MEXC: Binance es el mercado con más volumen y guía al resto.
//
//  - CVD: compras agresivas (a mercado) menos ventas agresivas, acumulado. Dice quién empuja el precio.
//  - OI: contratos abiertos. Sube = entra dinero nuevo; baja = se cierran posiciones.
//
// Lectura (última hora): precio, OI y CVD juntos dicen si el movimiento es sano (dinero nuevo y agresivo a
// favor), débil (cierres: squeeze o liquidaciones) o sospechoso (sube con ventas agresivas absorbidas).
// Divergencias (últimas 3 h): el precio hace un máximo más alto y el CVD no (compradores agotados), o un
// mínimo más bajo y el CVD no (absorción: alguien grande compra todo lo que se vende).
// Pesa poco y nunca decide solo: suma o resta como mucho 5 puntos de confianza.

const BN = 'https://fapi.binance.com';
const VELA = 5 * 60e3;

export async function simboloBinance(fuente, base, intento) {
  for (const s of [`${base}USDT`, `1000${base}USDT`]) {
    try { const r = await intento(s); if (r) return { s, r }; } catch { /* probar el siguiente nombre */ }
  }
  return null;
}

// Velas de 5 min con volumen comprado a mercado + OI de 5 min, 24 h. Devuelve null si no hay datos.
export async function datosFlujo(fuente, base) {
  const ahora = fuente.ahora();
  const k = await simboloBinance(fuente, base, async (s) => {
    const d = await fuente.json(`${BN}/fapi/v1/klines?symbol=${s}&interval=5m&limit=288&endTime=${ahora}`, `flujo-${s}-5m.json`);
    return Array.isArray(d) && d.length ? d : null;
  });
  if (!k) return null;
  const oi = await fuente.json(`${BN}/futures/data/openInterestHist?symbol=${k.s}&period=5m&limit=288&endTime=${ahora}`, `flujo-${k.s}-oi.json`).catch(() => null);
  const velas = k.r.map((x) => ({ t: +x[0], o: +x[1], h: +x[2], l: +x[3], c: +x[4], v: +x[5], tb: +x[9] }))
    .filter((v) => v.t + VELA <= ahora && v.v > 0); // solo velas cerradas
  const mapaOI = new Map((Array.isArray(oi) ? oi : []).map((x) => [+x.timestamp, +x.sumOpenInterest]));
  // el OI de Binance lleva la marca de tiempo del final del periodo: se asigna a la vela que termina ahí
  for (const v of velas) v.oi = mapaOI.get(v.t + VELA) ?? mapaOI.get(v.t) ?? null;
  return { simbolo: k.s, velas };
}

// Delta y CVD (en USD) de cada vela.
export function conCVD(velas) {
  let cvd = 0;
  return velas.map((v) => {
    const delta = (2 * v.tb - v.v) * v.c;
    cvd += delta;
    return { ...v, delta, cvd };
  });
}

const pct = (a, b) => (a != null && b ? (100 * (a - b)) / b : null);
const r2 = (x) => (x == null ? null : +x.toFixed(2));

// Máximos y mínimos locales (k velas a cada lado) del precio, con el CVD en ese punto.
function giros(v, k = 3) {
  const altos = [], bajos = [];
  for (let i = k; i < v.length - 1; i++) {
    const vent = v.slice(i - k, Math.min(v.length, i + k + 1)).filter((_, j) => j !== k);
    if (vent.every((x) => x.h < v[i].h)) altos.push(i);
    if (vent.every((x) => x.l > v[i].l)) bajos.push(i);
  }
  return { altos, bajos };
}

// Análisis puro sobre velas con CVD y OI.
export function leerFlujo(velas, { ventana = 12, ventanaDiv = 36 } = {}) {
  const v = conCVD(velas);
  if (v.length < ventanaDiv + 2) return null;
  const u = v.at(-1), a = v.at(-ventana - 1);
  const vol = v.slice(-ventana).reduce((s, x) => s + x.v * x.c, 0);
  const deltaVentana = u.cvd - a.cvd;
  const fuerzaCVD = vol ? deltaVentana / vol : 0; // −1..1: qué parte del volumen fue agresiva neta
  const precioPct = pct(u.c, a.c);
  const oiPct = u.oi != null && a.oi != null ? pct(u.oi, a.oi) : null;

  // régimen de la última hora
  const sube = precioPct >= 0.15, baja = precioPct <= -0.15;
  const oiSube = oiPct != null && oiPct >= 0.3, oiBaja = oiPct != null && oiPct <= -0.3;
  const cvdC = fuerzaCVD >= 0.04, cvdV = fuerzaCVD <= -0.04;
  let regimen = 'sin dirección', sesgo = 0, frase = 'Precio, OI y CVD sin una dirección clara en la última hora.';
  if (sube && oiSube && cvdC) { regimen = 'subida sana'; sesgo = 1; frase = 'Suben precio, OI y CVD: entran longs nuevos y agresivos (subida sana).'; }
  else if (baja && oiSube && cvdV) { regimen = 'caída sana'; sesgo = -1; frase = 'Bajan precio y CVD con el OI subiendo: entran shorts nuevos y agresivos (caída sana).'; }
  else if (sube && oiBaja) { regimen = 'cierre de shorts'; sesgo = 0.3; frase = 'Sube con el OI bajando: son shorts cerrando (squeeze). Subida débil, suele agotarse.'; }
  else if (baja && oiBaja) { regimen = 'cierre de longs'; sesgo = -0.3; frase = 'Baja con el OI bajando: son longs cerrando o liquidándose. Caída que suele agotarse.'; }
  else if (sube && cvdV) { regimen = 'subida absorbida'; sesgo = -0.4; frase = 'Sube pero con ventas agresivas: alguien vende a la subida. Cuidado con un techo.'; }
  else if (baja && cvdC) { regimen = 'caída absorbida'; sesgo = 0.4; frase = 'Baja pero con compras agresivas: alguien compra la caída. Posible suelo.'; }
  else if (sube && cvdC) { regimen = 'subida con compras'; sesgo = 0.6; frase = 'Sube con compras agresivas (el OI no confirma dinero nuevo).'; }
  else if (baja && cvdV) { regimen = 'caída con ventas'; sesgo = -0.6; frase = 'Baja con ventas agresivas (el OI no confirma dinero nuevo).'; }

  // divergencias: los dos últimos máximos (o mínimos) del precio en las últimas 3 h; el último reciente
  const w = v.slice(-ventanaDiv);
  const g = giros(w);
  let divergencia = null;
  const reciente = (i) => w.length - 1 - i <= 12; // el último giro, en la última hora
  const [h1, h2] = g.altos.slice(-2), [l1, l2] = g.bajos.slice(-2);
  if (h2 != null && reciente(h2) && w[h2].h > w[h1].h && w[h2].cvd < w[h1].cvd)
    divergencia = { tipo: 'bajista', frase: 'Divergencia bajista: el precio hizo un máximo más alto y el CVD uno más bajo (los compradores se agotan).', t: w[h2].t, precio: w[h2].h };
  if (l2 != null && reciente(l2) && w[l2].l < w[l1].l && w[l2].cvd > w[l1].cvd && (!divergencia || l2 > h2))
    divergencia = { tipo: 'alcista', frase: 'Absorción alcista: el precio hizo un mínimo más bajo y el CVD uno más alto (alguien compra todo lo que se vende).', t: w[l2].t, precio: w[l2].l };

  const puntuacion = +Math.max(-1, Math.min(1, 0.7 * sesgo + (divergencia ? (divergencia.tipo === 'alcista' ? 0.4 : -0.4) : 0))).toFixed(2);
  const oiSerie = v.filter((x) => x.oi != null);
  const ini = v[Math.max(0, v.length - 97)];
  return {
    ventana_min: ventana * 5,
    precio_pct: r2(precioPct), oi_pct: r2(oiPct), cvd_usd: Math.round(deltaVentana), fuerza_cvd: +fuerzaCVD.toFixed(3),
    oi_24h_pct: oiSerie.length > 1 ? r2(pct(oiSerie.at(-1).oi, oiSerie[0].oi)) : null,
    cvd_24h_usd: Math.round(u.cvd - v[0].cvd + v[0].delta),
    regimen, sesgo, frase, divergencia, puntuacion,
    // curva para la web: las últimas 8 h (precio, CVD acumulado en la ventana y OI)
    serie: v.slice(-96).map((x) => ({ t: x.t, c: x.c, cvd: Math.round(x.cvd - ini.cvd), oi: x.oi })),
  };
}

export async function analizarFlujo(fuente, base) {
  const d = await datosFlujo(fuente, base);
  if (!d || d.velas.length < 40) return null;
  const f = leerFlujo(d.velas);
  return f ? { simbolo: d.simbolo, ahora: fuente.ahora(), ...f, velas: d.velas } : null;
}

// Efecto en una señal (un lado): régimen sano a favor +5, régimen o divergencia en contra −5. Como mucho ±5.
export function efectoFlujo(f, lado, estrategia = 'tendencia') {
  if (!f) return { ajuste_conf: 0, textos: [] };
  const L = lado === 'LONG' ? 1 : -1, textos = [];
  let ajuste = 0;
  if (f.sesgo === L) { ajuste += 5; textos.push(`Flujo a favor del ${lado}: ${f.frase}`); }
  else if (Math.sign(f.sesgo) === -L && Math.abs(f.sesgo) >= 0.4) { ajuste -= 5; textos.push(`Flujo en contra del ${lado}: ${f.frase}`); }
  else if (Math.sign(f.sesgo) === -L && f.sesgo !== 0) textos.push(`Flujo: ${f.frase}`);
  if (f.divergencia) {
    const aFavor = (f.divergencia.tipo === 'alcista' ? 1 : -1) === L;
    if (aFavor) { ajuste += estrategia === 'reversion' ? 5 : 3; textos.push(`CVD a favor del ${lado}: ${f.divergencia.frase}`); }
    else { ajuste -= 5; textos.push(`CVD en contra del ${lado}: ${f.divergencia.frase}`); }
  }
  return { ajuste_conf: Math.max(-5, Math.min(5, ajuste)), textos };
}

// Lo justo para guardar en la señal (sin las velas).
export const flujoResumen = (f) => (f ? (({ velas, ...r }) => r)(f) : null);
