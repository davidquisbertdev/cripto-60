// Calendario económico: los datos macro que mueven a las cripto (inflación, empleo, tipos de la Fed...).
// Fuente: el calendario semanal público de ForexFactory (JSON, sin claves; trae la importancia de cada
// dato, la previsión y el anterior). Investing.com no se puede leer de forma automática (bloquea con 403).
//
// En 15-60 min un dato macro fuerte (p. ej. el IPC de EE. UU.) mueve todo el mercado de golpe: BTC y las
// altcoins caen o suben juntas en minutos, sin importar el análisis técnico. Por eso:
//  - CRÍTICA (IPC, empleo, decisión de la Fed... de EE. UU.) dentro de la operación o hace menos de 30 min:
//    se baja un nivel y −10 de confianza (−5 si ya salió).
//  - ALTA dentro de la operación: −5 y aviso. MEDIA: solo aviso.
// Nunca decide solo, pero avisa siempre, con la hora en tu zona.

import fs from 'node:fs';
import path from 'node:path';

export const URL_CALENDARIO = 'https://nfs.faireconomy.media/ff_calendar_thisweek.json';

// Datos que más mueven a las cripto, con qué son y qué suele pasar (en general, sin cifras inventadas).
const TIPOS = [
  [/core pce|pce price/i, 'Inflación PCE de EE. UU. (la que mira la Fed)', 'inflacion'],
  [/core cpi/i, 'Inflación subyacente de EE. UU. (IPC sin energía ni alimentos)', 'inflacion'],
  [/\bcpi\b/i, 'Inflación de EE. UU. (IPC)', 'inflacion'],
  [/core ppi/i, 'Precios al productor subyacentes de EE. UU.', 'inflacion'],
  [/\bppi\b/i, 'Precios al productor de EE. UU. (PPI)', 'inflacion'],
  [/non-farm|nfp/i, 'Empleo de EE. UU. (nóminas no agrícolas)', 'empleo'],
  [/unemployment rate/i, 'Tasa de desempleo de EE. UU.', 'empleo'],
  [/unemployment claims|jobless/i, 'Peticiones de subsidio por desempleo', 'empleo'],
  [/jolts/i, 'Ofertas de empleo JOLTS', 'empleo'],
  [/federal funds rate|fomc statement|fomc press|rate decision/i, 'Decisión de tipos de la Fed', 'fed'],
  [/fomc meeting minutes/i, 'Actas de la Fed', 'fed'],
  [/fed chair|powell/i, 'Discurso del presidente de la Fed', 'fed'],
  [/fomc member|fed /i, 'Discurso de un miembro de la Fed', 'fed_habla'],
  [/gdp/i, 'PIB de EE. UU.', 'actividad'],
  [/retail sales/i, 'Ventas minoristas de EE. UU.', 'actividad'],
  [/ism .*pmi|ism manufacturing|ism services/i, 'Índice ISM (actividad)', 'actividad'],
];
const CRITICOS = ['inflacion', 'empleo', 'fed'];
const EFECTO = {
  inflacion: 'Si sale por encima de la previsión, el mercado teme tipos más altos y suele tumbar a BTC y las altcoins; por debajo, suele subir.',
  empleo: 'Empleo más fuerte de lo previsto = tipos altos por más tiempo = bajista para cripto; más flojo suele ser alcista.',
  fed: 'Un tono duro (subir tipos o no bajarlos) es bajista para cripto; uno suave, alcista. Suelen ser los movimientos más bruscos del mes.',
  fed_habla: 'Si habla de subir tipos o de inflación persistente, presiona a la baja.',
  actividad: 'Una economía muy fuerte aleja las bajadas de tipos (bajista); muy débil asusta (también puede tumbar el mercado).',
  otro: 'Puede mover el dólar y, con él, a las cripto.',
};

export function clasificar(ev) {
  const titulo = String(ev.title ?? '');
  const tipo = TIPOS.find(([r]) => r.test(titulo));
  const clase = tipo?.[2] ?? 'otro';
  const pais = ev.country;
  const imp = ev.impact;
  let importancia = null;
  if (pais === 'USD' && imp === 'High') importancia = CRITICOS.includes(clase) ? 'CRÍTICA' : 'ALTA';
  else if (pais === 'USD' && imp === 'Medium') importancia = 'MEDIA';
  else if (pais === 'All' && imp === 'High') importancia = 'ALTA';
  else if (['CNY', 'EUR', 'JPY'].includes(pais) && imp === 'High') importancia = 'MEDIA';
  if (!importancia) return null;
  const t = Date.parse(ev.date);
  if (!Number.isFinite(t)) return null;
  return {
    titulo, pais, fecha: t, importancia, clase, que_es: tipo?.[1] ?? titulo, efecto: EFECTO[clase],
    prevision: ev.forecast || null, anterior: ev.previous || null, actual: ev.actual || null,
  };
}

const ORDEN_IMP = { 'CRÍTICA': 3, ALTA: 2, MEDIA: 1 };

// Reacción real de BTC tras un dato ya publicado: cambio a los 15 y 60 min y el peor/mejor recorrido,
// medido en velas de 5 min (si las hay de ese momento).
export function reaccion(ev, velas5) {
  if (!(velas5?.length > 1)) return null;
  const paso = velas5[1].t - velas5[0].t; // 5 o 15 min
  const i = velas5.findIndex((v) => v.t <= ev.fecha && ev.fecha < v.t + paso);
  if (i < 0) return null;
  const base = velas5[i].o;
  // cambio al cierre de la última vela que termina antes de +min (si ya terminó alguna después del dato)
  const tras = (min) => { const v = velas5.findLast((x) => x.t + paso <= ev.fecha + min * 60e3); return v && v.t >= velas5[i].t ? +((100 * (v.c - base)) / base).toFixed(2) : null; };
  const ventana = velas5.filter((v) => v.t >= velas5[i].t && v.t < ev.fecha + 60 * 60e3);
  return {
    cambio_15m_pct: tras(15), cambio_60m_pct: tras(60),
    max_pct: +((100 * (Math.max(...ventana.map((v) => v.h)) - base)) / base).toFixed(2),
    min_pct: +((100 * (Math.min(...ventana.map((v) => v.l)) - base)) / base).toFixed(2),
  };
}

