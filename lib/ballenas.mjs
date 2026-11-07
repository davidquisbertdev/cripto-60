// Ballenas y posicionamiento del dinero grande, con fuentes públicas y gratuitas:
//  1. Hyperliquid: billeteras públicas on-chain. Posiciones reales y operaciones de 24 h de las
//     cuentas grandes y rentables (se excluyen los market makers).
//  2. Binance futuros: top traders (el 20 % de cuentas con más margen) frente a todas las cuentas.
//     Respaldo: Bybit (ratio de cuentas).
//  3. Open interest + precio: si entra dinero nuevo a longs o a shorts, o si se cierran posiciones.
//  4. Flujo agresivo (taker buy/sell) y operaciones grandes recientes en MEXC.
//  5. Muros del libro de órdenes de MEXC.
// Devuelve una puntuación en [-1, 1] (positiva = las ballenas empujan al alza) y el detalle.
// Pensado para SCALPING: pesa más el flujo inmediato (taker, OI y operaciones grandes de los últimos
// 15-30 min) que las posiciones de fondo de las ballenas, que cambian despacio.
import fs from 'node:fs';
import path from 'node:path';

const HL = 'https://api.hyperliquid.xyz/info';
const HL_LB = 'https://stats-data.hyperliquid.xyz/Mainnet/leaderboard';
const BN = 'https://fapi.binance.com';
const BY = 'https://api.bybit.com';
const lim = (x, a = -1, b = 1) => Math.max(a, Math.min(b, x));
const corto = (d) => `${d.slice(0, 6)}…${d.slice(-4)}`;

export const PESOS_BALLENAS = { hl_posiciones: 0.15, hl_flujo: 0.15, top_traders: 0.1, open_interest: 0.2, taker: 0.25, grandes: 0.15 };

// ---------- 1. Hyperliquid ----------

// Ballenas: cuentas de 1 M USD o más, con ganancia histórica y sin el volumen típico de market maker.
export function seleccionarBallenas(filas, { minUsd = 1e6, n = 50, maxRotacion = 150 } = {}) {
  const win = (r, k) => (r.windowPerformances || []).find((x) => x[0] === k)?.[1] || { pnl: 0, roi: 0, vlm: 0 };
  return filas
    .filter((r) => +r.accountValue >= minUsd)
    .map((r) => ({
      dir: r.ethAddress, nombre: r.displayName || null, valor: +r.accountValue,
      pnl_total: +win(r, 'allTime').pnl, pnl_mes: +win(r, 'month').pnl, vol_mes: +win(r, 'month').vlm,
    }))
    .filter((w) => w.pnl_total > 0 && w.vol_mes > 0 && w.vol_mes / w.valor < maxRotacion)
    .sort((a, b) => b.valor - a.valor)
    .slice(0, n);
}

// La lista completa pesa ~40 MB: se reduce y se guarda en caché 12 h (trader/cache/hl-ballenas.json).
export async function listaBallenas(fuente, { carpetaCache = null, n = 50, minUsd = 1e6, refrescar = false } = {}) {
  if (fuente.offline) return JSON.parse(await fuente.texto(HL_LB, 'hl-ballenas.json'));
  const cache = carpetaCache ? path.join(carpetaCache, 'hl-ballenas.json') : null;
  if (cache && !refrescar && fs.existsSync(cache)) {
    const c = JSON.parse(fs.readFileSync(cache, 'utf8'));
    if (Date.now() - c.creada < 12 * 3600e3 && c.n === n && c.minUsd === minUsd) {
      if (fuente.grabar) fs.writeFileSync(path.join(fuente.grabar, 'hl-ballenas.json'), JSON.stringify(c));
      return c;
    }
  }
  const r = await fetch(HL_LB, { signal: AbortSignal.timeout(90000) });
  if (!r.ok) throw new Error(`Leaderboard de Hyperliquid: HTTP ${r.status}`);
  const filas = (await r.json()).leaderboardRows || [];
  const doc = { creada: Date.now(), n, minUsd, total_cuentas: filas.length, ballenas: seleccionarBallenas(filas, { n, minUsd }) };
  if (cache) { fs.mkdirSync(path.dirname(cache), { recursive: true }); fs.writeFileSync(cache, JSON.stringify(doc)); }
  if (fuente.grabar) fs.writeFileSync(path.join(fuente.grabar, 'hl-ballenas.json'), JSON.stringify(doc));
  return doc;
}

