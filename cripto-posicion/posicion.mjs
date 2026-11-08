#!/usr/bin/env node
// cripto-posicion: revisa una posición abierta (de una señal guardada o con datos a mano) y dice
// MANTENER / MOVER SL / REDUCIR / CERRAR según lo que hizo el precio, el tiempo, las noticias nuevas
// y si el análisis cambió.
import { pathToFileURL } from 'node:url';
import { Fuente, cerradas } from '../lib/mexc.mjs';
import { crearFuente, nombreExchange } from '../lib/fuentes.mjs';
import { base as baseDe } from '../lib/mexc.mjs';
import { analizarSimbolo } from '../lib/motor.mjs';
import { simular } from '../lib/simulacion.mjs';
import { redondear, repartir } from '../lib/plan.mjs';
import { compararInstantanea } from '../lib/ballenas.mjs';
import { filtroBTC } from '../lib/btc.mjs';
import path from 'node:path';
import { carpeta } from '../lib/config.mjs';
import { leerConfig, leerJSON, rutaSenal } from '../lib/config.mjs';
import { args, precio as fp, usdt, pct, signo, hora, duracion, parseDuracion, parseFecha, salir } from '../lib/formato.mjs';

export function cargarPosicion(op, cfg, ahora, sym) {
  const s = leerJSON(rutaSenal(cfg, baseDe(sym)));
  const pos = {};
  if (s && s.plan?.viable) {
    Object.assign(pos, {
      lado: s.lado, entrada: s.plan.entrada, sl: s.plan.sl, tps: s.plan.tps.map((t) => t.precio), contratos: s.plan.contratos,
      tam: s.plan.tam_contrato, abierta: s.creada, espera_max_min: s.espera_max_min, duracion_max_min: s.duracion_max_min ?? null, confianza_senal: s.confianza, nivel_senal: s.nivel,
      partes: s.plan.tps.map((t) => t.contratos), desde_senal: true, estrategia: s.estrategia ?? 'tendencia', objetivo_media: s.objetivo_media ?? null,
      ballenas_senal: s.ballenas?.instantanea ? { t: s.creada, posiciones: s.ballenas.instantanea, puntuacion: s.ballenas.puntuacion } : null,
    });
  }
  if (op.lado) pos.lado = op.lado.toUpperCase();
  if (op.entrada != null) pos.entrada = op.entrada;
  if (op.sl != null) pos.sl = op.sl;
  const tps = [op.tp1, op.tp2, op.tp3];
  if (tps.some((x) => x != null)) pos.tps = tps.map((x, i) => x ?? pos.tps?.[i]).filter((x) => x != null);
  if (op.contratos != null && op.contratos !== pos.contratos) { pos.contratos = op.contratos; pos.partes = null; }
  if (op.abierta) pos.abierta = parseFecha(op.abierta);
  if (op.hace) pos.abierta = ahora - parseDuracion(op.hace) * 60e3;
  if (op.espera) pos.espera_max_min = parseDuracion(op.espera);
  if (op.estrategia) pos.estrategia = op.estrategia.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  pos.estrategia = pos.estrategia ?? 'tendencia';
  if (!['tendencia', 'reversion'].includes(pos.estrategia)) throw new Error('--estrategia debe ser tendencia o reversion');
  if (!pos.lado || pos.entrada == null || pos.sl == null || !pos.tps?.length)
    throw new Error('No hay señal guardada para esta moneda: indica --lado long|short --entrada X --sl Y --tp1 A [--tp2 B --tp3 C] [--hace 10m]');
  if (!['LONG', 'SHORT'].includes(pos.lado)) throw new Error('--lado debe ser long o short');
  const L = pos.lado === 'LONG' ? 1 : -1;
  if (L * (pos.entrada - pos.sl) <= 0) throw new Error(`El SL ${pos.sl} está del lado equivocado para un ${pos.lado} con entrada ${pos.entrada}.`);
  pos.abierta = pos.abierta ?? ahora;
  pos.espera_max_min = pos.espera_max_min ?? cfg.espera_max_min;
  pos.duracion_max_min = pos.duracion_max_min ?? cfg.duracion_max_min;
  const repDefecto = pos.tps.length === 3 ? cfg.reparto_tps : pos.tps.length === 2 ? [50, 50, 0] : [100, 0, 0];
  if (pos.contratos && !pos.partes) pos.partes = repartir(pos.contratos, repDefecto).map((c, i) => (i < pos.tps.length ? c : 0));
  pos.reparto = pos.partes && pos.contratos ? pos.partes.map((c) => (100 * c) / pos.contratos) : repDefecto;
  while (pos.tps.length < 3) pos.tps.push(L * Infinity); // TP que no existe: inalcanzable
  return pos;
}

