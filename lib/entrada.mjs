// Mejor precio de entrada en los próximos minutos (lo que dura la validez de la señal, 5 min por defecto).
// ¿Entrar ya a mercado o dejar una orden limit un poco mejor? Se mide en las velas reales de 1 min de la
// moneda cuánto suele retroceder el precio en esos minutos (para un LONG: cuánto baja desde el cierre antes
// de que pasen 5 min). De ahí sale la probabilidad de que un limit a cada distancia se llene.
//  - El impulso de 1 min en contra del lado (sigue cayendo y quieres LONG): conviene esperar más abajo.
//  - El impulso a favor y fuerte: el precio se va; mejor entrar ya a mercado.
//  - Si no, la opción con más valor esperado: mejora de la entrada (en R) por la probabilidad de llenarse,
//    frente a lo que se pierde si no se llena (la operación no ocurre).
// Los niveles cercanos (soporte/resistencia de 5m, Fibonacci, zona de liquidaciones) se usan como precio
// del limit cuando caen en el rango alcanzable: ahí el precio suele frenar.

const cuantil = (orden, p) => orden[Math.min(orden.length - 1, Math.max(0, Math.floor(p * orden.length)))];

// Retroceso a favor de entrar (en %) en los `minutos` siguientes a cada vela de 1 min.
export function retrocesos(velas1m, lado, minutos = 5, n = 1000) {
  const v = velas1m.slice(-n - minutos);
  const L = lado === 'LONG' ? 1 : -1, out = [];
  for (let i = 0; i + minutos < v.length; i++) {
    let mejor = v[i].c;
    for (let j = i + 1; j <= i + minutos; j++) mejor = L > 0 ? Math.min(mejor, v[j].l) : Math.max(mejor, v[j].h);
    out.push((100 * L * (v[i].c - mejor)) / v[i].c);
  }
  return out.sort((a, b) => a - b);
}

// probabilidad (%) de que el precio retroceda al menos x % (= que el limit se llene)
const probLlenado = (orden, x) => {
  let lo = 0, hi = orden.length;
  while (lo < hi) { const m = (lo + hi) >> 1; if (orden[m] < x) lo = m + 1; else hi = m; }
  return +((100 * (orden.length - lo)) / orden.length).toFixed(0);
};

// lado, precio, sl; velas1m; momento1m: puntuación del marco de 1 min (−1..1); ev: resultado medio esperado de
// la operación en R (del historial real; null si no hay); niveles: [{ precio, que }] candidatos; unidad: tick.
export function mejorEntrada({ lado, precio, sl, velas1m, momento1m = 0, ev = null, niveles = [], minutos = 5, unidad = null }) {
  if (!velas1m?.length || sl == null) return null;
  const L = lado === 'LONG' ? 1 : -1;
  const rPct = (100 * Math.abs(precio - sl)) / precio;
  const orden = retrocesos(velas1m, lado, minutos);
  if (orden.length < 100 || !(rPct > 0)) return null;
  const tick = (p) => (unidad ? Math.round(p / unidad) * unidad : p);
  const evR = ev != null && Number.isFinite(ev) ? Math.max(ev, 0.02) : 0.1; // si no hay historial, ventaja pequeña
  // el limit no puede pasar de la mitad del camino al SL (quedaría un stop ridículo)
  const maxPct = rPct * 0.5;
  const opcion = (pct, que) => {
    const precioL = tick(precio * (1 - (L * pct) / 100));
    const real = (100 * L * (precio - precioL)) / precio;
    const prob = probLlenado(orden, real);
    const mejoraR = real / rPct;
    return { tipo: 'limit', precio: precioL, distancia_pct: +real.toFixed(3), prob_llenado: prob, mejora_r: +mejoraR.toFixed(2), valor: +((prob / 100) * (evR + mejoraR)).toFixed(3), que };
  };
  const ops = [{ tipo: 'mercado', precio, distancia_pct: 0, prob_llenado: 100, mejora_r: 0, valor: +evR.toFixed(3), que: 'a mercado, ahora' }];
  for (const p of [0.75, 0.6, 0.45]) {
    const pct = cuantil([...orden].reverse(), p); // retroceso que se alcanza con probabilidad p
    if (pct > 0.005 && pct <= maxPct) ops.push(opcion(pct, `retroceso típico en ${minutos} min`));
  }
  for (const nv of niveles) {
    if (!nv?.precio) continue;
    const pct = (100 * L * (precio - nv.precio)) / precio;
    if (pct > 0.005 && pct <= maxPct) {
      const o = opcion(pct, nv.que);
      if (o.prob_llenado >= 20) ops.push(o);
    }
  }
  // quitar duplicados por precio
  const vistas = new Set();
  const lista = ops.filter((o) => { const k = String(o.precio); if (vistas.has(k)) return false; vistas.add(k); return true; });
  const limits = lista.filter((o) => o.tipo === 'limit');
  let elegida, razon;
  const contra = L * momento1m <= -0.25, aFavor = L * momento1m >= 0.4;
  if (aFavor || !limits.length) {
    elegida = lista[0];
    razon = !limits.length ? 'El precio apenas retrocede en estos minutos: entra a mercado.' : `El impulso de 1 min va a favor del ${lado} (${momento1m.toFixed(2)}): si esperas, lo más probable es que se vaya sin ti. Entra a mercado.`;
  } else if (contra) {
    // sigue en contra: el limit más profundo que aún se llena al menos la mitad de las veces
    elegida = [...limits].filter((o) => o.prob_llenado >= 50).sort((a, b) => b.distancia_pct - a.distancia_pct)[0] ?? limits.sort((a, b) => b.prob_llenado - a.prob_llenado)[0];
    razon = `El impulso de 1 min aún va en contra del ${lado} (${momento1m.toFixed(2)}): lo normal es que siga un poco. Mejor un limit en ${elegida.precio} (${elegida.que}), que se llena ${elegida.prob_llenado} % de las veces en ${minutos} min.`;
  } else {
    elegida = [...lista].sort((a, b) => b.valor - a.valor)[0];
    razon = elegida.tipo === 'mercado'
      ? 'Esperar un precio mejor no compensa el riesgo de que no se llene: entra a mercado.'
      : `Un limit en ${elegida.precio} (${elegida.que}) mejora la entrada ${elegida.mejora_r} R y se llena ${elegida.prob_llenado} % de las veces en ${minutos} min: compensa frente a entrar ya.`;
  }
  return {
    recomendada: elegida.tipo, precio: elegida.precio, prob_llenado: elegida.prob_llenado, mejora_r: elegida.mejora_r, razon, minutos,
    retroceso_mediano_pct: +cuantil(orden, 0.5).toFixed(3), momento_1m: +momento1m.toFixed(2),
    opciones: lista.sort((a, b) => L * (b.precio - a.precio)).map(({ valor, ...o }) => o),
  };
}