export async function monedaHL(fuente, base) {
  const [meta, ctx] = await fuente.post(HL, { type: 'metaAndAssetCtxs' }, 'hl-meta.json');
  for (const nombre of [base, `k${base}`]) {
    const i = meta.universe.findIndex((u) => u.name === nombre && !u.isDelisted);
    if (i >= 0) return { coin: nombre, factor: nombre.startsWith('k') && nombre !== base ? 1000 : 1, ctx: ctx[i] };
  }
  return null;
}

async function enLotes(items, tam, fn) {
  const out = [];
  for (let i = 0; i < items.length; i += tam) out.push(...(await Promise.all(items.slice(i, i + tam).map(fn))));
  return out;
}

// minUsd: posiciones más pequeñas son restos, no apuestas de una ballena
export function resumirPosiciones(estados, coin, minUsd = 25000) {
  const pos = [];
  for (const { ballena, estado } of estados) {
    if (!estado) continue;
    const p = (estado.assetPositions || []).map((x) => x.position).find((x) => x.coin === coin);
    if (!p || !+p.szi || +p.positionValue < minUsd) continue;
    const valorCuenta = +estado.marginSummary?.accountValue || ballena.valor;
    pos.push({
      dir: ballena.dir, nombre: ballena.nombre, lado: +p.szi > 0 ? 'LONG' : 'SHORT', tam: +p.szi, valor: +p.positionValue,
      entrada: +p.entryPx, pnl: +p.unrealizedPnl, apalancamiento: p.leverage?.value ?? null, liquidacion: p.liquidationPx ? +p.liquidationPx : null,
      cuenta: valorCuenta, conviccion_pct: valorCuenta ? +((100 * +p.positionValue) / valorCuenta).toFixed(1) : null,
    });
  }
  pos.sort((a, b) => b.valor - a.valor);
  const L = pos.filter((p) => p.lado === 'LONG'), S = pos.filter((p) => p.lado === 'SHORT');
  const vl = L.reduce((s, p) => s + p.valor, 0), vs = S.reduce((s, p) => s + p.valor, 0);
  return {
    con_posicion: pos.length, longs: L.length, shorts: S.length, valor_long: vl, valor_short: vs,
    neto: vl + vs ? +((vl - vs) / (vl + vs)).toFixed(3) : 0, posiciones: pos,
  };
}

// Divide cada fill en lo que abre y lo que cierra (un "Long > Short" cierra el long y abre el short).
export function resumirFills(fills, coin, desde) {
  const f = { abrieron_long: 0, cerraron_long: 0, abrieron_short: 0, cerraron_short: 0, operaciones: 0 };
  for (const x of fills) {
    if (x.coin !== coin || x.time < desde) continue;
    const px = +x.px, sz = +x.sz, ini = +x.startPosition || 0, compra = x.side === 'B';
    let cierra = 0;
    if (compra && ini < 0) cierra = Math.min(sz, -ini);
    if (!compra && ini > 0) cierra = Math.min(sz, ini);
    const abre = sz - cierra;
    if (compra) { f.cerraron_short += cierra * px; f.abrieron_long += abre * px; } else { f.cerraron_long += cierra * px; f.abrieron_short += abre * px; }
    f.operaciones++;
  }
  const alcista = f.abrieron_long + f.cerraron_short, bajista = f.abrieron_short + f.cerraron_long;
  f.total = alcista + bajista;
  f.neto = f.total ? +((alcista - bajista) / f.total).toFixed(3) : 0;
  return f;
}