// Recorre las velas de 1 minuto desde la apertura y gestiona como el plan: TP1 -> SL a entrada, TP2 -> SL a TP1.
export function recorrido(velas1m, pos) {
  const L = pos.lado === 'LONG' ? 1 : -1;
  let stop = pos.sl, hit = 0, cierre = null, mfe = 0, mae = 0;
  const eventos = [];
  const desde = Math.floor(pos.abierta / 60e3) * 60e3;
  for (const b of velas1m) {
    if (b.t < desde) continue;
    const fav = L > 0 ? b.h - pos.entrada : pos.entrada - b.l, adv = L > 0 ? pos.entrada - b.l : b.h - pos.entrada;
    mfe = Math.max(mfe, fav); mae = Math.max(mae, adv);
    if (L > 0 ? b.l <= stop : b.h >= stop) {
      cierre = { tipo: hit === 0 ? 'SL' : hit === 1 ? 'ENTRADA' : 'TP1', precio: stop, t: b.t };
      eventos.push({ t: b.t, que: hit === 0 ? `tocó el SL ${stop}` : `volvió al stop movido ${stop}` });
      break;
    }
    while (hit < 3 && (L > 0 ? b.h >= pos.tps[hit] : b.l <= pos.tps[hit])) {
      eventos.push({ t: b.t, que: `tocó TP${hit + 1} ${pos.tps[hit]}` });
      stop = hit === 0 ? pos.entrada : pos.tps[hit - 1];
      hit++;
    }
    if (hit === 3 || (pos.reparto[hit] ?? 0) === 0 && pos.reparto.slice(hit).every((x) => !x)) {
      cierre = { tipo: 'COMPLETA', precio: pos.tps[hit - 1], t: b.t };
      break;
    }
  }
  return { hit, stop, cierre, mfe, mae, eventos };
}

