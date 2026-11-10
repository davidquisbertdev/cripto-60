// Fibonacci: retrocesos del último impulso (de un mínimo a un máximo o al revés) en 5m y 15m.
// En una tendencia, el precio suele corregir hasta el 50 %-61.8 % del impulso (la "zona dorada") y luego
// seguir. Si retrocede más del 78.6 %, el impulso probablemente falló. Las extensiones (127.2 % y 161.8 %)
// son objetivos habituales cuando el precio supera el extremo.
// En 15-60 min estos niveles son ruidosos: pesan como confluencia (±5 de confianza como mucho) y dan un
// precio limit alternativo; nunca deciden solos.
import { swings } from './indicadores.mjs';

export const RETROCESOS = [0.236, 0.382, 0.5, 0.618, 0.786];
export const EXTENSIONES = [1.272, 1.618];

const estadoDe = (r) => (r < 0 ? 'ruptura' : r < 0.382 ? 'leve' : r < 0.5 ? 'medio' : r <= 0.65 ? 'zona dorada' : r <= 0.786 ? 'profundo' : 'invalidado');

// velas cerradas de un marco; atr del marco; minRango: el impulso debe medir al menos minRango × ATR.
export function fibDe(velas, precio, atr, { marco = '15m', minRango = 3, k = 3 } = {}) {
  if (!velas?.length || velas.length < 30 || !atr) return null;
  const v = velas.slice(-120);
  const s = swings(v, k);
  const alto = s.altos.at(-1), bajo = s.bajos.at(-1);
  if (!alto || !bajo) return null;
  // el impulso termina en el giro más reciente; si el precio superó ese extremo después, se extiende
  const sube = alto.i > bajo.i;
  let ini = sube ? bajo : alto, fin = sube ? alto : bajo;
  const despues = v.slice(fin.i + 1);
  const extremo = sube ? Math.max(fin.p, ...despues.map((x) => x.h)) : Math.min(fin.p, ...despues.map((x) => x.l));
  fin = { ...fin, p: extremo };
  const rango = Math.abs(fin.p - ini.p);
  if (rango < minRango * atr) return null;
  const D = sube ? 1 : -1;
  const nivel = (r) => fin.p - D * r * rango;
  const retroceso = (D * (fin.p - precio)) / rango;
  return {
    marco, direccion: sube ? 'alcista' : 'bajista', desde: ini.p, hasta: fin.p, t_desde: ini.t, rango_pct: +((100 * rango) / ini.p).toFixed(2),
    retroceso: +retroceso.toFixed(3), estado: estadoDe(retroceso),
    niveles: RETROCESOS.map((r) => ({ r, precio: nivel(r) })),
    zona_dorada: { desde: nivel(0.5), hasta: nivel(0.618) },
    extensiones: EXTENSIONES.map((r) => ({ r, precio: ini.p + D * r * rango })),
  };
}

// Los dos marcos de la operación (5m) y de la dirección (15m).
export function analizarFib(marcos, velas5, velas15, precio) {
  const f5 = fibDe(velas5, precio, marcos['5m']?.atr, { marco: '5m' });
  const f15 = fibDe(velas15, precio, marcos['15m']?.atr, { marco: '15m' });
  return f5 || f15 ? { '5m': f5, '15m': f15 } : null;
}

const pc = (r) => `${+(r * 100).toFixed(1)} %`;

// Efecto en una señal (un lado). Impulso a favor del lado y precio en la zona dorada: +5 (confluencia).
// Impulso a favor pero retroceso más allá del 78.6 %: −5 (la estructura se rompió). Impulso en contra y el
// precio en su zona dorada (ahí suele retomar la otra dirección): −5. Máximo ±5.
export function efectoFib(fib, lado, estrategia = 'tendencia') {
  if (!fib) return { ajuste_conf: 0, textos: [] };
  const L = lado === 'LONG' ? 1 : -1, textos = [];
  let ajuste = 0;
  for (const m of ['15m', '5m']) {
    const f = fib[m];
    if (!f) continue;
    const D = f.direccion === 'alcista' ? 1 : -1;
    if (D === L && f.estado === 'zona dorada') { ajuste = Math.max(ajuste, 5); textos.push(`Fibonacci ${m}: el precio está en la zona dorada (50-61.8 %) del impulso ${f.direccion}: buena zona para el ${lado}.`); }
    else if (D === L && f.estado === 'invalidado') { ajuste = Math.min(ajuste, -5); textos.push(`Fibonacci ${m}: el precio retrocedió el ${pc(f.retroceso)} del impulso ${f.direccion} (más del 78.6 %): ese impulso falló.`); }
    else if (D === -L && f.estado === 'zona dorada' && estrategia === 'tendencia') { ajuste = Math.min(ajuste, -5); textos.push(`Fibonacci ${m}: el precio está en la zona dorada del impulso ${f.direccion}, donde suele retomar esa dirección: en contra del ${lado}.`); }
    if (ajuste) break; // manda el marco mayor que diga algo
  }
  return { ajuste_conf: ajuste, textos };
}

// Entrada limit en Fibonacci: el nivel 50 % o 61.8 % del impulso a favor que quede entre el precio y el
// SL (con al menos 0.1 ATR de distancia a cada uno). Es una alternativa paciente, no la entrada del plan.
export function entradaFib(fib, lado, precio, sl, atr) {
  if (!fib || sl == null) return null;
  const L = lado === 'LONG' ? 1 : -1;
  for (const m of ['5m', '15m']) {
    const f = fib[m];
    if (!f || (f.direccion === 'alcista' ? 1 : -1) !== L || !['leve', 'medio', 'zona dorada'].includes(f.estado)) continue;
    for (const r of [0.5, 0.618]) {
      const p = f.niveles.find((x) => x.r === r).precio;
      if (L * (precio - p) >= 0.1 * atr && L * (p - sl) >= 0.1 * atr) return { precio: p, nivel: pc(r), marco: m };
    }
  }
  return null;
}

export const fibResumen = (fib) => fib;