export async function ballenasHL(fuente, base, { carpetaCache = null, n = 50, conFills = 8 } = {}) {
  const m = await monedaHL(fuente, base);
  if (!m) return { disponible: false, motivo: `${base} no cotiza en Hyperliquid` };
  const lista = await listaBallenas(fuente, { carpetaCache, n });
  const estados = await enLotes(lista.ballenas, 10, async (b) => {
    try { return { ballena: b, estado: await fuente.post(HL, { type: 'clearinghouseState', user: b.dir }, `hl-estado-${b.dir}.json`) }; } catch { return { ballena: b, estado: null }; }
  });
  const res = resumirPosiciones(estados, m.coin);
  const ahora = fuente.ahora();
  const top = res.posiciones.slice(0, conFills);
  const fills = await enLotes(top, 4, async (p) => {
    try { return await fuente.post(HL, { type: 'userFillsByTime', user: p.dir, startTime: ahora - 24 * 3600e3, aggregateByTime: true }, `hl-fills-${p.dir}.json`); } catch { return []; }
  });
  const todas = fills.flat();
  return {
    disponible: true, coin: m.coin, factor: m.factor, cuentas_revisadas: estados.filter((e) => e.estado).length,
    criterio: `${lista.ballenas.length} cuentas ≥ ${(lista.minUsd / 1e6).toFixed(0)} M USD, rentables, sin market makers`,
    oi_hl_usd: m.ctx ? +m.ctx.openInterest * +m.ctx.markPx : null, funding_hl: m.ctx ? +m.ctx.funding : null, precio_hl: m.ctx ? +m.ctx.markPx : null,
    ...res,
    flujo_24h: resumirFills(todas, m.coin, ahora - 24 * 3600e3),
    flujo_4h: resumirFills(todas, m.coin, ahora - 4 * 3600e3),
    flujo_1h: resumirFills(todas, m.coin, ahora - 3600e3),
    instantanea: Object.fromEntries(res.posiciones.map((p) => [p.dir, p.tam])),
  };
}

// Cambios frente a una instantánea anterior { t, precio, posiciones: {dir: tam} }
export function compararInstantanea(prev, hl, precio = hl?.precio_hl) {
  if (!prev?.posiciones || !hl?.disponible || !precio) return null;
  const actual = hl.instantanea;
  const dirs = new Set([...Object.keys(prev.posiciones), ...Object.keys(actual)]);
  let delta = 0;
  const cambios = [];
  for (const d of dirs) {
    const a = prev.posiciones[d] || 0, b = actual[d] || 0;
    if (Math.abs(b - a) * precio < 1000) continue;
    delta += b - a;
    const que = a === 0 ? `abrió ${b > 0 ? 'LONG' : 'SHORT'}` : b === 0 ? `cerró su ${a > 0 ? 'LONG' : 'SHORT'}` : Math.sign(a) !== Math.sign(b) ? `giró a ${b > 0 ? 'LONG' : 'SHORT'}` : Math.abs(b) > Math.abs(a) ? `aumentó su ${b > 0 ? 'LONG' : 'SHORT'}` : `redujo su ${b > 0 ? 'LONG' : 'SHORT'}`;
    cambios.push({ dir: d, que, delta_usd: +((b - a) * precio).toFixed(0) });
  }
  cambios.sort((x, y) => Math.abs(y.delta_usd) - Math.abs(x.delta_usd));
  return { desde: prev.t, delta_neto_usd: +(delta * precio).toFixed(0), cambios };
}

// ---------- 2-3. Binance / Bybit: top traders, minoristas y open interest ----------

async function binanceSimbolo(fuente, base) {
  for (const s of [`${base}USDT`, `1000${base}USDT`]) {
    try {
      const d = await fuente.json(`${BN}/futures/data/topLongShortPositionRatio?symbol=${s}&period=5m&limit=30`, `bn-top-${base}.json`);
      if (Array.isArray(d) && d.length) return { simbolo: s, top: d };
    } catch { /* probar el siguiente nombre */ }
  }
  return null;
}