export function evaluar(a, pos, cfg) {
  const ahora = a.ahora, precio = a.precio, L = pos.lado === 'LONG' ? 1 : -1;
  const v1 = a.velas1m_vivo ?? a.velas1m; // incluye la vela en curso
  const rec = recorrido(v1, pos);
  const R = Math.abs(pos.entrada - pos.sl);
  const transcurrido = (ahora - pos.abierta) / 60e3;
  const espera = pos.espera_max_min, total = pos.duracion_max_min;
  // Una reversión va contra el movimiento corto por definición: se vigila con su propia lectura.
  const rev = pos.estrategia === 'reversion';
  const d = rev ? a.decisionReversion : a.decision;
  const enContra = d.sesgo !== pos.lado && d.nivel !== 'NO OPERAR';
  const debil = d.sesgo === pos.lado && (d.nivel === 'NO OPERAR' || (pos.confianza_senal != null && d.confianza <= pos.confianza_senal - 15));
  // reversión: si el precio ya volvió a la media, el movimiento esperado se cumplió
  const media = pos.objetivo_media ?? a.reversion?.medio ?? null;
  const llegoMedia = rev && media != null && (pos.lado === 'LONG' ? precio >= media : precio <= media);
  const nuevas = (a.noticias?.propias || []).filter((n) => n.fecha && n.fecha >= pos.abierta - 15 * 60e3);
  const nuevasMacro = (a.noticias?.macro || []).filter((n) => n.fecha && n.fecha >= pos.abierta - 15 * 60e3);
  const malas = nuevas.filter((n) => L * n.sentimiento < -0.3 || n.riesgo);
  const r_actual = (L * (precio - pos.entrada)) / R;
  // Ballenas: puntuación actual frente al lado de la posición, y qué movieron desde la señal
  const bw = d.ballenas;
  const ballenasContra = bw != null && L * bw <= -0.3;
  const movBallenas = pos.ballenas_senal && a.ballenas?.hl ? compararInstantanea(pos.ballenas_senal, a.ballenas.hl) : null;
  const movContra = movBallenas && L * movBallenas.delta_neto_usd < -1e6;
  // BTC: si arrastra en contra de la posición (con dirección o moviéndose ahora), se reduce
  const fb = filtroBTC(a.btc, a.btc?.relacion, L, pos.estrategia === 'reversion' ? 'reversion' : 'tendencia');
  const btcContra = fb.estado === 'en contra' && (fb.bloquea || fb.bajar > 0);

  let pnl = null;
  if (pos.contratos && pos.tam) {
    const partes = pos.partes ?? [pos.contratos, 0, 0];
    let real = 0, abiertos = pos.contratos;
    for (let i = 0; i < Math.min(rec.hit, 3); i++) { real += partes[i] * pos.tam * L * (pos.tps[i] - pos.entrada); abiertos -= partes[i]; }
    const flotante = rec.cierre ? 0 : abiertos * pos.tam * L * (precio - pos.entrada);
    if (rec.cierre && abiertos > 0) real += abiertos * pos.tam * L * (rec.cierre.precio - pos.entrada);
    pnl = { realizado: +real.toFixed(4), flotante: +flotante.toFixed(4), contratos_abiertos: rec.cierre ? 0 : abiertos };
  }

  let sim = null;
  if (!rec.cierre) {
    const restante = Math.max((rec.hit === 0 ? espera : total) - transcurrido, 3);
    sim = simular({
      velas: a.velas1m.slice(-1000), lado: pos.lado, entrada: pos.entrada, sl: rec.stop, tps: pos.tps, reparto: pos.reparto,
      horizonte: Math.round(restante), minBarra: 1, n: cfg.simulaciones, semilla: cfg.semilla, inicio: precio, hechos: rec.hit, riesgoR: R,
    });
  }
  const sig = rec.hit < 3 ? `tp${rec.hit + 1}` : null;
  const pSig = sim && sig ? sim.prob[sig] : null;
  const pStop = sim ? +(rec.hit === 0 ? sim.prob.sl_antes_tp1 : sim.prob.be_tras_tp1).toFixed(1) : null;

  let accion, motivo;
  const pasos = [];
  const unidad = a.contrato.priceUnit;
  const medio = redondear(rec.stop + (precio - rec.stop) / 2, unidad, L > 0 ? 'abajo' : 'arriba');
  if (rec.cierre) {
    const t = rec.cierre.tipo;
    accion = t === 'SL' ? 'CERRADA (SL)' : t === 'COMPLETA' ? 'COMPLETADA' : 'CERRADA (stop movido)';
    motivo = t === 'SL' ? `El precio tocó tu SL ${rec.cierre.precio} a las ${hora(rec.cierre.t, cfg.zona_horaria)}. Si sigue abierta, ciérrala ya.`
      : t === 'COMPLETA' ? 'Llegaron todos los TP. Operación terminada.'
        : `Tras ${t === 'ENTRADA' ? 'el TP1 el precio volvió a la entrada' : 'el TP2 el precio volvió al TP1'}: lo que quedaba se cerró en ${rec.cierre.precio}.`;
    pasos.push('Registra el resultado con /cripto-diario para llevar tu capital.');
  } else if (malas.length && (L * r_actual <= 0 || malas.some((n) => n.riesgo))) {
    accion = 'CERRAR';
    motivo = `Salió una noticia en contra desde que abriste: "${malas[0].titulo}".`;
  } else if (llegoMedia && (L * (precio - pos.entrada)) > 0) {
    accion = 'CERRAR (asegura ganancia)';
    motivo = `Reversión cumplida: el precio volvió a la media de 5m (${media.toPrecision(6)}). A partir de aquí ya no hay ventaja.`;
  } else if (!rev && enContra && d.confianza >= 50) {
    accion = r_actual > 0 ? 'CERRAR (asegura ganancia)' : 'CERRAR';
    motivo = `El análisis cambió: ahora se inclina a ${d.sesgo} con confianza ${d.confianza}/100.`;
  } else if (rec.hit === 0 && espera && transcurrido >= espera) {
    accion = 'CERRAR';
    motivo = `Pasaron ${duracion(transcurrido)} (espera máxima ${duracion(espera)}) y no llegó el TP1. El plan ya no se está cumpliendo.`;
  } else if (total && transcurrido >= total) {
    accion = 'CERRAR';
    motivo = `Se cumplió el tiempo total de la operación (${duracion(total)}). En scalping no se espera más: cierra lo que quede${rec.hit ? ' (ya aseguraste el TP' + rec.hit + ')' : ''} y busca la siguiente.`;
  } else if (rec.hit >= 1) {
    accion = 'MANTENER con SL movido';
    motivo = `Ya tocó TP${rec.hit}. Asegúrate de haber cerrado el ${pos.reparto.slice(0, rec.hit).join(' % + ')} % y de tener el SL en ${rec.stop}${rec.hit === 1 ? ' (entrada: ya no puedes perder)' : ' (TP1)'}.`;
    if (debil || enContra || ballenasContra || movContra || btcContra) { accion = 'REDUCIR'; motivo += ` ${btcContra ? 'BTC empuja en contra' : ballenasContra || movContra ? 'Las ballenas se mueven en contra' : `El impulso se debilitó (confianza ${d.confianza})`}: cierra otra parte o sube el SL a ${medio}.`; }
  } else if (debil || enContra || ballenasContra || movContra || btcContra || (pSig != null && pStop != null && pSig + pStop >= 10 && pSig / (pSig + pStop) < 0.4)) {
    accion = 'REDUCIR';
    motivo = `${debil ? `La confianza bajó (${pos.confianza_senal ?? '—'} → ${d.confianza}/100). ` : ''}${enContra ? `El análisis empieza a inclinarse a ${d.sesgo}. ` : ''}${ballenasContra ? `Las ballenas están en contra (${a.ballenas.lectura}). ` : ''}${btcContra ? `BTC ${a.btc.lectura} (${signo(a.btc.puntuacion)}) arrastra en contra de tu ${pos.lado}. ` : ''}${movContra ? `Desde tu señal las ballenas movieron ${(movBallenas.delta_neto_usd / 1e6).toFixed(1)} M USD hacia ${movBallenas.delta_neto_usd > 0 ? 'LONG' : 'SHORT'}. ` : ''}Desde aquí: ${sig.toUpperCase()} ${pct(pSig)} frente a stop ${pct(pStop)}. Cierra la mitad o acerca el SL a ${medio}.`;
  } else {
    accion = 'MANTENER';
    motivo = `El plan sigue en pie: análisis ${d.sesgo} ${d.confianza}/100, TP1 ${pct(pSig)} vs SL ${pct(pStop)}.`;
  }
  if (!rec.cierre && espera) {
    const resta = espera - transcurrido;
    if (rec.hit === 0) pasos.push(resta > 0 ? `Te quedan ${duracion(resta)} para el TP1: si a las ${hora(pos.abierta + espera * 60e3, cfg.zona_horaria)} no llegó, cierra.` : 'Tiempo cumplido sin TP1.');
    else if (total) pasos.push(`Cierre total como mucho a las ${hora(pos.abierta + total * 60e3, cfg.zona_horaria)} (${duracion(Math.max(total - transcurrido, 0))} restantes).`);
  }

  return {
    tipo: 'posicion', simbolo: a.simbolo, base: a.base, ahora, precio, decimales: a.decimales, posicion: pos, accion, motivo, pasos,
    r_actual: +r_actual.toFixed(2), transcurrido_min: Math.round(transcurrido), recorrido: rec, pnl,
    estrategia: pos.estrategia, analisis: { sesgo: d.sesgo, nivel: d.nivel, confianza: d.confianza, razones: d.razones, alertas: d.alertas },
    noticias_nuevas: nuevas.map(({ titulo, fecha, fuente, sentimiento }) => ({ titulo, fecha, fuente, sentimiento })),
    macro_nuevas: nuevasMacro.slice(0, 4).map(({ titulo, fecha, fuente }) => ({ titulo, fecha, fuente })),
    simulacion: sim, prob_siguiente_tp: pSig, prob_stop: pStop, siguiente: sig ? sig.toUpperCase() : null,
    ballenas: a.ballenas ? { puntuacion: a.ballenas.puntuacion, lectura: a.ballenas.lectura, cobertura: a.ballenas.cobertura, frases: a.ballenas.frases, en_contra: ballenasContra, desde_senal: movBallenas } : null,
    btc: a.btc ? { lectura: a.btc.lectura, puntuacion: a.btc.puntuacion, cambio_15m_pct: a.btc.cambio_15m_pct, presion: a.btc.presion, relacion: a.btc.relacion, estado: fb.estado, en_contra: btcContra, texto: fb.texto } : null,
  };
}

