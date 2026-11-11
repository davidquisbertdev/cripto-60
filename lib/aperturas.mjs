// Aperturas de mercado: los momentos del día en que BTC y las altcoins dan un golpe fuerte de pocos minutos.
// Medido con 90 días de velas de 1 min de BTC y ETH (ago-nov 2026): las aperturas de EE. UU. mueven 3.4-3.9
// veces lo normal en 5 min y la de la bolsa de Nueva York se mueve fuerte el 95 % de los días. Pero el golpe
// va hacia los dos lados y de forma imprevisible: operarlo (seguirlo, ir al revés, limit antes de abrir o
// "velas parecidas") NO ganó tras comisiones fuera de muestra. Por eso aquí son VENTANAS DE RIESGO, igual
// que el calendario económico: una agenda con alertas para no tener una operación abierta ni entrar justo
// en ese golpe, y un aviso en la señal si cae dentro de la operación. Módulo puro (sin node:fs).

const L5 = [1, 2, 3, 4, 5], DOM_JUE = [0, 1, 2, 3, 4];

// importancia y mueve_x: medidos en los datos (cuánto mueve en 5 min frente a lo normal).
// dias: días de la semana en la hora local de la bolsa (0 = domingo).
export const APERTURAS = [
  { clave: 'datos_0830', nombre: 'Datos de EE. UU. 08:30 (IPC, empleo…)', corto: 'Datos EE. UU.', tz: 'America/New_York', h: 8, m: 30, dias: L5, importancia: 'ALTA', mueve_x: 3.4, nota: 'El volumen se multiplica por 5 y el primer golpe suele engañar. Los días de IPC o empleo, mucho más.' },
  { clave: 'nyse', nombre: 'Apertura de la bolsa de Nueva York', corto: 'Apertura NY', tz: 'America/New_York', h: 9, m: 30, dias: L5, importancia: 'ALTA', mueve_x: 3.5, nota: 'Golpe fuerte casi todos los días (95 %), hacia cualquier lado.' },
  { clave: 'datos_1000', nombre: 'Datos de EE. UU. 10:00 (ISM, confianza…)', corto: 'Datos 10:00 NY', tz: 'America/New_York', h: 10, m: 0, dias: L5, importancia: 'ALTA', mueve_x: 3.7, nota: 'Golpe grande y dirección imprevisible.' },
  { clave: 'hk', nombre: 'Apertura de Hong Kong y Shanghái', corto: 'Hong Kong', tz: 'Asia/Hong_Kong', h: 9, m: 30, dias: L5, importancia: 'MEDIA', mueve_x: 2.2, nota: 'Golpe moderado.' },
  { clave: 'cme', nombre: 'Reapertura de los futuros de Chicago (CME)', corto: 'CME Chicago', tz: 'America/New_York', h: 18, m: 0, dias: DOM_JUE, importancia: 'MEDIA', mueve_x: 1.8, nota: 'Vuelven los futuros de BTC/ETH tras la pausa diaria.' },
  { clave: 'nyse_cierre', nombre: 'Cierre de la bolsa de Nueva York', corto: 'Cierre NY', tz: 'America/New_York', h: 16, m: 0, dias: L5, importancia: 'MEDIA', mueve_x: 1.7, nota: 'Movimiento moderado.' },
];
// lo que dura el golpe tras la apertura
export const GOLPE_MIN = 5;

// ---------- Horas locales con su horario de verano ----------
const partes = (t, tz) => Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', weekday: 'short' }).formatToParts(t).map((x) => [x.type, x.value]));
const DIAS = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
function desfaseMin(t, tz) {
  const p = partes(t, tz);
  return Math.round((Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute) - Math.floor(t / 60e3) * 60e3) / 60e3);
}
// instante UTC de la hora local h:m del día (y, mo, d) en la zona tz
export function instanteLocal(y, mo, d, h, m, tz) {
  const g = Date.UTC(y, mo, d, h, m);
  let t = g - desfaseMin(g, tz) * 60e3;
  t = g - desfaseMin(t, tz) * 60e3;
  return t;
}
// ocurrencias de una apertura entre desde y hasta (instantes UTC), solo en sus días de la semana
export function ocurrencias(ap, desde, hasta) {
  const out = [];
  for (let t0 = desde - 864e5; t0 <= hasta + 864e5; t0 += 864e5) {
    const p = partes(t0, ap.tz);
    const t = instanteLocal(+p.year, +p.month - 1, +p.day, ap.h, ap.m, ap.tz);
    if (t >= desde && t <= hasta && ap.dias.includes(DIAS[partes(t, ap.tz).weekday]) && !out.includes(t)) out.push(t);
  }
  return out.sort((a, b) => a - b);
}

// Próximas aperturas (y la que está dando su golpe ahora), ordenadas por hora.
// estado: 'golpe' (abrió hace menos de GOLPE_MIN) o 'proxima'.
/** @param {number} ahora @param {{ horas?: number, importancia?: string[] | null }} [opciones] */
export function agenda(ahora, { horas = 24, importancia = null } = {}) {
  return APERTURAS
    .filter((ap) => !importancia || importancia.includes(ap.importancia))
    .flatMap((ap) => ocurrencias(ap, ahora - GOLPE_MIN * 60e3, ahora + horas * 3600e3).map((t) => ({
      clave: ap.clave, nombre: ap.nombre, corto: ap.corto, importancia: ap.importancia, mueve_x: ap.mueve_x, nota: ap.nota, t,
      estado: t <= ahora ? 'golpe' : 'proxima', minutos: Math.round((t - ahora) / 60e3),
    })))
    .sort((a, b) => a.t - b.t);
}

const minTxt = (m) => (m < 90 ? `${Math.round(m)} min` : `${(m / 60).toFixed(1)} h`);

// Efecto en una señal: una apertura fuerte (ALTA) dentro de la operación (de ahora hasta la duración) o dando
// su golpe ahora → aviso y −5 de confianza; una MEDIA → solo aviso. Si el calendario ya avisa de un dato macro
// a esa misma hora (p. ej. el IPC a las 08:30), no se repite.
export function efectoAperturas(ahora, duracionMin = 60, { calendario = null } = {}) {
  const r = { ajuste_conf: 0, textos: [], en_ventana: [] };
  const yaAvisado = (t) => (calendario?.eventos ?? []).some((e) => Math.abs(e.fecha - t) <= 2 * 60e3 && e.importancia !== 'MEDIA');
  for (const a of agenda(ahora, { horas: duracionMin / 60 + 0.25 })) {
    if (a.t - ahora > duracionMin * 60e3) continue;
    r.en_ventana.push(a.clave);
    if (yaAvisado(a.t)) continue;
    const golpe = `suele mover ${a.mueve_x} veces lo normal en 5 min, hacia cualquier lado`;
    if (a.estado === 'golpe') {
      if (a.importancia === 'ALTA') r.ajuste_conf = Math.min(r.ajuste_conf, -5);
      r.textos.push(`Ahora mismo: ${a.nombre} (abrió hace ${-a.minutos} min) ${golpe}. Espera a que pase el golpe antes de entrar.`);
    } else if (a.importancia === 'ALTA') {
      r.ajuste_conf = Math.min(r.ajuste_conf, -5);
      r.textos.push(`En ${minTxt(a.minutos)}: ${a.nombre}, dentro de tu operación; ${golpe}. Entra después del golpe o pon el SL fuera de su alcance.`);
    } else r.textos.push(`En ${minTxt(a.minutos)}: ${a.nombre} (golpe moderado, ${a.mueve_x}x lo normal).`);
  }
  return r;
}