export async function posicionamiento(fuente, base) {
  const bn = await binanceSimbolo(fuente, base).catch(() => null);
  if (bn) {
    const s = bn.simbolo;
    const [glob, oi, taker] = await Promise.all([
      fuente.json(`${BN}/futures/data/globalLongShortAccountRatio?symbol=${s}&period=5m&limit=30`, `bn-global-${base}.json`).catch(() => null),
      fuente.json(`${BN}/futures/data/openInterestHist?symbol=${s}&period=5m&limit=30`, `bn-oi-${base}.json`).catch(() => null),
      fuente.json(`${BN}/futures/data/takerlongshortRatio?symbol=${s}&period=5m&limit=24`, `bn-taker-${base}.json`).catch(() => null),
    ]);
    const t = bn.top.map((x) => +x.longAccount), g = (glob || []).map((x) => +x.longAccount);
    return {
      fuente: 'Binance', simbolo: s,
      top_long: t.at(-1), top_long_antes: t.at(-7) ?? t[0], minoristas_long: g.at(-1) ?? null, minoristas_long_antes: g.at(-7) ?? g[0] ?? null,
      oi: (oi || []).map((x) => ({ t: x.timestamp, valor: +x.sumOpenInterestValue, contratos: +x.sumOpenInterest })),
      taker: (taker || []).map((x) => ({ t: x.timestamp, ratio: +x.buySellRatio, compra: +x.buyVol, venta: +x.sellVol })),
    };
  }
  // Respaldo Bybit (no publica top traders: solo el ratio de todas las cuentas)
  try {
    const ar = await fuente.json(`${BY}/v5/market/account-ratio?category=linear&symbol=${base}USDT&period=5min&limit=30`, `by-ratio-${base}.json`);
    const oi = await fuente.json(`${BY}/v5/market/open-interest?category=linear&symbol=${base}USDT&intervalTime=5min&limit=30`, `by-oi-${base}.json`);
    if (ar.retCode !== 0) throw new Error(ar.retMsg);
    const g = ar.result.list.map((x) => +x.buyRatio).reverse();
    return {
      fuente: 'Bybit', simbolo: `${base}USDT`, top_long: null, top_long_antes: null, minoristas_long: g.at(-1) ?? null, minoristas_long_antes: g.at(-7) ?? g[0] ?? null,
      oi: (oi.result?.list || []).map((x) => ({ t: +x.timestamp, contratos: +x.openInterest, valor: null })).reverse(), taker: [],
    };
  } catch {
    return null;
  }
}

// OI en velas de 5 min; se compara con 30 min antes (6 velas). precio15m: variación % del precio en
// esa ventana. OI subiendo con el precio = longs nuevos, etc.
export function lecturaOI(oi, precio15m, umbral = 0.4, velas = 6) {
  if (!oi || oi.length < velas + 1 || precio15m == null) return null;
  const k = oi.at(-1), j = oi.at(-velas - 1);
  const a = k.valor ?? k.contratos, b = j.valor ?? j.contratos;
  if (!b) return null;
  // con valor en USD, el cambio de precio infla el OI: se usa el número de contratos si existe
  const cambio = k.contratos && j.contratos ? (100 * (k.contratos - j.contratos)) / j.contratos : (100 * (a - b)) / b;
  let tipo = 'sin cambios', s = 0;
  if (Math.abs(cambio) >= umbral) {
    if (cambio > 0 && precio15m >= 0) { tipo = 'entran LONGS nuevos'; s = 0.6; }
    else if (cambio > 0) { tipo = 'entran SHORTS nuevos'; s = -0.6; }
    else if (precio15m >= 0) { tipo = 'cierre de shorts (subida débil)'; s = 0.25; }
    else { tipo = 'cierre de longs (bajada débil)'; s = -0.25; }
  }
  return { cambio_15m_pct: +cambio.toFixed(2), precio_15m_pct: +precio15m.toFixed(2), tipo, puntuacion: +(s * Math.min(1, Math.abs(cambio) / 1.5)).toFixed(3) };
}

// ---------- 4-5. MEXC: operaciones grandes y muros ----------

export function operacionesGrandes(deals, tamContrato, minUsd = 25000) {
  if (!deals?.length) return null;
  const ops = deals.map((d) => ({ usd: +d.v * tamContrato * +d.p, compra: +d.T === 1, t: +d.t }));
  const tot = ops.map((o) => o.usd).sort((a, b) => a - b);
  const umbral = Math.max(minUsd, tot[Math.floor(0.95 * (tot.length - 1))] || 0);
  const g = ops.filter((o) => o.usd >= umbral);
  const c = g.filter((o) => o.compra).reduce((s, o) => s + o.usd, 0), v = g.filter((o) => !o.compra).reduce((s, o) => s + o.usd, 0);
  return { umbral_usd: Math.round(umbral), compras_usd: Math.round(c), ventas_usd: Math.round(v), n: g.length, segundos: Math.round((Math.max(...ops.map((o) => o.t)) - Math.min(...ops.map((o) => o.t))) / 1000), neto: c + v ? +((c - v) / (c + v)).toFixed(3) : 0 };
}

