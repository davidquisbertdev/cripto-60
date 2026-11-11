// Bots de trading: nadie publica sus posiciones, pero dejan huella en datos públicos:
//  1. Hyperliquid: cuentas grandes con rotación de market maker / alta frecuencia (mueven al mes más de 150
//     veces su capital; el motor las excluye de las "ballenas"). Su posición neta en la moneda es su
//     inventario: si están muy LONG suelen estar absorbiendo ventas (y al revés). Solo se informa.
//  2. Ejecución algorítmica (TWAP / iceberg) en las operaciones recientes: muchas órdenes del MISMO tamaño en
//     el mismo lado = un bot repartiendo una compra o venta grande. Empuja el precio mientras dura.
//  3. Bots de grid en el libro: escaleras de órdenes iguales a intervalos regulares. Frenan el precio en ese
//     tramo (compran en cada bajada o venden en cada subida).
// Pesa poco y nunca decide solo: ±3 de confianza dentro de las confluencias de la señal.

const lim = (x) => Math.max(-1, Math.min(1, x));
const M = (x) => (Math.abs(x) >= 1e6 ? `${(x / 1e6).toFixed(1)} M` : `${Math.round(x / 1e3)} k`);

// Cuentas de bots / market makers en el leaderboard de Hyperliquid (lo contrario del filtro de ballenas).
export function seleccionarBots(filas, { minUsd = 1e6, n = 12, minRotacion = 150 } = {}) {
  const win = (r, k) => (r.windowPerformances || []).find((x) => x[0] === k)?.[1] || { vlm: 0 };
  return filas
    .filter((r) => +r.accountValue >= minUsd)
    .map((r) => ({ dir: r.ethAddress, nombre: r.displayName || null, valor: +r.accountValue, vol_mes: +win(r, 'month').vlm }))
    .filter((w) => w.vol_mes / w.valor >= minRotacion)
    .sort((a, b) => b.vol_mes - a.vol_mes)
    .slice(0, n)
    .map((w) => ({ ...w, rotacion: Math.round(w.vol_mes / w.valor) }));
}

// Posición neta de esas cuentas en la moneda (coin de Hyperliquid).
export function resumirBotsHL(estados, coin, minUsd = 10000) {
  let vl = 0, vs = 0, nl = 0, ns = 0, revisadas = 0;
  for (const { estado } of estados) {
    if (!estado) continue;
    revisadas++;
    const p = (estado.assetPositions || []).map((x) => x.position).find((x) => x.coin === coin);
    if (!p || !+p.szi || +p.positionValue < minUsd) continue;
    if (+p.szi > 0) { vl += +p.positionValue; nl++; } else { vs += +p.positionValue; ns++; }
  }
  return { revisadas, longs: nl, shorts: ns, valor_long: Math.round(vl), valor_short: Math.round(vs), neto: vl + vs ? +((vl - vs) / (vl + vs)).toFixed(3) : 0 };
}

// Órdenes repetidas del mismo tamaño en el mismo lado (≥ 4 veces, ≥ 1000 USD cada una) en la cinta reciente.
export function flujoAlgoritmico(deals, tamContrato, { minRep = 4, minUsd = 1000 } = {}) {
  if (!deals?.length) return null;
  const grupos = new Map();
  for (const d of deals) {
    const v = +d.v, usd = v * tamContrato * +d.p;
    if (usd < minUsd) continue;
    const k = `${+d.T === 1 ? 'C' : 'V'}|${+v.toPrecision(4)}`;
    const g = grupos.get(k) ?? { compra: +d.T === 1, n: 0, usd: 0, tam_usd: usd };
    g.n++; g.usd += usd;
    grupos.set(k, g);
  }
  const patrones = [...grupos.values()].filter((g) => g.n >= minRep).sort((a, b) => b.usd - a.usd);
  const c = patrones.filter((g) => g.compra).reduce((s, g) => s + g.usd, 0), v = patrones.filter((g) => !g.compra).reduce((s, g) => s + g.usd, 0);
  const t = deals.map((d) => +d.t);
  return {
    operaciones: deals.length, segundos: Math.round((Math.max(...t) - Math.min(...t)) / 1000), patrones: patrones.length,
    compras_usd: Math.round(c), ventas_usd: Math.round(v), neto: c + v ? +((c - v) / (c + v)).toFixed(3) : 0,
    mayor: patrones[0] ? { lado: patrones[0].compra ? 'compra' : 'venta', veces: patrones[0].n, orden_usd: Math.round(patrones[0].tam_usd), total_usd: Math.round(patrones[0].usd) } : null,
  };
}