// El feed se actualiza cada hora y corta con HTTP 429 si se le pide mucho: se guarda en memoria del proceso
// (la Edge Function reutiliza instancias), en una caché externa ({ leer, guardar }: un archivo en el CLI,
// la base de datos en la web) y, si falla, se usa la última copia de la semana.
const FRESCO = 60 * 60e3, VALIDO = 7 * 24 * 3600e3;
let memo = null;
export async function leerCalendario(fuente, { velasBTC5m = null, cache = null } = {}) {
  const ahora = fuente.ahora();
  if (fuente.offline) return resumirCalendario(await fuente.json(URL_CALENDARIO, 'calendario-semana.json'), ahora, { velasBTC5m });
  let copia = memo;
  if (!(copia && ahora - copia.t < FRESCO) && cache) {
    const c = await cache.leer().catch(() => null);
    if (c?.t && Array.isArray(c.datos) && (!copia || c.t > copia.t)) copia = c;
  }
  if (!(copia && ahora - copia.t < FRESCO)) {
    try {
      const crudo = await fuente.json(URL_CALENDARIO, 'calendario-semana.json', { intentos: 1 }); // reintentar un 429 lo alarga
      if (!Array.isArray(crudo)) throw new Error('Calendario económico no válido');
      copia = { t: ahora, datos: crudo };
      await cache?.guardar(copia).catch(() => {});
    } catch (e) {
      if (!(copia && ahora - copia.t < VALIDO)) throw e; // sin copia útil: no hay calendario
    }
  }
  memo = copia;
  return { ...resumirCalendario(copia.datos, ahora, { velasBTC5m }), leido: copia.t };
}

// Caché en un archivo (CLI): trader/cache/calendario.json
export function cacheArchivo(carpeta) {
  const ruta = () => path.join(carpeta, 'calendario.json');
  return {
    leer: async () => (fs.existsSync(ruta()) ? JSON.parse(fs.readFileSync(ruta(), 'utf8')) : null),
    guardar: async (doc) => { fs.mkdirSync(carpeta, { recursive: true }); fs.writeFileSync(ruta(), JSON.stringify(doc)); },
  };
}

// Eventos relevantes de las últimas 24 h y los próximos 3 días, con la reacción de BTC a los publicados.
export function resumirCalendario(crudo, ahora, { velasBTC5m = null } = {}) {
  const eventos = crudo.map(clasificar).filter(Boolean)
    .filter((e) => e.fecha >= ahora - 24 * 3600e3 && e.fecha <= ahora + 3 * 24 * 3600e3)
    .sort((a, b) => a.fecha - b.fecha)
    .map((e) => (e.fecha <= ahora ? { ...e, publicado: true, reaccion_btc: reaccion(e, velasBTC5m) } : { ...e, publicado: false }));
  const proximo = eventos.find((e) => !e.publicado && ORDEN_IMP[e.importancia] >= 2) ?? null;
  return { ahora, fuente: 'ForexFactory', eventos, proximo_importante: proximo };
}

const minTxt = (m) => (m < 90 ? `${Math.round(m)} min` : `${(m / 60).toFixed(1)} h`);

// Efecto en una señal (igual para LONG y SHORT: el dato puede salir para cualquier lado).
// duracionMin: lo que dura la operación; los datos dentro de esa ventana son los que la pueden barrer.
export function efectoCalendario(cal, ahora, duracionMin = 60) {
  const r = { ajuste_conf: 0, bajar: 0, textos: [], en_ventana: [] };
  if (!cal?.eventos?.length) return r;
  for (const e of cal.eventos) {
    const dt = (e.fecha - ahora) / 60e3; // > 0: falta; < 0: ya salió
    const dentro = dt >= 0 && dt <= duracionMin + 15;
    const reciente = dt < 0 && dt >= -30;
    if (!dentro && !reciente) continue;
    r.en_ventana.push(e);
    const nombre = `${e.que_es} (${e.pais}, importancia ${e.importancia})`;
    const prev = e.prevision ? ` Previsión ${e.prevision}${e.anterior ? `, anterior ${e.anterior}` : ''}.` : '';
    if (e.importancia === 'CRÍTICA') {
      r.bajar = 1;
      if (dentro) { r.ajuste_conf = Math.min(r.ajuste_conf, -10); r.textos.push(`En ${minTxt(dt)} sale ${nombre}: mueve todo el mercado de golpe y puede saltar tu SL o el de cualquiera.${prev} ${e.efecto} Mejor entra después o cierra antes.`); }
      else { r.ajuste_conf = Math.min(r.ajuste_conf, -5); r.textos.push(`Hace ${minTxt(-dt)} salió ${nombre}: la volatilidad sigue alta y la primera reacción suele engañar. Espera a que el precio se asiente.`); }
    } else if (e.importancia === 'ALTA') {
      r.ajuste_conf = Math.min(r.ajuste_conf, -5);
      r.textos.push(dentro ? `En ${minTxt(dt)} sale ${nombre}.${prev} ${e.efecto}` : `Hace ${minTxt(-dt)} salió ${nombre}: cuidado con los latigazos.`);
    } else if (dentro) r.textos.push(`En ${minTxt(dt)}: ${nombre}. Puede dar algo de volatilidad.`);
  }
  return r;
}
