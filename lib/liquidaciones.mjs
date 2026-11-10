// Mapa de liquidaciones: en qué precios se liquidarían muchas posiciones apalancadas.
// Por encima del precio están los shorts (al liquidarse compran a mercado y aceleran la subida); por
// debajo, los longs. El precio suele ir a "barrer" las zonas con más liquidez y luego girarse.
//
// Dos fuentes, siempre públicas:
//  1. ESTIMADO (como hacen los mapas de pago, que también son un modelo): en cada vela de 5 min de las
//     últimas 24 h en la que el OI de Binance subió, se asume que se abrieron posiciones nuevas a ese
//     precio, repartidas entre longs y shorts según el volumen agresivo de la vela y entre apalancamientos
//     típicos (10x, 25x, 50x, 100x). Su precio de liquidación aproximado es entrada × (1 ∓ 1/apalancamiento).
//     Las que el precio ya cruzó después se dan por liquidadas y salen del mapa (y cuentan como barrida).
//  2. REAL: el precio de liquidación exacto de las posiciones de las ballenas de Hyperliquid que sigue el
//     motor (solo cubre a esas billeteras).
// Pesa poco y nunca decide solo; sirve sobre todo para colocar el SL fuera de una zona y saber hacia dónde
// tira el imán.

const PALANCAS = [[10, 0.3], [25, 0.35], [50, 0.25], [100, 0.1]];
const MM = 0.005; // margen de mantenimiento aproximado
const VELA = 5 * 60e3;

export function liqPrecio(entrada, lev, L) {
  return L > 0 ? entrada * (1 - 1 / lev + MM) : entrada * (1 + 1 / lev - MM);
}

// velas: de flujo.mjs (con oi y tb). hl: posiciones de las ballenas [{lado, valor, liquidacion}].
// rango: ± % alrededor del precio que se dibuja; paso: ancho de cada tramo en %.
export function mapaLiquidaciones(velas, precio, { hl = [], rango = 6, paso = 0.25, ahora = null } = {}) {
  const v = (velas ?? []).filter((x) => x.oi != null);
  if (v.length < 24 && !hl.length) return null;
  const pos = [];
  for (let i = 1; i < v.length; i++) {
    const dOI = v[i].oi - v[i - 1].oi;
    if (!(dOI > 0)) continue;
    const usd = dOI * v[i].c;
    const fc = v[i].v ? Math.max(0.15, Math.min(0.85, v[i].tb / v[i].v)) : 0.5; // parte que entró en long
    for (const [lev, w] of PALANCAS) {
      pos.push({ i, L: 1, liq: liqPrecio(v[i].c, lev, 1), usd: usd * fc * w, lev });
      pos.push({ i, L: -1, liq: liqPrecio(v[i].c, lev, -1), usd: usd * (1 - fc) * w, lev });
    }
  }
  // mínimo y máximo que tocó el precio después de cada vela
  const minDesde = new Array(v.length + 1).fill(Infinity), maxDesde = new Array(v.length + 1).fill(-Infinity);
  for (let i = v.length - 1; i >= 0; i--) { minDesde[i] = Math.min(v[i].l, minDesde[i + 1]); maxDesde[i] = Math.max(v[i].h, maxDesde[i + 1]); }
  const t0 = (ahora ?? (v.at(-1)?.t ?? 0) + VELA) - 3600e3;
  const barrida = { longs_usd: 0, shorts_usd: 0 };
  const vivas = [];
  for (const p of pos) {
    // liquidada si después de abrirse el precio cruzó su liquidación
    if (p.L > 0 ? minDesde[p.i + 1] > p.liq : maxDesde[p.i + 1] < p.liq) { vivas.push(p); continue; }
    let k = -1;
    for (let j = p.i + 1; j < v.length; j++) if (p.L > 0 ? v[j].l <= p.liq : v[j].h >= p.liq) { k = j; break; }
    if (k < 0) vivas.push(p);
    else if (v[k].t >= t0) barrida[p.L > 0 ? 'longs_usd' : 'shorts_usd'] += p.usd; // barrida en la última hora
  }
  const n = Math.round(rango / paso);
  const tramos = [];
  for (let j = -n; j < n; j++) {
    const desde = precio * (1 + (j * paso) / 100), hasta = precio * (1 + ((j + 1) * paso) / 100);
    tramos.push({ desde, hasta, precio: (desde + hasta) / 2, longs_usd: 0, shorts_usd: 0, real_longs_usd: 0, real_shorts_usd: 0 });
  }
  const tramoDe = (p) => { const j = Math.floor(((p / precio - 1) * 100) / paso) + n; return j >= 0 && j < tramos.length ? tramos[j] : null; };
  for (const p of vivas) {
    const t = tramoDe(p.liq);
    // un long solo se liquida por debajo del precio y un short por encima
    if (t && (p.L > 0 ? p.liq < precio : p.liq > precio)) t[p.L > 0 ? 'longs_usd' : 'shorts_usd'] += p.usd;
  }
  for (const h of hl) {
    if (!h.liquidacion || !h.valor) continue;
    const t = tramoDe(h.liquidacion);
    if (t) t[h.lado === 'LONG' ? 'real_longs_usd' : 'real_shorts_usd'] += h.valor;
  }
  const total = (t) => t.longs_usd + t.shorts_usd + t.real_longs_usd + t.real_shorts_usd;
  const arriba = tramos.filter((t) => t.desde >= precio), abajo = tramos.filter((t) => t.hasta <= precio);
  const cerca = (t) => Math.abs(t.precio / precio - 1) * 100 <= 3;
  const sum = (l) => l.reduce((s, t) => s + total(t), 0);
  const sa = sum(arriba.filter(cerca)), sb = sum(abajo.filter(cerca));
  const mayor = (l) => l.reduce((m, t) => (total(t) > (m ? total(m) : 0) ? t : m), null);
  const zona = (t) => (t && total(t) > 0 ? { precio: t.precio, desde: t.desde, hasta: t.hasta, usd: Math.round(total(t)), dist_pct: +((100 * (t.precio - precio)) / precio).toFixed(2), real_usd: Math.round(t.real_longs_usd + t.real_shorts_usd) } : null);
  const medio = sum(tramos) / (tramos.length || 1);
  return {
    precio, paso_pct: paso, rango_pct: rango,
    tramos: tramos.map((t) => ({ precio: +t.precio.toPrecision(6), longs_usd: Math.round(t.longs_usd), shorts_usd: Math.round(t.shorts_usd), real_longs_usd: Math.round(t.real_longs_usd), real_shorts_usd: Math.round(t.real_shorts_usd) })),
    zona_arriba: zona(mayor(arriba)), zona_abajo: zona(mayor(abajo)),
    // tramos con mucha más liquidez que la media (zonas fuertes)
    fuertes: tramos.filter((t) => total(t) >= 3 * medio && total(t) > 0).map((t) => ({ desde: t.desde, hasta: t.hasta, lado: t.desde >= precio ? 'SHORT' : 'LONG', usd: Math.round(total(t)) })),
    arriba_3pct_usd: Math.round(sa), abajo_3pct_usd: Math.round(sb),
    asimetria: sa + sb ? +((sa - sb) / (sa + sb)).toFixed(2) : 0,
    barrida_1h: { longs_usd: Math.round(barrida.longs_usd), shorts_usd: Math.round(barrida.shorts_usd) },
    estimado: v.length >= 24, reales: hl.filter((h) => h.liquidacion).length,
  };
}