// Escaleras de órdenes iguales (≥ 5 niveles, tamaño idéntico, separación regular) en ±rango del precio.
export function gridsLibro(depth, tamContrato, precio, { rango = 0.03, minNiveles = 5 } = {}) {
  if (!depth?.bids?.length) return [];
  const out = [];
  for (const [nombre, niveles] of [['compra', depth.bids], ['venta', depth.asks]]) {
    const lv = niveles.map((x) => ({ p: +x[0], q: +x[1] })).filter((x) => Math.abs(x.p - precio) / precio <= rango && x.q > 0);
    const porTam = new Map();
    for (const x of lv) { const k = +x.q.toPrecision(3); porTam.set(k, [...(porTam.get(k) ?? []), x]); }
    for (const [q, xs] of porTam) {
      if (xs.length < minNiveles) continue;
      const ps = xs.map((x) => x.p).sort((a, b) => a - b);
      const saltos = ps.slice(1).map((p, i) => p - ps[i]);
      const media = saltos.reduce((s, x) => s + x, 0) / saltos.length;
      const cv = Math.sqrt(saltos.reduce((s, x) => s + (x - media) ** 2, 0) / saltos.length) / (media || 1);
      const usd = ps.reduce((s, p) => s + q * tamContrato * p, 0);
      if (cv <= 0.35 && usd >= 20000) out.push({ lado: nombre, niveles: ps.length, desde: ps[0], hasta: ps.at(-1), paso_pct: +((100 * media) / precio).toFixed(3), usd: Math.round(usd) });
    }
  }
  return out.sort((a, b) => b.usd - a.usd).slice(0, 4);
}

export function analizarBots({ hl = null, deals = null, depth = null, tamContrato = 1, precio }) {
  const algoritmico = flujoAlgoritmico(deals, tamContrato);
  const grids = gridsLibro(depth, tamContrato, precio);
  const frases = [];
  let s = 0;
  if (algoritmico?.patrones) {
    const tot = algoritmico.compras_usd + algoritmico.ventas_usd;
    s += 0.7 * algoritmico.neto * Math.min(1, tot / 2e5);
    const m = algoritmico.mayor;
    frases.push(`Ejecución algorítmica (TWAP/iceberg) en las últimas ${algoritmico.operaciones} operaciones: compras ${M(algoritmico.compras_usd)} / ventas ${M(algoritmico.ventas_usd)}${m ? `; el patrón mayor es una ${m.lado} de ${M(m.orden_usd)} repetida ${m.veces} veces` : ''}.`);
  }
  const gc = grids.filter((g) => g.lado === 'compra').reduce((x, g) => x + g.usd, 0), gv = grids.filter((g) => g.lado === 'venta').reduce((x, g) => x + g.usd, 0);
  if (gc + gv) s += 0.3 * ((gc - gv) / (gc + gv)) * Math.min(1, (gc + gv) / 5e5);
  for (const g of grids.slice(0, 2)) frases.push(`Bot de grid de ${g.lado} en el libro: ${g.niveles} órdenes iguales entre ${g.desde} y ${g.hasta} (~${M(g.usd)}): ${g.lado === 'compra' ? 'frena las bajadas en ese tramo' : 'frena las subidas en ese tramo'}.`);
  if (hl?.revisadas) {
    frases.push(hl.longs + hl.shorts
      ? `Market makers / bots de alta frecuencia de Hyperliquid (${hl.revisadas} cuentas): ${hl.longs} LONG (${M(hl.valor_long)}) y ${hl.shorts} SHORT (${M(hl.valor_short)}). Es su inventario: ${hl.valor_long + hl.valor_short < 2e5 ? 'poco relevante' : Math.abs(hl.neto) >= 0.5 ? `muy ${hl.neto > 0 ? 'LONG, suelen estar comprando lo que vende la masa' : 'SHORT, suelen estar vendiendo lo que compra la masa'}` : 'equilibrado'}.`
      : `Market makers / bots de Hyperliquid (${hl.revisadas} cuentas): sin posición relevante en esta moneda.`);
  }
  const puntuacion = +lim(s).toFixed(3);
  return {
    puntuacion, lectura: Math.abs(puntuacion) < 0.15 ? 'NEUTRAL' : puntuacion > 0 ? 'COMPRADORES' : 'VENDEDORES',
    algoritmico, grids, hl, frases, disponible: !!(algoritmico || grids.length || hl?.revisadas),
  };
}

// Efecto en una señal: bots empujando claramente a favor +3, en contra −3.
export function efectoBots(b, lado) {
  if (!b?.disponible || Math.abs(b.puntuacion) < 0.3) return { ajuste_conf: 0, textos: [] };
  const L = lado === 'LONG' ? 1 : -1, aFavor = Math.sign(b.puntuacion) === L;
  return { ajuste_conf: aFavor ? 3 : -3, textos: [`Bots ${aFavor ? 'a favor' : 'en contra'} del ${lado}: dominan los ${b.lectura === 'COMPRADORES' ? 'compradores' : 'vendedores'} algorítmicos (${b.puntuacion}).`] };
}