export function informe(e, cfg) {
  const tz = cfg.zona_horaria, f = (x) => fp(x, e.decimales), p = e.posicion;
  const out = [], linea = '─'.repeat(64);
  out.push(`${e.simbolo} · tu ${p.lado} · ${hora(e.ahora, tz)} · precio ${f(e.precio)}`);
  out.push(linea);
  out.push(`ACCIÓN: ${e.accion}`);
  out.push(`  ${e.motivo}`);
  for (const x of e.pasos) out.push(`  → ${x}`);
  out.push(linea);
  out.push(`Entrada ${f(p.entrada)} · SL ${f(p.sl)}${e.recorrido.stop !== p.sl ? ` (ahora en ${f(e.recorrido.stop)})` : ''} · TP ${p.tps.filter(Number.isFinite).map(f).join(' / ')}`);
  out.push(`Abierta hace ${duracion(e.transcurrido_min)} · ahora ${signo(e.r_actual)} R · máx. a favor ${f(e.recorrido.mfe)} · máx. en contra ${f(e.recorrido.mae)} (en precio)`);
  if (e.pnl) out.push(`PnL aprox.: realizado ${usdt(e.pnl.realizado)} · flotante ${usdt(e.pnl.flotante)} (sin comisiones)`);
  for (const ev of e.recorrido.eventos) out.push(`  · ${hora(ev.t, tz)} ${ev.que}`);
  if (e.simulacion) out.push(`Probabilidades desde aquí: ${e.siguiente} ${pct(e.prob_siguiente_tp)} · stop ${pct(e.prob_stop)} (${e.simulacion.simulaciones} simulaciones, ${duracion(e.simulacion.horizonte_min)})`);
  out.push(`Estrategia: ${e.estrategia === 'reversion' ? 'REVERSIÓN a la media' : 'TENDENCIA'}`);
  out.push(`Análisis ahora: ${e.analisis.sesgo} ${e.analisis.nivel} (${e.analisis.confianza}/100)${p.confianza_senal != null ? ` · en la señal: ${p.confianza_senal}/100` : ''}`);
  for (const r of e.analisis.razones) out.push(`  · ${r}`);
  for (const r of e.analisis.alertas) out.push(`  ! ${r}`);
  if (e.btc) {
    out.push(`BTC ahora: ${e.btc.lectura} (${signo(e.btc.puntuacion)}) · 15 min ${signo(e.btc.cambio_15m_pct)} %${e.btc.relacion ? ` · correlación ${e.btc.relacion.correlacion}` : ''} → ${e.btc.estado.toUpperCase()} de tu ${p.lado}${e.btc.en_contra ? ' ← vigila' : ''}`);
    if (e.btc.texto) out.push(`  · ${e.btc.texto}`);
  }
  if (e.ballenas?.cobertura) {
    out.push(`Ballenas ahora: ${e.ballenas.lectura} (${signo(e.ballenas.puntuacion)})${e.ballenas.en_contra ? ' ← EN CONTRA de tu posición' : ''}`);
    for (const x of e.ballenas.frases.slice(0, 2)) out.push(`  · ${x}`);
    const m = e.ballenas.desde_senal;
    if (m) out.push(`  · Desde tu señal: ${m.cambios.length ? `${signo(m.delta_neto_usd / 1e6, 2)} M USD netos hacia ${m.delta_neto_usd >= 0 ? 'LONG' : 'SHORT'} (${m.cambios.slice(0, 2).map((c) => c.que).join(', ')})` : 'las ballenas no se movieron'}`);
  }
  out.push(`Noticias desde que abriste: ${e.noticias_nuevas.length ? '' : 'ninguna de ' + e.base}`);
  for (const n of e.noticias_nuevas) out.push(`  · ${hora(n.fecha, tz)} ${n.titulo} [${n.fuente}] ${signo(n.sentimiento)}`);
  for (const n of e.macro_nuevas) out.push(`  · (mercado) ${hora(n.fecha, tz)} ${n.titulo}`);
  out.push(linea);
  out.push('No es asesoría financiera. Las órdenes las pones tú en tu exchange.');
  return out.join('\n');
}

async function main() {
  const { pos, op } = args(process.argv.slice(2), {
    flags: ['json', 'sin_noticias', 'sin_ballenas'], numeros: ['entrada', 'sl', 'tp1', 'tp2', 'tp3', 'contratos'],
  });
  if (!pos[0]) throw new Error('Uso: posicion.mjs SOL [--entrada X --sl Y --tp1 A --tp2 B --tp3 C --lado long --hace 10m]');
  const cfg = leerConfig(op.config);
  const fuente = crearFuente({ exchange: op.exchange, cfg, offline: op.offline, grabar: op.grabar });
  const p = cargarPosicion(op, cfg, fuente.ahora(), pos[0]);
  const a = await analizarSimbolo(fuente, pos[0], { conNoticias: !op.sin_noticias, conBallenas: !op.sin_ballenas, carpetaCache: path.join(carpeta(cfg), 'cache') });
  a.velas1m_vivo = await fuente.velas(a.simbolo, '1m', 2000); // misma petición que el motor: incluye la vela en curso
  p.tam = p.tam ?? +a.contrato.contractSize;
  const e = evaluar(a, p, cfg);
  console.log(op.json ? JSON.stringify(e, null, 2) : informe(e, cfg));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch(salir);
