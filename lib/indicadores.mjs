// Indicadores técnicos clásicos, sin dependencias. Todos devuelven arrays alineados con la entrada
// (null mientras no hay datos suficientes).

export function ema(valores, n) {
  const out = new Array(valores.length).fill(null);
  if (valores.length < n) return out;
  let s = 0;
  for (let i = 0; i < n; i++) s += valores[i];
  let e = s / n;
  out[n - 1] = e;
  const k = 2 / (n + 1);
  for (let i = n; i < valores.length; i++) {
    e = valores[i] * k + e * (1 - k);
    out[i] = e;
  }
  return out;
}

// Media móvil de Wilder (RMA)
function rma(valores, n, desde = 0) {
  const out = new Array(valores.length).fill(null);
  if (valores.length - desde < n) return out;
  let s = 0;
  for (let i = desde; i < desde + n; i++) s += valores[i];
  let m = s / n;
  out[desde + n - 1] = m;
  for (let i = desde + n; i < valores.length; i++) {
    m = (m * (n - 1) + valores[i]) / n;
    out[i] = m;
  }
  return out;
}

export function rsi(cierres, n = 14) {
  const out = new Array(cierres.length).fill(null);
  if (cierres.length <= n) return out;
  const sube = [0], baja = [0];
  for (let i = 1; i < cierres.length; i++) {
    const d = cierres[i] - cierres[i - 1];
    sube.push(Math.max(d, 0));
    baja.push(Math.max(-d, 0));
  }
  const ms = rma(sube, n, 1), mb = rma(baja, n, 1);
  for (let i = 0; i < cierres.length; i++) {
    if (ms[i] == null) continue;
    out[i] = mb[i] === 0 ? (ms[i] === 0 ? 50 : 100) : 100 - 100 / (1 + ms[i] / mb[i]);
  }
  return out;
}

export function rangoVerdadero(velas) {
  return velas.map((b, i) => {
    if (i === 0) return b.h - b.l;
    const pc = velas[i - 1].c;
    return Math.max(b.h - b.l, Math.abs(b.h - pc), Math.abs(b.l - pc));
  });
}

export function atr(velas, n = 14) {
  return rma(rangoVerdadero(velas), n, 1);
}

export function macd(cierres, rapida = 12, lenta = 26, senal = 9) {
  const er = ema(cierres, rapida), el = ema(cierres, lenta);
  const linea = cierres.map((_, i) => (er[i] == null || el[i] == null ? null : er[i] - el[i]));
  const ini = linea.findIndex((x) => x != null);
  const sen = new Array(cierres.length).fill(null);
  if (ini >= 0) {
    const e = ema(linea.slice(ini), senal);
    e.forEach((x, j) => (sen[ini + j] = x));
  }
  const hist = linea.map((x, i) => (x == null || sen[i] == null ? null : x - sen[i]));
  return { linea, senal: sen, hist };
}

export function adx(velas, n = 14) {
  const len = velas.length;
  const out = new Array(len).fill(null);
  if (len < 2 * n + 1) return out;
  const dmP = [0], dmM = [0];
  for (let i = 1; i < len; i++) {
    const up = velas[i].h - velas[i - 1].h, dn = velas[i - 1].l - velas[i].l;
    dmP.push(up > dn && up > 0 ? up : 0);
    dmM.push(dn > up && dn > 0 ? dn : 0);
  }
  const tr = rangoVerdadero(velas);
  const atrS = rma(tr, n, 1), pS = rma(dmP, n, 1), mS = rma(dmM, n, 1);
  const dx = new Array(len).fill(null);
  for (let i = 0; i < len; i++) {
    if (atrS[i] == null || atrS[i] === 0) continue;
    const pdi = (100 * pS[i]) / atrS[i], mdi = (100 * mS[i]) / atrS[i];
    dx[i] = pdi + mdi === 0 ? 0 : (100 * Math.abs(pdi - mdi)) / (pdi + mdi);
  }
  const ini = dx.findIndex((x) => x != null);
  const a = rma(dx.map((x) => x ?? 0), n, ini);
  for (let i = 0; i < len; i++) out[i] = a[i];
  return out;
}

// Máximos y mínimos de swing (fractales): una vela cuyo máximo/mínimo supera a las k vecinas de cada lado.
export function swings(velas, k = 3) {
  const altos = [], bajos = [];
  for (let i = k; i < velas.length - k; i++) {
    let esAlto = true, esBajo = true;
    for (let j = i - k; j <= i + k; j++) {
      if (j === i) continue;
      if (velas[j].h >= velas[i].h) esAlto = false;
      if (velas[j].l <= velas[i].l) esBajo = false;
    }
    if (esAlto) altos.push({ i, p: velas[i].h, t: velas[i].t });
    if (esBajo) bajos.push({ i, p: velas[i].l, t: velas[i].t });
  }
  return { altos, bajos };
}

export const ultimo = (a) => {
  for (let i = a.length - 1; i >= 0; i--) if (a[i] != null) return a[i];
  return null;
};