export function muros(depth, tamContrato, precio, rango = 0.03) {
  if (!depth?.bids?.length) return null;
  const lado = (lv) => lv.map((x) => ({ p: +x[0], usd: +x[1] * tamContrato * +x[0] })).filter((x) => Math.abs(x.p - precio) / precio <= rango);
  const b = lado(depth.bids), a = lado(depth.asks);
  const todos = [...b, ...a].map((x) => x.usd).sort((x, y) => x - y);
  const mediana = todos[Math.floor(todos.length / 2)] || 0;
  const mayor = (arr) => arr.reduce((m, x) => (x.usd > (m?.usd || 0) ? x : m), null);
  const mb = mayor(b), ma = mayor(a);
  return {
    compra: mb && mb.usd >= 5 * mediana ? { precio: mb.p, usd: Math.round(mb.usd) } : null,
    venta: ma && ma.usd >= 5 * mediana ? { precio: ma.p, usd: Math.round(ma.usd) } : null,
    liquidez_compra_usd: Math.round(b.reduce((s, x) => s + x.usd, 0)), liquidez_venta_usd: Math.round(a.reduce((s, x) => s + x.usd, 0)),
  };
}

// ---------- Puntuación ----------

export function puntuarBallenas({ hl, pos, oi, grandes }) {
  const c = {};
  if (hl?.disponible && hl.con_posicion)
    c.hl_posiciones = lim(hl.neto * Math.min(1, hl.con_posicion / 5) * Math.min(1, (hl.valor_long + hl.valor_short) / 1e6));
  if (hl?.disponible && hl.flujo_4h?.total) {
    const f1 = hl.flujo_1h?.total ? hl.flujo_1h.neto : hl.flujo_4h.neto;
    c.hl_flujo = lim((0.6 * f1 + 0.4 * hl.flujo_4h.neto) * Math.min(1, hl.flujo_4h.total / 150000));
  }
  if (pos) {
    let s = 0, w = 0;
    if (pos.top_long != null) {
      s += 0.5 * lim((pos.top_long - pos.top_long_antes) / 0.015); w += 0.5;
      if (pos.minoristas_long != null) { s += 0.5 * lim((pos.top_long - pos.minoristas_long) / 0.1); w += 0.5; }
    } else if (pos.minoristas_long != null) {
      s += -0.5 * lim((pos.minoristas_long - 0.5) / 0.3); w += 1; // solo minoristas: muy largos = riesgo de barrida
    }
    if (w) c.top_traders = lim(s / w);
    const tk = (pos.taker || []).slice(-6); // últimos 30 min
    if (tk.length) {
      const comp = tk.reduce((x, y) => x + y.compra, 0), vent = tk.reduce((x, y) => x + y.venta, 0);
      if (comp + vent) c.taker = lim(((comp - vent) / (comp + vent)) / 0.15);
    }
  }
  if (oi) c.open_interest = oi.puntuacion;
  if (grandes?.n) c.grandes = lim(grandes.neto * 0.6);
  let s = 0, w = 0;
  for (const [k, v] of Object.entries(c)) { s += PESOS_BALLENAS[k] * v; w += PESOS_BALLENAS[k]; }
  const p = w ? +(s / w).toFixed(3) : 0;
  const cobertura = +Object.keys(c).reduce((x, k) => x + PESOS_BALLENAS[k], 0).toFixed(2);
  const fuerza = Math.abs(p) >= 0.45 ? 'fuerte' : Math.abs(p) >= 0.2 ? 'moderada' : 'débil';
  const lectura = Math.abs(p) < 0.1 ? 'NEUTRAL' : `${p > 0 ? 'ALCISTA' : 'BAJISTA'} ${fuerza}`;
  return { puntuacion: p, lectura, componentes: Object.fromEntries(Object.entries(c).map(([k, v]) => [k, +v.toFixed(3)])), cobertura };
}

