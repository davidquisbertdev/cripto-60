// Estado del diario y frenos del día. Módulo puro (sin node:fs): lo usan también la web y la Edge Function.
// Día local (YYYY-MM-DD) en la zona configurada
export function diaLocal(ms, tz) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz || undefined, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ms));
}

// Estado del diario para la gestión de riesgo: capital, pérdidas seguidas, resultado de hoy y bloqueos.
export function estadoDiario(diario, cfg, ahora) {
  if (!diario) return null;
  const ops = diario.operaciones || [];
  const capital = +(diario.capital_inicial + ops.reduce((s, o) => s + (+o.pnl || 0), 0)).toFixed(4);
  const hoy = diaLocal(ahora, cfg.zona_horaria);
  const deHoy = ops.filter((o) => diaLocal(Date.parse(o.fecha), cfg.zona_horaria) === hoy);
  const pnlHoy = deHoy.reduce((s, o) => s + (+o.pnl || 0), 0);
  // racha de pérdidas de HOY (una mala racha de ayer no cuenta)
  let seguidas = 0;
  for (let i = deHoy.length - 1; i >= 0 && deHoy[i].pnl < 0; i--) seguidas++;
  const ultima = deHoy.length ? Date.parse(deHoy.at(-1).fecha) : null;
  const ultimaHora = deHoy.filter((o) => ahora - Date.parse(o.fecha) < 3600e3).length;
  const capitalInicioDia = capital - pnlHoy;
  const avisos = [];
  let bloqueo = null, pausa_hasta = null;
  let factor = 1;
  if (seguidas >= cfg.perdidas_seguidas_parar) bloqueo = `${seguidas} pérdidas seguidas hoy: para por hoy, el mercado no está a tu favor.`;
  else if (seguidas >= cfg.perdidas_seguidas_pausa && ultima && ahora - ultima < cfg.pausa_min * 60e3) {
    pausa_hasta = ultima + cfg.pausa_min * 60e3;
    bloqueo = `${seguidas} pérdidas seguidas: pausa de ${cfg.pausa_min} min (hasta ${new Intl.DateTimeFormat('es', { timeZone: cfg.zona_horaria || undefined, hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(pausa_hasta))}). Respira y no persigas la pérdida.`;
  }
  if (!bloqueo && seguidas >= cfg.perdidas_seguidas_mitad) { factor = 0.5; avisos.push(`${seguidas} pérdidas seguidas: riesgo reducido a la mitad.`); }
  if (capitalInicioDia > 0 && -pnlHoy >= (capitalInicioDia * cfg.max_perdida_dia_pct) / 100)
    bloqueo = `Hoy ya perdiste ${(-pnlHoy).toFixed(2)} USDT (límite ${cfg.max_perdida_dia_pct} % del capital): no operes más hoy.`;
  if (deHoy.length >= cfg.max_operaciones_dia) bloqueo = bloqueo || `Ya hiciste ${deHoy.length} operaciones hoy (máximo ${cfg.max_operaciones_dia}).`;
  if (ultimaHora >= cfg.max_operaciones_hora) bloqueo = bloqueo || `${ultimaHora} operaciones en la última hora (máximo ${cfg.max_operaciones_hora}): baja el ritmo, el sobre-trading es la forma más rápida de perder.`;
  const ganadas = ops.filter((o) => o.pnl > 0).length;
  return {
    capital, capital_inicial: diario.capital_inicial, operaciones: ops.length, ganadas,
    perdidas: ops.filter((o) => o.pnl < 0).length,
    tasa_acierto: ops.length ? +((100 * ganadas) / ops.length).toFixed(1) : null,
    hoy: { fecha: hoy, operaciones: deHoy.length, pnl: +pnlHoy.toFixed(4), ultima_hora: ultimaHora },
    margen_sugerido: +Math.min(capital, (cfg.margen_base ?? 20) + ((cfg.reinversion_pct ?? 50) / 100) * Math.max(0, capital - diario.capital_inicial)).toFixed(2),
    perdidas_seguidas: seguidas, factor_riesgo: factor, bloqueo, pausa_hasta, avisos,
  };
}
