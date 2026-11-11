// Plan de la operación: entrada, stop loss, TP1/TP2/TP3, tamaño en contratos (MEXC) o pasos de cantidad (Binance), apalancamiento,
// margen, precio de liquidación aproximado y ganancia/pérdida en USDT en cada escenario.

export function decimales(unidad) {
  const s = String(unidad);
  if (s.includes('e-')) return +s.split('e-')[1];
  return s.includes('.') ? s.split('.')[1].length : 0;
}

// modo: 'abajo' | 'arriba' | 'cerca'
export function redondear(x, unidad, modo = 'cerca') {
  const d = decimales(unidad);
  const n = x / unidad;
  const k = modo === 'abajo' ? Math.floor(n + 1e-9) : modo === 'arriba' ? Math.ceil(n - 1e-9) : Math.round(n);
  return +(k * unidad).toFixed(d);
}

// SL de scalping: detrás del swing de 5m más cercano + un colchón, entre sl_atr_min y sl_atr_max
// ATR(5m), y nunca más cerca que sl_pct_min % (el ruido de 1 minuto lo barrería).
export function stopLoss({ lado, entrada, atr, soporte, resistencia, cfg = {} }) {
  const aMin = cfg.sl_atr_min ?? 0.6, aMax = cfg.sl_atr_max ?? 1.5, colchon = cfg.sl_colchon_atr ?? 0.2, pMin = (cfg.sl_pct_min ?? 0.12) / 100;
  const min = Math.max(aMin * atr, pMin * entrada);
  const max = Math.max(aMax * atr, min * 1.5);
  const nivel = lado === 'LONG' ? soporte : resistencia;
  const que = lado === 'LONG' ? 'el soporte' : 'la resistencia';
  let dist, regla;
  if (nivel != null) {
    const d = lado === 'LONG' ? entrada - (nivel - colchon * atr) : nivel + colchon * atr - entrada;
    if (d >= min && d <= max) { dist = d; regla = `detrás ${lado === 'LONG' ? 'del soporte' : 'de la resistencia'} ${nivel} (5m) + ${colchon} ATR`; }
    else if (d < min) { dist = min; regla = `mínimo (${aMin} ATR 5m / ${(pMin * 100).toFixed(2)} %): ${que} estaba demasiado cerca`; }
    else { dist = max; regla = `${aMax} ATR(5m): ${que} estaba demasiado lejos para scalping`; }
  } else { dist = Math.max(min, atr); regla = '1 ATR(5m)'; }
  return { dist, regla };
}

// Reparte los contratos entre los TPs (1, 2 o 3) según el % de cada uno; el último TP con % se lleva
// el resto. Con pocos contratos, uno por TP empezando por el primero. Los TP con 0 % no reciben nada.
export function repartir(contratos, reparto) {
  const partes = new Array(Math.max(reparto.length, 1)).fill(0);
  let n = reparto.length;
  while (n > 1 && !(reparto[n - 1] > 0)) n--;
  if (contratos <= 0) return partes;
  if (contratos <= n) { for (let i = 0; i < contratos; i++) partes[i] = 1; return partes; }
  let resto = contratos;
  for (let i = 0; i < n - 1; i++) {
    partes[i] = Math.min(Math.max(1, Math.round((contratos * reparto[i]) / 100)), resto - (n - 1 - i));
    resto -= partes[i];
  }
  partes[n - 1] = resto;
  return partes;
}