// Frases cortas para el informe y para las razones de la señal.
export function frases(b) {
  const out = [];
  const hl = b.hl;
  const M = (x) => (Math.abs(x) >= 1e6 ? `${(x / 1e6).toFixed(1)} M` : `${Math.round(x / 1e3)} k`);
  if (hl?.disponible) {
    if (hl.con_posicion) out.push(`Hyperliquid: ${hl.longs} ballenas LONG (${M(hl.valor_long)}) y ${hl.shorts} SHORT (${M(hl.valor_short)}) → neto ${hl.neto >= 0 ? 'LONG' : 'SHORT'} ${Math.round(Math.abs(hl.neto) * 100)} %`);
    else out.push(`Hyperliquid: ninguna de las ${hl.cuentas_revisadas} ballenas tiene posición en ${hl.coin}`);
    const f = hl.flujo_4h;
    if (f.total) {
      const acciones = [['abrieron LONG', f.abrieron_long], ['cerraron LONG (toman ganancia o cortan)', f.cerraron_long], ['abrieron SHORT', f.abrieron_short], ['cerraron SHORT (toman ganancia o cortan)', f.cerraron_short]];
      const dom = acciones.sort((a, b) => b[1] - a[1])[0];
      out.push(`Ballenas 4 h: abrieron long ${M(f.abrieron_long)} · cerraron long ${M(f.cerraron_long)} · abrieron short ${M(f.abrieron_short)} · cerraron short ${M(f.cerraron_short)} → sobre todo ${dom[0]}`);
    }
  } else if (hl) out.push(`Hyperliquid: ${hl.motivo}`);
  const p = b.posicionamiento;
  if (p?.top_long != null) out.push(`${p.fuente} top traders ${(100 * p.top_long).toFixed(1)} % long (30 min: ${p.top_long - p.top_long_antes >= 0 ? '+' : ''}${(100 * (p.top_long - p.top_long_antes)).toFixed(2)} pp) vs todas las cuentas ${(100 * p.minoristas_long).toFixed(1)} %${p.minoristas_long - p.top_long > 0.05 ? ' → los minoristas están más largos que las ballenas' : p.top_long - p.minoristas_long > 0.05 ? ' → las ballenas están más largas que los minoristas' : ''}`);
  else if (p?.minoristas_long != null) out.push(`${p.fuente}: ${(100 * p.minoristas_long).toFixed(1)} % de las cuentas en long${p.minoristas_long > 0.7 ? ' (masa muy larga: riesgo de barrida hacia abajo)' : p.minoristas_long < 0.3 ? ' (masa muy corta: riesgo de squeeze)' : ''}`);
  if (b.oi) out.push(`Open interest 30 min ${b.oi.cambio_15m_pct >= 0 ? '+' : ''}${b.oi.cambio_15m_pct} % con precio ${b.oi.precio_15m_pct >= 0 ? '+' : ''}${b.oi.precio_15m_pct} % → ${b.oi.tipo}`);
  if (b.componentes?.taker != null) out.push(`Flujo agresivo 30 min (taker): ${b.componentes.taker > 0.2 ? 'dominan las compras' : b.componentes.taker < -0.2 ? 'dominan las ventas' : 'equilibrado'}`);
  if (b.grandes?.n) out.push(`MEXC operaciones ≥ ${M(b.grandes.umbral_usd)} (últimos ${b.grandes.segundos} s): compras ${M(b.grandes.compras_usd)} / ventas ${M(b.grandes.ventas_usd)}`);
  return out;
}

export async function analizarBallenas(fuente, { base, simbolo, contrato, precio, precio15m, carpetaCache = null, n = 50, conHL = true }) {
  const tam = +contrato.contractSize;
  const [hl, pos, deals, depth] = await Promise.all([
    conHL ? ballenasHL(fuente, base, { carpetaCache, n }).catch((e) => ({ disponible: false, motivo: `no se pudo leer (${e.message})` })) : null,
    posicionamiento(fuente, base).catch(() => null),
    fuente.operaciones(simbolo).catch(() => null),
    fuente.profundidad(simbolo, 100).catch(() => null),
  ]);
  const oi = lecturaOI(pos?.oi, precio15m);
  const grandes = operacionesGrandes(deals, tam);
  const p = puntuarBallenas({ hl, pos, oi, grandes });
  const b = { ...p, hl, posicionamiento: pos, oi, grandes, muros: muros(depth, tam, precio) };
  b.frases = frases(b);
  return b;
}