const M = (x) => (Math.abs(x) >= 1e6 ? `${(x / 1e6).toFixed(1)} M` : `${Math.round(x / 1e3)} k`);

// Efecto en una señal: el imán (asimetría) ±3, una barrida reciente del lado contrario con absorción del
// CVD a favor +5 (máx. ±5 en total). Y avisa si el SL cae dentro de una zona fuerte, con un SL alternativo.
export function efectoLiquidaciones(m, lado, { sl = null, flujo = null, slMaxPct = 0.8, entrada = null } = {}) {
  if (!m) return { ajuste_conf: 0, textos: [], sl_sugerido: null };
  const L = lado === 'LONG' ? 1 : -1, textos = [];
  let ajuste = 0;
  // asimetría > 0: más liquidez arriba (shorts por liquidar): el imán tira hacia arriba
  if (Math.abs(m.asimetria) >= 0.5) {
    const aFavor = Math.sign(m.asimetria) === L;
    ajuste += aFavor ? 3 : -3;
    textos.push(`Liquidaciones: hay ${M(Math.max(m.arriba_3pct_usd, m.abajo_3pct_usd))} USD por liquidar ${m.asimetria > 0 ? 'arriba (shorts)' : 'abajo (longs)'} frente a ${M(Math.min(m.arriba_3pct_usd, m.abajo_3pct_usd))} al otro lado: el imán tira ${aFavor ? 'a favor' : 'en contra'} del ${lado}.`);
  }
  // barrida reciente: longs barridos (abajo) favorece un LONG si el CVD muestra absorción, y al revés
  const barridos = L > 0 ? m.barrida_1h.longs_usd : m.barrida_1h.shorts_usd;
  const umbral = Math.max(2e5, 0.15 * (m.arriba_3pct_usd + m.abajo_3pct_usd));
  if (barridos >= umbral) {
    const absorcion = flujo?.divergencia?.tipo === (L > 0 ? 'alcista' : 'bajista') || Math.sign(flujo?.sesgo ?? 0) === L;
    if (absorcion) { ajuste += 5; textos.push(`Barrida hecha: en la última hora se liquidaron ~${M(barridos)} USD de ${L > 0 ? 'longs' : 'shorts'} y el CVD ya muestra ${L > 0 ? 'compras' : 'ventas'} a favor del ${lado}. Sin combustible en contra.`); }
    else textos.push(`En la última hora se liquidaron ~${M(barridos)} USD de ${L > 0 ? 'longs' : 'shorts'}: el CVD aún no confirma el giro.`);
  }
  // SL dentro de una zona fuerte del propio lado (los longs se liquidan abajo, donde va el SL de un LONG)
  let sl_sugerido = null;
  if (sl != null && entrada) {
    const z = m.fuertes.find((f) => f.lado === lado && sl >= f.desde && sl <= f.hasta);
    if (z) {
      const detras = L > 0 ? z.desde * 0.999 : z.hasta * 1.001;
      const distPct = (100 * Math.abs(entrada - detras)) / entrada;
      if (distPct <= slMaxPct) {
        sl_sugerido = detras;
        textos.push(`Tu SL cae en una zona de liquidaciones de ${L > 0 ? 'longs' : 'shorts'} (~${M(z.usd)} USD): ahí suelen barrer. Mejor detrás de ella, en ${+detras.toPrecision(6)} (${distPct.toFixed(2)} %), con menos tamaño.`);
      } else textos.push(`Tu SL cae en una zona de liquidaciones de ${L > 0 ? 'longs' : 'shorts'} (~${M(z.usd)} USD) y ponerlo detrás pasa del ${slMaxPct} %: ojo con una barrida.`);
    }
  }
  return { ajuste_conf: Math.max(-5, Math.min(5, ajuste)), textos, sl_sugerido };
}