// slDist / slRegla: distancia del SL ya elegida (calibrada con la simulación); si no, la de stopLoss().
// capital: dinero total de la cuenta (pone el tope de pérdida). margen: lo que pones en ESTA operación
// (por defecto, el capital). objetivo: USDT que se buscan si llegan todos los TP; de él sale el apalancamiento.
export function calcularPlan({ lado, entrada, atr, soporte, resistencia, contrato, capital, margen: margenUsuario = null, nivel, cfg, factorRiesgo = 1, objetivo = null, slDist = null, slRegla = null }) {
  const L = lado === 'LONG' ? 1 : -1;
  const unidad = contrato.priceUnit;
  const taker = +contrato.takerFeeRate || 0, maker = +contrato.makerFeeRate || 0, mmr = +contrato.maintenanceMarginRate || 0.005;
  const tam = +contrato.contractSize;

  const sl0 = slDist ? { dist: slDist, regla: slRegla || 'calibrado' } : stopLoss({ lado, entrada, atr, soporte, resistencia, cfg });
  const sl = redondear(entrada - L * sl0.dist, unidad, L > 0 ? 'abajo' : 'arriba');
  const R = Math.abs(entrada - sl);
  const slPct = R / entrada;
  const tps = cfg.tps_r.map((r) => redondear(entrada + L * r * R, unidad, L > 0 ? 'abajo' : 'arriba'));
  // En scalping las comisiones pesan: el TP1 tiene que cubrir varias veces la comisión de ida y vuelta.
  const comisionRT = taker + maker; // entrada a mercado (taker) + salida limit en el TP (maker)
  const tp1Pct = Math.abs(tps[0] - entrada) / entrada;
  const cubre = comisionRT > 0 ? tp1Pct / comisionRT : Infinity;
  if (cubre < (cfg.comision_ratio_min ?? 3))
    return { viable: false, motivo: `El movimiento hasta el TP1 (${(100 * tp1Pct).toFixed(3)} %) apenas cubre ${cubre.toFixed(1)}x la comisión (${(100 * comisionRT).toFixed(3)} %): la volatilidad es muy baja para scalpear con ganancia.`, sl, tps, R, comisiones_cubre: +cubre.toFixed(1) };

  const nivelRiesgo = nivel === 'NO OPERAR' ? 'BAJA' : nivel;
  const riesgoPct = Math.min(cfg.riesgo_por_confianza[nivelRiesgo] * factorRiesgo, cfg.riesgo_max_pct);
  const riesgoMax = (capital * riesgoPct) / 100;
  const stake = Math.min(margenUsuario ?? capital, capital);
  const margenPct = cfg.margen_por_confianza[nivelRiesgo];
  const margenDisp = (stake * margenPct) / 100;

  // Lo que gana cada USDT de posición si llegan todos los TP (con su reparto) y lo que pierde en el SL.
  const w = cfg.reparto_tps.map((x) => x / 100);
  const ganFrac = tps.reduce((x, tp, k) => x + (w[k] || 0) * (Math.abs(tp - entrada) / entrada), 0) - taker - maker;
  const perdFrac = slPct + 2 * taker;
  const levLiq = Math.floor(1 / (cfg.liquidacion_vs_sl * slPct + mmr));
  const levMax = Math.max(1, Math.min(cfg.apalancamiento_max, +contrato.maxLeverage || 125, levLiq));
  // Posición necesaria para el objetivo, frenada por la pérdida máxima y por el apalancamiento seguro
  const conObjetivo = objetivo != null && objetivo > 0;
  const nocObj = conObjetivo ? objetivo / ganFrac : Infinity;
  const nocRiesgo = riesgoMax / perdFrac;
  const nocLev = margenDisp * levMax;
  let nocional = Math.min(nocObj, nocRiesgo, nocLev);
  const limitante = nocional === nocObj ? 'objetivo' : nocional === nocRiesgo ? 'riesgo' : 'apalancamiento';
  const lev = Math.max(1, Math.min(Math.ceil(nocional / margenDisp - 1e-9), levMax));
  const avisos = [];
  if (conObjetivo && limitante === 'riesgo') {
    const riesgoNec = nocObj * perdFrac;
    avisos.push(`Para ganar ${objetivo} USDT habría que arriesgar ${riesgoNec.toFixed(2)} USDT (${((100 * riesgoNec) / capital).toFixed(0)} % del capital); con confianza ${nivelRiesgo} el tope es ${riesgoPct} % (${riesgoMax.toFixed(2)} USDT).`);
  }
  if (conObjetivo && limitante === 'apalancamiento') {
    avisos.push(`Para ganar ${objetivo} USDT con ${margenDisp.toFixed(2)} USDT de margen harían falta ${Math.ceil(nocObj / margenDisp)}x; el máximo seguro con este SL es ${levMax}x (liquidación al doble de la distancia del SL). Pon más margen o acepta menos ganancia.`);
  }
  if (!conObjetivo && limitante === 'apalancamiento') avisos.push(`El tope seguro es ${levMax}x, así que el riesgo real queda por debajo del máximo.`);
  const valorContrato = tam * entrada;
  let contratos = Math.floor(nocional / valorContrato + 1e-9);
  // si manda el objetivo, se redondea hacia arriba cuando cabe en los frenos (riesgo y apalancamiento)
  if (limitante === 'objetivo' && contratos * valorContrato < nocional) {
    const arriba = contratos + 1;
    if (arriba * valorContrato <= Math.min(nocRiesgo, nocLev) + 1e-9) contratos = arriba;
  }
  const minVol = +contrato.minVol || 1;
  if (contratos < minVol) {
    const margenMin = (minVol * valorContrato) / lev;
    const riesgoMin = minVol * valorContrato * (slPct + 2 * taker);
    if (margenMin <= stake && riesgoMin <= (capital * cfg.riesgo_max_pct) / 100) {
      contratos = minVol;
      avisos.push(`Con este margen solo alcanza el mínimo de ${minVol} contrato(s).`);
    } else {
      return { viable: false, motivo: `Capital insuficiente: el mínimo (${minVol} contrato = ${valorContrato.toFixed(2)} USDT) necesita ${margenMin.toFixed(2)} USDT de margen a ${lev}x y arriesgaría ${riesgoMin.toFixed(2)} USDT.`, sl, tps, R };
    }
  }
  const nocionalReal = contratos * valorContrato;
  const margen = nocionalReal / lev;
  const liq = redondear(entrada * (1 - L * (1 / lev - mmr)), unidad);
  const feeEntrada = nocionalReal * taker;
  const perdidaSL = nocionalReal * slPct + feeEntrada + nocionalReal * (1 - L * slPct) * taker;

  const partes = repartir(contratos, cfg.reparto_tps);
  const gan = tps.map((tp, i) => {
    const q = partes[i] * tam;
    const bruto = q * Math.abs(tp - entrada);
    const fee = q * tp * maker + (partes[i] / contratos) * feeEntrada;
    return +(bruto - fee).toFixed(4);
  });
  const pct = (x) => +((100 * x) / margen).toFixed(1);
  const totalTodos = gan.reduce((a, b) => a + b, 0);
  const restoTrasTP1 = contratos - partes[0];
  const feeBE = restoTrasTP1 * tam * entrada * taker + (restoTrasTP1 / contratos) * feeEntrada;
  const escenarios = {
    sl_directo: -+perdidaSL.toFixed(4),
    tp1_y_luego_be: +(gan[0] - (restoTrasTP1 ? feeBE : 0)).toFixed(4),
    tp1_tp2_y_luego_tp1: tps.length < 2 ? null : +(gan[0] + gan[1] + (partes[2] ? partes[2] * tam * Math.abs(tps[0] - entrada) - partes[2] * tam * tps[0] * taker - (partes[2] / contratos) * feeEntrada : 0)).toFixed(4),
    todos_los_tps: +totalTodos.toFixed(4),
  };

  let objetivoInfo = null;
  if (conObjetivo) {
    const alcanzable = totalTodos >= objetivo * 0.97; // se tolera el redondeo a contratos enteros
    const riesgoNec = (objetivo * perdFrac) / ganFrac;
    const margenNec = nocObj / levMax;
    // capital con el que ese riesgo cabría en el tope de pérdida de esta confianza
    const capitalNec = riesgoNec / (riesgoPct / 100);
    const frenoLev = levMax === levLiq ? 'liquidacion' : levMax === cfg.apalancamiento_max ? 'ajustes' : 'exchange';
    objetivoInfo = {
      objetivo, alcanzable, limitante, alcanza: +totalTodos.toFixed(2), riesgo_necesario: +riesgoNec.toFixed(2), riesgo_necesario_pct: +((100 * riesgoNec) / capital).toFixed(1),
      riesgo_tope_pct: riesgoPct, riesgo_ajuste_pct: cfg.riesgo_por_confianza[nivelRiesgo], riesgo_max_pct: cfg.riesgo_max_pct, factor_riesgo: factorRiesgo,
      nivel_riesgo: nivelRiesgo, capital_necesario: +capitalNec.toFixed(0), margen_necesario: +margenNec.toFixed(2), apalancamiento_max: levMax, freno_apalancamiento: frenoLev,
      ayuda: alcanzable ? null : limitante === 'apalancamiento'
        ? `Para ${objetivo} USDT: pon unos ${margenNec.toFixed(0)} USDT de margen${frenoLev === 'ajustes' ? ` o sube el tope de apalancamiento en Ajustes (ahora ${levMax}x)` : frenoLev === 'liquidacion' ? ` (con este SL más de ${levMax}x dejaría la liquidación demasiado cerca)` : ` (el exchange permite como mucho ${levMax}x)`}.`
        : `Para ${objetivo} USDT con este SL tendrías que arriesgar ${riesgoNec.toFixed(2)} USDT; con confianza ${nivelRiesgo} (tope ${riesgoPct} %) eso pide un capital de unos ${capitalNec.toFixed(0)} USDT. O sube a ${((100 * riesgoNec) / capital).toFixed(0)} % la pérdida en el SL de confianza ${nivelRiesgo.toLowerCase()} (Ajustes o riesgo_por_confianza): el motor no la sube solo.`,
      mensaje: alcanzable
        ? `Si llegan ${tps.length > 1 ? `los ${tps.length} TP` : 'al TP'} ganas ${totalTodos.toFixed(2)} USDT (objetivo ${objetivo}). Solo con el TP1 y salida en la entrada: ${escenarios.tp1_y_luego_be.toFixed(2)} USDT.`
        : limitante === 'apalancamiento'
          ? `Con este SL y ${margenDisp.toFixed(2)} USDT de margen lo máximo seguro son ${totalTodos.toFixed(2)} USDT. Para ${objetivo} USDT necesitarías unos ${margenNec.toFixed(0)} USDT de margen.`
          : `Con tu tope de pérdida el plan apunta a ${totalTodos.toFixed(2)} USDT. Para ${objetivo} USDT arriesgarías ${riesgoNec.toFixed(2)} USDT (${((100 * riesgoNec) / capital).toFixed(0)} % del capital): no se sube el riesgo con confianza ${nivelRiesgo}.`,
    };
  }
  const apalancamientoRazon = `SL a ${(100 * slPct).toFixed(2)} % → con ${margen.toFixed(2)} USDT de margen, ${lev}x = ${nocionalReal.toFixed(0)} USDT de posición. `
    + (limitante === 'objetivo' ? `Es lo justo para el objetivo de ${objetivo} USDT.`
      : limitante === 'riesgo' ? `Lo frena tu pérdida máxima (${riesgoPct} % = ${riesgoMax.toFixed(2)} USDT).`
        : `Lo frena la liquidación: más de ${levMax}x la acercaría demasiado al SL.`);

  return {
    viable: true, lado, entrada, sl, sl_regla: sl0.regla, R: +R.toFixed(decimales(unidad) + 2), sl_pct: +(100 * slPct).toFixed(3),
    tps: tps.map((p, i) => ({
      n: i + 1, precio: p, r: cfg.tps_r[i], cerrar_pct: cfg.reparto_tps[i], contratos: partes[i],
      movimiento_pct: +((100 * Math.abs(p - entrada)) / entrada).toFixed(3), ganancia_usdt: gan[i], roe_pct: pct(gan[i]),
    })),
    contratos, tam_contrato: tam, cantidad_moneda: +(contratos * tam).toPrecision(10), nocional: +nocionalReal.toFixed(4),
    apalancamiento: lev, apalancamiento_max_seguro: levMax, apalancamiento_razon: apalancamientoRazon, limitante,
    margen: +margen.toFixed(4), margen_elegido: +stake.toFixed(2), margen_pct_capital: +((100 * margen) / capital).toFixed(1),
    liquidacion: liq, riesgo_pct_objetivo: riesgoPct, riesgo_usdt: +perdidaSL.toFixed(4), riesgo_pct_real: +((100 * perdidaSL) / capital).toFixed(2),
    comisiones: { taker, maker, tp1_cubre_x: cubre === Infinity ? null : +cubre.toFixed(1) }, escenarios, objetivo: objetivoInfo, avisos,
  };
}
